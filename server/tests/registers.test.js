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
            query: async (sql) => {
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
