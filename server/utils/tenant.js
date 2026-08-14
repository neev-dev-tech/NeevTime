/**
 * Which customer a request belongs to.
 *
 * Resolved before anything touches the database, because row-level security
 * needs the tenant on the connection and authentication itself is a database
 * lookup — the credentials cannot be checked until it is known whose credentials
 * they are.
 *
 * Two modes, one codebase:
 *
 *   single  On-premise. Every request is the one company on the box. Nothing
 *           about the deployment changes, and no customer has to own a domain.
 *
 *   multi   Hosted. The tenant comes from the host — acme.neevtime.app is the
 *           company whose code is 'acme'. A tenant that cannot be resolved is
 *           refused rather than defaulted, because defaulting means one
 *           customer's request quietly served from another's data.
 *
 * `companies` is deliberately outside row-level security, otherwise resolving a
 * tenant would require already knowing it.
 */

const db = require('../db');

const MODE = (process.env.TENANT_MODE || 'single').toLowerCase();
const SINGLE_TENANT_ID = Number(process.env.SINGLE_TENANT_ID || 1);

/** Hosts that never carry a meaningful subdomain. */
const BARE_HOSTS = new Set(['localhost', '127.0.0.1', 'www']);

/** `acme.neevtime.app` -> `acme`; `localhost:3001` -> null. */
const subdomainOf = (host) => {
    if (!host) return null;
    const name = String(host).split(':')[0].trim().toLowerCase();
    if (!name || BARE_HOSTS.has(name)) return null;
    // A bare IP address has no subdomain to read.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return null;
    const parts = name.split('.');
    if (parts.length < 3) return null;
    const first = parts[0];
    return BARE_HOSTS.has(first) ? null : first;
};

// Codes change rarely and this runs on every request. Small, and cleared by
// restart — a company whose code is edited is one process restart from correct.
const cache = new Map();

const companyIdForCode = async (code) => {
    if (cache.has(code)) return cache.get(code);
    // Outside any tenant context on purpose: this is the lookup that establishes
    // one. `companies` carries no row-level policy for exactly this reason.
    const { rows } = await db.query(
        'SELECT id FROM companies WHERE lower(code) = lower($1)', [code]
    );
    const id = rows.length ? rows[0].id : null;
    cache.set(code, id);
    return id;
};

/**
 * The tenant for a request, or null when it cannot be established.
 * Never guesses: in multi mode an unknown host resolves to null, and the caller
 * refuses the request.
 */
const resolve = async (req) => {
    if (MODE === 'single') return SINGLE_TENANT_ID;

    const code = subdomainOf(req.headers?.host);
    if (!code) return null;
    return companyIdForCode(code);
};

/**
 * Express middleware. Establishes the tenant, then runs the rest of the request
 * inside it so every query underneath is scoped without being told.
 */
const withTenantContext = async (req, res, next) => {
    let tenantId;
    try {
        tenantId = await resolve(req);
    } catch (err) {
        console.error('Tenant resolution failed:', err.message);
        return res.status(500).json({ error: 'Could not determine the account for this request' });
    }

    if (!tenantId) {
        return res.status(404).json({
            error: 'Unknown account',
            detail: `No account is configured for ${req.headers?.host || 'this address'}.`
        });
    }

    req.tenantId = tenantId;
    db.withTenant(tenantId, () => next());
};

/**
 * A token issued for one customer must not work on another's address.
 *
 * Without this check a valid login at acme.neevtime.app could be replayed
 * against beta.neevtime.app: the host would set the tenant to beta, the token
 * would still verify, and the session would run as a beta user. The token says
 * which company it was issued for, and the two have to agree.
 */
const tokenMatchesTenant = (req) => {
    const claimed = req.user?.company_id;
    // Tokens issued before this existed carry no company_id. In single-tenant
    // there is only one answer, so they stay valid; hosted deployments must not
    // accept them.
    if (claimed === undefined || claimed === null) return MODE === 'single';
    return Number(claimed) === Number(req.tenantId);
};

module.exports = {
    MODE,
    SINGLE_TENANT_ID,
    resolve,
    withTenantContext,
    tokenMatchesTenant,
    subdomainOf,
    _clearCache: () => cache.clear(),
};
