/**
 * The facts the privacy notice states, for anyone who can open the sign-in page.
 *
 * NeevTime is run by an employer about its own staff, so the employer — not
 * the software — decides who answers privacy questions and how long records
 * are kept. Those come from Settings > Privacy contact; nothing here invents
 * them, and an unset value is reported as unset so the notice can say so
 * instead of printing a placeholder as if it were true.
 *
 * Public on purpose: an employee must be able to read the notice before
 * signing in, and on the punch screen before sharing location. It exposes
 * only what a published notice would — no personal data.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

const KEYS = {
    company: ['company_name', 'company_address', 'company_email'],
    privacy: [
        'privacy_operator_name', 'privacy_contact_name', 'privacy_contact_email',
        'privacy_contact_phone', 'privacy_contact_address', 'privacy_notice_updated',
        'attendance_record_retention',
    ],
    attendance: ['punch_photo_retention_days'],
};

router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT category, setting_key, setting_value FROM app_settings
              WHERE (category = 'company' AND setting_key = ANY($1))
                 OR (category = 'privacy' AND setting_key = ANY($2))
                 OR (category = 'attendance' AND setting_key = ANY($3))`,
            [KEYS.company, KEYS.privacy, KEYS.attendance]
        );
        const v = Object.fromEntries(result.rows.map(r => [r.setting_key, (r.setting_value || '').trim()]));
        const days = Number(v.punch_photo_retention_days);

        res.json({
            operator: v.privacy_operator_name || v.company_name || null,
            contact: {
                name: v.privacy_contact_name || null,
                email: v.privacy_contact_email || null,
                phone: v.privacy_contact_phone || null,
                address: v.privacy_contact_address || v.company_address || null,
            },
            updated: v.privacy_notice_updated || null,
            photo_retention_days: Number.isFinite(days) && days > 0 ? days : 90,
            attendance_record_retention: v.attendance_record_retention || null,
            // The notice is incomplete until someone answerable is named.
            configured: Boolean(v.privacy_contact_name && (v.privacy_contact_email || v.privacy_contact_phone)),
        });
    } catch (err) {
        console.error('Privacy notice facts failed:', err.message);
        res.status(500).json({ error: 'Could not load the privacy contact details' });
    }
});

module.exports = router;
