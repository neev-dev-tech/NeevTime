/**
 * Employee Self-Service Portal Routes
 *
 * Separate auth realm from admin users: employees log in with their
 * employee_code + a portal password (bcrypt hash in employees.portal_password_hash,
 * distinct from the plain-text device PIN in employees.password).
 * JWT carries { employee_code, role: 'employee' }.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure the portal password column exists (no migration framework in this repo)
db.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS portal_password_hash TEXT')
    .catch(err => console.error('portal_password_hash column check failed:', err.message));

// ==========================================
// AUTH
// ==========================================

router.post('/login', async (req, res) => {
    const { employee_code, password } = req.body;
    if (!employee_code || !password) {
        return res.status(400).json({ error: 'Employee code and password required' });
    }

    try {
        const result = await db.query(
            `SELECT id, employee_code, name, portal_password_hash, app_login_enabled
             FROM employees WHERE employee_code = $1 AND (status IS DISTINCT FROM 'resigned')`,
            [employee_code]
        );
        const emp = result.rows[0];

        const invalid = () => res.status(400).json({ error: 'Invalid employee code or password' });
        if (!emp) return invalid();
        if (!emp.app_login_enabled) {
            return res.status(403).json({ error: 'Portal access not enabled. Contact HR.' });
        }
        if (!emp.portal_password_hash) {
            return res.status(403).json({ error: 'Portal password not set. Contact HR.' });
        }

        const ok = await bcrypt.compare(password, emp.portal_password_hash);
        if (!ok) return invalid();

        const token = jwt.sign(
            { employee_code: emp.employee_code, role: 'employee' },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
        );
        res.json({
            token,
            user: { username: emp.employee_code, name: emp.name, role: 'employee' }
        });
    } catch (err) {
        console.error('Portal login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Employee-JWT guard for everything below
const requireEmployee = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.sendStatus(401);
        if (payload.role !== 'employee' || !payload.employee_code) return res.sendStatus(403);
        req.employee_code = payload.employee_code;
        next();
    });
};

router.use(requireEmployee);

// ==========================================
// PROFILE
// ==========================================

router.get('/me', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT e.id, e.employee_code, e.name, e.designation, e.email, e.mobile,
                    e.joining_date, d.name AS department, a.name AS area
             FROM employees e
             LEFT JOIN departments d ON e.department_id = d.id
             LEFT JOIN areas a ON e.area_id = a.id
             WHERE e.employee_code = $1`,
            [req.employee_code]
        );
        if (result.rows.length === 0) return res.sendStatus(404);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// MY ATTENDANCE
// ==========================================

router.get('/attendance', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];

        const result = await db.query(
            `SELECT to_char(date, 'YYYY-MM-DD') AS date,
                    to_char(date, 'Day') AS weekday,
                    to_char(in_time, 'HH24:MI') AS in_time,
                    to_char(out_time, 'HH24:MI') AS out_time,
                    duration_minutes, status, remarks
             FROM attendance_daily_summary
             WHERE employee_code = $1 AND date BETWEEN $2 AND $3
             ORDER BY date DESC`,
            [req.employee_code, start_date || defaultStart, end_date || defaultEnd]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// MY LEAVE
// ==========================================

router.get('/leave', async (req, res) => {
    try {
        const [apps, balances, types] = await Promise.all([
            db.query(
                `SELECT la.*, COALESCE(lt.name, 'Unknown') AS leave_type_name, lt.color
                 FROM leave_applications la
                 LEFT JOIN leave_types lt ON la.leave_type_id = lt.id
                 WHERE la.employee_code = $1
                 ORDER BY la.created_at DESC LIMIT 50`,
                [req.employee_code]
            ),
            db.query(
                `SELECT lb.*, lt.name AS leave_type_name
                 FROM leave_balances lb
                 JOIN leave_types lt ON lb.leave_type_id = lt.id
                 WHERE lb.employee_code = $1 AND lb.year = EXTRACT(YEAR FROM NOW())`,
                [req.employee_code]
            ),
            db.query('SELECT id, code, name FROM leave_types ORDER BY name')
        ]);
        res.json({ applications: apps.rows, balances: balances.rows, types: types.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/leave', async (req, res) => {
    try {
        const { leave_type_id, from_date, to_date, is_half_day, half_day_type, reason } = req.body;
        if (!leave_type_id || !from_date || !to_date) {
            return res.status(400).json({ error: 'Leave type and dates required' });
        }

        const days = is_half_day
            ? 0.5
            : Math.round((new Date(to_date) - new Date(from_date)) / 86400000) + 1;
        if (days <= 0) return res.status(400).json({ error: 'Invalid date range' });

        // No FK on leave_type_id in this schema — validate explicitly
        const typeCheck = await db.query('SELECT id FROM leave_types WHERE id = $1', [leave_type_id]);
        if (typeCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Unknown leave type' });
        }

        const result = await db.query(
            `INSERT INTO leave_applications
                (employee_code, leave_type_id, from_date, to_date, is_half_day, half_day_type, total_days, reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.employee_code, leave_type_id, from_date, to_date, is_half_day || false, half_day_type || null, days, reason || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
