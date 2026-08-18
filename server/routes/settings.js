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

        // Settings the browser has no business receiving.
        //
        // backup_destination_config holds the credentials for the backup
        // destination — encrypted, but it is still the credential material, and
        // it was being rendered in an editable text box on the Settings screen.
        // Anyone who could open that page could copy the ciphertext, and one
        // stray keystroke would corrupt the destination silently.
        //
        // The dedicated panel at System > Database > Backup returns these
        // properly: secrets as a mask, the rest as fields.
        const WITHHELD = new Set(['backup_destination_config', 'backup_destination']);

        // Group by category
        const grouped = result.rows.reduce((acc, row) => {
            if (WITHHELD.has(row.setting_key)) return acc;
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

        // Reject a Windows path here, while someone is looking at the screen.
        //
        // On Linux a UNC path is not a path, it is a filename. Saved quietly, it
        // would be created as one very oddly named directory inside the
        // container, every backup would be copied into it, and the copies would
        // vanish on the next deploy — announced by nothing. The owner of this
        // system typed exactly that path into this field, which is how the check
        // came to exist.
        //
        // Refused at save so the answer arrives now rather than at 02:00 in a
        // log nobody reads.
        if (category === 'database' && updates.backup_external_path) {
            const p = String(updates.backup_external_path).trim();
            if (/^\\\\/.test(p) || /^[A-Za-z]:[\\/]/.test(p)) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({
                    error: `"${p}" is a Windows path, and this server is Linux — it would be `
                        + 'treated as a filename and the backups would be lost on the next deploy.',
                    hint: 'Mount the share on the server first:\n'
                        + '  sudo mount -t cifs "//10.81.20.100/IT_Team" /mnt/it-backups '
                        + '-o username=<your AD user>,vers=3.0\n'
                        + '\n\nOr skip mounting entirely: System > Database > Backup, "Second copy", '
                        + 'choose "Windows share (SMB)" and enter the server, share and folder '
                        + 'separately with a username and password. That reaches this same share '
                        + 'without any path at all.',
                });
            }
        }

        await client.query('BEGIN');

        for (const [key, value] of Object.entries(updates)) {
            // Convert value to string for storage
            const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

            // Upsert, not update. An UPDATE against a setting_key that has no
            // row affects nothing and returns success, so a setting added in
            // code but never seeded into app_settings would appear to save and
            // silently not — the same shape as the sync_leaves toggle that
            // nothing read, and the ?status= parameter the server ignored.
            //
            // The table has UNIQUE(category, setting_key), so the conflict
            // target is exact. data_type is only set when the row is created;
            // an existing row keeps whatever type it was seeded with.
            await client.query(`
                INSERT INTO app_settings (category, setting_key, setting_value, data_type)
                VALUES ($2, $3, $1, $4)
                ON CONFLICT (category, setting_key) DO UPDATE
                SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
            `, [stringValue, category, key, typeof value === 'boolean' ? 'boolean'
                : typeof value === 'number' ? 'number'
                : typeof value === 'object' ? 'json' : 'string']);
        }

        await client.query('COMMIT');

        // Drop the settings cache so enforcement picks up the new values at once
        require('../utils/settings').invalidate();

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

        // Auto Reports tab changed — reconcile the scheduler's rows with it
        if (category === 'reports') {
            require('../services/scheduled-reports').syncFromSettings().catch(err => {
                console.error('Auto report sync failed:', err.message);
            });
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

/**
 * Fire a real alert on demand, so delivery can be proven without waiting for
 * something to actually break.
 *
 * This is deliberately not a shortcut to sendEmail: it goes through raise() and
 * resolve() exactly as a genuine alert does, so it exercises the recipient list,
 * the dedupe state, the mail formatting and SMTP together. A test that skips the
 * plumbing proves only that SMTP works, which the Email tab already tells you.
 *
 * Two mails are expected — the alert, then the recovery — which also confirms
 * the resolve half is wired, the half that is easy to leave broken because
 * nothing complains when it is.
 */
/**
 * Fire drill for the one alert that matters most.
 *
 * /test-alert above proves SMTP and the raise/resolve pipeline with a synthetic
 * alert. It proves nothing about checkNoPunches itself — the check written to
 * catch a dead ingest, the 145-day failure — whose query, timezone gates and
 * body had never once executed in production because collection has never been
 * down on a working morning since the check was written. This runs the real
 * check with only the verdict forced.
 */
router.post('/test-alert/no-punches', async (req, res) => {
    try {
        const { drillNoPunches } = require('../services/alert_checks');
        const result = await drillNoPunches();
        if (!result.sent) {
            return res.status(400).json({
                success: false,
                error: `Drill not delivered: ${result.reason}`,
                gates: result.gates,
            });
        }
        res.json({
            success: true,
            message: 'Drill sent — expect two mails, the alert and its recovery. '
                + 'The subject is prefixed [DRILL].',
            recovery_sent: result.recovery_sent,
            gates: result.gates,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/test-alert', async (req, res) => {
    try {
        const alerts = require('../services/alerts');
        const cfg = await alerts.alertConfig();

        if (cfg.recipientList.length === 0) {
            return res.status(400).json({
                error: 'No alert recipients configured. Set them under Settings → Alerts.'
            });
        }

        // A fixed key, cleared first, so repeated tests are not swallowed by the
        // dedupe that exists precisely to swallow repeats.
        const key = 'test_alert';
        await db.query('DELETE FROM alert_state WHERE alert_key = $1', [key]);

        const raised = await alerts.raise(key, {
            severity: 'low',
            subject: 'NeevTime test alert',
            body: 'This is a test, triggered from Settings.\n\n'
                + 'If this arrived, alerting works: the recipient list, the mail '
                + 'formatting and SMTP are all connected.\n\n'
                + 'A second mail should follow immediately confirming it cleared. '
                + 'Real alerts behave the same way — one when something breaks, '
                + 'one when it recovers, and nothing in between however long it lasts.',
            details: { triggeredBy: req.user?.username || 'unknown' }
        });

        if (!raised.sent) {
            return res.status(400).json({
                success: false,
                error: `Alert not delivered: ${raised.reason}`,
                hint: 'Alerting is email-only. Send a test from the Email/SMTP tab first.'
            });
        }

        const resolved = await alerts.resolve(key);

        res.json({
            success: true,
            recipients: cfg.recipientList,
            message: `Sent to ${cfg.recipientList.join(', ')}. Expect two mails: the alert and its recovery.`,
            recovery_sent: resolved.sent === true
        });
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

        require('../utils/settings').invalidate();
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
