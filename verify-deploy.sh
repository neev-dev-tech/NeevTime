#!/usr/bin/env bash
#
# Post-deploy verification. Run on the VM straight after
#   docker compose -f docker-compose.production.yml up -d --build app
#
#   ./verify-deploy.sh
#
# Answers the question "did that actually deploy, and is the app still doing
# its job?" — in that order, because the two failures look identical from a
# browser and have completely different fixes.
#
# The bundle check is the one that matters most. Twice now a deploy has been
# reported as "nothing changed" when the container was correct and the browser
# was serving a cached index.html pinned to the previous asset hash. This
# compares what the container is serving against what the running commit built,
# so "deployed" and "what I am looking at" stop being the same guess.
#
# Read-only. Nothing here restarts, migrates, or writes.

set -uo pipefail

APP_URL="${APP_URL:-http://localhost}"
DB_CONTAINER="${DB_CONTAINER:-attendance_db}"
APP_CONTAINER="${APP_CONTAINER:-attendance_app}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-attendance_db}"

# Every docker call goes through this.
#
# Without a timeout the script hangs rather than failing: when the Docker
# daemon is not reachable — the CLI installed but Docker Desktop not running,
# which is what happens when these commands get run on a laptop instead of the
# VM — `docker inspect` blocks indefinitely with no output. A verification
# script that hangs is worse than one that fails, because it looks like it is
# still working.
d() {
    if command -v timeout >/dev/null 2>&1; then timeout 10 docker "$@"
    else docker "$@"; fi
}

if ! d info >/dev/null 2>&1; then
    echo "Cannot reach the Docker daemon."
    echo
    echo "Run this ON THE VM, not on your laptop:"
    echo "    ssh innopay@192.168.1.237"
    echo "    cd ~/NeevTime/NeevTime && ./verify-deploy.sh"
    exit 2
fi

