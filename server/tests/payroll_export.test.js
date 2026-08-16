/**
 * Payroll numbers are deductions from people's wages.
 *
 * The figure to be most careful with is loss of pay. It is derived from absence
 * and from nothing else — in particular never from a day on which no reader in
 * the building reported anything. That distinction is not academic here: this
 * deployment ran for months counting reader outages, public holidays, approved
 * leave and pre-joining days as absence, and reported 409 absences in a month
 * for a company of seventy. Had payroll been wired to those numbers, seventy
 * people would have been short-paid and the error would have surfaced as a
 * dispute rather than as a strange-looking chart.
 *
 * The summary is built from the muster roll rather than from a second query, so
 * the register handed to a labour inspector and the file handed to payroll
 * cannot disagree. These tests hold that line.
 */

const test = require('node:test');
const assert = require('node:assert');

const load = (musterRollResult, overtimeRows = []) => {
    const dbPath = require.resolve('../db');
    const regPath = require.resolve('../services/registers');
    const svcPath = require.resolve('../services/payroll_export');
    const originals = { db: require.cache[dbPath], reg: require.cache[regPath] };

    require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: { query: async () => ({ rows: overtimeRows }) }
    };
    require.cache[regPath] = {
        id: regPath, filename: regPath, loaded: true,
        exports: { musterRoll: async () => musterRollResult }
    };
    delete require.cache[svcPath];
    const svc = require(svcPath);

    return {
        svc,
        restore() {
            delete require.cache[svcPath];
            if (originals.db) require.cache[dbPath] = originals.db; else delete require.cache[dbPath];
            if (originals.reg) require.cache[regPath] = originals.reg; else delete require.cache[regPath];
        }
    };
};

const roll = (totals, extra = {}) => ({
    rows: [{
        employee_code: 'E1', name: 'Asha', department_name: 'Plant',
        designation: 'Operator', date_of_joining: '2026-01-01',
        totals: { present: 0, absent: 0, leave: 0, holiday: 0, weekly_off: 0, no_data: 0, ...totals },
        ...extra
    }]
});

test('loss of pay counts absence and nothing else', async () => {
    const { svc, restore } = load(roll({ present: 18, absent: 2, leave: 1, holiday: 1, weekly_off: 8 }));
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        const r = out.rows[0];
        assert.strictEqual(r.lop_days, 2, 'loss of pay must be absence alone');
        assert.strictEqual(r.paid_leave_days, 1, 'approved leave is not loss of pay');
        assert.strictEqual(r.holiday_days, 1, 'a public holiday is not loss of pay');
        assert.strictEqual(r.weekly_off_days, 8, 'a weekend is not loss of pay');
    } finally { restore(); }
});

test('a day no reader reported is never loss of pay', async () => {
    const { svc, restore } = load(roll({ present: 15, absent: 1, no_data: 4, weekly_off: 8 }));
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        const r = out.rows[0];
        assert.strictEqual(r.lop_days, 1,
            'an uncollected day has been folded into loss of pay. A reader outage would ' +
            'become a deduction from someone\'s wages.');
        assert.strictEqual(r.uncollected_days, 4, 'uncollected days must be reported, not hidden');
    } finally { restore(); }
});

test('uncollected days raise a warning on the run', async () => {
    const { svc, restore } = load(roll({ present: 15, no_data: 3 }));
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        assert.strictEqual(out.warnings.length, 1, 'a period with missing attendance data warns nobody');
        assert.match(out.warnings[0], /reconcile/i);
    } finally { restore(); }
});

test('a clean period warns about nothing', async () => {
    const { svc, restore } = load(roll({ present: 22, weekly_off: 9 }));
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        assert.deepStrictEqual(out.warnings, [], 'a warning with no cause trains people to ignore warnings');
    } finally { restore(); }
});

test('payable days covers the whole period of employment', async () => {
    const { svc, restore } = load(roll({ present: 18, absent: 2, leave: 1, holiday: 1, weekly_off: 8, no_data: 1 }));
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        assert.strictEqual(out.rows[0].payable_days, 31,
            'payable days should account for every day the person was employed');
    } finally { restore(); }
});

test('overtime and late counts come across', async () => {
    const { svc, restore } = load(
        roll({ present: 20 }),
        [{ employee_code: 'E1', ot_minutes: '150', late_days: '3', early_exit_days: '1' }]
    );
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        const r = out.rows[0];
        assert.strictEqual(r.overtime_hours, 2.5, 'minutes are not being converted to hours');
        assert.strictEqual(r.late_days, 3);
        assert.strictEqual(r.early_exit_days, 1);
    } finally { restore(); }
});

test('an employee with no overtime row still exports', async () => {
    const { svc, restore } = load(roll({ present: 20 }), []);
    try {
        const out = await svc.payrollSummary({ from: '2026-08-01', to: '2026-08-31' });
        assert.strictEqual(out.rows[0].overtime_hours, 0);
        assert.strictEqual(out.rows[0].late_days, 0);
    } finally { restore(); }
});

test('CSV quotes anything that would break the file', () => {
    const { svc, restore } = load(roll({}));
    try {
        const csv = svc.toCSV({
            rows: [{ employee_code: 'E1', employee_name: 'Rao, K "Bob"', payable_days: 30, lop_days: 0 }]
        }, 'payroll-minimal');
        const line = csv.split('\r\n')[1];
        assert.ok(line.includes('"Rao, K ""Bob"""'),
            'a name containing a comma or quote is not escaped, so the columns shift');
    } finally { restore(); }
});

test('an unknown template is refused, not quietly swapped', () => {
    const { svc, restore } = load(roll({}));
    try {
        assert.throws(
            () => svc.toCSV({ rows: [] }, 'not-a-template'),
            /Unknown payroll template/,
            'an unknown template falls back to another layout. A payroll import with the ' +
            'wrong columns is worse than one that does not run.'
        );
    } finally { restore(); }
});

test('every template only names fields that exist', () => {
    const { svc, restore } = load(roll({}));
    try {
        const canonical = new Set(Object.keys(svc.CANONICAL));
        for (const [key, tpl] of Object.entries(svc.TEMPLATES)) {
            for (const col of tpl.columns) {
                if (col.field === null || col.field === undefined) {
                    assert.ok('constant' in col, `${key}: column "${col.header}" has neither a field nor a constant`);
                    continue;
                }
                assert.ok(canonical.has(col.field),
                    `${key}: column "${col.header}" reads "${col.field}", which is not a canonical field — ` +
                    `it would export as blank`);
            }
        }
    } finally { restore(); }
});
