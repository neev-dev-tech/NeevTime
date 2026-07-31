/**
 * Device trust checks shared by every vendor integration.
 *
 * Any reader that speaks a supported protocol can announce itself, and until
 * now that was enough for its punches to be trusted. Serials seen for the first
 * time are now registered as `pending` so they surface in the Devices page for
 * a human to accept.
 *
 * Enforcement is opt-in (Settings → Security → require_device_approval) and off
 * by default. Turning it on before approving the existing fleet would stop
 * attendance collection, so it is a deliberate decision rather than a silent
 * upgrade. Devices that predate this feature were marked approved by the
 * boot-time migration.
 */

const db = require('../db');
const settings = require('../utils/settings');

/**
 * Should punches from this serial be accepted?
 * @returns {Promise<{allowed: boolean, reason?: string, status?: string}>}
 */
const isDeviceAllowed = async (serial) => {
    if (!serial) return { allowed: false, reason: 'missing serial number' };

    const enforce = await settings.get('security', 'require_device_approval', false);
    if (!enforce) return { allowed: true };

    const res = await db.query(
        'SELECT approval_status, status FROM devices WHERE serial_number = $1',
        [serial]
    );

    if (res.rows.length === 0) {
        // Unknown to the database entirely — the upsert has not run yet
        return { allowed: false, reason: 'device is not registered', status: 'unknown' };
    }

    const { approval_status: approval, status } = res.rows[0];

    if (status === 'retired') {
        return { allowed: false, reason: 'device has been retired', status: 'retired' };
    }
    if (approval !== 'approved') {
        return { allowed: false, reason: 'device is awaiting approval', status: approval };
    }
    return { allowed: true };
};

/** Devices a human still has to accept or reject. */
const listPendingDevices = async () => {
    const res = await db.query(`
        SELECT serial_number, vendor, device_model, ip_address, first_seen_at, last_activity
        FROM devices
        WHERE approval_status = 'pending' AND status IS DISTINCT FROM 'retired'
        ORDER BY first_seen_at DESC NULLS LAST
    `);
    return res.rows;
};

const setApproval = async (serial, approved) => {
    const res = await db.query(
        `UPDATE devices SET approval_status = $1 WHERE serial_number = $2 RETURNING serial_number, approval_status`,
        [approved ? 'approved' : 'pending', serial]
    );
    return res.rows[0] || null;
};

module.exports = { isDeviceAllowed, listPendingDevices, setApproval };
