/**
 * Who may approve whose leave and attendance corrections.
 *
 * Both models, because companies differ and a product that assumes one is wrong
 * at half its customers:
 *
 *   manager      the employee's own reporting manager
 *   department   whoever is named approver for their department
 *   hr           any admin or HR user, as today
 *
 * Settings → Approvals → approval_chain sets the order. The first level that
 * yields somebody wins, so 'manager,department,hr' routes to a real reporting
 * line where one exists and falls back where it does not.
 *
 * HR belongs at the end of every chain. A request that reaches nobody is a
 * request that sits forever, and the person waiting on it has no way to tell
 * the difference between "not yet looked at" and "nobody can look at it".
 */

const db = require('../db');
const settings = require('../utils/settings');

const DEFAULT_CHAIN = 'manager,department,hr';

const chain = async () => {
    const raw = await settings.get('approvals', 'approval_chain', DEFAULT_CHAIN);
    const levels = String(raw || DEFAULT_CHAIN)
        .split(',').map(s => s.trim().toLowerCase())
        .filter(s => ['manager', 'department', 'hr'].includes(s));
    return levels.length ? levels : DEFAULT_CHAIN.split(',');
};

/**
 * The employees who may approve for this person, and how each qualifies.
 *
 * Every level in the chain contributes — this is a union, not a first-match.
 *
 * First-match was the obvious reading and it is wrong in practice: it means a
 * department head cannot act while a reporting manager exists, so a manager on
 * leave blocks their entire team until somebody edits the org chart. Real
 * approval works the way it was described to me — managers approve day to day,
 * HR participates, and either can act when the other is unavailable.
 *
 * The order still matters for one thing: `primary` is the level a request is
 * routed to, and it is what the portal shows as "waiting on" so two people do
 * not both assume the other has it.
 *
 * Returns [] only when the chain excludes hr and nobody is configured, which is
 * a misconfiguration worth seeing rather than papering over.
 */
const approversFor = async (employeeCode) => {
    const levels = await chain();

    const employee = await db.query(
        `SELECT e.id, e.employee_code, e.department_id, e.reporting_manager_id
           FROM employees e WHERE e.employee_code = $1`, [employeeCode]);
    const target = employee.rows[0];
    if (!target) return [];

    const found = [];

    for (const level of levels) {
        if (level === 'manager' && target.reporting_manager_id) {
            const m = await db.query(
                `SELECT employee_code, name FROM employees
                  WHERE id = $1 AND LOWER(status) IS DISTINCT FROM 'resigned'`,
                [target.reporting_manager_id]);
            // A manager who has left approves nothing, and their reports must
            // not stop dead — the other levels still apply.
            if (m.rows[0]) found.push({ ...m.rows[0], via: 'manager' });
        }

        if (level === 'department' && target.department_id) {
            const d = await db.query(
                `SELECT e.employee_code, e.name FROM department_approvers da
                   JOIN employees e ON e.id = da.employee_id
                  WHERE da.department_id = $1
                    AND LOWER(e.status) IS DISTINCT FROM 'resigned'
                    AND e.employee_code <> $2`,
                [target.department_id, employeeCode]);
            found.push(...d.rows.map(r => ({ ...r, via: 'department' })));
        }

        if (level === 'hr') {
            found.push({ employee_code: null, name: 'HR', via: 'hr' });
        }
    }

    // Somebody who is both a reporting manager and a department approver
    // appears once, credited to whichever level the chain reaches first.
    const seen = new Set();
    const unique = found.filter(a => {
        const key = a.employee_code ?? 'hr';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // The employee themselves never approves their own request, at any level.
    // A department approver requesting leave would otherwise sign it off.
    return unique.filter(a => a.employee_code !== employeeCode);
};

/** Where a request is routed — the first level that yields a person. */
const primaryApprover = async (employeeCode) => {
    const all = await approversFor(employeeCode);
    return all.find(a => a.employee_code) || all[0] || null;
};

/**
 * May this person approve that person's request?
 *
 * Asked of every approval, not only used to build a list — a list is a
 * convenience and this is the check. Nobody approves their own request at any
 * level, including an HR user who is also an employee.
 */
const canApprove = async (approverCode, targetCode) => {
    if (!approverCode || !targetCode) return { allowed: false, via: null };
    if (approverCode === targetCode) {
        return { allowed: false, via: null, reason: 'You cannot approve your own request' };
    }

    const approvers = await approversFor(targetCode);
    const match = approvers.find(a => a.employee_code === approverCode);
    if (match) return { allowed: true, via: match.via };

    return { allowed: false, via: null, reason: 'This request is not yours to approve' };
};

/**
 * Everything waiting on this person, across both request types.
 *
 * Built by asking who approves each pending request rather than by inverting
 * the rule into a query. The inverted version has to duplicate the chain logic
 * in SQL, and the two then disagree the first time the chain changes — which is
 * the failure the whole product keeps producing in other forms.
 */
const pendingFor = async (approverCode) => {
    const [leaves, regs] = await Promise.all([
        db.query(
            `SELECT l.id, l.employee_code, e.name AS employee_name, l.leave_type,
                    l.start_date, l.end_date, l.days, l.reason, l.created_at
               FROM leaves l JOIN employees e ON e.employee_code = l.employee_code
              WHERE LOWER(l.status) = 'pending'
              ORDER BY l.created_at`),
        db.query(
            `SELECT r.id, r.employee_code, e.name AS employee_name, r.date,
                    r.requested_in_time, r.requested_out_time, r.reason, r.created_at
               FROM attendance_regularizations r
               JOIN employees e ON e.employee_code = r.employee_code
              WHERE LOWER(r.status) = 'pending'
              ORDER BY r.created_at`),
    ]);

    const mine = async (rows, type) => {
        const out = [];
        for (const row of rows) {
            const { allowed, via } = await canApprove(approverCode, row.employee_code);
            if (allowed) out.push({ ...row, type, via });
        }
        return out;
    };

    return {
        leaves: await mine(leaves.rows, 'leave'),
        regularizations: await mine(regs.rows, 'regularization'),
    };
};

/** Does this person approve for anybody at all? Decides whether to show the tab. */
const isApprover = async (employeeCode) => {
    const [reports, departments] = await Promise.all([
        db.query(
            `SELECT 1 FROM employees e
               JOIN employees m ON m.id = e.reporting_manager_id
              WHERE m.employee_code = $1 LIMIT 1`, [employeeCode]),
        db.query(
            `SELECT 1 FROM department_approvers da
               JOIN employees e ON e.id = da.employee_id
              WHERE e.employee_code = $1 LIMIT 1`, [employeeCode]),
    ]);
    return reports.rows.length > 0 || departments.rows.length > 0;
};

module.exports = {
    chain, approversFor, primaryApprover, canApprove, pendingFor, isApprover, DEFAULT_CHAIN,
};
