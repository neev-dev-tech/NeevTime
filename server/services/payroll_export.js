/**
 * Attendance in the shape payroll needs, in whatever layout a payroll system
 * wants to read.
 *
 * ── Why this is a file and not an API client ───────────────────────────────
 *
 * There is no way to integrate with every payroll product by API, and trying is
 * the same mistake the HRMS adapters made. Tally, Busy and Marg are desktop
 * applications with no API at all. The cloud products that do have one —
 * greytHR, Keka, Zoho Payroll, RazorpayX — gate it behind a partner agreement
 * or a reviewed OAuth application, which a self-hosted attendance system cannot
 * obtain on a customer's behalf. Four adapters for exactly that class of vendor
 * were deleted from this codebase for being buttons that could never work.
 *
 * What every payroll product can do, without exception and without anybody
 * buying anything, is import a file. So this computes the numbers once and
 * renders them into whatever columns a given payroll expects.
 *
 * ── One computation ────────────────────────────────────────────────────────
 *
 * The figures come from the muster roll, not from a second query written for
 * payroll. That is deliberate. The muster roll is the document handed to a
 * labour inspector; if payroll were computed separately the two could disagree,
 * and discovering that during an inspection is the worst possible time. Same
 * numbers, two renderings.
 *
 * It also means payroll inherits the corrections that report took: public
 * holidays matched by location, approved leave, days before joining, and days
 * on which no reader in the building reported at all. That last one matters
 * most here — a reader outage counted as absence becomes a deduction from
 * someone's wages.
 *
 * ── Templates are data ─────────────────────────────────────────────────────
 *
 * A template is a name and a list of columns. Adding support for a client's
 * payroll is one entry, not a release, and the entry can be written by whoever
 * has actually seen that payroll's import screen. The canonical fields below
 * are the vocabulary; a template selects and renames them.
 */

const { musterRoll } = require('./registers');
const db = require('../db');

/**
 * The fields every payroll import is assembled from.
 *
 * `lop_days` is the one to be careful with. Loss of pay is what payroll deducts
 * against, so it is derived from absence alone — never from "no data". A day the
 * system was not collecting is not a day someone failed to attend, and paying
 * them less for it because a reader was unplugged is not a rounding error.
 */
const CANONICAL = {
    employee_code: 'Employee code as held by the biometric system',
    employee_name: 'Full name',
    department: 'Department name, blank if unassigned',
    designation: 'Designation, blank if unassigned',
    date_of_joining: 'YYYY-MM-DD, blank if not recorded',
    period_from: 'First day of the period',
    period_to: 'Last day of the period',
    payable_days: 'Days in the period the person was employed and expected to work',
    present_days: 'Days with at least one punch',
    lop_days: 'Loss of pay — absent days only, never days the system was not collecting',
    paid_leave_days: 'Approved leave falling in the period',
    weekly_off_days: 'Saturdays and Sundays',
    holiday_days: 'Public holidays, matched to this person\'s holiday list',
    uncollected_days: 'Days no reader in the company reported. Reconcile before running payroll.',
    overtime_hours: 'Sum of overtime recorded on daily summaries',
    late_days: 'Days with a late arrival',
    early_exit_days: 'Days with an early departure. Always 0 — the engine does not compute early exit.'
};

/**
 * Built-in templates.
 *
 * Generic first, because it is the one that always works: a client whose
 * payroll is not listed maps these columns on their own import screen. The
 * named ones are a convenience, not a guarantee — column headings differ
 * between versions of the same product, and nobody here has seen every import
 * screen. Treat a named template as a starting point to be checked once.
 */
const TEMPLATES = {
    generic: {
        name: 'Generic (all fields)',
        description: 'Every canonical field. Map the columns on your payroll\'s import screen.',
        columns: Object.keys(CANONICAL).map(field => ({ header: field, field }))
    },
    'payroll-minimal': {
        name: 'Minimal payroll input',
        description: 'The four numbers most payroll runs actually need.',
        columns: [
            { header: 'Employee Code', field: 'employee_code' },
            { header: 'Employee Name', field: 'employee_name' },
            { header: 'Payable Days', field: 'payable_days' },
            { header: 'LOP Days', field: 'lop_days' }
        ]
    },
    tally: {
        name: 'Tally — attendance import',
        description: 'Columns matching Tally\'s attendance voucher import. Verify against your version.',
        columns: [
            { header: 'Employee Name', field: 'employee_name' },
            { header: 'Employee Number', field: 'employee_code' },
            { header: 'Attendance Type', field: null, constant: 'Present' },
            { header: 'Value', field: 'present_days' },
            { header: 'Absent Days', field: 'lop_days' },
            { header: 'Overtime Hours', field: 'overtime_hours' }
        ]
    },
    'greythr-style': {
        name: 'greytHR-style attendance upload',
        description: 'Common column set for greytHR and similar cloud payroll. Verify against your tenant.',
        columns: [
            { header: 'EmployeeNo', field: 'employee_code' },
            { header: 'Name', field: 'employee_name' },
            { header: 'PresentDays', field: 'present_days' },
            { header: 'LOPDays', field: 'lop_days' },
            { header: 'PaidLeaveDays', field: 'paid_leave_days' },
            { header: 'OTHours', field: 'overtime_hours' }
        ]
    }
};

