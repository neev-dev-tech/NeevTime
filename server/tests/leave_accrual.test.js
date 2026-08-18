/**
 * Leave accrual — the engine behind every leave policy field.
 *
 * These fields decide paid days off, so the failure modes that matter are the
 * quiet ones: a re-run that doubles balances, a mid-year joiner credited a
 * full year, a quota cut that claws back days already taken.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const moment = require('moment-timezone');

const { accruedMonths, accruedTarget } = require('../services/leave_accrual');

const at = (d) => moment.tz(d, 'Asia/Kolkata');

test('a full-year employee holds quota/12 per month', () => {
    assert.strictEqual(accruedMonths(2026, '2020-03-10', at('2026-08-18')), 8);
    assert.strictEqual(accruedTarget(12, 8), 8);
    assert.strictEqual(accruedTarget(18, 8), 12);
});

test('the joining month counts only from the 15th rule', () => {
    // Joined 10 June — June counts: June, July, August = 3.
    assert.strictEqual(accruedMonths(2026, '2026-06-10', at('2026-08-18')), 3);
    // Joined 20 June — June does not: July, August = 2.
    assert.strictEqual(accruedMonths(2026, '2026-06-20', at('2026-08-18')), 2);
});

test('someone not yet joined accrues nothing', () => {
    assert.strictEqual(accruedMonths(2026, '2027-01-05', at('2026-08-18')), 0);
    // December joiner after the 15th: first month is January next year.
    assert.strictEqual(accruedMonths(2026, '2026-12-20', at('2026-12-31')), 0);
});

test('a past year accrues all twelve months, a future year none', () => {
    assert.strictEqual(accruedMonths(2025, '2020-01-01', at('2026-02-01')), 12);
    assert.strictEqual(accruedMonths(2027, '2020-01-01', at('2026-12-31')), 0);
});

test('targets land on half-day steps, because the column does', () => {
    // 7/12 of 10 days = 5.833… → 6.0, not 5.8333 truncated somewhere downstream.
    assert.strictEqual(accruedTarget(10, 7), 6);
    assert.strictEqual(accruedTarget(15, 5), 6.5);
});

test('accrual sets a target, never increments', () => {
    // Incrementing is how a re-run — or two containers — doubles every balance.
    const src = fs.readFileSync(path.join(__dirname, '../services/leave_accrual.js'), 'utf8');
    assert.match(src, /DO UPDATE SET accrued = \$4/,
        'accrued is written by increment — a second run doubles balances');
    assert.ok(!/SET accrued = accrued \+/.test(src), 'accrued is incremented');
});

test('a lowered quota does not claw back automatically', () => {
    // Days already taken against the old quota would go negative on a payslip.
    const src = fs.readFileSync(path.join(__dirname, '../services/leave_accrual.js'), 'utf8');
    assert.match(src, /target < current/,
        'nothing stops the job from lowering accrued after a quota cut');
    assert.match(src, /not lowered automatically/);
});

test('year end refuses to run twice', () => {
    // A second run finds remaining already carried and lapses it.
    const src = fs.readFileSync(path.join(__dirname, '../services/leave_accrual.js'), 'utf8');
    assert.match(src, /next_exists/, 'year end can run twice and lapse carried days');
    assert.match(src, /DO NOTHING/, 'year end overwrites an existing new-year row');
});

test('what lapses is written down, not discarded', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/011_leave_tables.sql'), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS lapsed/,
        '"where did my days go" has no answer — lapsed days vanish silently');
    const src = fs.readFileSync(path.join(__dirname, '../services/leave_accrual.js'), 'utf8');
    assert.match(src, /SET lapsed = \$1/);
});

test('the destructive half of year-end is opt-in over the API', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/leaves.js'), 'utf8');
    assert.match(src, /dry_run !== false/,
        'POST year-end applies by default — it should preview unless explicitly told');
});
