/**
 * Small in-process rate limiter for the unauthenticated endpoints.
 *
 * Deliberately dependency-free and in-memory: this app runs as a single
 * container against one database, so a shared store would add an operational
 * dependency for no benefit. If it is ever scaled to multiple instances, this
 * becomes per-instance and should move to Redis.
 *
 * The account lockout in routes/auth.js protects a *named* account. This
 * protects the endpoint itself — one source spraying many usernames never
 * triggers a per-account lock.
 */

const buckets = new Map();

// Drop expired buckets periodically so a spray of unique IPs cannot grow the
// map without bound. unref() keeps this timer from holding the process open.
const SWEEP_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(key);
    }
}, SWEEP_MS);
if (sweeper.unref) sweeper.unref();

/**
 * @param {object} options
 * @param {number} options.windowMs  Length of the window
 * @param {number} options.max       Requests allowed per key per window
 * @param {string} options.message   Body returned once the limit is hit
 */
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 30, message = 'Too many requests. Try again later.' } = {}) => {
    return (req, res, next) => {
        const key = `${req.baseUrl}${req.path}|${req.ip || req.connection?.remoteAddress || 'unknown'}`;
        const now = Date.now();
        let entry = buckets.get(key);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            buckets.set(key, entry);
        }

        entry.count += 1;

        if (entry.count > max) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ error: message, retry_after_seconds: retryAfter });
        }

        next();
    };
};

module.exports = { rateLimit };