/**
 * Canonical per-employee figures for a period.
 *
 * `uncollected_days` is carried through rather than folded into anything.
 * Payroll should see it: a non-zero value means part of the period has no
 * attendance data at all, and the run should wait until that is reconciled.
 */
const payrollSummary = async ({ from, to, departmentId = null }) => {
    const roll = await musterRoll({ from, to, departmentId });

    const overtime = (await db.query(`
        SELECT employee_code,
               -- ot_minutes, not overtime_minutes. The engine writes ot_minutes;
               -- overtime_minutes is a column nothing fills, so reading it
               -- reported every employee as having worked no overtime.
               COALESCE(SUM(ot_minutes), 0) AS ot_minutes,
               COUNT(*) FILTER (WHERE COALESCE(late_minutes, 0) > 0) AS late_days,
               COUNT(*) FILTER (WHERE COALESCE(early_leave_minutes, 0) > 0) AS early_exit_days
          FROM attendance_daily_summary
         WHERE date BETWEEN $1 AND $2
         GROUP BY employee_code
    `, [from, to])).rows;

    const otByEmployee = new Map(overtime.map(r => [r.employee_code, r]));

    const rows = roll.rows.map(r => {
        const ot = otByEmployee.get(r.employee_code) || {};
        const t = r.totals;
        return {
            employee_code: r.employee_code,
            employee_name: r.name || '',
            department: r.department_name || '',
            designation: r.designation || '',
            date_of_joining: r.date_of_joining || '',
            period_from: from,
            period_to: to,
            // Days employed and expected in. Weekly offs and holidays are paid
            // days in most Indian payroll, so they stay in payable days; only
            // days outside employment are excluded.
            payable_days: t.present + t.absent + t.leave + t.holiday + t.weekly_off + t.no_data,
            present_days: t.present,
            lop_days: t.absent,
            paid_leave_days: t.leave,
            weekly_off_days: t.weekly_off,
            holiday_days: t.holiday,
            uncollected_days: t.no_data,
            overtime_hours: Number(((Number(ot.ot_minutes) || 0) / 60).toFixed(2)),
            late_days: Number(ot.late_days) || 0,
            early_exit_days: Number(ot.early_exit_days) || 0
        };
    });

    const uncollected = rows.reduce((s, r) => s + r.uncollected_days, 0);

    return {
        period: { from, to },
        fields: CANONICAL,
        rows,
        warnings: uncollected > 0
            ? [`${uncollected} employee-days in this period have no attendance data at all — no reader ` +
               `reported. They are counted in payable days and NOT in loss of pay. Reconcile before ` +
               `running payroll.`]
            : []
    };
};

/** RFC 4180 quoting: a field containing a comma, quote or newline is quoted. */
const csvCell = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Render a summary through a template.
 *
 * An unknown template is an error, not a fallback to the generic one. Silently
 * producing a different layout than the one asked for is how a payroll import
 * goes in wrong — the same reasoning that made an unknown employee `view`
 * return 400 rather than quietly handing back the wrong population.
 */
const toCSV = (summary, templateKey = 'generic') => {
    const template = TEMPLATES[templateKey];
    if (!template) {
        const err = new Error(`Unknown payroll template "${templateKey}"`);
        err.allowed = Object.keys(TEMPLATES);
        throw err;
    }

    const lines = [template.columns.map(c => csvCell(c.header)).join(',')];
    for (const row of summary.rows) {
        lines.push(template.columns.map(c =>
            csvCell(c.field === null || c.field === undefined ? c.constant : row[c.field])
        ).join(','));
    }
    return lines.join('\r\n');
};

/** Templates, for a picker. */
const listTemplates = () => Object.entries(TEMPLATES).map(([key, t]) => ({
    key, name: t.name, description: t.description,
    columns: t.columns.map(c => c.header)
}));

module.exports = { payrollSummary, toCSV, listTemplates, TEMPLATES, CANONICAL };
