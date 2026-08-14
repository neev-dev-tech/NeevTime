const express = require('express');
const router = express.Router();
const db = require('../db');

// ========== LEAVE TYPES ==========
router.get('/leave-types', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM leave_types ORDER BY name');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/leave-types', async (req, res) => {
    try {
        const { code, name, annual_quota, carry_forward, color, requires_approval } = req.body;
        const result = await db.query(`
            INSERT INTO leave_types (code, name, annual_quota, carry_forward, color, requires_approval)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [code, name, annual_quota || 0, carry_forward || false, color || '#3b82f6', requires_approval !== false]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/leave-types/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM leave_types WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== LEAVE BALANCES ==========
router.get('/leave-balances', async (req, res) => {
    try {
        const { employee_code, year } = req.query;
        // `used` is derived from approved applications, not read from the
        // column.
        //
        // The stored value is only ever incremented when leave is applied for
        // through this app, so the 511 applications imported from the HRMS
        // never touched it and every balance read 0 used against real leave
        // that had been taken. Counting the applications is the only figure
        // that is true regardless of where the leave was entered.
        //
        // Days are counted per working day rather than trusting total_days,
        // because a leave spanning a weekend reports more days than it costs,
        // and half days count as half.
        let query = `
            SELECT lb.id, lb.employee_code, lb.leave_type_id, lb.year,
                   lb.opening_balance, lb.accrued, lb.carry_forward_balance, lb.updated_at,
                   COALESCE(u.days, 0) AS used,
                   COALESCE(lb.opening_balance, 0) + COALESCE(lb.accrued, 0)
                     + COALESCE(lb.carry_forward_balance, 0) - COALESCE(u.days, 0) AS balance,
                   lt.name as leave_type_name, lt.code as leave_code, lt.color,
                   e.name as employee_name
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type_id = lt.id
            JOIN employees e ON lb.employee_code = e.employee_code
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
        `;
        const params = [];
        const conditions = [];

        if (employee_code) { conditions.push(`lb.employee_code = $${params.length + 1}`); params.push(employee_code); }
        if (year) { conditions.push(`lb.year = $${params.length + 1}`); params.push(year); }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY e.name, lt.name';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Initialize balances for an employee for current year
router.post('/leave-balances/init', async (req, res) => {
    try {
        const { employee_code } = req.body;
        const year = new Date().getFullYear();

        // Get all leave types
        const types = await db.query('SELECT id, annual_quota FROM leave_types WHERE is_active = true');

        for (const lt of types.rows) {
            await db.query(`
                INSERT INTO leave_balances (employee_code, leave_type_id, year, opening_balance, balance)
                VALUES ($1, $2, $3, $4, $4)
                ON CONFLICT (employee_code, leave_type_id, year) DO NOTHING
            `, [employee_code, lt.id, year, lt.annual_quota || 0]);
        }

        res.json({ success: true, message: 'Balances initialized' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== LEAVE APPLICATIONS ==========
router.get('/leave-applications', async (req, res) => {
    try {
        const { status, employee_code } = req.query;
        let query = `
            SELECT la.*, lt.name as leave_type_name, lt.color, e.name as employee_name
            FROM leave_applications la
            JOIN leave_types lt ON la.leave_type_id = lt.id
            JOIN employees e ON la.employee_code = e.employee_code
        `;
        const params = [];
        const conditions = [];

        if (status) { conditions.push(`la.status = $${params.length + 1}`); params.push(status); }
        if (employee_code) { conditions.push(`la.employee_code = $${params.length + 1}`); params.push(employee_code); }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY la.created_at DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/leave-applications', async (req, res) => {
    const client = await db.getClient();
    try {
        const { employee_code, leave_type_id, from_date, to_date, is_half_day, half_day_type, reason } = req.body;

        // Calculate total days
        const fromD = new Date(from_date);
        const toD = new Date(to_date);
        let totalDays = Math.ceil((toD - fromD) / (1000 * 60 * 60 * 24)) + 1;
        if (is_half_day) totalDays = 0.5;

        await client.query('BEGIN');

        // Check balance
        const year = fromD.getFullYear();
        const balRes = await client.query(
            'SELECT balance FROM leave_balances WHERE employee_code=$1 AND leave_type_id=$2 AND year=$3',
            [employee_code, leave_type_id, year]
        );

        if (balRes.rows.length === 0 || balRes.rows[0].balance < totalDays) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient leave balance' });
        }

        // Insert application
        const result = await client.query(`
            INSERT INTO leave_applications (employee_code, leave_type_id, from_date, to_date, is_half_day, half_day_type, total_days, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [employee_code, leave_type_id, from_date, to_date, is_half_day || false, half_day_type, totalDays, reason]);

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Approve/Reject leave
router.put('/leave-applications/:id/status', async (req, res) => {
    const client = await db.getClient();
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body; // 'Approved' or 'Rejected'

        await client.query('BEGIN');

        // Lock the row for the transaction so two concurrent approvals cannot
        // both read a Pending status and both deduct the balance.
        const appRes = await client.query('SELECT * FROM leave_applications WHERE id=$1 FOR UPDATE', [id]);
        if (appRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Application not found' });
        }

        const app = appRes.rows[0];

        // The balance arithmetic lives in services/leave_balance.js so it can be
        // tested without a database — see server/tests/leave_balance.test.js.
        const { planStatusChange } = require('../services/leave_balance');
        const plan = planStatusChange(app.status, status, app.total_days);

        // Re-applying the same status is a no-op. Without this, a second
        // approval (double click, retry, two reviewers) deducted the balance
        // again, silently taking days the employee never used.
        if (plan.outcome === 'unchanged') {
            await client.query('ROLLBACK');
            return res.json({ success: true, status, unchanged: true });
        }

        await client.query(`
            UPDATE leave_applications SET status=$1, rejection_reason=$2, approved_at=NOW() WHERE id=$3
        `, [status, rejection_reason, id]);

        if (plan.usedDelta !== 0) {
            const year = new Date(app.from_date).getFullYear();
            await client.query(`
                UPDATE leave_balances SET used = used + $1, balance = balance - $1, updated_at = NOW()
                WHERE employee_code=$2 AND leave_type_id=$3 AND year=$4
            `, [plan.usedDelta, app.employee_code, app.leave_type_id, year]);
        }

        await client.query('COMMIT');
        res.json({ success: true, status });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
