'use strict';

/**
 * Host-network discovery agent.
 *
 * Discovery is an L2 operation — ARP and UDP broadcast only reach the segment
 * the scanner is actually on. The main server runs on the docker bridge
 * (172.x), isolated from the office LAN (e.g. 10.81.20.0/24), so a scan from
 * there sees nothing. This tiny agent is meant to run in a container with
 * `network_mode: host`, sharing the host's network stack, so the same discovery
 * code finally sees the real LAN and the readers on it.
 *
 * It is deliberately minimal and does ONE thing — run a scan and return the
 * candidates as JSON. It touches no database and holds no state. The main server
 * calls it (see /api/devices/discover) and remains the only component that talks
 * to the database or decides anything.
 *
 * Access is gated by a shared token: under host networking this port is on the
 * LAN, and triggering a ping sweep should not be anonymous. The token is passed
 * as `X-Discovery-Token` and compared in constant time.
 */

const http = require('http');
const crypto = require('crypto');
const discovery = require('./services/discovery');

const PORT = parseInt(process.env.DISCOVERY_AGENT_PORT || '3999', 10);
const TOKEN = process.env.DISCOVERY_AGENT_TOKEN || '';

function tokenOk(provided) {
    if (!TOKEN) return false; // no token configured => refuse everything
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(TOKEN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const send = (res, code, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
    res.end(payload);
};

const server = http.createServer(async (req, res) => {
    // Liveness check the main server can use to tell "agent present" from
    // "agent misconfigured" — no token needed, no scan performed.
    if (req.method === 'GET' && req.url === '/health') {
        return send(res, 200, { ok: true, agent: 'discovery', hasToken: !!TOKEN });
    }

    if (req.method !== 'POST' || req.url.split('?')[0] !== '/scan') {
        return send(res, 404, { error: 'not found' });
    }
    if (!tokenOk(req.headers['x-discovery-token'])) {
        return send(res, 401, { error: 'unauthorized' });
    }

    try {
        const result = await discovery.discover({
            timeoutMs: 3000,
            log: (m) => console.log(m),
        });
        return send(res, 200, result);
    } catch (err) {
        console.error('[discovery-agent] scan failed:', err.message);
        return send(res, 500, { error: 'scan failed', detail: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`[discovery-agent] listening on ${PORT} (host network); token ${TOKEN ? 'set' : 'MISSING — all requests will 401'}`);
});
