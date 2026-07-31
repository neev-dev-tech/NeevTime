/**
 * HTTP listener for Hikvision access controllers — NOT ENABLED BY DEFAULT.
 *
 * Point the device at:  http://<server>:3001/api/adapters/hikvision/event?token=<ingest_token>
 * (Device menu: Network → Advanced Settings → HTTP Listening, or "Notify
 * Surveillance Center" in the web UI.)
 *
 * The token is the same per-device ingest token used by /api/ingest/punch,
 * issued from POST /api/devices/:serial/ingest-token. It travels in the query
 * string because most Hikvision firmware cannot set a custom request header —
 * which is exactly why this listener should sit on the LAN, or behind TLS if it
 * must be reachable from anywhere else.
 *
 * To enable, mount it in server.js:
 *     app.use('/api/adapters/hikvision', require('./routes/adapter_hikvision'));
 * It is intentionally left unmounted until it has been tested against a real
 * device — see docs/adapters.md.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { recordPunch } = require('../services/punch_ingest');
const { isDeviceAllowed } = require('../services/device_registry');
const hikvision = require('../services/adapters/hikvision');

// The device posts XML, JSON or multipart — take the body as raw text and let
// the adapter work out which. 2 MB covers an event with a face snapshot.
router.use(express.text({ type: '*/*', limit: '2mb' }));

const deviceForToken = async (token) => {
    if (!token) return null;
    const res = await db.query(
        'SELECT serial_number, vendor, status FROM devices WHERE ingest_token IS NOT NULL'
    );
    const supplied = Buffer.from(String(token));
    for (const row of res.rows) {
        const stored = Buffer.from(row.ingest_token || '');
        if (stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied)) return row;
    }
    return null;
};

router.post('/event', async (req, res) => {
    // Always answer 200. A Hikvision controller that gets an error retries the
    // same event indefinitely, which is how a small parsing problem turns into a
    // flood. Anything rejected is logged instead.
    const ack = (note) => {
        if (note) logger.info(`[Hikvision] ${note}`);
        res.status(200).send('OK');
    };

    try {
        const token = req.query.token || req.get('x-device-token');
        const device = await deviceForToken(token);
        if (!device) return ack('event refused: unrecognised or missing token');

        const trust = await isDeviceAllowed(device.serial_number);
        if (!trust.allowed) return ack(`event refused from ${device.serial_number}: ${trust.reason}`);

        const parsed = hikvision.parseEvent(req.body, req.get('content-type') || '');
        if (!parsed.punch) return ack(`event ignored from ${device.serial_number}: ${parsed.ignored}`);

        const outcome = await recordPunch(
            { ...parsed.punch, deviceSerial: device.serial_number },
            { io: req.app.get('io') }
        );

        await db.query(
            `UPDATE devices SET last_activity = NOW(),
                status = CASE WHEN status = 'retired' THEN 'retired' ELSE 'online' END
             WHERE serial_number = $1`,
            [device.serial_number]
        );

        return ack(outcome.stored
            ? `punch stored for ${parsed.punch.employeeCode} at ${outcome.timestamp}`
            : `punch rejected: ${outcome.reason}`);
    } catch (err) {
        return ack(`listener error: ${err.message}`);
    }
});

/** Some firmware probes the URL with GET before it will save the setting. */
router.get('/event', (req, res) => res.status(200).send('OK'));

module.exports = router;
