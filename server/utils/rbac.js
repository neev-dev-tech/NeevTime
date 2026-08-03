/**
 * Role-based access control.
 *
 * Before this, "user" meant everything except Settings, Database, System Logs,
 * HRMS, Mobile Entry and user management. Any account that was not an admin
 * could still delete employees in bulk and post manual attendance — that is,
 * erase people and invent hours. The Users page defaults new accounts to that
 * role, so the first assistant given a login inherited it.
 *
 * Three tiers now:
 *
 *   admin   everything, including settings, database, integrations and users
 *   hr      day-to-day work: personnel, attendance, leave, approvals, devices.
 *           No settings, no database, no user management, no integrations.
 *   viewer  read-only. Sees the same pages, cannot change anything.
 *
 * Enforcement is central rather than per-route. A guard that has to be
 * remembered on every new endpoint is a guard that will be forgotten, and the
 * gap is invisible until someone exploits it. This runs for every /api request
 * and denies by default: a method that changes data is refused unless the role
 * is explicitly allowed.
 *
 * `employee` is the self-service portal realm and never reaches here —
 * authenticateToken rejects it for admin APIs.
 */

const ROLES = { ADMIN: 'admin', HR: 'hr', VIEWER: 'viewer' };

/** Legacy accounts created before the tiers existed. Treated as hr, not admin. */
const LEGACY_ROLE = 'user';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Areas only an admin may change. Matched against the path after /api.
 * These already carry requireAdmin on their mounts; listing them here means a
 * new route added under one of these prefixes is covered from the first commit.
 */
const ADMIN_ONLY_PREFIXES = [
    '/settings',
    '/database',
    '/system-logs',
    '/hrms',
    '/users',
    '/devices/external',
    '/employees/bulk-delete'
];

const isAdminOnly = (path) => ADMIN_ONLY_PREFIXES.some(p => path.startsWith(p));

/** Normalise stored roles, including accounts predating the tiers. */
const normaliseRole = (role) => {
    if (!role) return ROLES.VIEWER;
    const r = String(role).toLowerCase();
    if (r === ROLES.ADMIN) return ROLES.ADMIN;
    if (r === ROLES.VIEWER) return ROLES.VIEWER;
    // 'user' and anything unrecognised land on hr: it keeps existing accounts
    // working for day-to-day tasks while removing their admin-adjacent reach.
    return ROLES.HR;
};

/**
 * Read the caller's role straight from the bearer token.
 *
 * This middleware has to run before the routers in order to cover them, but
 * `req.user` is populated by each router's own authenticateToken, which runs
 * later — so depending on req.user here would silently let every write through.
 * Decoding the token directly makes the guard independent of mount order.
 *
 * Verification, not decoding: an unsigned or tampered token must not choose its
 * own role. Requests without a token fall through untouched; the public routes
 * (login, portal login, device ingest) handle their own auth, and everything
 * else is refused by authenticateToken further down.
 */
const roleFromRequest = (req) => {
    if (req.user?.role) return normaliseRole(req.user.role);

    const header = req.headers?.authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) return null;

    try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(header.slice(7).trim(), process.env.JWT_SECRET);
        return payload?.role ? normaliseRole(payload.role) : null;
    } catch {
        return null; // invalid or expired — authenticateToken will reject it
    }
};

/**
 * Central write guard. Mount once on /api, above the routers.
 * Reads are never blocked here — page-level visibility is handled separately.
 */
const enforceRole = (req, res, next) => {
    if (READ_METHODS.has(req.method)) return next();

    const role = roleFromRequest(req);
    if (!role) return next(); // no valid token: let the auth layer answer

    if (role === ROLES.ADMIN) return next();

    if (role === ROLES.VIEWER) {
        return res.status(403).json({
            error: 'Your account has read-only access.',
            role: 'viewer'
        });
    }

    // hr
    if (isAdminOnly(req.path)) {
        return res.status(403).json({
            error: 'This area is restricted to administrators.',
            role
        });
    }
    return next();
};

/** Route-level guard for anything that must be admin regardless of method. */
const requireRole = (...allowed) => (req, res, next) => {
    const role = normaliseRole(req.user?.role);
    if (allowed.includes(role)) return next();
    return res.status(403).json({ error: 'You do not have access to this area.', role });
};

module.exports = { enforceRole, requireRole, normaliseRole, ROLES, LEGACY_ROLE, ADMIN_ONLY_PREFIXES };
