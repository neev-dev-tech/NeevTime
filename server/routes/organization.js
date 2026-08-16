const express = require('express');
const router = express.Router();
const db = require('../db');

// ================= DEPARTMENTS =================
router.get('/departments', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM departments ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/departments', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO departments (name) VALUES ($1) RETURNING *',
            [name]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/departments/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= POSITIONS =================
router.get('/positions', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, 
                   (SELECT COUNT(*) FROM employees e WHERE e.designation = p.name) as employee_count
            FROM positions p
            ORDER BY p.name
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/positions', async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO positions (name, description) VALUES ($1, $2) RETURNING *',
            [name, description]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/positions/:id', async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await db.query(
            'UPDATE positions SET name = $1, description = COALESCE($2, description) WHERE id = $3 RETURNING *',
            [name, description, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/positions/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM positions WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= AREAS =================
router.get('/areas', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT a.*, 
                   parent.name as parent_area_name,
                   (SELECT COUNT(*)::int FROM employees e WHERE e.area_id = a.id AND (LOWER(e.status) IS DISTINCT FROM 'resigned')) as employee_count,
                   (SELECT COUNT(*)::int FROM devices d WHERE d.area_id = a.id) as device_count,
                   (SELECT COUNT(*)::int FROM employees e WHERE e.area_id = a.id AND LOWER(e.status) = 'resigned') as resigned_count,
                   -- Enrolment counts come from biometric_templates, not from
                   -- employees. These two summed e.fingerprint_count and
                   -- e.face_count, columns that exist on `devices` and have
                   -- never existed on `employees` in any schema file — so the
                   -- whole statement failed and the Areas page returned 500 on
                   -- every install, this one included.
                   --
                   -- template_type 1 and 2 are fingerprints and 9 is face,
                   -- matching how the device detail and system stats endpoints
                   -- already classify them.
                   (SELECT COUNT(*)::int FROM biometric_templates bt
                      JOIN employees e ON e.employee_code = bt.employee_code
                     WHERE e.area_id = a.id AND bt.template_type IN (1, 2)) as fp_count,
                   (SELECT COUNT(*)::int FROM biometric_templates bt
                      JOIN employees e ON e.employee_code = bt.employee_code
                     WHERE e.area_id = a.id AND bt.template_type = 9) as face_count,
                   (SELECT COUNT(*)::int FROM employees e WHERE e.area_id = a.id AND e.card_number IS NOT NULL AND e.card_number != '') as card_count
            FROM areas a
            LEFT JOIN areas parent ON a.parent_area_id = parent.id
            ORDER BY a.name
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/areas', async (req, res) => {
    const { name, code, parent_area_id } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO areas (name, code, parent_area_id) VALUES ($1, $2, $3) RETURNING *',
            [name, code || null, parent_area_id || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/areas/:id', async (req, res) => {
    const { name, code, parent_area_id } = req.body;
    try {
        const result = await db.query(
            'UPDATE areas SET name = $1, code = COALESCE($2, code), parent_area_id = $3 WHERE id = $4 RETURNING *',
            [name, code, parent_area_id || null, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/areas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM areas WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
