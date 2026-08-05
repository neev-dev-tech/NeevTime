/**
 * Vendor-neutral punch ingestion.
 *
 * Every device integration — the ZKTeco/eSSL ADMS push handler, the generic
 * vendor webhook, and any adapter added later — funnels through recordPunch so
 * that duplicate handling, timezone normalisation, summary recomputation, the
 * live socket feed and HRMS push all behave identically no matter which brand
 * of reader produced the punch.
 *
 * Adapters are responsible for one thing only: turning their vendor's payload
 * into the normalised shape below. They must not write to attendance_logs
 * directly.
 *
 *   {
 *     employeeCode: string,   // the PIN / user id on the device
 *     timestamp:    string,   // local wall clock, 'YYYY-MM-DD HH:mm:ss'
 *     deviceSerial: string,
 *     state:        string,   // '0' in, '1' out — see normalizeState
 *     verifyMode:   number,   // 0 unknown, 1 fingerprint, 2 face, 3 card, 4 password
 *     raw:          string    // original line/payload, kept for troubleshooting
 *   }
 */

const moment = require('moment-timezone');
const db = require('../db');
const settings = require('../utils/settings');

const DEFAULT_TZ = 'Asia/Kolkata';

const resolveTimezone = async () => {
    const tz = await settings.get('timezone', 'system_timezone', DEFAULT_TZ);
    return moment.tz.zone(tz) ? tz : DEFAULT_TZ;
};

/**
 * Map a vendor's direction wording onto the punch_state the reports expect.
 * Anything unrecognised stays '0' (IN), matching the ADMS handler's fallback.
 */
const normalizeState = (value, deviceDirection = null) => {
    if (deviceDirection === 'in') return '0';
    if (deviceDirection === 'out') return '1';

    if (value === null || value === undefined || value === '') return '0';

    const text = String(value).trim().toLowerCase();
    if (['1', 'out', 'checkout', 'check-out', 'exit'].includes(text)) return '1';
    if (['0', 'in', 'checkin', 'check-in', 'entry'].includes(text)) return '0';

    // Numeric ZK states pass through untouched — reports already understand them
    return /^\d+$/.test(text) ? text : '0';
};

const VERIFY_MODES = {
    fingerprint: 1, finger: 1, fp: 1,
    face: 2, facial: 2,
    card: 3, rfid: 3,
    password: 4, pin: 4
};

const normalizeVerifyMode = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    const text = String(value).trim().toLowerCase();
    if (/^\d+$/.test(text)) return parseInt(text);
    return VERIFY_MODES[text] ?? 0;
};

/**
 * Persist one punch and run everything that must follow it.
 *
 * @param {object} punch     normalised punch (see module docblock)
 * @param {object} [options]
 * @param {object} [options.io]         socket.io server, to push the live feed
 * @param {boolean} [options.recompute] rebuild the daily summary (default true)
 * @returns {Promise<{stored: boolean, reason?: string, punchDate?: string}>}
 */
const recordPunch = async (punch, options = {}) => {
    const { io = null, recompute = true } = options;
    const { employeeCode, deviceSerial, raw } = punch;

    if (!employeeCode || !punch.timestamp) {
        return { stored: false, reason: 'employeeCode and timestamp are required' };
    }

    const timezone = await resolveTimezone();
    const parsed = moment.tz(punch.timestamp, timezone);
    if (!parsed.isValid()) {
        return { stored: false, reason: `unparseable timestamp: ${punch.timestamp}` };
    }
    const localTimestamp = parsed.format('YYYY-MM-DD HH:mm:ss');

    const state = normalizeState(punch.state, punch.deviceDirection);
    const verifyMode = normalizeVerifyMode(punch.verifyMode);

    try {
        // A punch can arrive before the employee has been created in the app;
        // the placeholder keeps the foreign key satisfied and surfaces the
        // unknown code in Personnel rather than dropping attendance.
        await db.query(
            `INSERT INTO employees (employee_code, name) VALUES ($1, 'Unknown') ON CONFLICT DO NOTHING`,
            [employeeCode]
        );

        await db.query(`
            INSERT INTO attendance_logs
            (employee_code, device_serial, punch_time, punch_state, verification_mode, raw_data, source, is_attendance, upload_time)
            VALUES ($1, $2, $3, $4, $5, $6, 1, 1, NOW())
            ON CONFLICT (employee_code, punch_time) DO UPDATE
            SET upload_time = NOW(), punch_state = EXCLUDED.punch_state
        `, [employeeCode, deviceSerial, localTimestamp, state, verifyMode, raw || null]);

        if (io) {
            io.emit('new_punch', {
                employee_code: employeeCode,
                device_serial: deviceSerial,
                timestamp: localTimestamp,
                state
            });
        }

        const punchDate = localTimestamp.substring(0, 10);

        if (recompute) {
            const attendanceEngine = require('./attendance_engine');
            await attendanceEngine.processDateRange(punchDate, punchDate, null, employeeCode);
        }

        // HRMS push must never hold up or fail the punch
        (async () => {
            try {
                const hrmsIntegration = require('./hrms-integration');
                const integrations = await hrmsIntegration.getActiveIntegrations();
                for (const integration of integrations) {
                    if (!integration.sync_attendance) continue;
                    const instance = await hrmsIntegration.getIntegrationInstance(integration.id);
                    const record = {
                        employee_code: employeeCode,
                        punch_time: localTimestamp,
                        punch_state: state,
                        device_serial: deviceSerial
                    };

                    try {
                        const stats = await instance.pushAttendance([record]);
                        const failed = stats?.failed || 0;

                        // Heartbeat only — one integration_sync_logs row per punch
                        // would add hundreds of rows a day and bury the batch
                        // entries. This keeps "is the push alive?" answerable
                        // without the noise. It matters: that table read "last
                        // push 31 July" for four days while the real-time path
                        // was the only thing running, which is what made the
                        // outage so hard to see.
                        await instance.updateSyncStatus(
                            failed ? 'partial' : 'success',
                            failed
                                ? `Live push: ${employeeCode} rejected`
                                : `Live push: ${employeeCode} at ${localTimestamp}`
                        );

                        // Failures DO get a row. They are rare, and each one is a
                        // punch that never reached payroll — exactly what someone
                        // reviewing sync health needs to find.
                        if (failed) {
                            await instance.logSync('attendance', 'push', 'partial', stats);
                        }
                    } catch (pushErr) {
                        await instance.updateSyncStatus('failed', `Live push failed: ${pushErr.message}`);
                        await instance.logSync(
                            'attendance', 'push', 'failed',
                            { processed: 1, success: 0, failed: 1 },
                            pushErr.message
                        );
                        throw pushErr;
                    }
                }
            } catch (err) {
                console.log(`[Punch] HRMS push skipped: ${err.message}`);
            }
        })();

        return { stored: true, punchDate, timestamp: localTimestamp };
    } catch (err) {
        console.error('[Punch] insert failed:', err.message);
        return { stored: false, reason: err.message };
    }
};

module.exports = { recordPunch, normalizeState, normalizeVerifyMode, resolveTimezone };
