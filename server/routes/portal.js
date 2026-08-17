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
const ingest = require('../services/punch_ingest');
const directory = require('../services/directory_auth');
const crypto = require('crypto');

// Employee portal login is public; throttle it like the admin login.
const portalLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts from this address. Try again later.' });

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure portal schema pieces exist (no migration framework in this repo;
// fix_production_schema.js covers Docker installs, this covers bare restarts)
db.query(`ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS directory_email TEXT,
    ADD COLUMN IF NOT EXISTS directory_subject TEXT,
    ADD COLUMN IF NOT EXISTS directory_auth_method TEXT`)
    .catch(err => console.error('directory columns check failed:', err.message));

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

/**
 * One cookie, read from the raw header.
 *
 * cookie-parser is not installed and this is the only cookie the app uses —
 * a dependency for a single value, on the sign-in path, is not worth it.
 */
const readCookie = (req, name) => {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
};

/**
 * Which sign-in methods this installation offers.
 *
 * The login page asks before drawing anything, so it never shows a button that
 * cannot work. Configuration problems come back here too — an administrator who
 * enabled single sign-on and forgot the client secret should be told on the
 * login page, not left with a button that fails for everyone.
 */
router.get('/auth/modes', async (req, res) => {
    try {
        res.json(await directory.availableModes());
    } catch (err) {
        console.error('Auth modes failed:', err.message);
        res.json({ local: true, oidc: false, ldap: false, problems: [] });
    }
});

/**
 * Sign in against the on-prem directory.
 *
 * The password goes straight to the domain controller and is never stored here
 * — it is not hashed, kept, or logged, because this app has no business holding
 * somebody's domain password even for the duration of a request.
 */
router.post('/auth/ldap', portalLoginLimiter, async (req, res) => {
    const { login, password } = req.body || {};
    if (!login || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    try {
        const modes = await directory.availableModes();
        if (!modes.ldap) return res.status(403).json({ error: 'Directory sign-in is not enabled' });

        const identity = await directory.ldapVerify(login, password);
        const linked = await linkIdentity(identity, 'ldap');
        if (linked.error) return res.status(linked.status).json({ error: linked.error });
        res.json(linked.session);
    } catch (err) {
        // Bind failures and "no such user" both arrive here and both say the
        // same thing: naming which one it was tells an attacker which accounts
        // exist.
        const message = /Invalid username or password/.test(err.message)
            ? 'Invalid username or password' : err.message;
        res.status(401).json({ error: message });
    }
});

/**
 * Begin single sign-on.
 *
 * state and nonce are signed into a short-lived cookie rather than held in
 * memory, so the callback still works when it lands on a different worker or
 * after a restart. Without state, a sign-in started by an attacker can be
 * completed in somebody else's browser.
 */
router.get('/auth/oidc/start', async (req, res) => {
    try {
        const modes = await directory.availableModes();
        if (!modes.oidc) return res.status(403).json({ error: 'Single sign-on is not enabled' });

        const state = crypto.randomBytes(16).toString('hex');
        const nonce = crypto.randomBytes(16).toString('hex');
        const ticket = jwt.sign({ state, nonce }, JWT_SECRET, { expiresIn: '10m' });

        res.cookie('portal_oidc', ticket, {
            httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60 * 1000,
        });
        res.redirect(await directory.authorizationUrl(state, nonce));
    } catch (err) {
        console.error('OIDC start failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Return from the identity provider.
 *
 * Ends in a redirect rather than JSON: a browser lands here, so the result has
 * to be a page. The token goes in the fragment, which is never sent to a server
 * and stays out of access logs and Referer headers.
 */
router.get('/auth/oidc/callback', async (req, res) => {
    const fail = (message) =>
        res.redirect(`/portal/login#error=${encodeURIComponent(message)}`);
    try {
        const { code, state } = req.query;
        if (!code || !state) return fail('Sign-in was cancelled');

        const ticket = readCookie(req, 'portal_oidc');
        if (!ticket) return fail('Sign-in took too long — please try again');
        res.clearCookie('portal_oidc');

        let expected;
        try {
            expected = jwt.verify(ticket, JWT_SECRET);
        } catch {
            return fail('Sign-in took too long — please try again');
        }
        if (expected.state !== state) return fail('Sign-in could not be verified');

        const identity = await directory.exchangeCode(code);
        // A replayed id_token from an earlier sign-in carries the wrong nonce.
        if (identity.nonce && identity.nonce !== expected.nonce) {
            return fail('Sign-in could not be verified');
        }

        const linked = await linkIdentity(identity, 'oidc');
        if (linked.error) return fail(linked.error);

        res.redirect(`/portal/login#token=${encodeURIComponent(linked.session.token)}`);
    } catch (err) {
        console.error('OIDC callback failed:', err.message);
        fail('Sign-in could not be completed');
    }
});

/**
 * Turn a directory identity into a session for one employee.
 *
 * Matches on the stored immutable id first and falls back to the email address,
 * recording the id when it does. A UPN can change — someone marries, or a
 * tenant migrates its domain, which is exactly what happened between innopay.in
 * and innopayad.in — and after the first sign-in that no longer matters.
 *
 * An unmatched account is refused. Creating an employee record from whoever
 * signs in would let anyone in the company generate themselves an attendance
 * history, and the message names the address so HR can put it on the right
 * person rather than guessing.
 */
const linkIdentity = async (identity, method) => {
    if (!identity.subject) {
        return { status: 401, error: 'The directory returned no identifier for this account' };
    }

    const found = await db.query(
        `SELECT id, employee_code, name, app_login_enabled, directory_subject
           FROM employees
          WHERE (directory_subject = $1
                 OR (directory_subject IS NULL AND $2 <> '' AND LOWER(directory_email) = $2))
            AND (LOWER(status) IS DISTINCT FROM 'resigned')
          ORDER BY (directory_subject = $1) DESC
          LIMIT 1`,
        [identity.subject, identity.email || '']
    );
    const emp = found.rows[0];

    if (!emp) {
        return {
            status: 403,
            error: `${identity.email || 'That account'} is not linked to an employee record. `
                + 'Ask HR to add it to your profile.',
        };
    }
    if (!emp.app_login_enabled) {
        return { status: 403, error: 'Portal access not enabled. Contact HR.' };
    }

    // Bind to the immutable id on the first successful sign-in, so a later
    // address change cannot lock this person out of their own record.
    if (!emp.directory_subject) {
        await db.query(
            'UPDATE employees SET directory_subject = $1, directory_auth_method = $2 WHERE id = $3',
            [identity.subject, method, emp.id]
        );
    }

    const token = jwt.sign(
        { employee_code: emp.employee_code, role: 'employee' },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
    return {
        session: {
            token,
            user: { username: emp.employee_code, name: emp.name, role: 'employee' },
        },
    };
};

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

        // In or out, decided from the day's own record rather than always
        // writing check_in. A day of nothing but check_ins produces no worked
        // hours at all, and the person who notices is whoever runs payroll at
        // the end of the month.
        const last = await db.query(
            `SELECT punch_state FROM attendance_logs
              WHERE employee_code = $1
                AND punch_time >= CURRENT_DATE
                AND punch_time <  CURRENT_DATE + 1
              ORDER BY punch_time DESC LIMIT 1`,
            [req.employee_code]
        );
        // Asked of the ingest, which knows every spelling a punch_state has
        // ever been written in. Testing for one of them here matched nothing
        // once punches started being normalised to '0', so every punch became
        // a check-in and clocking out was impossible.
        const state = ingest.isEntryState(last.rows[0]?.punch_state) ? 'check_out' : 'check_in';

        // The same path a biometric reader uses. Inserting directly stored the
        // punch and did nothing else — no daily summary, no live feed, no push
        // to the HR system — so attendance from a phone stayed a raw event
        // until the nightly recompute at 01:00. Nobody would have seen it as
        // attendance today, which is what "how do I mark it" meant.
        let stored;
        try {
            stored = await ingest.recordPunch({
                employeeCode: req.employee_code,
                deviceSerial: 'MOBILE_APP',
                timestamp: new Date(),
                state,
                verifyMode: 'mobile',
                punchSource: 'mobile',
                photoPath: photoName,
                location: {
                    latitude, longitude, geofenceId: match.fence.id,
                },
            }, { io: req.app.get('io') || null });
        } catch (err) {
            // No record, no photograph. An image of an employee kept for a
            // punch that does not exist is data held for no reason.
            await mobile.discardPhoto(photoName);
            throw err;
        }

        if (!stored.stored) {
            await mobile.discardPhoto(photoName);
            return res.status(400).json({ error: stored.reason || 'The punch could not be recorded' });
        }

        res.json({
            success: true,
            message: state === 'check_in' ? 'Checked in' : 'Checked out',
            punch_state: state,
            location: match.fence.name,
            distance_m: Math.round(match.distance),
            punch_time: new Date().toISOString(),
            photo_saved: Boolean(photoName),
            photo_warning: photoWarning,
        });
    } catch (err) {
        console.error('[Portal] punch failed:', err.message);
        res.status(500).json({ error: 'Could not record the punch' });
    }
});

/**
 * What the punch button should say, and whether punching is possible at all.
 *
 * Without this the page would guess. It would show "Check in" to someone who
 * checked in an hour ago, and there would be no way to tell a site with no
 * geofence configured from a site where the employee is simply standing outside
 * one — the first is an administrator's job, the second is the employee's, and
 * they need different words.
 */
router.get('/punch-status', async (req, res) => {
    try {
        const [last, fences] = await Promise.all([
            db.query(
                `SELECT punch_time, punch_state FROM attendance_logs
                  WHERE employee_code = $1
                    AND punch_time >= CURRENT_DATE AND punch_time < CURRENT_DATE + 1
                  ORDER BY punch_time DESC LIMIT 1`,
                [req.employee_code]
            ),
            db.query('SELECT count(*)::int AS n FROM geofences WHERE is_active IS TRUE'),
        ]);

        res.json({
            next_state: ingest.isEntryState(last.rows[0]?.punch_state) ? 'check_out' : 'check_in',
            last_punch: last.rows[0] || null,
            geofences_configured: fences.rows[0].n > 0,
        });
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
