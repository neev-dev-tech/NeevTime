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
const { checkPasswordPolicy } = require('./auth');
const crypto = require('crypto');

// Employee portal login is public; throttle it like the admin login.
const portalLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts from this address. Try again later.' });

const JWT_SECRET = process.env.JWT_SECRET;

// Ensure portal schema pieces exist (no migration framework in this repo;
// fix_production_schema.js covers Docker installs, this covers bare restarts)
db.query(`ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS directory_email TEXT,
    ADD COLUMN IF NOT EXISTS directory_subject TEXT,
    ADD COLUMN IF NOT EXISTS directory_auth_method TEXT,
    -- Activation: the employee chooses their own password using a one-time
    -- code. Only the hash is kept, so a leaked database does not hand out
    -- working activation codes, and an administrator who issued one cannot read
    -- it back later.
    ADD COLUMN IF NOT EXISTS portal_setup_hash TEXT,
    ADD COLUMN IF NOT EXISTS portal_setup_expires TIMESTAMP,
    ADD COLUMN IF NOT EXISTS portal_password_set_at TIMESTAMP,
    -- Set when an administrator typed the password. That password is known to
    -- somebody else, so it gets the employee as far as the change screen and no
    -- further.
    ADD COLUMN IF NOT EXISTS portal_must_change BOOLEAN DEFAULT false`)
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
            `SELECT id, employee_code, name, portal_password_hash, app_login_enabled,
                    portal_must_change
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

        // A password an administrator typed is a password somebody else knows.
        // The token says so, and the guard below lets it reach the change
        // screen and nothing else — a punch made under a shared credential is
        // not evidence of anything.
        const token = jwt.sign(
            {
                employee_code: emp.employee_code,
                role: 'employee',
                must_change: Boolean(emp.portal_must_change),
            },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
        );
        res.json({
            token,
            must_change: Boolean(emp.portal_must_change),
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

/**
 * Finish setting up portal access.
 *
 * The employee types the one-time code they were given — by email, or on a slip
 * from HR for the many people here who have no mailbox — and chooses their own
 * password. Nobody else ever knows it, which is the whole point: a punch has to
 * be attributable to the person who made it, and it is not if an administrator
 * could have signed in as them.
 *
 * The code is single-use and short-lived. It is stored hashed, so the database
 * cannot be read for working codes and the administrator who issued one cannot
 * look it up afterwards.
 */
router.post('/activate', portalLoginLimiter, async (req, res) => {
    const { employee_code, code, password } = req.body || {};
    if (!employee_code || !code || !password) {
        return res.status(400).json({ error: 'Employee code, activation code and a new password are required' });
    }

    const policyError = await checkPasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });

    try {
        const found = await db.query(
            `SELECT id, employee_code, name, portal_setup_hash, portal_setup_expires
               FROM employees
              WHERE employee_code = $1 AND (LOWER(status) IS DISTINCT FROM 'resigned')`,
            [employee_code]
        );
        const emp = found.rows[0];

        // One message for every failure. Distinguishing "no such employee" from
        // "wrong code" tells anyone who asks which employee codes are real.
        const invalid = () => res.status(400).json({
            error: 'That activation code is not valid, or it has expired. Ask HR for a new one.',
        });

        if (!emp || !emp.portal_setup_hash) return invalid();
        if (emp.portal_setup_expires && new Date(emp.portal_setup_expires) < new Date()) return invalid();
        if (!await bcrypt.compare(String(code).trim().toUpperCase(), emp.portal_setup_hash)) return invalid();

        const hash = await bcrypt.hash(password, 10);
        await db.query(
            `UPDATE employees
                SET portal_password_hash = $1,
                    app_login_enabled = true,
                    portal_password_set_at = NOW(),
                    portal_must_change = false,
                    portal_setup_hash = NULL,
                    portal_setup_expires = NULL
              WHERE id = $2`,
            [hash, emp.id]
        );

        res.json({ success: true, message: 'Password set. You can sign in now.' });
    } catch (err) {
        console.error('Portal activation error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * A forgotten password, for an employee who has an address on file.
 *
 * Answers the same way whether or not the employee exists — otherwise this
 * endpoint is a way to find out which employee codes are real, and employee
 * codes are printed on badges.
 *
 * Employees without an address are not served here on purpose: there is nowhere
 * to send anything, and they go back to HR for a fresh activation code.
 */
router.post('/forgot-password', portalLoginLimiter, async (req, res) => {
    const { employee_code } = req.body || {};
    const genericOk = {
        success: true,
        message: 'If that employee has an email address on file, a reset link has been sent. '
            + 'Otherwise ask HR for a new activation code.',
    };
    if (!employee_code) return res.status(400).json({ error: 'Employee code required' });

    try {
        const found = await db.query(
            `SELECT id, employee_code, name,
                    COALESCE(NULLIF(directory_email, ''), NULLIF(email, '')) AS address
               FROM employees
              WHERE employee_code = $1 AND (LOWER(status) IS DISTINCT FROM 'resigned')`,
            [employee_code]
        );
        const emp = found.rows[0];
        if (!emp || !emp.address) return res.json(genericOk);

        const { code, hash, expires } = await newActivationCode();
        await db.query(
            'UPDATE employees SET portal_setup_hash = $1, portal_setup_expires = $2 WHERE id = $3',
            [hash, expires, emp.id]
        );

        const emailService = require('../services/email');
        await emailService.sendEmail({
            to: emp.address,
            subject: 'NeevTime portal access',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Set your portal password</h2>
                    <p>Hello ${emp.name || emp.employee_code},</p>
                    <p>Use this code to set a new password for employee code
                       <b>${emp.employee_code}</b>:</p>
                    <p style="font-size:24px;letter-spacing:4px;font-weight:bold;">${code}</p>
                    <p style="color:#666;font-size:12px;">It expires in 24 hours and can be used once.
                       If you did not ask for this, ignore this email — nothing has changed yet.</p>
                   </div>`,
            text: `Your NeevTime activation code for ${emp.employee_code} is ${code}. It expires in 24 hours.`,
        });

        res.json(genericOk);
    } catch (err) {
        console.error('Portal forgot-password error:', err.message);
        // The generic reply would hide a broken mail server from everyone,
        // including the administrator who needs to fix it.
        res.status(500).json({ error: 'Could not send the email. Ask your administrator to check SMTP settings.' });
    }
});

