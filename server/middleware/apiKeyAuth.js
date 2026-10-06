/**
 * Machine authentication for the outbound export API.
 *
 * This is the counterpart to the per-device token in routes/vendor_ingest.js,
 * with three differences that follow from who holds the credential. A device
 * token belongs to a reader on the office LAN; an API key belongs to an outside
 * company, reachable from the internet, reading the attendance of every
 * employee.
 *
 *  1. The token is compared as a SHA-256 hash, so the database never holds a
 *     usable key. vendor_ingest loads every token and walks them with
 *     timingSafeEqual because it stores them in the clear; hashing removes both
 *     the table scan and the plaintext.
 *  2. Calls are restricted to the addresses the client actually calls from.
 *     A pull integration has a small, fixed set of them.
 *  3. Every request is recorded — the refused ones especially, because a key
 *     being tried from an unexpected address is the signal that matters.
 *
 * Attach with a scope: the route says what it needs, the key says what it has.
 *
 *     router.get('/punches', apiKeyAuth('attendance:read'), handler)
 */

const crypto = require('node:crypto');
const db = require('../db');
const logger = require('../utils/logger');

const HEADER_FALLBACK = 'x-api-key';

/**
 * The address the call actually came from.
 *
 * req.ip is whatever opened the TCP connection, which in every deployment of
 * this API is a proxy — so the allowlist would be comparing the server against
 * itself and matching nothing. The real address arrives in a header, and which
 * header depends on how the request got here:
 *
 *  - **Cloudflare tunnel.** cloudflared connects from localhost, so
 *    $remote_addr is 127.0.0.1 and useless. Cloudflare puts the true client
 *    address in CF-Connecting-IP, sets it at its own edge, and strips any
 *    value the caller tried to supply. It is the trustworthy one, and it is
 *    checked first.
 *
 *  - **Direct reverse proxy.** No CF-Connecting-IP, so the first entry of
 *    X-Forwarded-For is used. That header IS caller-supplied and forgeable,
 *    which is why nginx must be configured to overwrite it with $remote_addr
 *    rather than append to it — see the export listener config — and why the
 *    allowlist is a second lock on a token that already has to be correct,
 *    rather than the only one.
 *
 * Order matters: CF-Connecting-IP before X-Forwarded-For. A caller behind the
 * tunnel can set X-Forwarded-For to anything they like, and Cloudflare passes
 * it through; reading it first would hand them the allowlist.
 */
