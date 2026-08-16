/**
 * Statutory registers.
 *
 * The Factories Act requires a muster roll of every worker showing daily
 * attendance, an overtime register, and a leave register. They must be retained
 * — three years for the muster roll and wage registers, five for overtime and
 * leave — and produced on demand during a labour inspection.
 *
 * Every field these need already existed in this database. What was missing was
 * a way to print them, so the one document an inspector asks for could not be
 * produced from the system holding the data.
 *
 * ── What this does and does not claim ───────────────────────────────────────
 *
 * These produce the CONTENT of the registers. They are not certified forms.
 * Form numbers and column layouts are set by each state's Factories Rules —
 * Form 25 in Tamil Nadu, Form 29 in Maharashtra, others elsewhere — and a
 * layout that satisfies one inspector may not satisfy another. Treat the output
 * as the record, and lay it out to whatever form your state prescribes.
 *
 * One field a strict muster roll wants is not held here at all: the worker's
 * father's or husband's name. It is not on the employees table and is not
 * pulled from any HRMS, so it cannot be filled in. `missingFields` on every
 * response says so rather than leaving a silently blank column.
 *
 * ── Day classification ─────────────────────────────────────────────────────
 *
 * The muster roll marks each day per worker, and the rules for what counts as
 * what are the same ones the absent report took four separate fixes to get
 * right. They are applied here by the same reasoning:
 *
 *   H  holiday, honouring which location's holiday it is
 *   W  weekly off
 *   L  approved leave
 *   P  present — at least one punch
 *   A  absent
 *   –  outside employment: before joining, or after leaving
 *
 * A day on which nobody in the company punched at all is marked "?" rather than
 * absent. That is a day the system was not collecting — before this deployment
 * existed, or while the readers were down — and treating it as absence is what
 * produced 409 absences in a month for a company of seventy.
 *
 * ── Who appears ────────────────────────────────────────────────────────────
 *
 * Everyone employed during the period, including people who have since resigned
 * or been deleted. A muster roll for March is a record of who worked in March;
 * filtering it to today's active staff would silently omit anyone who left, and
 * those are precisely the records an inspection asks about. This is the one
 * report in the application that deliberately does not filter by current status.
 */

const db = require('../db');

/** Days between two dates, inclusive, as YYYY-MM-DD. */
const dayRange = (from, to) => {
    const out = [];
    const d = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (d <= end) {
        out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        d.setDate(d.getDate() + 1);
    }
    return out;
};

const MARK = { PRESENT: 'P', ABSENT: 'A', LEAVE: 'L', HOLIDAY: 'H', WEEKLY_OFF: 'W', NO_DATA: '?', NOT_EMPLOYED: '–' };

/**
 * Muster roll: one row per worker, one mark per day.
 *
 * @param {object} opts
 * @param {string} opts.from  YYYY-MM-DD
 * @param {string} opts.to    YYYY-MM-DD
 * @param {number} [opts.departmentId]
 */
