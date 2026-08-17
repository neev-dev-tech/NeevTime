/**
 * The registers and the payroll export, run against a real Postgres.
 *
 * Four separate failures shipped from these two services, every one invisible
 * to the 223 tests that stub the database:
 *
 *   1. a query passing [from, to] that referenced only $2 — Postgres cannot
 *      infer a type for an unused parameter and rejects the statement;
 *   2. reading attendance_daily_summary columns this deployment did not have;
 *   3. reading overtime_minutes, a column nothing writes, instead of
 *      ot_minutes — which returned zero overtime for everyone, silently;
 *   4. String(date).slice(0, 10) against the Date objects pg actually returns,
 *      giving "Wed Jul 09", which string-compares as earlier than every day in
 *      the period. Every worker was marked never-employed and payroll exported
 *      zero payable days for the entire company.
 *
 * The stub returned strings where pg returns Dates, so it was not an incomplete
 * mock — it was a differently shaped one, which is worse than no test because it
 * produced confidence. These tests exist so the database gets a vote.
 *
 * They skip when no database is reachable, so `npm test` on a laptop is
 * unaffected. CI runs them with a real Postgres.
 */

const test = require('node:test');
const assert = require('node:assert');

const db = require('../db');
const registers = require('../services/registers');
const payroll = require('../services/payroll_export');

// Everything this file writes carries this prefix, and only rows with it are
// ever deleted. It must never match a real employee code.
const P = 'ZZTEST-';
const FROM = '2026-06-01';
const TO = '2026-06-30';

let usable = false;
let seededSummary = false;

const cleanup = async () => {
    for (const sql of [
        `DELETE FROM attendance_logs WHERE employee_code LIKE '${P}%'`,
        `DELETE FROM attendance_daily_summary WHERE employee_code LIKE '${P}%'`,
        `DELETE FROM leave_applications WHERE employee_code LIKE '${P}%'`,
        `DELETE FROM holidays WHERE name LIKE '${P}%'`,
        `DELETE FROM employees WHERE employee_code LIKE '${P}%'`,
        `DELETE FROM devices WHERE serial_number = 'ZZTESTDEV'`
    ]) {
        try { await db.query(sql); } catch { /* table may not exist */ }
    }
};

test.before(async () => {
    try {
        await db.query('SELECT 1');
        // The columns these services read must exist, which is what ensureSchema
        // guarantees. If they do not, this environment has not booted the server.
        await db.query('SELECT deleted_at, attendance_required FROM employees LIMIT 0');
        await db.query('SELECT ot_minutes, late_minutes FROM attendance_daily_summary LIMIT 0');
        usable = true;
    } catch (err) {
        console.log(`  (skipping real-database tests: ${err.message.slice(0, 70)})`);
        return;
    }

    await cleanup();

    // One worker who joined mid-period, so the joining-date comparison is
    // actually exercised — that is fix 4 above.
    await db.query(
        `INSERT INTO employees (employee_code, name, status, joining_date, attendance_required)
         VALUES ($1, 'ZZ Test Worker', 'active', DATE '2026-06-08', TRUE)`, [`${P}1`]);

    // The reader these punches came from. attendance_logs.device_serial has a
    // foreign key to devices, so a punch from a serial nobody has registered is
    // rejected — which is correct, and is exactly how mobile punching was found
    // to be broken on the deployment.
    await db.query(
        `INSERT INTO devices (serial_number, device_name, status)
         VALUES ('ZZTESTDEV', 'ZZ Test Reader', 'online')
         ON CONFLICT (serial_number) DO NOTHING`
    ).catch(() => { /* older schemas without the constraint */ });

    // Punches on Mon 8, Tue 9, Wed 10 June 2026.
    for (const d of ['2026-06-08', '2026-06-09', '2026-06-10']) {
        await db.query(
            `INSERT INTO attendance_logs (employee_code, device_serial, punch_time, punch_state)
             VALUES ($1, 'ZZTESTDEV', $2::date + TIME '09:00', 0)`, [`${P}1`, d]);
    }

    // A daily summary carrying overtime, so the ot_minutes read is exercised.
    try {
        await db.query(
            `INSERT INTO attendance_daily_summary (employee_code, date, ot_minutes, late_minutes, status)
             VALUES ($1, DATE '2026-06-09', 90, 15, 'present')`, [`${P}1`]);
        seededSummary = true;
    } catch { /* this environment has a different summary table */ }

    // Thu 11 June is a company holiday; Fri 12 is approved leave.
    try {
        await db.query(
            `INSERT INTO holidays (name, date) VALUES ($1, DATE '2026-06-11')`, [`${P}Holiday`]);
    } catch { /* optional */ }
    try {
        await db.query(
            `INSERT INTO leave_applications (employee_code, from_date, to_date, status, is_half_day)
             VALUES ($1, DATE '2026-06-12', DATE '2026-06-12', 'approved', false)`, [`${P}1`]);
    } catch { /* optional */ }
});

