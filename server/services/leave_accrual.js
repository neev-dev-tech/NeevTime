/**
 * Leave accrual — the job that makes the policy fields real.
 *
 * leave_types has carried annual_quota, carry_forward and max_carry_forward
 * since it was created, and nothing ever wrote leave_balances.accrued: balances
 * moved only when an admin typed an opening figure or an approval deducted.
 * Every policy field was decorative — the same fault as the shift module, found
 * the same way.
 *
 * ── The accrual rule ────────────────────────────────────────────────────────
 *
 * quota/12 per completed-or-current month, credited on the 1st. Someone with 12
 * days a year holds 8 by August. Proration from joining: the joining month
 * counts when they joined on or before the 15th — the convention most Indian
 * HR follows, and stated here because whichever half-month rule a company
 * wanted, "silently none" was the previous behaviour.
 *
 * Idempotent by SETTING, not incrementing. accrued is computed as the target
 * value for (employee, type, year, month-now) and written only when it
 * differs. Running the job twice, or after three missed months, or from two
 * containers at once, converges on the same number — incrementing is how a
 * re-run doubles everyone's balance.
 *
 * ── Year end ────────────────────────────────────────────────────────────────
 *
 * On the new year: remaining = opening + carried + accrued − used(live, from
 * approved applications, the same figure the balance screen shows). Carry
 * min(remaining, max_carry_forward) into the new year's row when the type
 * allows it; write what expired into `lapsed`, because "where did my days go"
 * is a January question every year and the answer should be a number, not a
 * shrug.
 */

const db = require('../db');
const moment = require('moment-timezone');
const settings = require('../utils/settings');

const tzNow = async () => {
    const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');
    return moment.tz(moment.tz.zone(tz) ? tz : 'Asia/Kolkata');
};

/**
 * Months of `year` accrued by `asOf` for somebody who joined `joining`.
 * Pure, so the rule is testable without a database.
 */
const accruedMonths = (year, joiningDate, asOf) => {
    if (asOf.year() < year) return 0;
    const monthNow = asOf.year() > year ? 12 : asOf.month() + 1;

    let firstMonth = 1;
    if (joiningDate) {
        const j = moment(joiningDate);
        if (j.isValid()) {
            if (j.year() > year) return 0;
            if (j.year() === year) {
                firstMonth = j.month() + 1 + (j.date() > 15 ? 1 : 0);
            }
        }
    }
    return Math.max(0, monthNow - firstMonth + 1);
};

/** quota/12 × months, in the half-day steps the balance column stores. */
const accruedTarget = (annualQuota, months) =>
    Math.round((annualQuota / 12) * months * 2) / 2;

/**
 * Bring accrued up to date for every active employee and type.
 * Safe to re-run; returns what changed so callers can show their work.
 */
const runAccrual = async ({ dryRun = false } = {}) => {
    const now = await tzNow();
    const year = now.year();

    const [types, employees] = await Promise.all([
        db.query(`SELECT id, name, annual_quota FROM leave_types
                   WHERE is_active IS NOT FALSE AND annual_quota > 0`),
        db.query(`SELECT employee_code, joining_date FROM employees
                   WHERE LOWER(status) IS DISTINCT FROM 'resigned'
                     AND attendance_required IS NOT FALSE`),
    ]);

    const changes = [];
    for (const type of types.rows) {
        for (const emp of employees.rows) {
            const months = accruedMonths(year, emp.joining_date, now);
            const target = accruedTarget(Number(type.annual_quota), months);

            const existing = await db.query(
                `SELECT id, accrued FROM leave_balances
                  WHERE employee_code = $1 AND leave_type_id = $2 AND year = $3`,
                [emp.employee_code, type.id, year]);

            const current = existing.rows[0] ? Number(existing.rows[0].accrued) : null;
            if (current === target) continue;

            // Never DOWN outside a dry run's report. A quota lowered mid-year
            // would otherwise claw back days people may already have taken,
            // and a negative balance appears on somebody's payslip. Lowering
            // is a human decision made on the balance screen, with the audit
            // trail recording who.
            if (current !== null && target < current) {
                changes.push({ employee_code: emp.employee_code, type: type.name,
                    from: current, to: target, applied: false,
                    reason: 'target below current accrued — not lowered automatically' });
                continue;
            }

            changes.push({ employee_code: emp.employee_code, type: type.name,
                from: current, to: target, applied: !dryRun });
            if (dryRun) continue;

            await db.query(`
                INSERT INTO leave_balances (employee_code, leave_type_id, year, accrued, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (employee_code, leave_type_id, year)
                DO UPDATE SET accrued = $4, updated_at = NOW()
            `, [emp.employee_code, type.id, year, target]);
        }
    }
    return { year, month: now.month() + 1, changes };
};

