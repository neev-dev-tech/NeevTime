#!/usr/bin/env bash
#
# Go back to the version that was live before the last ship.sh.
#
# The image for that commit was tagged when it was built, so this is a checkout
# and a restart rather than a rebuild. It matters at the only moment it is ever
# used: the app is broken, someone is waiting, and a three-minute rebuild is
# three minutes of an attendance system not recording attendance.
#
# What this does NOT do is restore the database. That is deliberate. Punches
# arrive continuously — readers were still posting while the bad version was
# live, and those punches are real. Restoring the pre-deploy snapshot would
# throw them away. The snapshot exists for the case where the data itself is
# damaged, and putting it back is a decision someone makes with their eyes open,
# not a step in a rollback script.
#
#   ./rollback.sh            back to the previously deployed commit
#   ./rollback.sh <ref>      back to a specific commit or tag
#
set -euo pipefail

COMPOSE_FILE="docker-compose.production.yml"
STATE_DIR=".deploy"

cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
die()  { printf '  \033[31mFAIL\033[0m  %s\n\n' "$*" >&2; exit 1; }

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
    [ -f "$STATE_DIR/previous" ] || die "No previous deploy recorded in $STATE_DIR/previous.
        Pass a commit explicitly:  ./rollback.sh <commit>"
    TARGET="$(cat "$STATE_DIR/previous")"
fi

SHORT="$(git rev-parse --short "$TARGET")"
say "Rolling back to $SHORT $(git log -1 --format=%s "$TARGET" | cut -c1-52)"

CURRENT="$(git rev-parse HEAD)"
git checkout --quiet "$TARGET"

# The tagged image means no rebuild. If it is missing — an older deploy, or the
# tag was pruned — fall back to building, and say so, because the timing is
# entirely different and someone is watching a clock.
if docker image inspect "neevtime-app:$SHORT" >/dev/null 2>&1; then
    docker tag "neevtime-app:$SHORT" neevtime-app:latest
    ok "reusing the image built for $SHORT — no rebuild"
    docker compose -f "$COMPOSE_FILE" up -d --no-build app
else
    printf '  \033[33mWARN\033[0m  no image tagged for %s; rebuilding (slower)\n' "$SHORT"
    docker compose -f "$COMPOSE_FILE" up -d --build app
fi

# So a rollback can itself be rolled back.
echo "$CURRENT" > "$STATE_DIR/previous"
echo "$TARGET"  > "$STATE_DIR/current"

say "Verify"
if ./verify-deploy.sh; then
    say "Rolled back to $SHORT"
    echo "  Forward again with:  ./rollback.sh $(git rev-parse --short "$CURRENT")"
    echo
else
    printf '\n\033[31m  Still failing after rollback.\033[0m\n'
    echo "  The problem is probably not the application version — check the database"
    echo "  container and the readers before deploying anything else."
    echo
    exit 1
fi
