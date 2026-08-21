#!/usr/bin/env bash
#
# Post-deploy verification. Run on the VM straight after
#   docker compose up -d --build client server
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

# Follow the redirect and accept the self-signed certificate.
#
# Enabling TLS made every check here fail at once: nginx answers browser traffic
# on port 80 with a 301, so this read the redirect page, found no bundle hash in
# it, and reported an unhealthy deploy that was in fact fine. The readers are
# unaffected — /iclock/ is served in clear text on purpose — but this script was
# looking at the wrong thing and saying so loudly.
#
# -L follows to https, -k accepts the self-signed pair the entrypoint generates.
# A real certificate needs neither, and both are harmless once one is installed.
APP_URL="${APP_URL:-http://localhost}"
CURL="curl -sL -k"
DB_CONTAINER="${DB_CONTAINER:-attendance_db}"
# nginx and node run in separate containers. This script named a single
# `attendance_app` — the old combined container — and kept reporting it after
# the split, so a healthy deploy failed on a corpse that had exited cleanly a
# day earlier while `docker exec` on it broke the bundle check. Container names
# come from compose now, so the script follows the file rather than a memory of
# what the file used to say.
WEB_CONTAINER="${WEB_CONTAINER:-}"   # nginx: serves the bundle, proxies /iclock
API_CONTAINER="${API_CONTAINER:-}"   # node: the API and the ADMS endpoint
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-attendance_db}"
# Punch timestamps are local wall-clock time; the database container is UTC.
REPORT_TZ="${REPORT_TZ:-Asia/Kolkata}"

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

# Ask compose which container is which. A container that compose no longer
# lists is not part of this deployment, whatever it is called and whether or not
# it is still lying around.
# By id, not by parsing the table. `docker compose ps --format` has accepted
# different things across compose versions, and a format string this script
# guesses wrong resolves to an empty name and silently falls back to the old
# combined container — the exact failure being fixed here.
compose_container() {
    local id
    id=$(d compose ps -q "$1" 2>/dev/null | head -1)
    [ -n "$id" ] && d inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's,^/,,'
}
[ -z "$WEB_CONTAINER" ] && WEB_CONTAINER=$(compose_container client)
[ -z "$API_CONTAINER" ] && API_CONTAINER=$(compose_container server)
# Older installs still run the combined container, and this script has to work
# on them too — that is the deployment most likely to need verifying.
[ -z "$WEB_CONTAINER" ] && WEB_CONTAINER="attendance_app"
[ -z "$API_CONTAINER" ] && API_CONTAINER="$WEB_CONTAINER"

pass=0; fail=0; warn=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33mWARN\033[0m  %s\n' "$1"; warn=$((warn+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

psql_q() { d exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null; }

# ── 1. Containers ─────────────────────────────────────────────────────────
head_ "1. Containers"
for c in $(printf '%s\n' "$WEB_CONTAINER" "$API_CONTAINER" "$DB_CONTAINER" | awk '!seen[$0]++'); do
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

for c in $(printf '%s\n' "$WEB_CONTAINER" "$API_CONTAINER" | awk '!seen[$0]++'); do
    restarts=$(d inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo 0)
    [ "${restarts:-0}" -gt 0 ] && note "$c has restarted $restarts times — check logs for a crash loop"
done

# A container carrying a name from an earlier layout is not a failure, but it is
# worth saying: it holds a port or a volume claim until someone removes it, and
# it is the reason this check used to report a broken deploy.
for stale in attendance_app; do
    case " $WEB_CONTAINER $API_CONTAINER " in *" $stale "*) continue ;; esac
    [ "$(d inspect -f '{{.State.Status}}' "$stale" 2>/dev/null)" = "exited" ] &&
        note "$stale is a stopped container from the old single-container layout, not part of this deploy — remove it with: docker rm $stale"
done

# ── 2. The app answers ────────────────────────────────────────────────────
head_ "2. HTTP"
code=$($CURL -o /dev/null -w '%{http_code}' "$APP_URL/" 2>/dev/null)
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
    health=$($CURL --max-time 3 "$APP_URL/api/health" 2>/dev/null)
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
    bad "/api/health still 502 after 60s — nginx is up but node is not listening on 3001. Check: docker logs $API_CONTAINER --tail 50"
else
    bad "/api/health: ${health:-no response after 60s}"
fi

