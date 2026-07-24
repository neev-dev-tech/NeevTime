const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { logLogin, logLogout } = require('../utils/systemLogger');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    process.exit(1);
}

// Helper: Get User by Username
const getUserByUsername = async (username) => {
    const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
};

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await getUserByUsername(username);

        // For initial setup, if no user exists, please use reset_admin_password.js script
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) return res.status(400).json({ error: 'Invalid username or password' });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '12h'
        });

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
router.post('/forgot-password', async (req, res) => {
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

router.post('/reset-password', async (req, res) => {
    const { uid, token, password } = req.body;
    if (!uid || !token || !password) return res.status(400).json({ error: 'uid, token and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

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

        // Check if user exists
        const existing = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (username, password_hash, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, email, created_at',
            [username, hashedPassword, role || 'user', email || null]
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
            params.push(username);
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

module.exports = { router, authenticateToken };