pass=0; fail=0; warn=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warn=$((warn+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

psql_q() { d exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null; }

# ── 1. Containers ─────────────────────────────────────────────────────────
head_ "1. Containers"
for c in "$APP_CONTAINER" "$DB_CONTAINER"; do
    state=$(d inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
    if [ "$state" = "running" ]; then
        # Uptime under a minute is the signal that this deploy actually
        # replaced the container rather than leaving the old one in place.
        started=$(d inspect -f '{{.State.StartedAt}}' "$c" 2>/dev/null)
        ok "$c running (since $started)"
    else
        bad "$c is '${state:-missing}' — the deploy did not complete"
    fi
done

restarts=$(d inspect -f '{{.RestartCount}}' "$APP_CONTAINER" 2>/dev/null || echo 0)
[ "${restarts:-0}" -gt 0 ] && note "$APP_CONTAINER has restarted $restarts times — check logs for a crash loop"

# ── 2. The app answers ────────────────────────────────────────────────────
head_ "2. HTTP"
code=$(curl -s -o /dev/null -w '%{http_code}' "$APP_URL/" 2>/dev/null)
[ "$code" = "200" ] && ok "GET / returns 200" || bad "GET / returns ${code:-no response}"

# Wait for it rather than asking once.
#
# This script is meant to be chained onto the deploy, so it runs the same
# second the container is recreated. nginx binds immediately; node takes a few
# seconds more to boot and start listening on 3001. Probing once in that window
# gets a 502 from nginx and reports a broken deploy that is actually mid-start
# — which is exactly what happened the first time this ran: the nginx error and
# the container start timestamp were the same second, while punches were
# arriving normally.
#
# Poll for up to 60s. A deploy that is genuinely broken still fails, just 60s
# later; a deploy that is merely starting passes, which is the correct answer.
health=""
for i in $(seq 1 30); do
    health=$(curl -s --max-time 3 "$APP_URL/api/health" 2>/dev/null)
    echo "$health" | grep -q '"status":"healthy"' && break
    [ "$i" = 1 ] && printf '  ....  waiting for the app to finish starting'
    printf '.'
    sleep 2
done
[ -n "${i:-}" ] && [ "$i" != "1" ] && echo

if echo "$health" | grep -q '"status":"healthy"'; then
    up=$(echo "$health" | grep -o '"uptime":[0-9.]*' | cut -d: -f2 | cut -d. -f1)
    ok "/api/health healthy, database connected (node up ${up:-?}s)"
elif echo "$health" | grep -q '502 Bad Gateway'; then
    bad "/api/health still 502 after 60s — nginx is up but node is not listening on 3001. Check: docker logs $APP_CONTAINER --tail 50"
else
    bad "/api/health: ${health:-no response after 60s}"
fi

# ── 3. Is the browser going to get the new build? ─────────────────────────
head_ "3. Deployed bundle"
served=$(curl -s "$APP_URL/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
in_image=$(d exec "$APP_CONTAINER" sh -c 'ls /usr/share/nginx/html/assets/index-*.js 2>/dev/null | head -1' | xargs -n1 basename 2>/dev/null)

if [ -n "$served" ]; then
    ok "serving $served"
    if [ -n "$in_image" ] && [ "$(basename "$served")" = "$in_image" ]; then
        ok "matches the bundle inside the container"
    elif [ -n "$in_image" ]; then
        bad "container holds $in_image but is serving $(basename "$served") — nginx is caching stale HTML"
    fi
else
    bad "could not read the asset hash from index.html"
fi

cache=$(curl -sI "$APP_URL/" | grep -i '^cache-control' | tr -d '\r')
if echo "$cache" | grep -qi 'no-store\|no-cache'; then
    ok "index.html sent ${cache#*: }"
else
    bad "index.html is cacheable (${cache:-no Cache-Control}) — browsers will pin the old build"
fi

echo
echo "  Open the app and confirm DevTools > Network shows: ${served:-?}"
echo "  A different hash there means your browser cache, not the server."

# ── 4. Is attendance still being collected? ───────────────────────────────
# The checks above can all pass on an app that has quietly stopped doing the
# one thing it exists for.
head_ "4. Data flow"
if d inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    last=$(psql_q "SELECT to_char(max(punch_time),'YYYY-MM-DD HH24:MI') FROM attendance_logs")
    mins=$(psql_q "SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - max(punch_time)))/60, 999999)::int FROM attendance_logs")
    if [ -z "$mins" ]; then
        note "could not read attendance_logs"
    elif [ "$mins" -lt 240 ]; then
        ok "last punch $last (${mins} min ago)"
    else
        note "last punch $last (${mins} min ago) — no recent punches; fine out of hours, not during a shift"
    fi

    today=$(psql_q "SELECT count(*) FROM attendance_logs WHERE DATE(punch_time) = CURRENT_DATE")
    ok "punches recorded today: ${today:-?}"

    emp=$(psql_q "SELECT count(*) FROM employees WHERE status='active'")
    ok "active employees: ${emp:-?}"

    # Flagged rather than failed: it does not break the app, but it empties the
    # department filter and the workforce chart.
    unassigned=$(psql_q "SELECT count(*) FROM employees WHERE status='active' AND department_id IS NULL")
    [ "${unassigned:-0}" -gt 0 ] && note "$unassigned active employees have no department set"

    devices=$(psql_q "SELECT count(*) FILTER (WHERE status='online') || '/' || count(*) FROM devices")
    ok "devices online: ${devices:-?}"

    undelivered=$(psql_q "SELECT count(*) FROM alert_state WHERE resolved_at IS NULL AND last_error IS NOT NULL" 2>/dev/null)
    [ "${undelivered:-0}" -gt 0 ] && note "$undelivered alerts failed to send — email may be broken"
else
    note "$DB_CONTAINER not found, skipping data checks"
fi

# ── 5. Errors since the deploy ────────────────────────────────────────────
head_ "5. Recent errors"
# nginx logs one "connect() failed (111: Connection refused) ... upstream"
# for every request that lands in the gap between nginx binding and node
# listening. On a fresh deploy that is expected and says nothing about health —
# the polling check above is what actually decides whether node came up. Left
# in the count it reports a warning on every single successful deploy, which
# trains you to ignore the section.
NOISE='connect() failed .*upstream'
errline() { d logs --since 5m "$APP_CONTAINER" 2>&1 | grep -iE '\[ERROR\]|UnhandledPromise|ECONNREFUSED' | grep -vE "$NOISE"; }

errs=$(errline | grep -c . || true)
if [ "${errs:-0}" -eq 0 ]; then
    ok "no errors in the last 5 minutes"
else
    note "$errs error lines in the last 5 minutes:"
    errline | tail -5 | sed 's/^/        /'
fi

# ── Summary ───────────────────────────────────────────────────────────────
printf '\n\033[1mSummary\033[0m  %d passed, %d failed, %d warnings\n' "$pass" "$fail" "$warn"
if [ "$fail" -gt 0 ]; then
    echo "Deploy is NOT healthy. Fix the failures above before trusting the app."
    exit 1
fi
echo "Deploy looks good. Remaining warnings are worth a look but are not blocking."
