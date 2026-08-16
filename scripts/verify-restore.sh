#!/usr/bin/env bash
#
# Prove a backup can be restored.
#
# A backup nobody has restored is not a backup, and attendance records are
# payroll evidence with a three-to-five year retention obligation. This takes
# the newest dump, restores it into a scratch database, compares row counts
# against the live one, and drops the scratch database again.
#
# It never writes to the live database. The only destructive statement is
# DROP DATABASE against a scratch name this script created, and the live name is
# checked against that name before anything runs.
#
# Run it after any change to the backup settings, and on a schedule — monthly is
# enough. The failure this catches is not "the dump is missing", which is
# obvious; it is "the dump exists and cannot be read", which is silent until the
# day it matters.
#
#   ./scripts/verify-restore.sh                      # newest backup
#   ./scripts/verify-restore.sh path/to/file.dump    # a specific one
#
set -euo pipefail

DB_NAME="${DB_NAME:-attendance_db}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../server/backups}"
SCRATCH="${DB_NAME}_restore_check_$$"

export PGUSER="$DB_USER"
[ -n "${DB_HOST:-}" ] && export PGHOST="$DB_HOST"
[ -n "${DB_PORT:-}" ] && export PGPORT="$DB_PORT"
[ -n "${DB_PASSWORD:-}" ] && export PGPASSWORD="$DB_PASSWORD"

# Refuse to continue if the scratch name could ever be the live one. The only
# DROP in this script targets $SCRATCH, and this is what keeps that safe.
if [ "$SCRATCH" = "$DB_NAME" ]; then
    echo "refusing to run: scratch name matches the live database" >&2
    exit 1
fi

cleanup() {
    dropdb --if-exists "$SCRATCH" 2>/dev/null || true
}
trap cleanup EXIT

if [ $# -ge 1 ]; then
    BACKUP="$1"
else
    BACKUP=$(ls -t "$BACKUP_DIR"/*.sql "$BACKUP_DIR"/*.dump 2>/dev/null | head -1 || true)
fi

if [ -z "${BACKUP:-}" ] || [ ! -f "$BACKUP" ]; then
    echo "FAIL: no backup found in $BACKUP_DIR" >&2
    echo "      Settings > Database > enable automatic backups, or POST /api/database/backups" >&2
    exit 1
fi

AGE_HOURS=$(( ( $(date +%s) - $(date -r "$BACKUP" +%s) ) / 3600 ))
echo "backup : $(basename "$BACKUP")"
echo "size   : $(du -h "$BACKUP" | cut -f1)"
echo "age    : ${AGE_HOURS}h"
echo

# Counts worth comparing: the tables whose loss would actually matter.
TABLES="employees attendance_logs attendance_daily_summary leave_applications"

echo "restoring into $SCRATCH ..."
createdb "$SCRATCH"
if ! pg_restore -d "$SCRATCH" --no-owner --no-privileges "$BACKUP" 2>/tmp/restore_err_$$; then
    # pg_restore warns about owners and extensions on a normal restore; only a
    # non-zero exit with real errors is a failure.
    if grep -qiE '^pg_restore: error' /tmp/restore_err_$$; then
        echo "FAIL: restore reported errors" >&2
        head -20 /tmp/restore_err_$$ >&2
        rm -f /tmp/restore_err_$$
        exit 1
    fi
fi
rm -f /tmp/restore_err_$$
echo

FAILED=0
printf '%-28s %10s %10s\n' "table" "live" "restored"
for t in $TABLES; do
    live=$(psql -d "$DB_NAME" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "-")
    restored=$(psql -d "$SCRATCH" -tAc "SELECT count(*) FROM $t" 2>/dev/null || echo "-")
    printf '%-28s %10s %10s' "$t" "$live" "$restored"
    if [ "$live" = "$restored" ]; then
        echo "  ok"
    else
        echo "  MISMATCH"
        FAILED=1
    fi
done

echo
if [ "$FAILED" -eq 0 ]; then
    echo "PASS — this backup restores, and the data survives the round trip."
    echo
    echo "It does not prove the backup is off-machine. A dump on the same disk as"
    echo "the database is not a backup against losing that disk."
else
    echo "FAIL — the restored data does not match the live database." >&2
    echo "A backup that restores to different numbers is worse than none, because" >&2
    echo "it will be trusted." >&2
    exit 1
fi
