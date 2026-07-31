/**
 * Vendor-neutral punch intake.
 *
 * ZKTeco and eSSL readers push over the ADMS/iclock protocol, which the app has
 * always spoken. Other manufacturers — Hikvision, Suprema, Matrix, Anviz — each
 * use their own protocol, and writing a native adapter for every one of them is
 * a long road that needs the physical hardware to verify.
 *
 * This endpoint is the shortcut that works today: any device, middleware or
 * vendor cloud that can POST JSON can feed attendance in, using one documented
 * contract. Punches land through the same services/punch_ingest.js path as ADMS
 * punches, so dedup, timezone handling, summary recomputation, the live feed and
 * HRMS push behave identically regardless of brand.
 *
 * Authentication is a per-device token rather than a user session, because the
 * caller is a machine. Generate one from the Devices page; it is sent as
 * `Authorization: Bearer <token>` or `X-Device-Token`.
 *
 *   POST /api/ingest/punch
 *   {
 *     "device_serial": "HIK-12345",
 *     "punches": [
 *       {
 *         "employee_code": "INT029",
 *         "timestamp": "2026-07-31 13:11:52",   // device local time
 *         "direction": "in",                    // in | out | 0 | 1 — optional
 *         "verify_mode": "face"                 // fingerprint|face|card|password — optional
 *       }
 *     ]
 *   }
 *
 * A single punch may also be posted with the fields at the top level.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { recordPunch } = require('../services/punch_ingest');
const { isDeviceAllowed } = require('../services/device_registry');

const MAX_BATCH = 500;

/**
 * Resolve the device from its ingest token. Comparison is constant-time so the
 * endpoint does not leak token contents through response timing.
 */
const authenticateDevice = async (req) => {
    const header = req.get('authorization') || '';
    const token = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : (req.get('x-device-token') || '').trim();

    if (!token) return { error: 'Missing device token' };

    const res = await db.query(
        `SELECT serial_number, ingest_token, vendor, status
         FROM devices WHERE ingest_token IS NOT NULL`
    );

    const supplied = Buffer.from(token);
    for (const row of res.rows) {
        const stored = Buffer.from(row.ingest_token);
        if (stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied)) {
            return { device: row };
        }
    }
    return { error: 'Unrecognised device token' };
};

router.post('/punch', async (req, res) => {
    try {
        const auth = await authenticateDevice(req);
        if (auth.error) return res.status(401).json({ error: auth.error });

        const device = auth.device;

        const trust = await isDeviceAllowed(device.serial_number);
        if (!trust.allowed) {
            return res.status(403).json({ error: `Device rejected: ${trust.reason}` });
        }

        const body = req.body || {};
        const punches = Array.isArray(body.punches)
            ? body.punches
            : (body.employee_code ? [body] : null);

        if (!punches || punches.length === 0) {
            return res.status(400).json({ error: 'Provide "punches": [...] or a single punch object' });
        }
        if (punches.length > MAX_BATCH) {
            return res.status(413).json({ error: `Send at most ${MAX_BATCH} punches per request` });
        }

        const results = { accepted: 0, rejected: 0, errors: [] };

        for (const [index, punch] of punches.entries()) {
            const employeeCode = String(punch.employee_code ?? punch.user_id ?? '').trim();
            const timestamp = String(punch.timestamp ?? punch.punch_time ?? '').trim();

            if (!employeeCode || !timestamp) {
                results.rejected += 1;
                results.errors.push(`Punch ${index + 1}: employee_code and timestamp are required`);
                continue;
            }

            const outcome = await recordPunch(
                {
                    employeeCode,
                    timestamp,
                    deviceSerial: device.serial_number,
                    state: punch.direction ?? punch.punch_state,
                    verifyMode: punch.verify_mode ?? punch.verification_mode,
                    raw: JSON.stringify(punch)
                },
                { io: req.app.get('io') }
            );

            if (outcome.stored) {
                results.accepted += 1;
            } else {
                results.rejected += 1;
                results.errors.push(`Punch ${index + 1}: ${outcome.reason}`);
            }
        }

        // Any successful contact counts as the device being alive
        await db.query(
            `UPDATE devices SET last_activity = NOW(),
                status = CASE WHEN status = 'retired' THEN 'retired' ELSE 'online' END
             WHERE serial_number = $1`,
            [device.serial_number]
        );

        res.json({
            success: true,
            device: device.serial_number,
            accepted: results.accepted,
            rejected: results.rejected,
            errors: results.errors.slice(0, 50)
        });
    } catch (err) {
        console.error('[Ingest] failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** Lets an integrator confirm their token and connectivity before going live. */
router.get('/ping', async (req, res) => {
    const auth = await authenticateDevice(req);
    if (auth.error) return res.status(401).json({ error: auth.error });
    res.json({
        success: true,
        device: auth.device.serial_number,
        vendor: auth.device.vendor,
        server_time: new Date().toISOString()
    });
});

module.exports = router;
