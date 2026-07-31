/**
 * Timestamp handling, on both sides of the wire.
 *
 * Two separate faults produced the same symptom here — times displaying 5h30m
 * early. One was writing UTC into the database, the other was reading a UTC
 * instant as if it were a wall clock. These pin down the behaviour so a third
 * variant does not slip back in.
 *
 * Run under IST, which is where the offset bugs actually bite:
 *     TZ=Asia/Kolkata node --test server/tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { normalizeState, normalizeVerifyMode } = require('../services/punch_ingest');

const dateFormatPath = path.join(__dirname, '../../client/src/utils/dateFormat.js');
const loadDateFormat = () => import(`file://${dateFormatPath}`);

// ─────────────────────── client-side display formatting ──────────────────────

test('a UTC instant renders in the viewer local time, not the UTC clock face', async () => {
    const { formatTimestamp } = await loadDateFormat();
    // 07:41:52Z is 13:11:52 IST — this displayed as 7:41 AM before the fix
    const out = formatTimestamp('2026-07-31T07:41:52.000Z');
    assert.strictEqual(out.datetime, '7/31/2026 1:11:52 PM');
});

test('a bare wall clock is shown as written, with no shifting', async () => {
    const { formatTimestamp } = await loadDateFormat();
    // to_char() output has no zone; parsing it as an instant would move it
    const out = formatTimestamp('2026-07-31 13:11:52');
    assert.strictEqual(out.datetime, '7/31/2026 1:11:52 PM');
});

test('a date column does not display as the previous day', async () => {
    const { formatTimestamp } = await loadDateFormat();
    // Midnight IST on the 15th serialises as 18:30Z on the 14th
    assert.strictEqual(formatTimestamp('2026-07-14T18:30:00.000Z').date, '7/15/2026');
});

test('a date-only string stays on its own date', async () => {
    const { formatTimestamp } = await loadDateFormat();
    assert.strictEqual(formatTimestamp('2026-07-15').date, '7/15/2026');
});

test('an explicit offset is honoured', async () => {
    const { formatTimestamp } = await loadDateFormat();
    assert.strictEqual(formatTimestamp('2026-07-31T13:11:52+05:30').datetime, '7/31/2026 1:11:52 PM');
});

test('empty and unparseable values degrade to a dash rather than "Invalid Date"', async () => {
    const { formatTimestamp } = await loadDateFormat();
    assert.strictEqual(formatTimestamp(null).datetime, '-');
    assert.strictEqual(formatTimestamp('').datetime, '-');
});

test('toLocalDateString buckets an early-morning punch to the correct day', async () => {
    const { toLocalDateString } = await loadDateFormat();
    const early = new Date('2026-07-31T02:00:00+05:30');
    // toISOString().split('T')[0] would answer 2026-07-30 here
    assert.strictEqual(toLocalDateString(early), '2026-07-31');
});

// ──────────────────────── server-side punch normalising ──────────────────────

test('vendor direction wording maps onto punch states', () => {
    assert.strictEqual(normalizeState('in'), '0');
    assert.strictEqual(normalizeState('IN'), '0');
    assert.strictEqual(normalizeState('checkOut'), '1');
    assert.strictEqual(normalizeState('exit'), '1');
});

test('numeric ZK states pass through unchanged', () => {
    assert.strictEqual(normalizeState('4'), '4');
    assert.strictEqual(normalizeState('1'), '1');
});

test('a reader configured as in-only or out-only overrides the punch state', () => {
    // This is how single-direction readers are handled — the device wins
    assert.strictEqual(normalizeState('1', 'in'), '0');
    assert.strictEqual(normalizeState('0', 'out'), '1');
});

test('an unknown direction falls back to IN rather than dropping the punch', () => {
    assert.strictEqual(normalizeState('sideways'), '0');
    assert.strictEqual(normalizeState(null), '0');
});

test('verification modes accept vendor words and numeric codes alike', () => {
    assert.strictEqual(normalizeVerifyMode('fingerprint'), 1);
    assert.strictEqual(normalizeVerifyMode('face'), 2);
    assert.strictEqual(normalizeVerifyMode('card'), 3);
    assert.strictEqual(normalizeVerifyMode(2), 2);
    assert.strictEqual(normalizeVerifyMode('9'), 9);
    assert.strictEqual(normalizeVerifyMode('something-new'), 0);
});
