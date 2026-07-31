/**
 * Hikvision ISAPI adapter — UNVERIFIED AGAINST HARDWARE.
 *
 * Hikvision access controllers push events to an HTTP listener you configure on
 * the device ("Network → Advanced → HTTP Listening", or Notify Surveillance
 * Center). The device POSTs an EventNotificationAlert as XML, JSON, or as a
 * multipart body whose first part is one of those with a photo attached.
 *
 * What is safe to rely on here: the parsing is pure and covered by tests in
 * server/tests/adapters.test.js against payload shapes taken from Hikvision's
 * ISAPI documentation.
 *
 * What still needs a real device:
 *   - the exact subEventType numbers your firmware emits on a successful punch
 *   - whether your model sends attendanceStatus at all (many send "undefined")
 *   - whether it posts XML, JSON or multipart
 *
 * Because of that, SUCCESS_SUB_EVENTS is configurable and anything unrecognised
 * is logged and ignored rather than guessed at. Treating an unknown event as a
 * punch would invent attendance from a *denied* access attempt, which is worse
 * than dropping it — the log tells you what to add.
 */

const VERIFY_MODE_BY_SUB_EVENT = {
    1: 3,   // legal card
    38: 1,  // fingerprint comparison passed
    75: 2,  // face authentication passed
    76: 2,  // face + card
    77: 1   // fingerprint + card
};

/**
 * Sub-event types that mean "a person was successfully identified".
 * Anything not listed is ignored. Override per install once the device's real
 * codes are known — see docs/adapters.md.
 */
const SUCCESS_SUB_EVENTS = new Set([1, 38, 75, 76, 77]);

const MAJOR_ACCESS_CONTROLLER = 5;

/** Pull the text of <tag>…</tag>, ignoring any namespace prefix. */
const xmlValue = (xml, tag) => {
    const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'));
    return match ? match[1].trim() : null;
};

/**
 * Split a multipart body and return the part that looks like the event payload.
 * Photo parts are discarded — this adapter only cares about the event.
 */
const extractFromMultipart = (body, contentType) => {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
    if (!boundaryMatch) return body;

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const parts = String(body).split(`--${boundary}`);

    for (const part of parts) {
        const separator = part.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
        const headerEnd = part.indexOf(separator);
        if (headerEnd === -1) continue;

        const headers = part.slice(0, headerEnd).toLowerCase();
        if (headers.includes('image/') || headers.includes('filename=')) continue;

        const content = part.slice(headerEnd + separator.length).trim();
        if (content.startsWith('<') || content.startsWith('{')) return content;
    }
    return body;
};

/** checkIn/checkOut wording → the direction punch_ingest understands. */
const directionFromStatus = (status) => {
    if (!status) return null;
    const text = String(status).trim().toLowerCase();
    if (['checkin', 'breakin', 'overtimein'].includes(text)) return 'in';
    if (['checkout', 'breakout', 'overtimeout'].includes(text)) return 'out';
    return null; // includes Hikvision's literal "undefined"
};

/**
 * Turn one ISAPI event notification into a normalised punch.
 *
 * @param {string|object} body        raw request body
 * @param {string} [contentType]      request Content-Type, for multipart handling
 * @param {object} [options]
 * @param {Set<number>} [options.successSubEvents]  override the accepted codes
 * @returns {{punch: object}|{ignored: string}}
 */
const parseEvent = (body, contentType = '', options = {}) => {
    const successCodes = options.successSubEvents || SUCCESS_SUB_EVENTS;

    let payload = body;
    if (typeof payload !== 'string' && typeof payload !== 'object') {
        return { ignored: 'unsupported body type' };
    }

    if (typeof payload === 'string' && (contentType || '').includes('multipart')) {
        payload = extractFromMultipart(payload, contentType);
    }

    let employeeCode = null;
    let timestamp = null;
    let subEventType = null;
    let majorEventType = null;
    let attendanceStatus = null;
    let serialNo = null;

    const asObject = typeof payload === 'object'
        ? payload
        : (payload.trim().startsWith('{') ? safeJson(payload) : null);

    if (asObject) {
        const event = asObject.AccessControllerEvent || asObject.accessControllerEvent || {};
        employeeCode = event.employeeNoString ?? event.employeeNo ?? event.cardNo ?? null;
        timestamp = asObject.dateTime ?? asObject.time ?? null;
        subEventType = toInt(event.subEventType ?? event.minorEventType);
        majorEventType = toInt(event.majorEventType);
        attendanceStatus = event.attendanceStatus ?? null;
        serialNo = asObject.macAddress ?? event.serialNo ?? null;
    } else if (typeof payload === 'string' && payload.includes('<')) {
        employeeCode = xmlValue(payload, 'employeeNoString')
            ?? xmlValue(payload, 'employeeNo')
            ?? xmlValue(payload, 'cardNo');
        timestamp = xmlValue(payload, 'dateTime');
        subEventType = toInt(xmlValue(payload, 'subEventType') ?? xmlValue(payload, 'minorEventType'));
        majorEventType = toInt(xmlValue(payload, 'majorEventType'));
        attendanceStatus = xmlValue(payload, 'attendanceStatus');
        serialNo = xmlValue(payload, 'macAddress') ?? xmlValue(payload, 'serialNo');
    } else {
        return { ignored: 'body is neither XML nor JSON' };
    }

    if (majorEventType !== null && majorEventType !== MAJOR_ACCESS_CONTROLLER) {
        return { ignored: `not an access controller event (major ${majorEventType})` };
    }
    if (!employeeCode || String(employeeCode).trim() === '') {
        return { ignored: 'no employee number on the event' };
    }
    if (!timestamp) {
        return { ignored: 'no dateTime on the event' };
    }
    if (subEventType === null || !successCodes.has(subEventType)) {
        // Door-forced, denied, tamper and heartbeat events all arrive here
        return { ignored: `sub-event ${subEventType} is not a recognised successful identification` };
    }

    return {
        punch: {
            employeeCode: String(employeeCode).trim(),
            timestamp: String(timestamp).trim(),
            state: directionFromStatus(attendanceStatus),
            verifyMode: VERIFY_MODE_BY_SUB_EVENT[subEventType] ?? 0,
            raw: typeof payload === 'string' ? payload.slice(0, 2000) : JSON.stringify(payload).slice(0, 2000),
            deviceHint: serialNo
        }
    };
};

const toInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number.parseInt(String(value), 10);
    return Number.isNaN(n) ? null : n;
};

const safeJson = (text) => {
    try { return JSON.parse(text); } catch { return null; }
};

module.exports = { parseEvent, SUCCESS_SUB_EVENTS, VERIFY_MODE_BY_SUB_EVENT, directionFromStatus };
