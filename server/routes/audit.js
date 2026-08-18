/**
 * Reading the audit trail.
 *
 * Admin only, and deliberately so. The central role guard does not block reads —
 * page-level visibility is handled separately — but this is the one history that
 * says what everybody did, including the person reading it. An HR user being
 * able to check whether their own edit was noticed defeats the purpose.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('./auth');

const adminOnly = (req, res, next) => {
    if (String(req.user?.role || '').toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'The audit trail is available to administrators only' });
    }
    next();
};

/** Tables the trail covers, for the filter dropdown. Derived, not hardcoded. */
router.get('/audit/tables', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT table_name, count(*)::int AS entries
               FROM audit_logs GROUP BY table_name ORDER BY table_name`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * The trail, newest first.
 *
 * Paged rather than complete: this table only grows, and a page that tries to
 * render a year of changes is a page nobody opens twice.
 */
router.get('/audit', authenticateToken, adminOnly, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Math.max(Number(req.query.offset) || 0, 0);

        const where = [];
        const params = [];
        const add = (clause, value) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

        if (req.query.table) add('a.table_name = ?', req.query.table);
        if (req.query.action) add('a.action = ?', String(req.query.action).toUpperCase());
        if (req.query.user_id) add('a.user_id = ?', Number(req.query.user_id));
        if (req.query.record_id) add('a.record_id = ?', Number(req.query.record_id));
        if (req.query.from) add('a.created_at >= ?', req.query.from);
        // Inclusive of the whole day someone typed, not midnight at its start.
        if (req.query.to) add("a.created_at < (?::date + INTERVAL '1 day')", req.query.to);

        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const { rows } = await db.query(`
            SELECT a.id, a.table_name, a.record_id, a.action,
                   a.old_data, a.new_data, a.user_id, a.created_at,
                   u.username
              FROM audit_logs a
              LEFT JOIN users u ON u.id = a.user_id
              ${clause}
             ORDER BY a.id DESC
             LIMIT ${limit} OFFSET ${offset}
        `, params);

        const total = await db.query(
            `SELECT count(*)::int AS n FROM audit_logs a ${clause}`, params);

        res.json({ entries: rows, total: total.rows[0].n, limit, offset });
    } catch (err) {
        console.error('Audit read failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Everything that ever happened to one record.
 *
 * The question a dispute actually asks is not "what changed today" but "what
 * happened to this punch", so it deserves its own route rather than a filter
 * someone has to construct.
 */
router.get('/audit/history/:table/:id', authenticateToken, adminOnly, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT a.id, a.action, a.old_data, a.new_data, a.created_at, u.username, a.user_id
              FROM audit_logs a
              LEFT JOIN users u ON u.id = a.user_id
             WHERE a.table_name = $1 AND a.record_id = $2
             ORDER BY a.id ASC
        `, [req.params.table, Number(req.params.id)]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