const musterRoll = async ({ from, to, departmentId = null }) => {
    const days = dayRange(from, to);

    const params = [from, to];
    let deptFilter = '';
    if (departmentId) {
        params.push(departmentId);
        deptFilter = `AND e.department_id = $${params.length}`;
    }

    // Anyone employed at any point in the window. joining_date may be null on
    // records created before it was captured; those are included rather than
    // dropped, since omitting a worker from a muster roll is the worse error.
    const employees = (await db.query(`
        SELECT e.employee_code, e.name, e.gender, e.designation, e.employment_type,
               e.joining_date, e.deleted_at, e.holiday_location_id, e.status,
               d.name AS department_name
          FROM employees e
          LEFT JOIN departments d ON e.department_id = d.id
         WHERE e.attendance_required IS NOT FALSE
           AND (e.joining_date IS NULL OR e.joining_date <= $2::date)
           -- Also uses $1, and not only to keep Postgres happy. Someone removed
           -- before this period began never worked in it, and without this they
           -- appear as a row of dashes. Leaving $1 unreferenced is what broke
           -- this query outright: Postgres cannot infer a type for a parameter
           -- the statement never mentions, and rejects the whole thing with
           -- "could not determine data type of parameter $1".
           AND (e.deleted_at IS NULL OR e.deleted_at::date >= $1::date)
           ${deptFilter}
         ORDER BY d.name NULLS LAST, e.name
    `, params)).rows;

    const [punches, leaves, holidays, collecting] = await Promise.all([
        db.query(
            `SELECT employee_code, DATE(punch_time)::text AS day
               FROM attendance_logs
              WHERE DATE(punch_time) BETWEEN $1 AND $2
              GROUP BY employee_code, DATE(punch_time)`, [from, to]),
        db.query(
            `SELECT employee_code, from_date::text AS from_date, to_date::text AS to_date
               FROM leave_applications
              WHERE LOWER(status) = 'approved'
                AND to_date >= $1 AND from_date <= $2`, [from, to]),
        db.query(
            `SELECT date::text AS day, holiday_location_id
               FROM holidays WHERE date BETWEEN $1 AND $2`, [from, to]),
        // Days the system was collecting anything at all.
        db.query(
            `SELECT DISTINCT DATE(punch_time)::text AS day
               FROM attendance_logs WHERE DATE(punch_time) BETWEEN $1 AND $2`, [from, to])
    ]);

    const punchSet = new Set(punches.rows.map(r => `${r.employee_code}|${r.day}`));
    const collectingSet = new Set(collecting.rows.map(r => r.day));

    const holidayAll = new Set();
    const holidayByLocation = new Map();
    for (const h of holidays.rows) {
        if (h.holiday_location_id === null) holidayAll.add(h.day);
        else {
            if (!holidayByLocation.has(h.holiday_location_id)) holidayByLocation.set(h.holiday_location_id, new Set());
            holidayByLocation.get(h.holiday_location_id).add(h.day);
        }
    }

    const leaveByEmployee = new Map();
    for (const l of leaves.rows) {
        if (!leaveByEmployee.has(l.employee_code)) leaveByEmployee.set(l.employee_code, []);
        leaveByEmployee.get(l.employee_code).push([l.from_date, l.to_date]);
    }

    const rows = employees.map(e => {
        const joined = e.joining_date ? String(e.joining_date).slice(0, 10) : null;
        const left = e.deleted_at ? String(e.deleted_at).slice(0, 10) : null;
        const onLeave = leaveByEmployee.get(e.employee_code) || [];

        const marks = days.map(day => {
            if (joined && day < joined) return MARK.NOT_EMPLOYED;
            if (left && day > left) return MARK.NOT_EMPLOYED;

            if (punchSet.has(`${e.employee_code}|${day}`)) return MARK.PRESENT;

            if (holidayAll.has(day)) return MARK.HOLIDAY;
            if (e.holiday_location_id !== null && holidayByLocation.get(e.holiday_location_id)?.has(day)) return MARK.HOLIDAY;
            // An employee with no list assigned is matched against any holiday
            // — the lenient reading, matching the absent report.
            if (e.holiday_location_id === null && [...holidayByLocation.values()].some(s => s.has(day))) return MARK.HOLIDAY;

            const dow = new Date(`${day}T00:00:00`).getDay();
            if (dow === 0 || dow === 6) return MARK.WEEKLY_OFF;

            if (onLeave.some(([f, t]) => day >= f && day <= t)) return MARK.LEAVE;

            if (!collectingSet.has(day)) return MARK.NO_DATA;

            return MARK.ABSENT;
        });

        const count = (m) => marks.filter(x => x === m).length;
        return {
            employee_code: e.employee_code,
            name: e.name,
            gender: e.gender || null,
            designation: e.designation || null,
            employment_type: e.employment_type || null,
            department_name: e.department_name || null,
            date_of_joining: joined,
            status: e.status,
            marks,
            totals: {
                present: count(MARK.PRESENT),
                absent: count(MARK.ABSENT),
                leave: count(MARK.LEAVE),
                holiday: count(MARK.HOLIDAY),
                weekly_off: count(MARK.WEEKLY_OFF),
                no_data: count(MARK.NO_DATA)
            }
        };
    });

    return {
        register: 'Muster roll',
        statute: 'Factories Act — daily attendance of every worker',
        retention_years: 3,
        period: { from, to },
        days,
        legend: MARK,
        rows,
        missingFields: ["father's or husband's name — not held on the employee record"],
        notes: [
            'Includes workers who have since resigned or been removed. A muster roll for a past ' +
            'period is a record of who worked then.',
            '"?" marks a day on which no punch was recorded anywhere in the company — the system ' +
            'was not collecting, which is not the same as nobody attending.'
        ]
    };
};

