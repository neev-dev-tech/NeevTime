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
const { rateLimit } = require('../utils/rateLimit');

// Employee portal login is public; throttle it like the admin login.
const portalLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts from this address. Try again later.' });

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure portal schema pieces exist (no migration framework in this repo;
// fix_production_schema.js covers Docker installs, this covers bare restarts)
db.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS portal_password_hash TEXT')
    .catch(err => console.error('portal_password_hash column check failed:', err.message));
db.query(`
    CREATE TABLE IF NOT EXISTS attendance_regularizations (
        id SERIAL PRIMARY KEY,
        employee_code VARCHAR(50) NOT NULL,
        date DATE NOT NULL,
        requested_in_time TIME,
        requested_out_time TIME,
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_by VARCHAR(100),
        reviewed_at TIMESTAMP,
        review_comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
`).catch(err => console.error('attendance_regularizations table check failed:', err.message));

// ==========================================
// AUTH
// ==========================================

router.post('/login', portalLoginLimiter, async (req, res) => {
    const { employee_code, password } = req.body;
    if (!employee_code || !password) {
        return res.status(400).json({ error: 'Employee code and password required' });
    }

    try {
        const result = await db.query(
            `SELECT id, employee_code, name, portal_password_hash, app_login_enabled
             FROM employees WHERE employee_code = $1 AND (LOWER(status) IS DISTINCT FROM 'resigned')`,
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
// PUNCH — for the employee themselves
// ==========================================

/**
 * An employee clocks themselves in.
 *
 * The identity comes from the token and nowhere else. /api/mobile/punch takes an
 * employee_id in the body and is mounted behind requireAdmin, which makes it an
 * administrator's tool — useful for supervised punching, useless for staff, and
 * dangerous if it were ever opened up, because a body field would let anyone
 * punch as anyone.
 *
 * The geofence rule is imported rather than repeated. Two copies of it is two
 * places for someone to be marked present from the wrong side of town.
 */
router.post('/punch', async (req, res) => {
    const { latitude, longitude, photo } = req.body || {};
    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'Location is required to punch' });
    }

    try {
        const mobile = require('./mobile_attendance');

        const match = await mobile.findMatchingGeofence(req.employee_code, latitude, longitude);
        if (!match) {
            return res.status(403).json({
                error: 'You are outside the allowed location.',
                details: 'No approved site matched your position.',
            });
        }

        // A camera that failed is not a reason to refuse someone's clock-in.
        let photoName = null;
        let photoWarning = null;
        try {
            photoName = await mobile.savePunchPhoto(photo, req.employee_code);
        } catch (err) {
            photoWarning = err.message;
        }

        const result = await db.query(
            `INSERT INTO attendance_logs
             (employee_code, punch_time, punch_state, device_serial, verification_mode,
              punch_source, latitude, longitude, is_geofence_verified, geofence_id, photo_path)
             VALUES ($1, NOW(), 'check_in', 'MOBILE_APP', 1, 'mobile', $2, $3, TRUE, $4, $5)
             ON CONFLICT (employee_code, punch_time) DO NOTHING
             RETURNING punch_time`,
            [req.employee_code, latitude, longitude, match.fence.id, photoName]
        );

        res.json({
            success: true,
            message: 'Attendance marked',
            location: match.fence.name,
            distance_m: Math.round(match.distance),
            punch_time: result.rows[0]?.punch_time || null,
            photo_saved: Boolean(photoName),
            photo_warning: photoWarning,
        });
    } catch (err) {
        console.error('[Portal] punch failed:', err.message);
        res.status(500).json({ error: 'Could not record the punch' });
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

// ==========================================
// MY REGULARIZATION REQUESTS (missed punch correction)
// ==========================================

router.get('/regularizations', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, to_char(date, 'YYYY-MM-DD') AS date,
                    to_char(requested_in_time, 'HH24:MI') AS requested_in_time,
                    to_char(requested_out_time, 'HH24:MI') AS requested_out_time,
                    reason, status, review_comment, created_at
             FROM attendance_regularizations
             WHERE employee_code = $1
             ORDER BY created_at DESC LIMIT 50`,
            [req.employee_code]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/regularizations', async (req, res) => {
    try {
        const { date, requested_in_time, requested_out_time, reason } = req.body;
        if (!date || !reason || (!requested_in_time && !requested_out_time)) {
            return res.status(400).json({ error: 'Date, reason and at least one time required' });
        }
        if (new Date(date) > new Date()) {
            return res.status(400).json({ error: 'Cannot regularize a future date' });
        }

        const existing = await db.query(
            `SELECT id FROM attendance_regularizations
             WHERE employee_code = $1 AND date = $2 AND status = 'pending'`,
            [req.employee_code, date]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'A pending request already exists for this date' });
        }

        const result = await db.query(
            `INSERT INTO attendance_regularizations
                (employee_code, date, requested_in_time, requested_out_time, reason)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.employee_code, date, requested_in_time || null, requested_out_time || null, reason]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
