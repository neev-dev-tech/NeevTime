#!/usr/bin/env node
/**
 * Vendor device simulator — exercise the Hikvision and Suprema adapters with no
 * hardware present.
 *
 * The parsing half of both adapters is already covered by unit tests. What was
 * untestable without a device is everything around it: the ingest token check,
 * the device-approval gate, the punch actually landing in attendance_logs, and
 * the Socket.IO event reaching the dashboard. This drives those paths.
 *
 * What it does NOT prove, and no simulator can: the event type codes your real
 * BioStar version emits, whether Hikvision's firmware sends the multipart shape
 * assumed here, and whether user_id carries your employee code or an internal
 * id. Those still need the hardware — see docs/adapters.md. This gets everything
 * else working first, so the day a device arrives the only unknown left is the
 * device.
 *
 * ── Hikvision ────────────────────────────────────────────────────────────────
 * Posts events to a running NeevTime the way a camera would.
 *
 *   1. Register a device and mint a token:
 *        POST /api/devices                       (vendor: 'Hikvision')
 *        POST /api/devices/<serial>/ingest-token
 *   2. node server/scripts/simulate_vendor_device.js hikvision \
 *        --url http://localhost:3001 --token <token> --code INT089
 *
 * ── Suprema ──────────────────────────────────────────────────────────────────
 * Runs a fake BioStar server for the poller to talk to. Point the poller's
 * baseUrl at it instead of a real appliance.
 *
 *   node server/scripts/simulate_vendor_device.js suprema --port 8890
 *   ... then startSupremaPoller({ baseUrl: 'http://localhost:8890', ... })
 *
 * Add --deny to emit access-denied events instead of successful ones. That case
 * matters more than the happy path: a denied event must never become
 * attendance, and this is the cheapest way to prove it does not.
 */

const http = require('node:http');

const args = process.argv.slice(2);
const mode = args[0];
const flag = (name, fallback = null) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const deny = has('deny');

// ─────────────────────────────── Hikvision ───────────────────────────────────

/**
 * The multipart shape an access controller posts: an XML part carrying the
 * event, and usually a JPEG snapshot alongside it. The binary part is included
 * deliberately — a parser that only ever sees clean XML in tests will fall over
 * the first time a real camera attaches a picture.
 */