/**
 * Close `fromYear` and open the next: carry what the type allows, record what
 * lapsed. Refuses to run twice — a second run would find remaining already
 * carried and lapse it.
 */
const runYearEnd = async (fromYear, { dryRun = false } = {}) => {
    const toYear = fromYear + 1;
    const rows = await db.query(`
        SELECT lb.id, lb.employee_code, lb.leave_type_id, lt.name AS type_name,
               lt.carry_forward, lt.max_carry_forward,
               COALESCE(lb.opening_balance,0) + COALESCE(lb.accrued,0)
                 + COALESCE(lb.carry_forward_balance,0) - COALESCE(u.days,0) AS remaining,
               (SELECT count(*) FROM leave_balances nb
                 WHERE nb.employee_code = lb.employee_code
                   AND nb.leave_type_id = lb.leave_type_id
                   AND nb.year = $2) AS next_exists
          FROM leave_balances lb
          JOIN leave_types lt ON lt.id = lb.leave_type_id
          LEFT JOIN LATERAL (
              SELECT SUM(CASE WHEN la.is_half_day THEN 0.5 ELSE 1 END) AS days
                FROM leave_applications la
               CROSS JOIN LATERAL generate_series(la.from_date, la.to_date, INTERVAL '1 day') d
               WHERE la.employee_code = lb.employee_code
                 AND la.leave_type_id = lb.leave_type_id
                 AND LOWER(la.status) = 'approved'
                 AND EXTRACT(YEAR FROM d) = lb.year
                 AND EXTRACT(DOW FROM d) NOT IN (0, 6)
          ) u ON TRUE
         WHERE lb.year = $1
    `, [fromYear, toYear]);

    const results = [];
    for (const row of rows.rows) {
        if (Number(row.next_exists) > 0) {
            results.push({ employee_code: row.employee_code, type: row.type_name,
                skipped: 'next year already exists — year end has run for this row' });
            continue;
        }
        const remaining = Math.max(0, Number(row.remaining));
        const carried = row.carry_forward
            ? Math.min(remaining, Number(row.max_carry_forward) || 0) : 0;
        const lapsed = Math.round((remaining - carried) * 2) / 2;

        results.push({ employee_code: row.employee_code, type: row.type_name,
            remaining, carried, lapsed, applied: !dryRun });
        if (dryRun) continue;

        await db.query('UPDATE leave_balances SET lapsed = $1, updated_at = NOW() WHERE id = $2',
            [lapsed, row.id]);
        await db.query(`
            INSERT INTO leave_balances (employee_code, leave_type_id, year, carry_forward_balance, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (employee_code, leave_type_id, year) DO NOTHING
        `, [row.employee_code, row.leave_type_id, toYear, carried]);
    }
    return { fromYear, toYear, results };
};

/**
 * Checks hourly, acts on the 1st of the month after 02:00 local — the same
 * restart-proof shape as the recompute job: a container reboot cannot skip the
 * run, and the date guard makes repeats harmless because the accrual itself is
 * idempotent. January 1st additionally closes the old year first, so
 * carry-forward exists before the new year's first accrual.
 */
let lastRunKey = null;
const startAccrualJob = () => {
    setInterval(async () => {
        try {
            const now = await tzNow();
            if (now.date() !== 1 || now.hour() < 2) return;
            const key = now.format('YYYY-MM');
            if (lastRunKey === key) return;
            lastRunKey = key;

            if (now.month() === 0) {
                const closed = await runYearEnd(now.year() - 1);
                console.log(`[LeaveAccrual] year end ${now.year() - 1}: ${closed.results.length} rows`);
            }
            const run = await runAccrual();
            const applied = run.changes.filter(c => c.applied).length;
            console.log(`[LeaveAccrual] ${key}: ${applied} balance(s) accrued`);
        } catch (err) {
            console.error('[LeaveAccrual] failed:', err.message);
        }
    }, 60 * 60 * 1000);
};

module.exports = { accruedMonths, accruedTarget, runAccrual, runYearEnd, startAccrualJob };
