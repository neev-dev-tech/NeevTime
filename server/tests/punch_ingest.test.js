/**
 * The shared punch path.
 *
 * Every punch — reader, phone, admin — goes through punch_ingest, so a mistake
 * here is a mistake in all of them at once. These tests cover the parts that
 * decide what a punch MEANS, as opposed to whether it was stored.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ingest = require('../services/punch_ingest');

// ─────────────────────── which way was that punch? ───────────────────────────
//
// Both mobile routes decide in-or-out by looking at the day's last punch. They
// compared it against the single spelling 'check_in' while this module stored
// '0', so the comparison never matched: every punch from a phone was recorded
// as an arrival and clocking out was impossible. A day of arrivals and no
// departures produces no worked hours at all.

test('an entry is recognised however it was spelled', () => {
    for (const stored of ['0', 0, 'in', 'IN', 'check-in', 'check_in', 'checkin', 'entry']) {
        assert.strictEqual(ingest.isEntryState(stored), true,
            `${JSON.stringify(stored)} was not recognised as an arrival`);
    }
});

test('an exit is recognised however it was spelled', () => {
    // check_out with an underscore is what the mobile routes wrote before they
    // shared this path. It was absent from the OUT list, fell through to the
    // default, and came back as an arrival — an exit read as an entry, which
    // would make the app offer "check out" to someone who had already left.
    for (const stored of ['1', 1, 'out', 'OUT', 'check-out', 'check_out', 'checkout', 'exit']) {
        assert.strictEqual(ingest.isEntryState(stored), false,
            `${JSON.stringify(stored)} was not recognised as a departure`);
    }
});

test('no punch yet today reads as "not checked in"', () => {
    // undefined is what the query returns on someone's first punch of the day,
    // and it must produce a check_in rather than a check_out out of nowhere.
    assert.strictEqual(ingest.isEntryState(undefined), true);
    assert.strictEqual(ingest.isEntryState(null), true);
});

test('neither mobile route hardcodes the punch direction', () => {
    // The admin page wrote state: 'check_in' unconditionally, so /mobile could
    // record arrivals and nothing else.
    for (const f of ['../routes/mobile_attendance.js', '../routes/portal.js']) {
        const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
        assert.ok(!/state:\s*'check_in'/.test(src),
            `${f} hardcodes check_in — nobody can clock out from it`);
        assert.match(src, /isEntryState/,
            `${f} decides direction on its own instead of asking the ingest`);
    }
});