/**
 * A one-time activation code.
 *
 * Eight characters from an alphabet with no O/0 or I/1, because these get read
 * over a phone and written on paper. Only the hash is stored.
 */
const newActivationCode = async () => {
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    const code = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
    return {
        code,
        hash: await bcrypt.hash(code, 10),
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
};

// Employee-JWT guard for everything below
const requireEmployee = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.sendStatus(401);
        // Named, not a bare 403. An admin token reaching an employee route is a
        // wiring mistake somewhere, and a status with no body left the page
        // saying "could not change the password" — which describes neither the
        // cause nor the fix.
        if (payload.role !== 'employee' || !payload.employee_code) {
            return res.status(403).json({
                error: 'This is an employee route and the token is not an employee token',
            });
        }
        req.employee_code = payload.employee_code;

        // Enforced here rather than asked of the page. A client that skips the
        // change screen — or a script that never loads it — would otherwise
        // punch happily with a credential the employee does not control.
        if (payload.must_change && req.path !== '/change-password') {
            return res.status(403).json({
                error: 'Set your own password before using the portal',
                must_change: true,
            });
        }
        next();
    });
};

router.use(requireEmployee);

/**
 * The employee changes their own password.
 *
 * The current password is required even though the session is already
 * authenticated: an unlocked phone left on a bench should not be enough to lock
 * its owner out of their own attendance record.
 */