/**
 * Overtime register: one row per worker per day with overtime recorded.
 *
 * Wage columns are deliberately absent. Overtime pay is a rate this system does
 * not hold, and a register showing a computed amount from a rate nobody entered
 * would be worse than one showing hours alone.
 */
const overtimeRegister = async ({ from, to, departmentId = null }) => {
    const params = [from, to];
    let deptFilter = '';
    if (departmentId) {
        params.push(departmentId);
        deptFilter = `AND e.department_id = $${params.length}`;
    }

    const rows = (await db.query(`
        SELECT e.employee_code, e.name, e.designation, d.name AS department_name,
               ads.date::text AS date,
               ads.in_time, ads.out_time,
               ads.duration_minutes,
               -- ot_minutes is what the attendance engine writes. overtime_minutes
               -- is a column nothing fills, and reading it showed every day as
               -- having no overtime.
               ads.ot_minutes AS overtime_minutes
          FROM attendance_daily_summary ads
          JOIN employees e ON e.employee_code = ads.employee_code
          LEFT JOIN departments d ON e.department_id = d.id
         WHERE ads.date BETWEEN $1 AND $2
           AND COALESCE(ads.ot_minutes, 0) > 0
           AND e.attendance_required IS NOT FALSE
           ${deptFilter}
         ORDER BY e.name, ads.date
    `, params)).rows.map(r => ({
        ...r,
        overtime_hours: Number((r.overtime_minutes / 60).toFixed(2)),
        worked_hours: r.duration_minutes ? Number((r.duration_minutes / 60).toFixed(2)) : null
    }));

    const totalMinutes = rows.reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);

    return {
        register: 'Overtime register',
        statute: 'Factories Act — overtime worked',
        retention_years: 5,
        period: { from, to },
        rows,
        totals: { entries: rows.length, overtime_hours: Number((totalMinutes / 60).toFixed(2)) },
        missingFields: [
            'overtime wage rate and amount — no pay rate is held in this system',
            'early exit — the attendance engine does not compute it, so it is always empty'
        ],
        notes: ['Only days with overtime above the configured threshold appear.']
    };
};

/**
 * Leave register: approved leave per worker over the period.
 *
 * Days are counted excluding weekends, and a half day counts as half — the same
 * arithmetic the leave balances screen uses, so the two cannot disagree.
 */
const leaveRegister = async ({ from, to, departmentId = null }) => {
    const params = [from, to];
    let deptFilter = '';
    if (departmentId) {
        params.push(departmentId);
        deptFilter = `AND e.department_id = $${params.length}`;
    }

    const rows = (await db.query(`
        SELECT e.employee_code, e.name, e.designation, d.name AS department_name,
               lt.name AS leave_type,
               la.from_date::text AS from_date,
               la.to_date::text AS to_date,
               la.is_half_day,
               la.reason,
               la.status,
               (SELECT SUM(CASE WHEN la.is_half_day THEN 0.5 ELSE 1 END)
                  FROM generate_series(GREATEST(la.from_date, $1::date),
                                       LEAST(la.to_date, $2::date),
                                       INTERVAL '1 day') AS dd
                 WHERE EXTRACT(DOW FROM dd) NOT IN (0, 6)) AS days
          FROM leave_applications la
          JOIN employees e ON e.employee_code = la.employee_code
          LEFT JOIN departments d ON e.department_id = d.id
          LEFT JOIN leave_types lt ON lt.id = la.leave_type_id
         WHERE LOWER(la.status) = 'approved'
           AND la.to_date >= $1 AND la.from_date <= $2
           ${deptFilter}
         ORDER BY e.name, la.from_date
    `, params)).rows.map(r => ({ ...r, days: r.days === null ? 0 : Number(r.days) }));

    return {
        register: 'Leave register',
        statute: 'Factories Act — leave with wages',
        retention_years: 5,
        period: { from, to },
        rows,
        totals: {
            entries: rows.length,
            days: Number(rows.reduce((s, r) => s + r.days, 0).toFixed(1))
        },
        missingFields: ['wages paid during leave — no pay rate is held in this system'],
        notes: ['Weekends within a leave period are not counted, matching the leave balances screen.']
    };
};

module.exports = { musterRoll, overtimeRegister, leaveRegister, MARK, dayRange };
