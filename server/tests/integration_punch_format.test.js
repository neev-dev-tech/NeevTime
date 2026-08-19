/**
 * Punch decoding for outbound HRMS integrations.
 *
 * These pin down the two mistakes that were repeated across six of the eight
 * integration modules: reading punch_state as though `<= 1` meant entry, and
 * converting a naive local punch time to UTC before sending it.
 *
 * Run under IST — the timezone assertions only mean anything in a zone with a
 * non-zero offset:  TZ=Asia/Kolkata node --test tests/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const { decodeDirection, isCheckIn, formatLocal, localDate } = require('../services/integrations/punch_format');

// ─────────────────────────────── direction ───────────────────────────────

test('explicit check-out states decode as OUT', () => {
    for (const state of [1, 2, 5, 9]) {
        assert.strictEqual(decodeDirection(state), 'OUT', `state ${state} should be OUT`);
    }
});

test('explicit check-in states decode as IN', () => {
    for (const state of [3, 4, 8]) {
        assert.strictEqual(decodeDirection(state), 'IN', `state ${state} should be IN`);
    }
});

test('state 1 is a check-out, not a check-in', () => {
    // The old `punch_state <= 1` test matched this and called it an entry
    assert.strictEqual(isCheckIn(1), false, 'an exit was reported as an entry');
});

test('an ambiguous state follows the reader configuration', () => {
    // eSSL readers with no direction set report 0 or 255 for everything
    assert.strictEqual(decodeDirection(0, 'in'), 'IN');
    assert.strictEqual(decodeDirection(0, 'out'), 'OUT');
    assert.strictEqual(decodeDirection(255, 'out'), 'OUT');
    assert.strictEqual(decodeDirection(null, 'out'), 'OUT');
    assert.strictEqual(decodeDirection('nonsense', 'out'), 'OUT');
});

test('an ambiguous state with no reader configuration defaults to IN', () => {
    assert.strictEqual(decodeDirection(0), 'IN');
    assert.strictEqual(decodeDirection(undefined), 'IN');
});

test('numeric strings from the database decode the same as numbers', () => {
    assert.strictEqual(decodeDirection('1'), 'OUT');
    assert.strictEqual(decodeDirection('3'), 'IN');
});

test('a day of punches resolves to one entry and one exit', () => {
    // The old logic found every punch as an entry and no exit at all
    const day = [{ punch_state: '0' }, { punch_state: '1' }];
    const ins = day.filter(r => isCheckIn(r.punch_state));
    const outs = day.filter(r => !isCheckIn(r.punch_state));
    assert.strictEqual(ins.length, 1);
    assert.strictEqual(outs.length, 1, 'check-out was lost, so the HR system gets a null end time');
});

// ─────────────────────────────── timestamps ──────────────────────────────

test('a punch keeps the wall clock the device reported', () => {
    const out = formatLocal(new Date('2026-07-31 13:11:52'));
    assert.strictEqual(out.time, '13:11:52', 'time was shifted by the UTC offset');
    assert.strictEqual(out.date, '2026-07-31');
    assert.strictEqual(out.datetime, '2026-07-31 13:11:52');
});

test('an early-morning punch stays on its own date', () => {
    // 02:00 IST is the previous day in UTC — this is what mis-filed the punch
    assert.strictEqual(localDate(new Date('2026-07-31 02:00:00')), '2026-07-31');
});

test('a late-evening punch stays on its own date', () => {
    assert.strictEqual(localDate(new Date('2026-07-31 23:45:00')), '2026-07-31');
});

test('the short time form drops seconds without shifting', () => {
    assert.strictEqual(formatLocal(new Date('2026-07-31 09:05:07')).timeShort, '09:05');
});

test('the ISO-shaped form stays local rather than becoming UTC', () => {
    const out = formatLocal(new Date('2026-07-31 13:11:52'));
    assert.strictEqual(out.iso, '2026-07-31T13:11:52');
    assert.ok(!out.iso.endsWith('Z'), 'a trailing Z would claim this is UTC');
});

test('single-digit months, days and times are zero padded', () => {
    const out = formatLocal(new Date('2026-01-05 07:03:09'));
    assert.strictEqual(out.datetime, '2026-01-05 07:03:09');
});

test('missing or unparseable times return null instead of "Invalid Date"', () => {
    for (const bad of [null, undefined, '', 'not a date']) {
        assert.strictEqual(formatLocal(bad), null, `formatLocal(${bad}) should be null`);
        assert.strictEqual(localDate(bad), null);
    }
});

test('a string punch time is accepted as well as a Date', () => {
    assert.strictEqual(formatLocal('2026-07-31 13:11:52').datetime, '2026-07-31 13:11:52');
});

test('formatLocal disagrees with toISOString — which is the whole point', () => {
    const d = new Date('2026-07-31 13:11:52');
    const wrong = d.toISOString().split('T')[1].substring(0, 8);
    assert.notStrictEqual(formatLocal(d).time, wrong,
        'if these match, the process is running in UTC and the test proves nothing');
    assert.strictEqual(formatLocal(d).time, '13:11:52');
});

test('socket.io has one origin gate, not two', () => {
    // The cors block carried its own allowlist with none of allowRequest's
    // same-origin logic, and engine.io consults CORS on the websocket
    // upgrade's HTTP phase FIRST — so the same-origin fix never ran and every
    // browser upgrade died as a 400 with nothing logged. Five rounds of nginx
    // debugging, and it was two doors with one unlocked.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

    assert.match(src, /cors: \{ origin: true/,
        'the socket.io cors block has its own origin list again — it runs before allowRequest and will refuse browser upgrades');
    assert.match(src, /allowRequest: \(req, callback\)/,
        'allowRequest is gone — with reflective CORS it is the only gate');
    assert.match(src, /\[socket\.io\] refused: Origin/,
        'refusals no longer name both sides — the next debugging round starts blind again');
});

test('the /api direct handlers are behind an explicit auth gate', () => {
    // ~40 app.get/app.post('/api/...') handlers carry no inline authenticateToken
    // and were gated only as a side effect of the first authenticateToken router
    // mount running before them — authentication by source order, one reorder
    // from an open door. An explicit gate now sits above them, below the public
    // routes.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const gate = src.indexOf("app.use('/api', authenticateToken);");
    assert.ok(gate > -1, 'the explicit /api auth gate is gone');
    // The gate must sit below the public routes and above the direct handlers.
    assert.ok(gate > src.indexOf("app.get('/api/health'"), 'the gate is above /api/health — the healthcheck would 401');
    assert.ok(gate > src.indexOf("app.use('/api/portal'"), 'the gate is above the portal mount — employee login would 401');
    assert.ok(gate < src.indexOf("app.get('/api/stats'"), 'the gate is below the direct handlers — they are ungated again');
});

test('internal error text is not returned to clients', () => {
    // 249 handlers answer failures with res.status(500).json({ error: err.message }).
    // The raw message names tables and columns — how "column check_in does not
    // exist" reached a screen. A wrapper redacts 5xx bodies and logs the real one.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(src, /res\.statusCode >= 500 && body && typeof body === 'object' && 'error' in body/,
        'nothing redacts raw error messages on 5xx');
    assert.match(src, /A server error occurred/, 'no generic client-facing message');
    assert.match(src, /NEEV_LEAK_ERRORS/, 'no escape hatch for local debugging');
});

test('device commands are an allowlist, admin-only, not a free-form string', () => {
    // The endpoint used to insert `command` verbatim: any write role could queue
    // a factory reset to any reader, gated only by a browser confirm().
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(src, /app\.post\('\/api\/device-commands', authenticateToken, requireAdmin/,
        'device commands are not admin-gated');
    assert.match(src, /const READER_COMMANDS = \{/, 'there is no command allowlist');
    assert.match(src, /Unknown or disallowed device command/, 'unknown commands are not refused');
});
