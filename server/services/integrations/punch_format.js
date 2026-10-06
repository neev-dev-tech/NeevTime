/**
 * Shared punch decoding for outbound HRMS integrations.
 *
 * Every integration module used to reimplement these two things, and only the
 * ERPNext one got them right:
 *
 *  1. **Direction.** Six modules tested `punch_state <= 1` for check-in and
 *     `> 1` for check-out. In this system 0 is IN and 1 is OUT, so `<= 1`
 *     matched both — every punch became an entry — while `> 1` matched only the
 *     break and overtime states, so check-out was never found and was pushed as
 *     null.
 *
 *  2. **Timestamps.** Six modules called `toISOString()` on the punch time.
 *     `attendance_logs.punch_time` is a naive local wall clock, which the pg
 *     driver hands back as a Date built in the process timezone; converting that
 *     to UTC moves it by the offset. In IST that meant every time was 5h30m
 *     early and any punch before 05:30 was filed under the previous day.
 *
 * The direction rules below are lifted verbatim from the ERPNext integration,
 * which has been running in production — including its deliberate treatment of
 * state 0 as ambiguous, because eSSL readers that are not configured for a
 * direction report 0 or 255 for everything and the device's own setting is the
 * only reliable signal.
 */

const EXPLICIT_OUT = [1, 2, 5, 9];  // check-out, break-out, OT-out
const EXPLICIT_IN = [3, 4, 8];      // break-in, OT-in

/**
 * Decide whether a punch is an entry or an exit.
 *
 * @param {number|string} punchState        raw punch_state from the device
 * @param {string} [deviceDirection='in']   the reader's configured direction,
 *                                          used when the state is ambiguous
 * @returns {'IN'|'OUT'}
 */
const decodeDirection = (punchState, deviceDirection = 'in') => {
    const state = Number.parseInt(punchState, 10);

    if (!Number.isNaN(state)) {
        if (EXPLICIT_OUT.includes(state)) return 'OUT';
        if (EXPLICIT_IN.includes(state)) return 'IN';
    }

    // State 0, 255, or unparseable: the device did not tell us, so trust how the
    // reader itself is configured.
    return deviceDirection === 'out' ? 'OUT' : 'IN';
};

const isCheckIn = (punchState, deviceDirection = 'in') =>
    decodeDirection(punchState, deviceDirection) === 'IN';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Break a punch time into its local calendar parts.
 *
 * Uses local getters deliberately. `punch_time` is stored without a zone and pg
 * builds the Date in the process timezone, which server.js pins to the
 * attendance timezone on the first line. Reading local components therefore
 * returns the wall clock the device originally reported; reading UTC components
 * would shift it by the offset.
 *
 * @param {Date|string} punchTime
 * @returns {{date: string, time: string, timeShort: string, datetime: string, iso: string}|null}
 */
const formatLocal = (punchTime) => {
    if (!punchTime) return null;
    const d = punchTime instanceof Date ? punchTime : new Date(punchTime);
    if (Number.isNaN(d.getTime())) return null;

    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    return {
        date,
        time,
        timeShort: time.substring(0, 5),
        datetime: `${date} ${time}`,
        // ISO-shaped but still local — what most HR APIs mean by a timestamp
        iso: `${date}T${time}`
    };
};

/** Convenience: just the local calendar date, for grouping punches by day. */
const localDate = (punchTime) => formatLocal(punchTime)?.date ?? null;

/**
 * Look up the configured direction of every reader in a batch of punches.
 *
 * States 0 and 255 — which are 100% of the ambiguous traffic on eSSL hardware —
 * can only be resolved from the reader's own setting, so an integration pushing
 * a day of punches needs this. One query rather than one per record.
 *
 * @param {Array<{device_serial?: string}>} records
 * @returns {Promise<Object<string, 'in'|'out'|'both'>>} serial → direction
 */
const resolveDeviceDirections = async (records) => {
    const serials = [...new Set(records.map(r => r.device_serial).filter(Boolean))];
    if (serials.length === 0) return {};

    const db = require('../../db');
    const res = await db.query(
        'SELECT serial_number, device_direction FROM devices WHERE serial_number = ANY($1)',
        [serials]
    );

    const map = {};
    for (const row of res.rows) {
        map[row.serial_number] = row.device_direction || 'in';
    }
    return map;
};

module.exports = {
    decodeDirection,
    isCheckIn,
    formatLocal,
    localDate,
    resolveDeviceDirections,
    EXPLICIT_IN,
    EXPLICIT_OUT
};
