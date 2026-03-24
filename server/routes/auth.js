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
            console.log(`[LOGIN FAILED] User not found: ${username}`);
            return res.status(400).json({ error: 'User not found' });
        }

        const validPass = await bcrypt.compare(password, user.password_hash);
        console.log(`[LOGIN DEBUG] Request for: ${username}`);
        // Match result logging
        console.log(`[LOGIN DEBUG] Match result: ${validPass}`);

        if (!validPass) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);

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

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
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
