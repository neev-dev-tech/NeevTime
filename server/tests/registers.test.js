/**
 * The muster roll must mark each day the way the law reads it, and must not
 * repeat the mistakes the absent report made.
 *
 * That report was wrong four separate ways at once — it counted public
 * holidays, approved leave, days before a person joined, and days on which the
 * system collected nothing at all, and produced 409 absences in a month for a
 * company of seventy. The muster roll is the same computation with a stricter
 * audience: a labour inspector, reading a document the company is required to
 * keep for three years.
 *
 * These tests run the classification against a fixed dataset with a known
 * answer, rather than checking that certain SQL appears in a file.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

/**
 * Stub ../db before requiring the service, so the queries run against fixed
 * rows. The service issues five queries in a known order; each is matched on a
 * fragment of its text rather than on call order, so reordering them inside the
 * service does not silently feed the wrong rows in.
 */
const withFixture = (fixture, fn) => {
    const dbPath = require.resolve('../db');
    const original = require.cache[dbPath];
    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: {
            query: async (sql, params = []) => {
                // Every parameter passed must be referenced by the statement.
                //
                // Postgres cannot infer a type for a placeholder the query never
                // mentions and rejects the whole statement with "could not
                // determine data type of parameter $1". That is precisely how
                // the muster roll — and the payroll export built on it — failed
                // in production: params were [from, to] and only $2 appeared.
                //
                // These tests stub the database, so the SQL is never parsed by
                // Postgres and nothing here would have noticed. This is the
                // cheapest thing that would have.
                for (let i = 1; i <= params.length; i++) {
                    if (!new RegExp(`\\$${i}\\b`).test(sql)) {
                        throw new Error(
                            `query passes ${params.length} parameter(s) but never references $${i} — ` +
                            `Postgres rejects this outright: ${sql.trim().slice(0, 80)}`
                        );
                    }
                }
                for (const [fragment, rows] of fixture) {
                    if (sql.includes(fragment)) return { rows };
                }
                throw new Error('unexpected query: ' + sql.slice(0, 90));
            }
        }
    };
    const svcPath = require.resolve('../services/registers');
    delete require.cache[svcPath];
    const svc = require(svcPath);
    return Promise.resolve(fn(svc)).finally(() => {
        delete require.cache[svcPath];
        if (original) require.cache[dbPath] = original; else delete require.cache[dbPath];
    });
};

// Mon 3 Aug .. Sun 9 Aug 2026. 8 Aug is a Saturday, 9 Aug a Sunday.
const WEEK = { from: '2026-08-03', to: '2026-08-09' };

// The weekdays of that window. Tests that expect an 'A' must say the company
// was collecting on that day, otherwise the correct mark is '?' — the service
// declining to call a reader outage an absence.
const ALL_WEEKDAYS = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']
    .map(day => ({ day }));

const baseEmployee = {
    employee_code: 'E1', name: 'Asha', gender: 'F', designation: 'Operator',
    employment_type: 'Permanent', joining_date: '2026-01-01', deleted_at: null,
    holiday_location_id: null, status: 'active', department_name: 'Plant'
};

const fixture = ({ employees = [baseEmployee], punches = [], leaves = [], holidays = [], collecting = null }) => [
    ['FROM employees e', employees],
    ['GROUP BY employee_code, DATE(punch_time)', punches],
    ['FROM leave_applications', leaves],
    ['FROM holidays WHERE date', holidays],
    ['SELECT DISTINCT DATE(punch_time)', collecting ?? punches.map(p => ({ day: p.day }))]
];

test('a punch marks the day present', () => withFixture(
    fixture({ punches: [{ employee_code: 'E1', day: '2026-08-03' }] }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows[0].marks[0], 'P');
        assert.strictEqual(out.rows[0].totals.present, 1);
    }
));

test('Saturday and Sunday are weekly off, not absence', () => withFixture(
    fixture({ punches: [{ employee_code: 'E1', day: '2026-08-03' }] }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows[0].marks[5], 'W', 'Saturday 8 Aug');
        assert.strictEqual(out.rows[0].marks[6], 'W', 'Sunday 9 Aug');
        assert.strictEqual(out.rows[0].totals.weekly_off, 2);
    }
));

test('a public holiday is a holiday, not absence', () => withFixture(
    fixture({
        punches: [{ employee_code: 'E1', day: '2026-08-03' }],
        holidays: [{ day: '2026-08-04', holiday_location_id: null }],
        collecting: ALL_WEEKDAYS
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows[0].marks[1], 'H');
        assert.strictEqual(out.rows[0].totals.absent, 3, 'Wed, Thu, Fri remain absent');
    }
));

test("a holiday for another location does not exempt this worker", () => withFixture(
    fixture({
        employees: [{ ...baseEmployee, holiday_location_id: 1 }],
        punches: [{ employee_code: 'E1', day: '2026-08-03' }],
        holidays: [{ day: '2026-08-04', holiday_location_id: 2 }],
        collecting: ALL_WEEKDAYS
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows[0].marks[1], 'A',
            'a holiday at site 2 must not mark a worker at site 1 as on holiday');
    }
));

