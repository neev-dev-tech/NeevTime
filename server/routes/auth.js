const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { logLogin, logLogout } = require('../utils/systemLogger');
const settings = require('../utils/settings');
const { rateLimit } = require('../utils/rateLimit');

// Throttles the endpoint itself. The per-account lockout below cannot see an
// attacker spraying one password across many usernames; this can.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts from this address. Try again later.' });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many password reset requests. Try again later.' });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1);
}

/**
 * Look a user up for sign-in.
 *
 * Matching is case-insensitive and ignores surrounding whitespace. It used to be
 * an exact comparison, so an account created as "Mukesh" could not be signed
 * into as "mukesh" — and because a missing user and a wrong password return the
 * same message, the account simply appeared broken. A username is a name, not a
 * secret; the password carries the case sensitivity that matters.
 *
 * A unique index on lower(username) (see ensureSchema) keeps this unambiguous —
 * without it, two accounts differing only by case would make this lookup
 * arbitrary about which one it returned.
 */
const getUserByUsername = async (username) => {
    if (typeof username !== 'string' || !username.trim()) return undefined;
    const res = await db.query(
        'SELECT * FROM users WHERE lower(username) = lower($1)',
        [username.trim()]
    );
    return res.rows[0];
};

/**
 * Validate a new password against the Security settings policy.
 * Returns an error string, or null when the password is acceptable.
 */
const checkPasswordPolicy = async (password) => {
    const policy = await settings.getCategory('security', {
        password_min_length: 6,
        password_require_uppercase: false,
        password_require_number: false,
        require_special_char: false
    });

    if (password.length < policy.password_min_length) {
        return `Password must be at least ${policy.password_min_length} characters`;
    }
    if (policy.password_require_uppercase && !/[A-Z]/.test(password)) {
        return 'Password must contain an uppercase letter';
    }
    if (policy.password_require_number && !/[0-9]/.test(password)) {
        return 'Password must contain a number';
    }
    if (policy.require_special_char && !/[^A-Za-z0-9]/.test(password)) {
        return 'Password must contain a special character';
    }
    return null;
};

/** Session length for issued tokens, from Security settings. */
const tokenOptions = async () => {
    const minutes = await settings.get('security', 'session_timeout_minutes', 0);
    if (minutes > 0) return { expiresIn: `${minutes}m` };
    return { expiresIn: process.env.JWT_EXPIRES_IN || '12h' };
};