const clientIp = (req) => {
    const cloudflare = req.get('cf-connecting-ip');
    if (cloudflare) return cloudflare.trim().replace(/^::ffff:/, '');

    const forwarded = req.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim().replace(/^::ffff:/, '');

    return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Pull the token from either header. Bearer is what most vendors reach for
 * first; X-API-Key is what greytHR's documentation describes, and accepting
 * both costs one line and saves a round of "it returns 401".
 */
const extractToken = (req) => {
    const header = req.get('authorization') || '';
    if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    return (req.get(HEADER_FALLBACK) || '').trim();
};

/**
 * An IPv4 address, a bare prefix ('49.204.'), or a CIDR block. Vendors give
 * their egress ranges in whichever of the three they happen to use.
 */
const ipAllowed = (ip, allowed) => {
    if (!allowed || allowed.length === 0) return true;   // unrestricted
    return allowed.some((entry) => {
        const rule = String(entry).trim();
        if (!rule) return false;
        if (rule === ip) return true;
        if (rule.endsWith('.')) return ip.startsWith(rule);
        if (rule.includes('/')) return cidrMatch(ip, rule);
        return false;
    });
};

const cidrMatch = (ip, cidr) => {
    const [range, bitsRaw] = cidr.split('/');
    const bits = Number.parseInt(bitsRaw, 10);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

    const toInt = (addr) => {
        const parts = addr.split('.');
        if (parts.length !== 4) return null;
        let n = 0;
        for (const part of parts) {
            const octet = Number.parseInt(part, 10);
            if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
            n = (n << 8) | octet;
        }
        return n >>> 0;
    };

    const a = toInt(ip);
    const b = toInt(range);
    if (a === null || b === null) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (a & mask) === (b & mask);
};

/**
 * Requests per minute, per key, held in memory.
 *
 * Deliberately not in Postgres: the limiter must answer before the query runs,
 * and a write per request to protect against too many requests is the wrong
 * shape. A restart clears the counters, which is acceptable — this exists to
 * stop a misconfigured poller hammering the database, not to defend a billing
 * boundary.
 */
const buckets = new Map();

const withinRateLimit = (clientId, perMinute) => {
    const now = Date.now();
    const windowStart = now - 60_000;
    const hits = (buckets.get(clientId) || []).filter((t) => t > windowStart);
    if (hits.length >= perMinute) {
        buckets.set(clientId, hits);
        return false;
    }
    hits.push(now);
    buckets.set(clientId, hits);
    return true;
};

/** Keep the map from growing without bound on a long-running process. */
setInterval(() => {
    const windowStart = Date.now() - 60_000;
    for (const [id, hits] of buckets) {
        const live = hits.filter((t) => t > windowStart);
        if (live.length === 0) buckets.delete(id);
        else buckets.set(id, live);
    }
}, 300_000).unref();

/**
 * Record the call. Never throws into the request path: a logging table that is
 * missing or full must not be able to take the export down.
 */
const record = async (req, res, clientId, rowsReturned) => {
    try {
        await db.query(
            `INSERT INTO api_request_logs
                 (client_id, endpoint, query_string, status, rows_returned, ip, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                clientId,
                req.baseUrl + req.path,
                Object.keys(req.query).length ? JSON.stringify(req.query) : null,
                res.statusCode,
                rowsReturned ?? null,
                clientIp(req),
                Date.now() - req.apiStartedAt
            ]
        );
    } catch (err) {
        logger.error(`[ExportAPI] request log failed: ${err.message}`);
    }
};

const apiKeyAuth = (requiredScope) => async (req, res, next) => {
    req.apiStartedAt = Date.now();
    const ip = clientIp(req);

    // res.json is wrapped once here so every exit — including the handler's own
    // — lands in the request log without each route remembering to call it.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const rows = Array.isArray(body?.data) ? body.data.length : null;
        record(req, res, req.apiClient?.id ?? null, rows);
        return originalJson(body);
    };

    const token = extractToken(req);
    if (!token) {
        logger.warn(`[ExportAPI] missing token from ${ip} for ${req.originalUrl}`);
        return res.status(401).json({ error: 'Missing API key. Send "Authorization: Bearer <key>" or "X-API-Key: <key>".' });
    }

    let client;
    try {
        const result = await db.query(
            `SELECT id, name, scopes, allowed_ips, is_active, rate_limit_per_minute, revoked_at
             FROM api_clients WHERE token_hash = $1`,
            [hashToken(token)]
        );
        client = result.rows[0];
    } catch (err) {
        logger.error(`[ExportAPI] client lookup failed: ${err.message}`);
        return res.status(500).json({ error: 'Authentication unavailable' });
    }

    // Same response for an unknown key and a revoked one. Telling a caller that
    // their key was once valid is information they do not need.
    if (!client || !client.is_active || client.revoked_at) {
        logger.warn(`[ExportAPI] rejected key ${token.slice(0, 8)}… from ${ip}`);
        return res.status(401).json({ error: 'Invalid API key' });
    }

    // Attributed before the authorisation checks, not after, so a refusal lands
    // in the request log against the key that caused it. Recording "somebody was
    // rate-limited from 127.0.0.1" answers none of the questions a refusal
    // raises. This marks who the caller claims to be — the checks below still
    // decide whether they get an answer.
    req.apiClient = client;

    if (!ipAllowed(ip, client.allowed_ips)) {
        logger.warn(`[ExportAPI] "${client.name}" called from disallowed address ${ip}`);
        return res.status(403).json({ error: `Address ${ip} is not permitted for this key` });
    }

    if (requiredScope && !(client.scopes || []).includes(requiredScope)) {
        return res.status(403).json({ error: `This key does not carry the "${requiredScope}" scope` });
    }

    if (!withinRateLimit(client.id, client.rate_limit_per_minute)) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: `Rate limit of ${client.rate_limit_per_minute} requests/minute exceeded` });
    }

    // Last-seen is best-effort and must not delay the answer.
    db.query('UPDATE api_clients SET last_used_at = now(), last_used_ip = $1 WHERE id = $2', [ip, client.id])
        .catch((err) => logger.error(`[ExportAPI] last_used update failed: ${err.message}`));

    next();
};

module.exports = { apiKeyAuth, hashToken, ipAllowed, cidrMatch, clientIp };
