#!/usr/bin/env bash
#
# Deploy, with a way back.
#
# Replaces typing this by hand:
#
#   git pull origin main && docker compose -f docker-compose.production.yml \
#     up -d --build app && ./verify-deploy.sh
#
# which has no snapshot before it and no route back after it. What that sequence
# cannot tell you is what to do when verify-deploy fails: the previous image was
# built as :latest and has just been overwritten, so going back means finding the
# old commit and waiting out another build while the app is down.
#
# This does the same deploy and adds four things:
#
#   1. A database dump before anything changes, checked for size rather than
#      assumed. A backup nobody has looked at is not a backup.
#   2. The image tagged with the commit it was built from, so the previous one
#      still exists afterwards and rolling back is a restart, not a rebuild.
#   3. The commit that was live recorded, so rollback.sh knows where to return to
#      without anyone having to remember.
#   4. verify-deploy.sh run automatically, and its failure treated as a failure
#      rather than as the last line of output.
#
# Schema is deliberately not touched. ensureSchema still runs at boot and only
# adds things, which a code rollback tolerates. Anything that cannot be rolled
# back — dropping a column, changing a policy — belongs in server/migrations and
# is run deliberately, never as a side effect of shipping.
#
#   ./ship.sh              deploy origin/main
#   ./ship.sh v1.4.0       deploy a tag or commit
#
set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"
STATE_DIR=".deploy"
BACKUP_DIR="server/backups/pre-deploy"
KEEP_BACKUPS=10
TARGET="${1:-origin/main}"

cd "$(dirname "$0")"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; }
die()  { printf '  \033[31mFAIL\033[0m  %s\n\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
say "1. Preflight"

if [ -n "$(git status --porcelain)" ]; then
    git status --short | sed 's/^/        /'
    die "Working tree is not clean. Commit or stash first — a deploy should be
        reproducible from a commit, and these changes are not in one."
fi

PREVIOUS="$(git rev-parse HEAD)"
ok "currently live: $(git rev-parse --short HEAD) $(git log -1 --format=%s | cut -c1-54)"

git fetch --quiet origin
NEXT="$(git rev-parse "$TARGET")"

if [ "$PREVIOUS" = "$NEXT" ]; then
    ok "already at $TARGET — nothing to deploy"
    exit 0
fi

echo "        deploying: $(git rev-parse --short "$NEXT") $(git log -1 --format=%s "$NEXT" | cut -c1-54)"
CHANGED="$(git diff --name-only "$PREVIOUS" "$NEXT" | wc -l | tr -d ' ')"
echo "        $CHANGED file(s) changed"

# Migrations are never run automatically. Deploying code that expects a
# migration which has not been applied is a real failure mode, so say so.
if git diff --name-only "$PREVIOUS" "$NEXT" | grep -q '^server/migrations/.*\.sql$'; then
    warn "this deploy includes new migrations:"
    git diff --name-only "$PREVIOUS" "$NEXT" | grep '^server/migrations/.*\.sql$' | sed 's/^/        /'
    warn "they are NOT applied by this script. Run them deliberately:"
    echo "        docker compose -f $COMPOSE_FILE exec app node migrations/runner.js status"
fi

# ---------------------------------------------------------------- snapshot
say "2. Database snapshot"

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-attendance_db}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/pre-deploy-$STAMP-$(git rev-parse --short "$PREVIOUS").dump"

if ! docker compose -f "$COMPOSE_FILE" exec -T db \
        pg_dump -U "$DB_USER" -F c "$DB_NAME" > "$DUMP" 2>/dev/null; then
    rm -f "$DUMP"
    die "pg_dump failed. Not deploying without a snapshot."
fi

SIZE="$(wc -c < "$DUMP" | tr -d ' ')"
# A dump that exists but is tiny is the failure this check is for: an empty file
# still satisfies "the backup ran".
if [ "$SIZE" -lt 20000 ]; then
    die "snapshot is only ${SIZE} bytes, which is too small to be a real database.
        Not deploying. Check the db container and DB_NAME."
fi
ok "$DUMP ($(( SIZE / 1024 )) KB)"

ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm --
ok "keeping the most recent $KEEP_BACKUPS pre-deploy snapshots"

# ---------------------------------------------------------------- build
say "3. Build"

git checkout --quiet "$NEXT"
SHORT="$(git rev-parse --short HEAD)"

if ! docker compose -f "$COMPOSE_FILE" build app; then
    git checkout --quiet "$PREVIOUS"
    die "build failed. Nothing was deployed and the checkout was restored."
fi

# Tag by commit so the previous image survives this one. Without it the old
# build is overwritten and going back means rebuilding while the app is down.
docker tag neevtime-app:latest "neevtime-app:$SHORT"
ok "built and tagged neevtime-app:$SHORT"

# ---------------------------------------------------------------- release
say "4. Release"

echo "$PREVIOUS" > "$STATE_DIR/previous"
echo "$NEXT"     > "$STATE_DIR/current"

docker compose -f "$COMPOSE_FILE" up -d app
ok "container started"

# ---------------------------------------------------------------- verify
say "5. Verify"

if ./verify-deploy.sh; then
    say "Deployed $SHORT"
    echo "  Roll back with:  ./rollback.sh"
    echo
else
    printf '\n\033[31m  Verification failed.\033[0m\n\n'
    echo "  The previous version is still built and tagged, so going back is a restart:"
    echo
    echo "      ./rollback.sh"
    echo
    echo "  Database snapshot from before this deploy:"
    echo "      $DUMP"
    echo
    exit 1
fi
