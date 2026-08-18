/**
 * Rotation patterns and shift swaps.
 *
 * Rotations are admin-side: define a repeating sequence, assign crews with
 * offsets, generate ahead. Swaps are employee-side and travel the approval
 * machinery leave does: counterpart agrees first, then whoever the chain or
 * flow says approves — a swap is an agreement between two people that
 * management countersigns.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const rotations = require('../services/rotations');

router.get('/rotations', async (req, res) => {
    try {
        const r = await db.query(`
            SELECT r.*, (SELECT count(*) FROM employee_rotations er WHERE er.rotation_id = r.id)::int AS crew
              FROM shift_rotations r ORDER BY r.is_active DESC, r.name`);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/rotations', async (req, res) => {
    const { name, shift_sequence, period_days, anchor_date } = req.body || {};
    if (!name || !Array.isArray(shift_sequence) || shift_sequence.length < 1 || !anchor_date) {
        return res.status(400).json({ error: 'name, shift_sequence (ordered shift ids) and anchor_date are required' });
    }
    try {
        const r = await db.query(`
            INSERT INTO shift_rotations (name, shift_sequence, period_days, anchor_date)
            VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, shift_sequence.map(v => v || null), Number(period_days) || 7, anchor_date]);
        res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/rotations/:id', async (req, res) => {
    const { name, shift_sequence, period_days, anchor_date, is_active } = req.body || {};
    try {
        const r = await db.query(`
            UPDATE shift_rotations SET
                name = COALESCE($1, name),
                shift_sequence = COALESCE($2, shift_sequence),
                period_days = COALESCE($3, period_days),
                anchor_date = COALESCE($4, anchor_date),
                is_active = COALESCE($5, is_active)
            WHERE id = $6 RETURNING *`,
            [name, Array.isArray(shift_sequence) ? shift_sequence : null,
             period_days, anchor_date, is_active, req.params.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Rotation not found' });
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Assign a crew. Offsets stagger crews across the pattern's slots. */
router.post('/rotations/:id/crew', async (req, res) => {
    const { employee_ids, slot_offset, starts_on } = req.body || {};
    if (!Array.isArray(employee_ids) || !employee_ids.length || !starts_on) {
        return res.status(400).json({ error: 'employee_ids and starts_on are required' });
    }
    try {
        let added = 0;
        for (const empId of employee_ids.map(Number).filter(Number.isInteger)) {
            const r = await db.query(`
                INSERT INTO employee_rotations (employee_id, rotation_id, slot_offset, starts_on)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (employee_id, rotation_id, starts_on) DO NOTHING RETURNING id`,
                [empId, req.params.id, Number(slot_offset) || 0, starts_on]);
            added += r.rows.length;
        }
        res.json({ success: true, added });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rotations/:id/crew', async (req, res) => {
    try {
        const r = await db.query(`
            SELECT er.id, er.slot_offset, er.starts_on, er.ends_on,
                   e.id AS employee_id, e.employee_code, e.name
              FROM employee_rotations er JOIN employees e ON e.id = er.employee_id
             WHERE er.rotation_id = $1 ORDER BY er.slot_offset, e.name`, [req.params.id]);
        res.json(r.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rotations/:id/crew/:memberId', async (req, res) => {
    try {
        await db.query('DELETE FROM employee_rotations WHERE id = $1 AND rotation_id = $2',
            [req.params.memberId, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Generate now, rather than waiting for the nightly run — with a preview
 * count first if dry_run. The generator is idempotent and never overwrites a
 * hand-entered schedule, so running it early costs nothing.
 */
router.post('/rotations/generate', async (req, res) => {
    try {
        res.json(await rotations.generate({}));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