# ── 3. Is the browser going to get the new build? ─────────────────────────
head_ "3. Deployed bundle"
served=$($CURL "$APP_URL/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
in_image=$(d exec "$WEB_CONTAINER" sh -c 'ls /usr/share/nginx/html/assets/index-*.js 2>/dev/null | head -1' | xargs -n1 basename 2>/dev/null)

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

cache=$($CURL -I "$APP_URL/" | grep -i '^cache-control' | tr -d '\r')
if echo "$cache" | grep -qi 'no-store\|no-cache'; then
    ok "index.html sent ${cache#*: }"
else
    bad "index.html is cacheable (${cache:-no Cache-Control}) — browsers will pin the old build"
fi

echo
echo "  Open the app and confirm DevTools > Network shows: ${served:-?}"
echo "  A different hash there means your browser cache, not the server."

# ── 3b. Can the readers actually reach the ADMS endpoint? ────────────────
head_ "3b. Biometric readers"
# This check did not exist, and its absence cost 145 days of attendance.
#
# On 2026-03-24 a deploy at 13:06 left nginx proxying /iclock to a node process
# that was no longer there. Every reader kept polling every 30 seconds and every
# poll got a 502. The health check above passed the whole time, because it asks
# nginx, and nginx was fine. The last punch recorded was 13:06:52 that day; the
# gap was found on 2026-08-16.
#
# It must be probed through the same address the readers use. Hitting node
# directly on :3001 returns 200 while the proxy in front of it is broken —
# that is exactly the state this system sat in for five months.
#
# No SN is sent deliberately. An unknown serial makes adms.js register a new
# device row, and a real one would stamp last_activity as though the reader had
# just reported. Reaching node at all is the thing being tested; the status it
# answers with does not matter, only that something answered.
iclock_code=$($CURL -o /dev/null -w '%{http_code}' --max-time 5 "$APP_URL/iclock/cdata" 2>/dev/null)
case "$iclock_code" in
    502|504|000|"")
        bad "/iclock is ${iclock_code:-unreachable} — the readers cannot deliver punches.
        nginx is answering but cannot reach node. Every punch made at every door is
        being refused and will never be recovered beyond the readers' own buffers.
        Check:  docker exec $WEB_CONTAINER sh -c 'nginx -T | grep -A3 \"location /iclock\"'
                curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/iclock/cdata" ;;
    *)
        ok "/iclock reachable through $APP_URL (HTTP $iclock_code)" ;;
esac

# ── 3c. Are there migrations this deploy has not applied? ────────────────
head_ "3c. Migrations"
# A pending migration is not a broken deploy, which is why this warns rather
# than fails. It is still worth saying loudly: the audit trail lives in one, and
# an un-applied migration means the trail records nothing while looking present
# in the interface.
# grep -c prints 0 AND exits non-zero when it matches nothing, so `|| echo 0`
# appended a second zero and the test below was handed "0\n0". Count lines
# instead; an empty result is an empty string, which the arithmetic default
# handles.
pending=$(d exec "$API_CONTAINER" node migrations/runner.js status 2>/dev/null \
    | grep -i '^ *pending' | wc -l | tr -d ' ')
if [ "${pending:-0}" -gt 0 ]; then
    note "$pending migration(s) pending — apply with: docker compose exec server node migrations/runner.js up"
else
    ok "no pending migrations"
fi

# ── 3d. Is the audit trail recording decisions, or machine noise? ────────
head_ "3d. Audit trail"
# Three separate machine writers filled this table before anyone looked: reader
# heartbeats, the recompute after every punch, and the HRMS sync marking punches
# delivered. Each was found by eye, days apart. A trail nobody reads because it
# is thirty thousand recalculations is worse than no trail, since it is still
# there to be pointed at — so the fourth source should announce itself here
# rather than wait to be spotted.
#
# The signal is unattributed rows: a person's change carries a user_id, a
# machine's does not. A handful is normal (a device coming online, a genuine
# scripted correction). Hundreds in an hour is a writer nobody has excluded yet.
if psql_q "SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs'" | grep -q 1; then
    noise=$(psql_q "SELECT count(*) FROM audit_logs WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 hour'")
    total=$(psql_q "SELECT count(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 hour'")
    if [ "${noise:-0}" -gt 200 ]; then
        note "$noise of $total audit rows in the last hour have no actor — something automatic is writing to the trail.
        Find it:  docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"SELECT table_name, count(*) FROM audit_logs WHERE user_id IS NULL AND created_at > NOW() - INTERVAL '1 hour' GROUP BY 1 ORDER BY 2 DESC\""
    else
        ok "audit trail recording (${total:-0} rows in the last hour, ${noise:-0} unattributed)"
    fi
else
    note "audit_logs does not exist — run: docker compose exec server node migrations/runner.js up"
fi

# ── 4. Is attendance still being collected? ───────────────────────────────
# The checks above can all pass on an app that has quietly stopped doing the
# one thing it exists for.
head_ "4. Data flow"
if d inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    # A fresh install is not a broken one. With no employees enrolled and no
    # punch ever recorded, the collection checks below would read "empty" as
    # "collection stopped" and fail a deploy that is perfectly healthy — which
    # is exactly what a customer sees the first time they run this, before a
    # single reader is pointed at the box. Distinguish the two: never collected
    # is a new install; collected-then-stopped is the outage this section
    # exists to catch.
    ever=$(psql_q "SELECT count(*) FROM attendance_logs")
    emp_total=$(psql_q "SELECT count(*) FROM employees WHERE lower(status)='active' AND attendance_required IS NOT FALSE")
    if [ "${ever:-0}" -eq 0 ] && [ "${emp_total:-0}" -eq 0 ]; then
        note "fresh install: no employees enrolled and no punches yet — collection checks skipped until there is data to check"
        ok "active employees: 0 (new install)"
        echo
        # Skip the rest of section 4; nothing to judge on an empty database.
        SKIP_DATAFLOW=1
    fi