const hikvisionMultipart = (code, boundary) => {
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<EventNotificationAlert version="2.0">',
        '  <ipAddress>10.81.20.201</ipAddress>',
        '  <dateTime>' + new Date().toISOString() + '</dateTime>',
        '  <eventType>AccessControllerEvent</eventType>',
        '  <AccessControllerEvent>',
        '    <majorEventType>5</majorEventType>',
        // 1 = legal card / verification success. 21 is a denied attempt, which
        // the adapter must ignore rather than store.
        `    <subEventType>${deny ? 21 : 1}</subEventType>`,
        `    <employeeNoString>${code}</employeeNoString>`,
        '    <currentVerifyMode>cardOrFaceOrFp</currentVerifyMode>',
        '    <attendanceStatus>checkIn</attendanceStatus>',
        '  </AccessControllerEvent>',
        '</EventNotificationAlert>'
    ].join('\n');

    return Buffer.concat([
        Buffer.from(
            `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="event_log"\r\n' +
            'Content-Type: application/xml\r\n\r\n' +
            xml + '\r\n' +
            `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="picture"; filename="snap.jpg"\r\n' +
            'Content-Type: image/jpeg\r\n\r\n'
        ),
        // a few bytes of "JPEG"
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
};

const sendHikvision = async () => {
    const base = flag('url', 'http://localhost:3001');
    const token = flag('token');
    const code = flag('code', 'INT089');
    const count = Number.parseInt(flag('count', '1'), 10);

    if (!token) {
        console.error('--token is required. Mint one with POST /api/devices/<serial>/ingest-token');
        process.exit(1);
    }

    const boundary = '----NeevTimeSim' + Math.floor(process.hrtime()[1]).toString(36);

    for (let i = 0; i < count; i++) {
        const body = hikvisionMultipart(code, boundary);
        const res = await fetch(`${base}/api/adapters/hikvision/event?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body
        });
        const text = await res.text();
        console.log(`[${i + 1}/${count}] ${res.status} ${text.trim().slice(0, 120)}`);
    }

    console.log(
        deny
            ? '\nSent access-DENIED events. Nothing should appear in attendance_logs.'
            : `\nSent ${count} successful event(s) for ${code}. Check the Live Logs page.`
    );
};

// ──────────────────────────────── Suprema ────────────────────────────────────

/**
 * Minimum BioStar surface the poller uses: a login that returns a session
 * header, and an event search that returns rows under EventCollection.
 */
const supremaServer = () => {
    const port = Number.parseInt(flag('port', '8890'), 10);
    const code = flag('code', 'INT089');
    const SESSION = 'sim-session-' + Math.floor(process.hrtime()[1]).toString(36);
    let served = 0;

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.method === 'POST' && req.url.startsWith('/api/login')) {
                console.log('[sim] login');
                res.writeHead(200, { 'bs-session-id': SESSION, 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ Response: { code: '0' } }));
            }

            if (req.method === 'POST' && req.url.startsWith('/api/events/search')) {
                if (req.headers['bs-session-id'] !== SESSION) {
                    // Exercises the poller's re-login path, which is otherwise
                    // only reachable when a real session expires.
                    console.log('[sim] events/search without a valid session -> 401');
                    res.writeHead(401); return res.end('{}');
                }
                served += 1;
                const rows = [{
                    // 4097 = fingerprint verify success; 4360 is a denial, which
                    // must not become a punch.
                    event_type_id: { code: deny ? 4360 : 4097 },
                    datetime: new Date().toISOString(),
                    user_id: { user_id: code },
                    device_id: { id: 'SIM-BIOSTAR-1', name: 'Simulated BioStation' }
                }];
                console.log(`[sim] events/search #${served} -> 1 row (${deny ? 'DENIED' : 'success'})`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ EventCollection: { rows, total: rows.length } }));
            }

            // Opening the port in a browser is the first thing anyone does,
            // and a bare 404 reads as "broken" rather than "wrong verb".
            if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                return res.end(
                    'NeevTime — fake BioStar server\n\n' +
                    'This is an API, not a web page. It answers exactly two calls,\n' +
                    'both POST, which is what the Suprema poller makes:\n\n' +
                    '  POST /api/login          -> returns a bs-session-id header\n' +
                    '  POST /api/events/search  -> returns one event row\n\n' +
                    `Currently emitting: ${deny ? 'DENIED events (must NOT become attendance)' : 'successful verifications'}\n` +
                    `Employee code:      ${code}\n` +
                    `Searches served:    ${served}\n\n` +
                    'Drive it by hand:\n' +
                    `  curl -si -X POST http://localhost:${port}/api/login \\\n` +
                    `    -H 'Content-Type: application/json' \\\n` +
                    `    -d '{"User":{"login_id":"x","password":"y"}}' | grep -i bs-session-id\n\n` +
                    `  curl -s -X POST http://localhost:${port}/api/events/search \\\n` +
                    `    -H 'bs-session-id: SESSION_FROM_ABOVE' \\\n` +
                    `    -H 'Content-Type: application/json' -d '{"Query":{"limit":10}}'\n`
                );
            }
            if (req.method === 'GET' && req.url === '/favicon.ico') {
                res.writeHead(204); return res.end();
            }

            console.log(`[sim] unhandled ${req.method} ${req.url} (this server only answers POST /api/login and POST /api/events/search)`);
            res.writeHead(404); res.end('{}');
        });
    });

    server.listen(port, () => {
        console.log(`Fake BioStar listening on http://localhost:${port}`);
        console.log(`Emitting ${deny ? 'DENIED' : 'successful'} events for ${code}.`);
        console.log('\nPoint the poller at it:');
        console.log(`  startSupremaPoller({ baseUrl: 'http://localhost:${port}', username: 'x',`);
        console.log(`                       password: 'y', deviceSerial: '<a registered serial>' })\n`);
        console.log('Ctrl-C to stop.');
    });
};

// ────────────────────────────────── main ─────────────────────────────────────

if (mode === 'hikvision') {
    sendHikvision().catch(err => { console.error(err.message); process.exit(1); });
} else if (mode === 'suprema') {
    supremaServer();
} else {
    console.log(`Usage:
  node server/scripts/simulate_vendor_device.js hikvision --token <t> [--url http://localhost:3001]
                                                          [--code INT089] [--count 5] [--deny]
  node server/scripts/simulate_vendor_device.js suprema   [--port 8890] [--code INT089] [--deny]

--deny sends access-denied events. Those must never become attendance; it is the
case worth checking first.`);
    process.exit(mode ? 1 : 0);
}
