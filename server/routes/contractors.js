/**
 * Contractors — the companies whose people work here and who invoice for it.
 *
 * A contractor is an entity you bill against, not a label on an employee. The
 * question this exists to answer is "what do I owe Sharma Services for August",
 * which employment_type = 'Contract' cannot express at all.
 *
 * Hours come from attendance_daily_summary, the same rows the register and
 * payroll read. Recomputing them here would let an invoice disagree with the
 * attendance the client is shown, and the invoice would be the one believed.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/** Everyone, with how many people each has and whether they are still active. */
router.get('/contractors', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT c.*,
                   count(e.id) FILTER (WHERE LOWER(e.status) IS DISTINCT FROM 'resigned')
                       AS employee_count
              FROM contractors c
              LEFT JOIN employees e ON e.contractor_id = c.id
             GROUP BY c.id
             ORDER BY c.is_active DESC, LOWER(c.name)
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/contractors', async (req, res) => {
    const { name, code, contact_person, phone, email, address, gst_number, hourly_rate, notes } = req.body || {};
    if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'A contractor needs a name' });
    }
    try {
        const result = await db.query(`
            INSERT INTO contractors (name, code, contact_person, phone, email, address, gst_number, hourly_rate, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [String(name).trim(), code || null, contact_person || null, phone || null,
            email || null, address || null, gst_number || null,
            hourly_rate === '' || hourly_rate === undefined ? null : hourly_rate, notes || null]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        // Two agencies with the same name is a data-entry mistake every time,
        // and the one that gets invoiced would be a coin toss.
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A contractor with that name already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

router.put('/contractors/:id', async (req, res) => {
    const { name, code, contact_person, phone, email, address, gst_number, hourly_rate, is_active, notes } = req.body || {};
    try {
        const result = await db.query(`
            UPDATE contractors SET
                name = COALESCE($1, name),
                code = $2, contact_person = $3, phone = $4, email = $5,
                address = $6, gst_number = $7,
                hourly_rate = $8,
                is_active = COALESCE($9, is_active),
                notes = $10,
                updated_at = now()
              WHERE id = $11 RETURNING *
        `, [name ? String(name).trim() : null, code || null, contact_person || null,
            phone || null, email || null, address || null, gst_number || null,
            hourly_rate === '' || hourly_rate === undefined ? null : hourly_rate,
            is_active === undefined ? null : Boolean(is_active), notes || null, req.params.id]);

        if (!result.rows[0]) return res.status(404).json({ error: 'Contractor not found' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'A contractor with that name already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

/**
 * Removing a contractor that still has people is refused.
 *
 * The alternatives are orphaning those employees' attendance from the agency
 * that is owed for it, or deleting the people — and their attendance is payroll
 * evidence with a multi-year retention obligation. Deactivating keeps the
 * history intact and takes the agency out of the lists.
 */
router.delete('/contractors/:id', async (req, res) => {
    try {
        const attached = await db.query(
            'SELECT count(*)::int AS n FROM employees WHERE contractor_id = $1', [req.params.id]);

        if (attached.rows[0].n > 0) {
            return res.status(409).json({
                error: `${attached.rows[0].n} employee(s) are still billed to this contractor. `
                    + 'Move them first, or deactivate it instead — deleting would separate their '
                    + 'attendance from the agency owed for it.',
                employee_count: attached.rows[0].n,
            });
        }

        const result = await db.query('DELETE FROM contractors WHERE id = $1 RETURNING id', [req.params.id]);
        if (!result.rows[0]) return res.status(404).json({ error: 'Contractor not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * What one contractor's people worked in a month — the invoice question.
 *
 * Read from attendance_daily_summary rather than recomputed. Days present and
 * minutes worked are what the register shows; an invoice derived from different
 * arithmetic would be the version the client argues with.
 */
router.get('/contractors/:id/summary', async (req, res) => {
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month must be YYYY-MM' });
    }

    try {
        const contractor = await db.query('SELECT * FROM contractors WHERE id = $1', [req.params.id]);
        if (!contractor.rows[0]) return res.status(404).json({ error: 'Contractor not found' });

        const rows = await db.query(`
            SELECT e.employee_code, e.name, e.designation,
                   count(s.date) FILTER (WHERE s.status IN ('Present', 'Half Day', 'Short Day', 'Miss Punch'))
                       AS days_present,
                   COALESCE(sum(s.duration_minutes), 0)  AS minutes_worked,
                   COALESCE(sum(s.ot_minutes), 0)        AS overtime_minutes,
                   COALESCE(sum(s.late_minutes), 0)      AS late_minutes
              FROM employees e
              LEFT JOIN attendance_daily_summary s
                     ON s.employee_code = e.employee_code
                    AND to_char(s.date, 'YYYY-MM') = $2
             WHERE e.contractor_id = $1
             GROUP BY e.id, e.employee_code, e.name, e.designation
             ORDER BY e.name
        `, [req.params.id, month]);

        const minutes = rows.rows.reduce((sum, r) => sum + Number(r.minutes_worked), 0);
        const overtime = rows.rows.reduce((sum, r) => sum + Number(r.overtime_minutes), 0);
        const rate = contractor.rows[0].hourly_rate;

        res.json({
            contractor: contractor.rows[0],
            month,
            employees: rows.rows,
            totals: {
                headcount: rows.rows.length,
                minutes_worked: minutes,
                hours_worked: Number((minutes / 60).toFixed(2)),
                overtime_minutes: overtime,
                // Only when a rate is actually set. An amount computed from a
                // rate somebody invented to fill the field would be quoted at
                // an agency, and quoting a number nobody agreed is worse than
                // showing none.
                billable: rate ? Number(((minutes / 60) * Number(rate)).toFixed(2)) : null,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
