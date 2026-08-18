/**
 * Who approves for a department.
 *
 * The other half — an employee's reporting manager — is a field on the employee
 * and is set on their profile. This is the departmental route, for the many
 * companies where approval follows the org chart rather than individual
 * reporting lines.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/departments/:id/approvers', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT da.id, e.id AS employee_id, e.employee_code, e.name, e.designation
               FROM department_approvers da
               JOIN employees e ON e.id = da.employee_id
              WHERE da.department_id = $1
              ORDER BY e.name`, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/departments/:id/approvers', async (req, res) => {
    const { employee_id } = req.body || {};
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });
    try {
        const result = await db.query(
            `INSERT INTO department_approvers (department_id, employee_id)
             VALUES ($1, $2)
             ON CONFLICT (department_id, employee_id) DO NOTHING
             RETURNING id`, [req.params.id, employee_id]);

        // Already an approver is success, not an error: the caller wanted them
        // to be one and they are.
        res.status(201).json({ success: true, added: result.rows.length > 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/departments/:deptId/approvers/:employeeId', async (req, res) => {
    try {
        await db.query(
            'DELETE FROM department_approvers WHERE department_id = $1 AND employee_id = $2',
            [req.params.deptId, req.params.employeeId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Who approves for one employee, and why — the question an employee asks when a
 * request has been sitting for three days.
 */
router.get('/employees/:code/approvers', async (req, res) => {
    try {
        const approvals = require('../services/approvals');
        const [all, primary] = await Promise.all([
            approvals.approversFor(req.params.code),
            approvals.primaryApprover(req.params.code),
        ]);
        res.json({ approvers: all, primary, chain: await approvals.chain() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
