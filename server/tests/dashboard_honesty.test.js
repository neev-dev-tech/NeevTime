/**
 * The dashboard must measure, not describe.
 *
 * On 2026-08-16 this system was found to have recorded no attendance since
 * 2026-03-24 — 145 days, four readers polling the whole time, every request
 * rejected with a 502 before it reached the application.
 *
 * Nobody noticed because the dashboard reported a normal day, every day:
 *
 *   PUNCHES        100   "today"
 *   VERIFICATIONS  636
 *   Real-Time Monitor: Aakash 1:06 PM
 *   "All 4 devices are online and syncing normally"
 *
 * Every one of those was false, and the first is the reason the rest went
 * unchallenged. "Punches today" was `rowsOfSettled(logsRes).length` where the
 * request was `/api/logs?limit=100` — no date filter. It returned exactly 100
 * from the moment the table held 100 rows and could never have returned
 * anything else. The headline number on the operations dashboard was the page
 * size.
 *
 * The Real-Time Monitor used the same undated feed, so March punches scrolled
 * past under a heading claiming they were live.
 *
 * These tests pin the shape of the fix. They are source assertions rather than
 * behavioural ones because the failure was structural: the query could not
 * express the question being asked of it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const dashboard = () => fs.readFileSync(
    path.join(__dirname, '../../client/src/pages/Dashboard.jsx'), 'utf8');

test('the punch count is a count, not the length of a fetched array', () => {
    const src = dashboard();
    assert.ok(!/totalPunches\s*=\s*rowsOfSettled\([^)]*\)\.length/.test(src),
        'the punches figure is the number of rows returned — it reports the LIMIT, ' +
        'not the day. This displayed 100 on 145 consecutive days with zero punches.');
    assert.ok(/api\/logs\/count/.test(src),
        'the dashboard should ask the server to count today, not count what it received');
});

test('every punch feed on the dashboard is filtered to today', () => {
    const src = dashboard();
    const calls = src.match(/api\.get\(\s*'\/api\/logs'[^)]*\)/gs) || [];
    assert.ok(calls.length > 0, 'the dashboard no longer fetches logs — has this moved?');
    for (const call of calls) {
        assert.ok(/date:/.test(call),
            'a punch feed without a date filter shows the newest rows whatever their ' +
            `age. Under a heading like "Real-Time Monitor" that is a lie: ${call.slice(0, 90)}`);
    }
});

test('the logs endpoint can actually answer "which day"', () => {
    const src = read('server.js');
    const start = src.indexOf("app.get('/api/logs'");
    assert.ok(start > -1, 'the logs route has moved');
    const body = src.slice(start, start + 1600);

    assert.ok(/const \{[^}]*\bdate\b/.test(body),
        'the route accepts only a limit, so no caller can ask about a specific day');
    // The SQL is built as a template literal, so the placeholder appears as
    // ${params.length} in source rather than $1 — match on the comparison.
    assert.ok(/punch_time\s*>=[^\n]*::date/.test(body),
        'the date parameter is accepted but not applied to the query');
});

test('the count endpoint counts in SQL', () => {
    const src = read('server.js');
    const start = src.indexOf("app.get('/api/logs/count'");
    assert.ok(start > -1, 'there is no count endpoint');
    const body = src.slice(start, start + 900);
    assert.ok(/count\(\*\)/i.test(body),
        'counting rows in JavaScript after a LIMIT reproduces the original bug');
});

test('an outcome alert exists — component checks all missed this', () => {
    const src = read('services/alert_checks.js');
    assert.ok(/checkNoPunches/.test(src),
        'nothing alerts on "no attendance recorded today". Every existing check ' +
        'watches a component: device liveness reads last_activity, which is only ' +
        'written when a request reaches the app, so a rejected request looks ' +
        'exactly like an unplugged reader — and the sync checks watch what leaves ' +
        'the system, which is silent when nothing arrives.');
    assert.ok(/\['no punches today', checkNoPunches\]/.test(src),
        'the check exists but is not registered in runChecks, so it never runs');
});