// Login
router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await getUserByUsername(username);

        // For initial setup, if no user exists, please use reset_admin_password.js script
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const maxAttempts = await settings.get('security', 'max_login_attempts', 0);
        const lockoutMinutes = await settings.get('security', 'lockout_duration_minutes', 15);

        // Locked accounts are refused before the password is even checked, so a
        // lockout cannot be worn down by continued guessing.
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(423).json({
                error: `Account locked. Try again in ${remaining} minute${remaining === 1 ? '' : 's'}.`
            });
        }

        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) {
            if (maxAttempts > 0) {
                const attempts = (user.failed_login_attempts || 0) + 1;
                if (attempts >= maxAttempts) {
                    await db.query(
                        `UPDATE users SET failed_login_attempts = 0,
                         locked_until = NOW() + ($1 || ' minutes')::interval WHERE id = $2`,
                        [String(lockoutMinutes), user.id]
                    );
                    return res.status(423).json({
                        error: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.`
                    });
                }
                await db.query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
            }
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        // Successful login clears the counter and any expired lock
        if (user.failed_login_attempts || user.locked_until) {
            await db.query(
                'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
                [user.id]
            );
        }

        // username travels in the token so audit entries can name the actor
        // without a database lookup on every mutating request
        const token = jwt.sign(
            { id: user.id, role: user.role, username: user.username },
            JWT_SECRET,
            await tokenOptions()
        );

        // Log login event
        const ipAddress = req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for'];
        const userAgent = req.get('user-agent');
        logLogin(user.username, ipAddress, userAgent, user.id).catch(err => {
            console.error('Failed to log login:', err);
        });

        res.json({ token, user: { username: user.username, role: user.role } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ================= PASSWORD RESET =================

// Request a reset link. Always responds success to avoid user enumeration.
router.post('/forgot-password', resetLimiter, async (req, res) => {
    const { username } = req.body;
    const genericOk = { success: true, message: 'If the account exists, a reset link has been emailed.' };
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        const user = await getUserByUsername(username);
        if (!user || !user.email) return res.json(genericOk);

        // Sign with secret + current hash: changing the password invalidates the link
        const token = jwt.sign(
            { id: user.id, purpose: 'pwreset' },
            JWT_SECRET + user.password_hash,
            { expiresIn: '30m' }
        );

        const baseUrl = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${baseUrl}/reset-password?uid=${user.id}&token=${token}`;

        const emailService = require('../services/email');
        await emailService.sendEmail({
            to: user.email,
            subject: 'NeevTime password reset',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Password Reset</h2>
                    <p>A password reset was requested for user <b>${user.username}</b>.</p>
                    <p><a href="${resetUrl}" style="background:#EA580C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reset Password</a></p>
                    <p style="color:#666;font-size:12px;">The link expires in 30 minutes. If you did not request this, ignore this email.</p>
                </div>`,
            text: `Reset your NeevTime password: ${resetUrl} (expires in 30 minutes)`
        });

        res.json(genericOk);
    } catch (err) {
        console.error('Forgot password error:', err.message);
        // Email failure surfaces clearly; nothing sensitive leaked
        res.status(500).json({ error: 'Could not send reset email. Check SMTP settings or contact your administrator.' });
    }
});

router.post('/reset-password', resetLimiter, async (req, res) => {
    const { uid, token, password } = req.body;
    if (!uid || !token || !password) return res.status(400).json({ error: 'uid, token and password required' });

    const policyError = await checkPasswordPolicy(password);
    if (policyError) return res.status(400).json({ error: policyError });

    try {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [uid]);
        const user = result.rows[0];
        if (!user) return res.status(400).json({ error: 'Invalid reset link' });

        try {
            const payload = jwt.verify(token, JWT_SECRET + user.password_hash);
            if (payload.purpose !== 'pwreset' || payload.id !== user.id) throw new Error('bad token');
        } catch {
            return res.status(400).json({ error: 'Reset link is invalid or has expired' });
        }

        const hash = await bcrypt.hash(password, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
        res.json({ success: true, message: 'Password updated. You can now sign in.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        // 401 (not 403) so the client knows the session itself is invalid/expired
        if (err) return res.sendStatus(401);
        // Employee portal tokens are a separate realm — not valid for admin APIs
        if (user.role === 'employee') return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Logout — records the audit entry. The token itself is discarded client-side.
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT username FROM users WHERE id = $1', [req.user.id]);
        const ipAddress = req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for'];
        await logLogout(result.rows[0]?.username || String(req.user.id), ipAddress, req.user.id);
    } catch (err) {
        console.error('Failed to log logout:', err.message);
    }
    res.json({ success: true });
});

router.get('/me', authenticateToken, async (req, res) => {
    const result = await db.query('SELECT id, username, role FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
});

// ================= USER MANAGEMENT =================

// Get all users (admin only)
router.get('/users', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const result = await db.query('SELECT id, username, role, email, created_at FROM users ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new user (admin only)
router.post('/users', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { username, password, role, email } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const policyError = await checkPasswordPolicy(password);
        if (policyError) return res.status(400).json({ error: policyError });

        // Compared case-insensitively to match how sign-in looks accounts up.
        // Allowing both "Mukesh" and "mukesh" to exist would make that lookup
        // ambiguous, and one of the two accounts unreachable.
        const cleanUsername = username.trim();
        const existing = await db.query('SELECT id FROM users WHERE lower(username) = lower($1)', [cleanUsername]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (username, password_hash, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, email, created_at',
            [cleanUsername, hashedPassword, role || 'user', email || null]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user (admin only)
router.put('/users/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const { username, password, role, email } = req.body;

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (username) {
            // Same rule as creation: no two accounts may differ only by case,
            // or sign-in cannot tell them apart.
            const cleanUsername = username.trim();
            const clash = await db.query(
                'SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2',
                [cleanUsername, id]
            );
            if (clash.rows.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            params.push(cleanUsername);
            updates.push(`username = $${params.length}`);
        }
        if (role) {
            params.push(role);
            updates.push(`role = $${params.length}`);
        }
        if (email !== undefined) {
            params.push(email);
            updates.push(`email = $${params.length}`);
        }
        if (password) {
            const policyError = await checkPasswordPolicy(password);
            if (policyError) return res.status(400).json({ error: policyError });
            const hashedPassword = await bcrypt.hash(password, 10);
            params.push(hashedPassword);
            updates.push(`password_hash = $${params.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);
        query += updates.join(', ') + ` WHERE id = $${params.length} RETURNING id, username, role, email`;

        const result = await db.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user (admin only)
router.delete('/users/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;

        // Prevent deleting self
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// checkPasswordPolicy is shared with the employee portal: the rules an
// administrator sets under Security apply to everyone who has a password in
// this system, not only to admin accounts.
module.exports = { router, authenticateToken, checkPasswordPolicy };