test('approved leave is leave, not absence', () => withFixture(
    fixture({
        punches: [{ employee_code: 'E1', day: '2026-08-03' }],
        leaves: [{ employee_code: 'E1', from_date: '2026-08-04', to_date: '2026-08-05' }]
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.deepStrictEqual(out.rows[0].marks.slice(1, 3), ['L', 'L']);
        assert.strictEqual(out.rows[0].totals.leave, 2);
    }
));

test('days before joining are not absence', () => withFixture(
    fixture({
        employees: [{ ...baseEmployee, joining_date: '2026-08-05' }],
        punches: [{ employee_code: 'E1', day: '2026-08-05' }],
        collecting: ALL_WEEKDAYS
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.deepStrictEqual(out.rows[0].marks.slice(0, 2), ['–', '–']);
        assert.strictEqual(out.rows[0].totals.absent, 2, 'only Thu and Fri after joining');
    }
));

test('a day the system collected nothing is not absence', () => withFixture(
    // Punches exist on the 3rd only, so the 4th–7th were never collected.
    fixture({
        punches: [{ employee_code: 'E1', day: '2026-08-03' }],
        collecting: [{ day: '2026-08-03' }]
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows[0].totals.absent, 0,
            'no punch anywhere in the company means the readers were not reporting');
        assert.strictEqual(out.rows[0].totals.no_data, 4);
    }
));

test('a worker who has left still appears, and only for the days they worked', () => withFixture(
    fixture({
        employees: [{ ...baseEmployee, deleted_at: '2026-08-05', status: 'deleted' }],
        punches: [{ employee_code: 'E1', day: '2026-08-03' }, { employee_code: 'E1', day: '2026-08-04' }],
        collecting: [{ day: '2026-08-03' }, { day: '2026-08-04' }, { day: '2026-08-05' },
                     { day: '2026-08-06' }, { day: '2026-08-07' }]
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.rows.length, 1, 'a departed worker is missing from the muster roll');
        assert.strictEqual(out.rows[0].marks[3], '–', 'the 6th is after they left');
        assert.strictEqual(out.rows[0].totals.present, 2);
    }
));

test('the register states what it cannot fill in', () => withFixture(
    fixture({ punches: [] }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.ok(out.missingFields.length > 0, 'missingFields is empty');
        assert.ok(
            out.missingFields.some(f => /father|husband/i.test(f)),
            "the muster roll wants a father's or husband's name and this system does not hold one; " +
            'saying so is the difference between a gap and a silently blank column'
        );
        assert.strictEqual(out.retention_years, 3);
    }
));

test('every day in the period gets exactly one mark', () => withFixture(
    fixture({ punches: [{ employee_code: 'E1', day: '2026-08-03' }] }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        assert.strictEqual(out.days.length, 7);
        assert.strictEqual(out.rows[0].marks.length, out.days.length);
        const t = out.rows[0].totals;
        const summed = t.present + t.absent + t.leave + t.holiday + t.weekly_off + t.no_data;
        assert.strictEqual(summed, 7, 'the marks do not add up to the number of days');
    }
));

test('every column the registers read is one ensureSchema guarantees', () => {
    // schema_columns.test.js walks INSERT statements. These failures were
    // SELECTs, so it saw nothing: the muster roll and payroll export read
    // late_minutes, early_leave_minutes and overtime_minutes from
    // attendance_daily_summary, 00_init_all.sql declares all three, and this
    // deployment's table had none of them. A schema file describes what a fresh
    // install receives; ensureSchema is the only thing that runs against a
    // database that already exists.
    const fs = require('node:fs');
    const path = require('node:path');
    const SERVER = path.join(__dirname, '..');
    const ensure = fs.readFileSync(path.join(SERVER, 'server.js'), 'utf8');

    // The names the attendance engine actually writes. overtime_minutes was
    // read here for a while and is filled by nothing — every overtime figure
    // came back zero, silently, which is the worst way for a payroll input to
    // be wrong.
    const READ_FROM_SUMMARY = ['late_minutes', 'early_leave_minutes'];

    for (const col of READ_FROM_SUMMARY) {
        assert.ok(
            new RegExp(`ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS ${col}\\b`).test(ensure),
            `attendance_daily_summary.${col} is read by the registers or the payroll export, ` +
            `but ensureSchema does not create it. On a database that predates the schema file ` +
            `the query fails outright — which is exactly how the payroll export shipped broken.`
        );
    }

    // And the services really do read them, so this test cannot quietly become
    // vacuous if the queries change.
    const sources = ['services/registers.js', 'services/payroll_export.js']
        .map(f => fs.readFileSync(path.join(SERVER, f), 'utf8')).join('\n');
    for (const col of READ_FROM_SUMMARY) {
        assert.ok(sources.includes(col), `${col} is no longer read; drop it from this test`);
    }
});

test('overtime is read from the column the engine writes', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const SERVER = path.join(__dirname, '..');

    // services/attendance_engine.js writes ot_minutes. Nothing anywhere writes
    // overtime_minutes, so a query reading it returns zero for every employee
    // and every day — a payroll input that is wrong and looks fine.
    const engine = fs.readFileSync(path.join(SERVER, 'services/attendance_engine.js'), 'utf8');
    assert.ok(/ot_minutes/.test(engine), 'the engine no longer writes ot_minutes; check what it writes now');

    for (const f of ['services/registers.js', 'services/payroll_export.js']) {
        const src = fs.readFileSync(path.join(SERVER, f), 'utf8');
        const sqlRefs = [...src.matchAll(/(?:ads\.|SUM\(|COALESCE\()\s*overtime_minutes/g)];
        assert.strictEqual(sqlRefs.length, 0,
            `${f} reads overtime_minutes from the database. The engine writes ot_minutes; ` +
            `overtime_minutes is filled by nothing and every overtime figure comes back zero.`);
    }
});

test('date columns arrive as Date objects, not strings', () => withFixture(
    // pg returns DATE columns as JS Date objects. Every fixture above passes
    // strings, so none of them exercised the coercion — and the production bug
    // was exactly there: String(date).slice(0, 10) gives "Wed Jul 09", which
    // string-compares against "2026-08-04" with digits sorting before letters.
    // Every day read as before the joining date, every worker was marked never
    // employed, and the payroll export gave everyone zero payable days.
    fixture({
        employees: [{ ...baseEmployee, joining_date: new Date(2026, 7, 5), deleted_at: null }],
        punches: [{ employee_code: 'E1', day: '2026-08-05' }],
        collecting: ALL_WEEKDAYS
    }),
    async (svc) => {
        const out = await svc.musterRoll(WEEK);
        const row = out.rows[0];
        assert.strictEqual(row.date_of_joining, '2026-08-05',
            'a Date object is not being formatted to YYYY-MM-DD');
        assert.deepStrictEqual(row.marks.slice(0, 2), ['–', '–'], 'days before joining');
        assert.strictEqual(row.marks[2], 'P', 'the joining day itself has a punch');

        // totals deliberately exclude days outside employment, so they sum to
        // the days worked rather than the days in the period. That is what
        // payable_days depends on: someone who joined mid-month is not owed the
        // days before they started.
        const counted = Object.values(row.totals).reduce((a, b) => a + b, 0);
        const notEmployed = row.marks.filter(m => m === '–').length;
        assert.strictEqual(counted + notEmployed, out.days.length, 'every day gets exactly one mark');
        assert.strictEqual(notEmployed, 2, 'only the two days before joining are outside employment');
        assert.notStrictEqual(row.totals.present + row.totals.absent + row.totals.weekly_off, 0,
            'every day came back as outside employment, which is the Date-coercion bug');
    }
));

test('the insight reports read the stored summary, not their own arithmetic', () => {
    // Both new reports exist to be compared against payroll. A cross-tab
    // computed from raw punches would drift from the register the first time
    // the engine and the report disagreed about a rule, and the sheet in
    // somebody's hands is the version that gets argued.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'services/reports.js'), 'utf8');

    for (const fn of ['generateDepartmentMonthly', 'generateTrends']) {
        const at = src.indexOf(`const ${fn}`);
        assert.ok(at > -1, `${fn} has gone`);
        const body = src.slice(at, src.indexOf('};', at));
        assert.match(body, /FROM (employees e|attendance_daily_summary s)/,
            `${fn} no longer reads the stored summary`);
        assert.ok(!/FROM attendance_logs/.test(body),
            `${fn} recomputes from raw punches — it will disagree with the register`);
    }
});

test('no report casts punch_state to int raw, and none reads exits as arrivals', () => {
    // Two faults, one line apart, found from a user's screenshot. The raw
    // ::int cast died on the legacy 'check_in' rows kept from the old mobile
    // path — one such row inside the range took the whole report down. And the
    // <=1/>1 direction reading counted exits as arrivals and matched nothing
    // as an exit, so last_out was NULL and check-outs were zero for everything
    // this system's own ingest ever wrote. The late-early report was fixed for
    // the second fault months ago; its three siblings were not.
    const fs = require('fs');
    const path = require('path');
    // Comments stripped before matching — the notes explaining these bugs
    // quote the broken patterns, and this guard has to test code, not history.
    const src = fs.readFileSync(path.join(__dirname, '..', 'services/reports.js'), 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('--')).join('\n');

    assert.ok(!/punch_state::int/.test(src),
        'a raw punch_state::int cast is back — one legacy row will crash the report');
    assert.match(src, /punch_state_int\(/, 'the tolerant cast is gone');
    assert.ok(!/punch_state_int\([^)]*\) <= 1/.test(src),
        'a report reads <=1 as an arrival again — exits are counted as check-ins');
    assert.ok(!/punch_state_int\([^)]*\) > 1/.test(src),
        'a report reads >1 as an exit again — nothing this system writes matches, last_out goes NULL');
});
