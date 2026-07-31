/**
 * Suprema BioStar 2 adapter — UNVERIFIED AGAINST HARDWARE.
 *
 * BioStar 2 does not push to arbitrary listeners the way Hikvision does, so this
 * polls its REST API instead: sign in, ask for events newer than the last one we
 * saw, translate them, hand them to punch_ingest.
 *
 * What is safe to rely on here: mapEvent is pure and covered by tests in
 * server/tests/adapters.test.js against the response shape in Suprema's API
 * documentation.
 *
 * What still needs a real server:
 *   - the event type codes your BioStar version emits for a successful
 *     verification (they differ between 2.7, 2.8 and 2.9)
 *   - whether your install presents a self-signed certificate
 *   - whether user_id carries your employee code or an internal id you will
 *     need to map
 *
 * As with the Hikvision adapter, unrecognised event codes are logged and
 * ignored rather than assumed to be punches — an access *denied* event must
 * never become attendance.
 */

const axios = require('axios');

/**
 * Event type codes that mean a person was successfully identified.
 * Defaults cover the common verify/identify successes; override per install.
 */
const SUCCESS_EVENT_CODES = new Set([4096, 4097, 4098, 4864, 4865, 4867]);

/** BioStar reports the credential used; map it to our verification_mode. */
const VERIFY_MODE_BY_CODE = {
    4097: 1,  // fingerprint
    4098: 3,  // card
    4864: 1,
    4865: 2,  // face
    4867: 2
};

class BioStarClient {
    /**
     * @param {object} config
     * @param {string} config.baseUrl        e.g. https://biostar.local
     * @param {string} config.username
     * @param {string} config.password
     * @param {boolean} [config.allowSelfSigned]  BioStar often ships a self-signed cert
     */
    constructor(config) {
        this.baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
        this.username = config.username;
        this.password = config.password;
        this.sessionId = null;

        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: 20000,
            // Only when the operator has explicitly accepted it — a BioStar box on
            // the LAN usually has no publicly trusted certificate.
            httpsAgent: config.allowSelfSigned
                ? new (require('node:https').Agent)({ rejectUnauthorized: false })
                : undefined
        });
    }

    async login() {
        const res = await this.http.post('/api/login', {
            User: { login_id: this.username, password: this.password }
        });
        const session = res.headers['bs-session-id'];
        if (!session) throw new Error('BioStar login did not return a bs-session-id header');
        this.sessionId = session;
        return session;
    }

    async ensureSession() {
        if (!this.sessionId) await this.login();
        return this.sessionId;
    }

    /**
     * Fetch events in a window. BioStar expects UTC ISO strings.
     * Re-authenticates once if the session has expired.
     */
    async searchEvents({ start, end, limit = 1000 }) {
        await this.ensureSession();

        const request = () => this.http.post('/api/events/search', {
            Query: {
                limit,
                conditions: [
                    { column: 'datetime', operator: 3, values: [start, end] }
                ],
                orders: [{ column: 'datetime', descending: false }]
            }
        }, { headers: { 'bs-session-id': this.sessionId } });

        let res;
        try {
            res = await request();
        } catch (err) {
            if (err.response && err.response.status === 401) {
                this.sessionId = null;
                await this.login();
                res = await request();
            } else {
                throw err;
            }
        }

        return res.data?.EventCollection?.rows || [];
    }
}

/**
 * Translate one BioStar event row into a normalised punch.
 * @returns {{punch: object}|{ignored: string}}
 */
const mapEvent = (row, options = {}) => {
    const successCodes = options.successEventCodes || SUCCESS_EVENT_CODES;

    const code = Number.parseInt(
        row?.event_type_id?.code ?? row?.event_type_id ?? row?.event_type ?? '',
        10
    );
    if (Number.isNaN(code)) return { ignored: 'event has no numeric type code' };
    if (!successCodes.has(code)) {
        return { ignored: `event code ${code} is not a recognised successful verification` };
    }

    // user_id is an object in newer versions, a bare string in older ones
    const rawUser = row?.user_id;
    const employeeCode = typeof rawUser === 'object' && rawUser !== null
        ? (rawUser.user_id ?? rawUser.id ?? null)
        : rawUser;

    if (!employeeCode || String(employeeCode).trim() === '') {
        return { ignored: 'event has no user id' };
    }
    if (!row?.datetime) {
        return { ignored: 'event has no datetime' };
    }

    const device = row?.device_id;
    const deviceHint = typeof device === 'object' && device !== null
        ? (device.name ?? device.id ?? null)
        : device;

    return {
        punch: {
            employeeCode: String(employeeCode).trim(),
            // BioStar returns UTC; punch_ingest converts to the configured zone
            timestamp: row.datetime,
            state: null, // BioStar has no in/out on the event; the engine infers it
            verifyMode: VERIFY_MODE_BY_CODE[code] ?? 0,
            raw: JSON.stringify(row).slice(0, 2000),
            deviceHint
        }
    };
};

module.exports = { BioStarClient, mapEvent, SUCCESS_EVENT_CODES, VERIFY_MODE_BY_CODE };