fi
if [ "${SKIP_DATAFLOW:-0}" != "1" ] && d inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    last=$(psql_q "SELECT to_char(max(punch_time),'YYYY-MM-DD HH24:MI') FROM attendance_logs")
    # NOW() is UTC in this container while punch_time is local wall-clock time.
    # Subtracting them directly casts one through the server zone and reports a
    # figure 5h30m out in IST — which is why `ago` came back NEGATIVE when this
    # was first run against the readers.
    mins=$(psql_q "SELECT COALESCE(EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE '$REPORT_TZ') - max(punch_time)))/60, 999999)::int FROM attendance_logs")
    if [ -z "$mins" ]; then
        note "could not read attendance_logs"
    elif [ "$mins" -lt 240 ]; then
        ok "last punch $last (${mins} min ago)"
    elif [ "$mins" -gt 2880 ] && [ "$(psql_q "SELECT EXTRACT(DOW FROM (NOW() AT TIME ZONE '$REPORT_TZ'))::int")" != "0" ] \
                              && [ "$(psql_q "SELECT EXTRACT(DOW FROM (NOW() AT TIME ZONE '$REPORT_TZ'))::int")" != "6" ] \
                              && [ "$(psql_q "SELECT EXTRACT(HOUR FROM (NOW() AT TIME ZONE '$REPORT_TZ'))::int")" -ge 11 ]; then
        # More than two days, on a working day, after the morning. Gated that
        # way because 48 hours alone is not enough: Friday evening to Monday
        # morning is 62 hours, so an ungated threshold would fail every Monday
        # before the first person badges in. A check that cries wolf weekly is a
        # check people learn to scroll past — which is precisely what happened
        # to the previous version of this line. It reported a note for 145 days
        # while nothing at all was being collected: the message was accurate and
        # the severity was wrong.
        bad "last punch $last (${mins} min ago) — attendance collection has stopped.
        This is not an out-of-hours gap. Check 3b above: if /iclock is not reachable
        the readers are being refused, and every punch since then is already lost."
    else
        note "last punch $last (${mins} min ago) — no recent punches; fine out of hours, not during a shift"
    fi

    # Judged, not just printed. This line read "punches recorded today: 0" as a
    # pass on every deploy through the entire outage.
    today=$(psql_q "SELECT count(*) FROM attendance_logs WHERE punch_time::date = (NOW() AT TIME ZONE '$REPORT_TZ')::date")
    dow=$(psql_q "SELECT EXTRACT(DOW FROM (NOW() AT TIME ZONE '$REPORT_TZ'))::int")
    hour=$(psql_q "SELECT EXTRACT(HOUR FROM (NOW() AT TIME ZONE '$REPORT_TZ'))::int")
    if [ "${today:-0}" -gt 0 ]; then
        ok "punches recorded today: $today"
    elif [ "${dow:-0}" = "0" ] || [ "${dow:-0}" = "6" ]; then
        note "no punches today (weekend)"
    elif [ "${hour:-0}" -lt 11 ]; then
        note "no punches yet today (before 11:00)"
    else
        bad "no punches recorded today, on a working day past 11:00 — collection is broken"
    fi

    emp=$(psql_q "SELECT count(*) FROM employees WHERE lower(status)='active' AND attendance_required IS NOT FALSE")
    ok "active employees: ${emp:-?}"

    # Flagged rather than failed: it does not break the app, but it empties the
    # department filter and the workforce chart.
    unassigned=$(psql_q "SELECT count(*) FROM employees WHERE lower(status)='active' AND attendance_required IS NOT FALSE AND department_id IS NULL")
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
# Parens escaped. Unescaped, `connect()` is an empty capture group in ERE, so
# the pattern reads as "connect" followed by " failed" — which never appears in
# the real line ("connect() failed") and so filtered nothing. GNU grep accepted
# it silently and matched nothing; ugrep rejects it outright as an empty
# subexpression. Either way the noise came through on every run.
NOISE='connect\(\) failed .*upstream'
errline() { { d logs --since 5m "$API_CONTAINER" 2>&1; [ "$WEB_CONTAINER" != "$API_CONTAINER" ] && d logs --since 5m "$WEB_CONTAINER" 2>&1; } | grep -iE '\[ERROR\]|UnhandledPromise|ECONNREFUSED' | grep -vE "$NOISE"; }

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