test.after(async () => { if (usable) await cleanup(); });

const mine = (rows) => rows.filter(r => String(r.employee_code || '').startsWith(P));

test('the muster roll runs and marks each day', async (t) => {
    if (!usable) return t.skip('no database');
    const out = await registers.musterRoll({ from: FROM, to: TO });
    const row = mine(out.rows)[0];
    assert.ok(row, 'the seeded worker is missing from the muster roll');

    // The failure that shipped: a Date object formatted as "Mon Jun 08" and
    // string-compared, marking every day as outside employment.
    assert.strictEqual(row.date_of_joining, '2026-06-08',
        'joining_date is not being formatted as YYYY-MM-DD from the Date pg returns');

    const notEmployed = row.marks.filter(m => m === '–').length;
    assert.notStrictEqual(notEmployed, out.days.length,
        'every day is outside employment — the joining-date comparison is broken');

    const idx = (d) => out.days.indexOf(d);
    assert.strictEqual(row.marks[idx('2026-06-08')], 'P', 'a punched day should be present');
    assert.strictEqual(row.marks[idx('2026-06-07')], '–', 'the day before joining');
    assert.strictEqual(row.marks[idx('2026-06-13')], 'W', 'Saturday');

    const counted = Object.values(row.totals).reduce((a, b) => a + b, 0);
    assert.strictEqual(counted + notEmployed, out.days.length, 'every day gets exactly one mark');
});

test('holidays and approved leave are not absence', async (t) => {
    if (!usable) return t.skip('no database');
    const out = await registers.musterRoll({ from: FROM, to: TO });
    const row = mine(out.rows)[0];
    const at = (d) => row.marks[out.days.indexOf(d)];

    // Both are optional inserts — assert only what the environment accepted.
    if (row.totals.holiday > 0) assert.strictEqual(at('2026-06-11'), 'H', 'a company holiday');
    if (row.totals.leave > 0) assert.strictEqual(at('2026-06-12'), 'L', 'approved leave');
    assert.notStrictEqual(at('2026-06-11'), 'A', 'a holiday must never read as absence');
    assert.notStrictEqual(at('2026-06-12'), 'A', 'approved leave must never read as absence');
});

test('the overtime register reads the column the engine writes', async (t) => {
    if (!usable) return t.skip('no database');
    const out = await registers.overtimeRegister({ from: FROM, to: TO });
    const rows = mine(out.rows);

    // Not a skip. Reading the wrong column returns no rows, and skipping on an
    // empty result is how this test failed to catch the bug it was written for:
    // overtime_minutes exists on some databases, is filled by nothing, and the
    // register simply came back empty. If the row was seeded, it must appear.
    if (!seededSummary) return t.skip('this environment has a different summary table');
    assert.strictEqual(rows.length, 1,
        'a day with 90 minutes of overtime was seeded and the register did not return it — ' +
        'the query is reading a column nothing writes');
    assert.strictEqual(rows[0].overtime_hours, 1.5, '90 minutes should be 1.5 hours');
});

test('the leave register runs — its aggregate does not group the outer query', async (t) => {
    if (!usable) return t.skip('no database');
    // SUM(CASE WHEN la.is_half_day ...) referenced an outer column, which makes
    // Postgres treat the aggregate as the outer query's and demand a GROUP BY.
    const out = await registers.leaveRegister({ from: FROM, to: TO });
    assert.ok(Array.isArray(out.rows), 'the leave register did not return rows');
    const rows = mine(out.rows);
    if (rows.length) assert.strictEqual(rows[0].days, 1, 'one full weekday of leave');
});

test('payroll gives a real payable-days figure', async (t) => {
    if (!usable) return t.skip('no database');
    const out = await payroll.payrollSummary({ from: FROM, to: TO });
    const row = mine(out.rows)[0];
    assert.ok(row, 'the seeded worker is missing from the payroll summary');

    // This is the number the whole feature exists to produce. It was 0 for every
    // employee in the company and the export still looked complete.
    assert.ok(row.payable_days > 0,
        'payable_days is zero — a wage file that looks filled in and is entirely wrong');
    assert.strictEqual(row.present_days, 3, 'three punched days');
    assert.ok(row.lop_days >= 0 && row.lop_days <= out.rows.length + 31, 'loss of pay is sane');

    const csv = payroll.toCSV(out, 'payroll-minimal');
    assert.ok(csv.split('\r\n').length > 1, 'the CSV has no data rows');
});