router.post('/change-password', async (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Current and new password are required' });
    }

    const policyError = await checkPasswordPolicy(new_password);
    if (policyError) return res.status(400).json({ error: policyError });

    try {
        const found = await db.query(
            'SELECT id, portal_password_hash FROM employees WHERE employee_code = $1',
            [req.employee_code]
        );
        const emp = found.rows[0];
        if (!emp?.portal_password_hash) {
            return res.status(400).json({ error: 'No portal password is set for this account' });
        }
        if (!await bcrypt.compare(current_password, emp.portal_password_hash)) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        if (current_password === new_password) {
            return res.status(400).json({ error: 'The new password must be different' });
        }

        await db.query(
            `UPDATE employees
                SET portal_password_hash = $1, portal_must_change = false, portal_password_set_at = NOW()
              WHERE id = $2`,
            [await bcrypt.hash(new_password, 10), emp.id]
        );

        // A fresh token, because the one in hand still carries must_change.
        const token = jwt.sign(
            { employee_code: req.employee_code, role: 'employee' },
            JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
        );
        res.json({ success: true, token, message: 'Password updated' });
    } catch (err) {
        console.error('Portal change-password error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

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

/**
 * The employee's own record, as HR holds it.
 *
 * Read-only on purpose. Someone editing their own joining date or department is
 * an audit problem — those fields decide leave accrual, shift, and who approves
 * their requests. Corrections are requested and applied by HR.
 *
 * The device PIN, the portal password hash and the directory identifiers are
 * not selected. There is no reason for a page to carry them.
 */
router.get('/profile', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT e.employee_code, e.name, e.designation, e.gender, e.dob,
                    e.joining_date, e.mobile, e.email, e.address, e.status,
                    e.employment_type, e.card_number,
                    d.name AS department, a.name AS area
               FROM employees e
               LEFT JOIN departments d ON d.id = e.department_id
               LEFT JOIN areas a ON a.id = e.area_id
              WHERE e.employee_code = $1`,
            [req.employee_code]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Employee not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Portal profile error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Shift and holidays — the two questions HR is asked most often, and both are
 * already in the database.
 *
 * Holidays are filtered to the employee's own location where a mapping exists.
 * A national list shown to someone whose plant does not observe half of it is
 * worse than no list: they plan a day off that is not one.
 */
router.get('/schedule', async (req, res) => {
    // Installs differ. Shift and holiday tables arrived later than the core
    // schema and are absent on older databases — including the development one
    // this was written against. A missing table means the feature was never set
    // up, which is not an error worth a 500 on a page that also shows holidays.
    const optional = async (text, params) => {
        try {
            return (await db.query(text, params)).rows;
        } catch (err) {
            if (err.code === '42P01') return [];   // undefined_table
            throw err;
        }
    };

    try {
        const [shift, holidays] = await Promise.all([
            optional(
                `SELECT s.name, s.start_time, s.end_time, es.effective_date
                   FROM employee_shifts es
                   JOIN shifts s ON s.id = es.shift_id
                  WHERE es.employee_code = $1 AND es.effective_date <= CURRENT_DATE
                  ORDER BY es.effective_date DESC LIMIT 1`,
                [req.employee_code]
            ),
            optional(
                `SELECT DISTINCT h.name, h.date, h.type, h.is_optional
                   FROM holidays h
                   LEFT JOIN holiday_location_mapping m ON m.holiday_id = h.id
                   LEFT JOIN employees e ON e.employee_code = $1
                  WHERE h.date >= CURRENT_DATE - INTERVAL '30 days'
                    AND (m.location_id IS NULL OR m.location_id = e.area_id)
                  ORDER BY h.date`,
                [req.employee_code]
            ),
        ]);

        res.json({
            // Null rather than invented. An employee with no shift assigned
            // should be told that, not shown a default they are not on.
            shift: shift[0] || null,
            holidays,
        });
    } catch (err) {
        console.error('Portal schedule error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * The employee's own attendance for a month, as a spreadsheet.
 *
 * The same figures the register and payroll use — read from
 * attendance_daily_summary rather than recomputed here, so a discrepancy
 * between what somebody downloads and what they are paid on cannot appear.
 *
 * CSV, not PDF: it opens in Excel, it is a few lines of code with no dependency,
 * and someone disputing a month's hours wants the numbers rather than a layout.
 */
router.get('/attendance/export', async (req, res) => {
    const month = String(req.query.month || '').trim();      // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month must be YYYY-MM' });
    }

    try {
        const rows = await db.query(
            `SELECT to_char(date, 'YYYY-MM-DD') AS date,
                    to_char(in_time,  'HH24:MI') AS in_time,
                    to_char(out_time, 'HH24:MI') AS out_time,
                    COALESCE(duration_minutes, 0) AS duration_minutes,
                    COALESCE(late_minutes, 0)     AS late_minutes,
                    COALESCE(ot_minutes, 0)       AS ot_minutes,
                    status
               FROM attendance_daily_summary
              WHERE employee_code = $1
                AND to_char(date, 'YYYY-MM') = $2
              ORDER BY date`,
            [req.employee_code, month]
        );

        const header = ['Date', 'In', 'Out', 'Hours', 'Late (min)', 'Overtime (min)', 'Status'];
        const lines = [header.join(',')];
        for (const r of rows.rows) {
            const hours = (r.duration_minutes / 60).toFixed(2);
            lines.push([
                r.date, r.in_time || '', r.out_time || '', hours,
                r.late_minutes, r.ot_minutes,
                // Quoted: a status could contain a comma, and one stray comma
                // shifts every later column on that row.
                `"${String(r.status || '').replace(/"/g, '""')}"`,
            ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',
            `attachment; filename="attendance-${req.employee_code}-${month}.csv"`);
        res.send(lines.join('\n'));
    } catch (err) {
        console.error('Portal export error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * What is waiting on me to approve.
 *
 * An employee who approves for nobody gets an empty list and the portal hides
 * the tab — rather than a screen that exists to say "nothing here", which
 * teaches people to stop opening it.
 */
router.get('/approvals', async (req, res) => {
    try {
        const approvals = require('../services/approvals');
        const [pending, approver] = await Promise.all([
            approvals.pendingFor(req.employee_code),
            approvals.isApprover(req.employee_code),
        ]);
        res.json({ ...pending, is_approver: approver });
    } catch (err) {
        console.error('Portal approvals error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Approve or reject one request.
 *
 * The permission is checked here, on this request, not inherited from the fact
 * that the list showed it. A list is a convenience; anyone can post an id.
 */
router.post('/approvals/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    const { decision, comment } = req.body || {};

    if (!['leave', 'regularization'].includes(type)) {
        return res.status(400).json({ error: 'Unknown request type' });
    }
    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or rejected' });
    }

    const table = type === 'leave' ? 'leaves' : 'attendance_regularizations';

    try {
        const existing = await db.query(
            `SELECT employee_code, status FROM ${table} WHERE id = $1`, [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Request not found' });

        // Already decided is a conflict, not a silent overwrite. Two approvers
        // opening the same queue is normal, and the second one should be told
        // rather than quietly reversing the first.
        if (String(existing.rows[0].status).toLowerCase() !== 'pending') {
            return res.status(409).json({
                error: `That request has already been ${existing.rows[0].status}`,
            });
        }

        const approvals = require('../services/approvals');
        const { allowed, via, reason } = await approvals.canApprove(
            req.employee_code, existing.rows[0].employee_code);
        if (!allowed) return res.status(403).json({ error: reason || 'Not yours to approve' });

        // approved_via records the level that authorised it. Chains change, and
        // six months on "were they allowed to approve this" cannot be answered
        // by re-running today's chain against a decision made under a different
        // one.
        if (type === 'leave') {
            await db.query(
                `UPDATE leaves SET status = $1, approved_at = NOW(),
                        approved_via = $2, approver_employee_code = $3
                  WHERE id = $4`,
                [decision, via, req.employee_code, id]);
        } else {
            await db.query(
                `UPDATE attendance_regularizations
                    SET status = $1, reviewed_at = NOW(), review_comment = $2,
                        approved_via = $3, approver_employee_code = $4, reviewed_by = $4
                  WHERE id = $5`,
                [decision, comment || null, via, req.employee_code, id]);
        }

        res.json({ success: true, decision, via });
    } catch (err) {
        console.error('Portal approval decision error:', err.message);
        res.status(500).json({ error: 'Server error' });
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
