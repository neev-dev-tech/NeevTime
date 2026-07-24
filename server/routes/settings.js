const express = require('express');
const router = express.Router();
const db = require('../db');

// ================= GET ALL SETTINGS (grouped by category) =================
router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT category, setting_key, setting_value, data_type, description
            FROM app_settings
            ORDER BY category, setting_key
        `);

        // Group by category
        const grouped = result.rows.reduce((acc, row) => {
            if (!acc[row.category]) {
                acc[row.category] = {};
            }
            // Parse JSON values
            let value = row.setting_value;
            if (row.data_type === 'json') {
                try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
            } else if (row.data_type === 'boolean') {
                value = value === 'true';
            } else if (row.data_type === 'number') {
                value = parseFloat(value);
            }
            acc[row.category][row.setting_key] = {
                value,
                data_type: row.data_type,
                description: row.description
            };
            return acc;
        }, {});

        res.json(grouped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= GET SETTINGS BY CATEGORY =================
router.get('/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const result = await db.query(`
            SELECT setting_key, setting_value, data_type, description
            FROM app_settings
            WHERE category = $1
            ORDER BY setting_key
        `, [category]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Convert to object with parsed values
        const settings = result.rows.reduce((acc, row) => {
            let value = row.setting_value;
            if (row.data_type === 'json') {
                try { value = JSON.parse(value); } catch (e) { /* keep as string */ }
            } else if (row.data_type === 'boolean') {
                value = value === 'true';
            } else if (row.data_type === 'number') {
                value = parseFloat(value);
            }
            acc[row.setting_key] = {
                value,
                data_type: row.data_type,
                description: row.description
            };
            return acc;
        }, {});

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= UPDATE SETTINGS BY CATEGORY =================
router.put('/:category', async (req, res) => {
    const client = await db.getClient();
    try {
        const { category } = req.params;
        const updates = req.body; // { key1: value1, key2: value2, ... }

        await client.query('BEGIN');

        for (const [key, value] of Object.entries(updates)) {
            // Convert value to string for storage
            const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

            await client.query(`
                UPDATE app_settings 
                SET setting_value = $1, updated_at = NOW()
                WHERE category = $2 AND setting_key = $3
            `, [stringValue, category, key]);
        }

        await client.query('COMMIT');

        // Return updated settings
        const result = await db.query(`
            SELECT setting_key, setting_value, data_type
            FROM app_settings
            WHERE category = $1
        `, [category]);

        const settings = result.rows.reduce((acc, row) => {
            let value = row.setting_value;
            if (row.data_type === 'json') {
                try { value = JSON.parse(value); } catch (e) { }
            } else if (row.data_type === 'boolean') {
                value = value === 'true';
            } else if (row.data_type === 'number') {
                value = parseFloat(value);
            }
            acc[row.setting_key] = value;
            return acc;
        }, {});

        res.json({ success: true, settings });

        // SMTP config changed — rebuild the cached transporter
        if (category === 'notifications') {
            require('../services/email').initTransporter().catch(() => {});
        }
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ================= SEND TEST EMAIL (uses saved SMTP settings) =================
router.post('/test-email', async (req, res) => {
    try {
        const { test_email } = req.body;
        if (!test_email) {
            return res.status(400).json({ error: 'test_email required' });
        }
        const emailService = require('../services/email');
        const result = await emailService.testEmailConfig(test_email);
        res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= UPDATE SINGLE SETTING =================
router.put('/:category/:key', async (req, res) => {
    try {
        const { category, key } = req.params;
        const { value } = req.body;

        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

        const result = await db.query(`
            UPDATE app_settings 
            SET setting_value = $1, updated_at = NOW()
            WHERE category = $2 AND setting_key = $3
            RETURNING *
        `, [stringValue, category, key]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        res.json({ success: true, setting: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= GET CATEGORIES LIST =================
router.get('/meta/categories', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT category, COUNT(*) as setting_count
            FROM app_settings
            GROUP BY category
            ORDER BY category
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
