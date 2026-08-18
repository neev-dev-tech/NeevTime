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
const canApprove = async (approverCode, targetCode, request = null) => {
    if (!approverCode || !targetCode) return { allowed: false, via: null };
    if (approverCode === targetCode) {
        return { allowed: false, via: null, reason: 'You cannot approve your own request' };
    }

    // A request travelling a flow answers to its current step, nobody else —
    // except HR, which can always act: a flow whose approver has left must not
    // trap a request forever, and the override is recorded as what it is.
    if (request?.flow_id && request?.current_step) {
        const step = await stepApprovers(request.flow_id, request.current_step, targetCode);
        const inStep = step.find(a => a.employee_code === approverCode);
        if (inStep) return { allowed: true, via: `flow-step-${request.current_step}` };
        const hr = await isHr(approverCode);
        if (hr) return { allowed: true, via: 'hr-override' };
        return { allowed: false, via: null,
            reason: `Waiting on step ${request.current_step} of its approval flow` };
    }

    const approvers = await approversFor(targetCode);
    const match = approvers.find(a => a.employee_code === approverCode);
    if (match) return { allowed: true, via: match.via };
    // The chain's hr level admits admin users; resolve it for named employees
    // too so an HR person with an employee record can act from the portal.
    if (await isHr(approverCode)) return { allowed: true, via: 'hr' };

    return { allowed: false, via: null, reason: 'This request is not yours to approve' };
};

/** Is this employee linked to an admin/HR user account? */
const isHr = async (employeeCode) => {
    const r = await db.query(
        `SELECT 1 FROM users u JOIN employees e ON LOWER(u.username) = LOWER(e.employee_code)
              OR LOWER(u.email) = LOWER(e.email)
          WHERE e.employee_code = $1 AND LOWER(u.role) IN ('admin', 'hr') LIMIT 1`,
        [employeeCode]);
    return r.rows.length > 0;
};

/**
 * Who may act at one step of a flow, resolved from the node's approver type.
 * Person and Role are the builder's own vocabulary; Manager, Department and HR
 * borrow the chain's resolvers, so a node can say "their manager" without
 * naming anyone.
 */
const stepApprovers = async (flowId, stepNo, requesterCode) => {
    const node = await db.query(
        `SELECT n.approver_type, n.approver_id
           FROM flow_nodes fs JOIN approval_nodes n ON n.id = fs.node_id
          WHERE fs.flow_id = $1 AND fs.node_order = $2`, [flowId, stepNo]);
    if (!node.rows[0]) return [];
    const { approver_type, approver_id } = node.rows[0];
    const type = String(approver_type || '').toLowerCase();

    if (type === 'person' && approver_id) {
        const r = await db.query(
            `SELECT employee_code, name FROM employees
              WHERE id = $1 AND LOWER(status) IS DISTINCT FROM 'resigned'`, [approver_id]);
        return r.rows;
    }
    if (type === 'role' && approver_id) {
        const r = await db.query(
            `SELECT e.employee_code, e.name FROM approval_role_members m
               JOIN employees e ON e.id = m.employee_id
              WHERE m.role_id = $1 AND LOWER(e.status) IS DISTINCT FROM 'resigned'`, [approver_id]);
        return r.rows;
    }
    if (type === 'manager') {
        const r = await db.query(
            `SELECT m.employee_code, m.name FROM employees e
               JOIN employees m ON m.id = e.reporting_manager_id
              WHERE e.employee_code = $1 AND LOWER(m.status) IS DISTINCT FROM 'resigned'`,
            [requesterCode]);
        return r.rows;
    }
    if (type === 'department') {
        const r = await db.query(
            `SELECT a.employee_code, a.name FROM employees e
               JOIN department_approvers da ON da.department_id = e.department_id
               JOIN employees a ON a.id = da.employee_id
              WHERE e.employee_code = $1 AND LOWER(a.status) IS DISTINCT FROM 'resigned'
                AND a.employee_code <> e.employee_code`, [requesterCode]);
        return r.rows;
    }
    // 'hr' nodes and anything unresolvable (Position has no mapping to people)
    // return empty: the hr-override in canApprove is what can act, so the
    // request is never trapped, and the misconfiguration is visible instead of
    // silently skipped.
    return [];
};

/**
 * The flow that claims a new request, if any: active today, matching the
 * request type, scoped to the requester's department when the flow names one.
 * Department-specific beats company-wide. A flow with no steps claims nothing.
 */
const flowFor = async (requesterCode, requestType) => {
    const r = await db.query(
        `SELECT f.id, f.department_id,
                (SELECT count(*) FROM flow_nodes fs WHERE fs.flow_id = f.id)::int AS steps
           FROM approval_flows f
           JOIN employees e ON e.employee_code = $1
          WHERE LOWER(f.request_type) LIKE $2 || '%'
            AND CURRENT_DATE BETWEEN f.start_date AND f.end_date
            AND (f.department_id IS NULL OR f.department_id = e.department_id)
          ORDER BY f.department_id NULLS LAST
          LIMIT 1`, [requesterCode, String(requestType).toLowerCase().slice(0, 5)]);
    const flow = r.rows[0];
    return flow && flow.steps > 0 ? { id: flow.id, steps: flow.steps } : null;
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
            // leave_applications, NOT `leaves`. Both the portal and the admin
            // screens write leave_applications; the first version of this read
            // the parallel dead table, so a real application never appeared in
            // anyone's Approvals tab — and its test passed because the fixture
            // wrote the dead table directly. Fixtures must go through the same
            // door the product uses.
            `SELECT l.id, l.employee_code, e.name AS employee_name,
                    lt.name AS leave_type,
                    l.from_date AS start_date, l.to_date AS end_date,
                    l.total_days AS days, l.reason, l.created_at,
                    l.flow_id, l.current_step
               FROM leave_applications l
               JOIN employees e ON e.employee_code = l.employee_code
               LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
              WHERE LOWER(l.status) = 'pending'
              ORDER BY l.created_at`),
        db.query(
            `SELECT r.id, r.employee_code, e.name AS employee_name, r.date,
                    r.requested_in_time, r.requested_out_time, r.reason, r.created_at,
                    r.flow_id, r.current_step
               FROM attendance_regularizations r
               JOIN employees e ON e.employee_code = r.employee_code
              WHERE LOWER(r.status) = 'pending'
              ORDER BY r.created_at`),
    ]);

    const mine = async (rows, type) => {
        const out = [];
        for (const row of rows) {
            const { allowed, via } = await canApprove(approverCode, row.employee_code, row);
            if (allowed) out.push({ ...row, type, via, step: row.current_step || null });
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
    chain, approversFor, primaryApprover, canApprove, pendingFor, isApprover,
    flowFor, stepApprovers, isHr, DEFAULT_CHAIN,
};
