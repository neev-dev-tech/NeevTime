/**
 * Employee sign-in against a company directory.
 *
 * Until now an administrator set every employee's portal password and the
 * employee could not change it. With 68 people that is 68 passwords one person
 * knows permanently — so a punch recorded against someone is not really
 * attributable to them, which is the one thing an attendance record has to be.
 *
 * Three modes, chosen per installation:
 *
 *   local  the existing bcrypt password. Still the right answer for a site with
 *          no directory at all, and the fallback when the directory is down.
 *   oidc   Entra ID, Google Workspace, Okta — anything with OpenID Connect
 *          discovery. The company already runs MFA and conditional access on
 *          those accounts, and this app never sees the password.
 *   ldap   a bind against on-prem Active Directory. Works with no internet,
 *          which matters for a factory site, and is the only option when a
 *          client has AD but no cloud tenant.
 *
 * More than one may be enabled. A site can run OIDC for office staff and keep
 * local passwords for shop-floor employees who have no mailbox.
 *
 * ── Matching a directory account to an employee ──────────────────────────────
 *
 * The first successful sign-in matches on email or UPN, because that is what
 * both protocols reliably return. It then stores the directory's own immutable
 * identifier — Entra's `oid`, AD's `objectGUID` — and every later sign-in
 * matches on that instead.
 *
 * That second step is the point. UPNs change: someone marries, or a tenant
 * migrates its domain, and an account that has been signing in for a year stops
 * matching anything. Binding to the immutable id means the address can change
 * freely and the person keeps their attendance history.
 *
 * ── Secrets ──────────────────────────────────────────────────────────────────
 *
 * The OIDC client secret and the LDAP bind password come from the environment,
 * never from the settings table. Everything else — issuer, client id, server
 * URL, base DN — is configuration an administrator can see and edit in the UI.
 * A secret in a database row is a secret in every backup, every export and
 * every screenshot of the settings page.
 */

const settings = require('../utils/settings');

const OIDC_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD || '';

/** Configuration, with the secrets read from the environment. */
const loadConfig = async () => {
    const [
        modes, oidcIssuer, oidcClientId, oidcRedirect,
        ldapUrl, ldapBaseDn, ldapBindDn, ldapFilter,
    ] = await Promise.all([
        settings.get('auth', 'employee_login_modes', 'local'),
        settings.get('auth', 'oidc_issuer', ''),
        settings.get('auth', 'oidc_client_id', ''),
        settings.get('auth', 'oidc_redirect_uri', ''),
        settings.get('auth', 'ldap_url', ''),
        settings.get('auth', 'ldap_base_dn', ''),
        settings.get('auth', 'ldap_bind_dn', ''),
        settings.get('auth', 'ldap_user_filter', '(userPrincipalName={login})'),
    ]);

    const enabled = String(modes || 'local')
        .split(',').map(m => m.trim().toLowerCase()).filter(Boolean);

    return {
        enabled,
        oidc: {
            issuer: oidcIssuer, clientId: oidcClientId,
            redirectUri: oidcRedirect, clientSecret: OIDC_SECRET,
        },
        ldap: {
            url: ldapUrl, baseDn: ldapBaseDn, bindDn: ldapBindDn,
            bindPassword: LDAP_BIND_PASSWORD, userFilter: ldapFilter,
        },
    };
};

/**
 * Which methods can actually be used right now.
 *
 * A mode that is switched on but missing its client secret is not offered. A
 * sign-in button that always fails teaches people the app is broken, and the
 * administrator who forgot the secret never finds out — so the reason is
 * reported here rather than at the moment somebody tries to log in.
 */
const availableModes = async () => {
    const cfg = await loadConfig();
    const out = { local: cfg.enabled.includes('local'), oidc: false, ldap: false, problems: [] };

    if (cfg.enabled.includes('oidc')) {
        const missing = ['issuer', 'clientId', 'redirectUri', 'clientSecret']
            .filter(k => !cfg.oidc[k]);
        if (missing.length) {
            out.problems.push(`Single sign-on is enabled but not configured: ${missing.join(', ')} missing`
                + (missing.includes('clientSecret') ? ' (OIDC_CLIENT_SECRET is an environment variable)' : ''));
        } else {
            out.oidc = true;
        }
    }

    if (cfg.enabled.includes('ldap')) {
        const missing = ['url', 'baseDn', 'bindDn', 'bindPassword'].filter(k => !cfg.ldap[k]);
        if (missing.length) {
            out.problems.push(`Directory sign-in is enabled but not configured: ${missing.join(', ')} missing`
                + (missing.includes('bindPassword') ? ' (LDAP_BIND_PASSWORD is an environment variable)' : ''));
        } else {
            out.ldap = true;
        }
    }

    // Nothing configured is not an error — it is a fresh install, and local
    // passwords still work.
    if (!out.local && !out.oidc && !out.ldap) out.local = true;
    return out;
};

// ── OIDC ─────────────────────────────────────────────────────────────────────

let discoveryCache = { issuer: null, doc: null, at: 0 };
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

/** The provider's own endpoint list, rather than URLs assembled by hand. */
const discover = async (issuer) => {
    const now = Date.now();
    if (discoveryCache.issuer === issuer && now - discoveryCache.at < DISCOVERY_TTL_MS) {
        return discoveryCache.doc;
    }
    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Identity provider discovery failed (${res.status})`);
    const doc = await res.json();
    if (!doc.authorization_endpoint || !doc.token_endpoint) {
        throw new Error('Identity provider did not advertise the endpoints this needs');
    }
    discoveryCache = { issuer, doc, at: now };
    return doc;
};

/**
 * Where to send the browser to sign in.
 *
 * The state value is generated and checked by the caller; without it, an
 * attacker can complete somebody else's sign-in in their browser.
 */
const authorizationUrl = async (state, nonce) => {
    const cfg = await loadConfig();
    const doc = await discover(cfg.oidc.issuer);
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('client_id', cfg.oidc.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', cfg.oidc.redirectUri);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    return url.toString();
};

/**
 * Trade the code for the user's identity.
 *
 * The id_token's signature is not checked locally, and does not need to be:
 * this is a server-to-server request over TLS to the token endpoint the
 * provider itself advertised, authenticated with the client secret. The
 * transport is what establishes trust. (An id_token arriving by any other route
 * — from the browser, say — would have to be verified against the provider's
 * JWKS, and this deliberately never accepts one.)
 */
const exchangeCode = async (code) => {
    const cfg = await loadConfig();
    const doc = await discover(cfg.oidc.issuer);

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.oidc.redirectUri,
        client_id: cfg.oidc.clientId,
        client_secret: cfg.oidc.clientSecret,
    });

    const res = await fetch(doc.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Sign-in could not be completed (${res.status}) ${detail.slice(0, 200)}`);
    }
    const tokens = await res.json();
    if (!tokens.id_token) throw new Error('The identity provider returned no id_token');

    const [, payloadB64] = tokens.id_token.split('.');
    if (!payloadB64) throw new Error('The id_token was malformed');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    // Audience is checked even though the transport is trusted: a token minted
    // for a different application must not sign anyone in here.
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(cfg.oidc.clientId)) {
        throw new Error('The id_token was issued for a different application');
    }

    return {
        subject: claims.oid || claims.sub,
        email: (claims.email || claims.preferred_username || claims.upn || '').toLowerCase(),
        name: claims.name || null,
        nonce: claims.nonce || null,
    };
};

// ── LDAP ─────────────────────────────────────────────────────────────────────

/**
 * Verify a password by binding as the user.
 *
 * A service account finds the entry, then the directory itself checks the
 * password by accepting or refusing a bind. The password is never compared
 * here and never stored.
 *
 * ldaps:// is required unless the operator has explicitly allowed plain ldap://
 * — a simple bind sends the password in the clear, and on a flat factory
 * network that is every employee's domain password on the wire.
 */
const ldapVerify = async (login, password) => {
    const cfg = await loadConfig();
    if (!password) throw new Error('A password is required');

    const insecure = String(process.env.LDAP_ALLOW_INSECURE || '').toLowerCase() === 'true';
    if (!cfg.ldap.url.startsWith('ldaps://') && !insecure) {
        throw new Error('Directory sign-in refuses plain ldap:// — a simple bind would send '
            + 'the password in clear text. Use ldaps://, or set LDAP_ALLOW_INSECURE=true if '
            + 'the link is genuinely private.');
    }

    // Required lazily so an install with no LDAP never needs the dependency
    // present, and a missing module reports itself instead of crashing boot.
    let Client;
    try {
        ({ Client } = require('ldapts'));
    } catch {
        throw new Error('Directory sign-in needs the ldapts package, which is not installed');
    }

    const client = new Client({ url: cfg.ldap.url, timeout: 10000, connectTimeout: 10000 });
    try {
        await client.bind(cfg.ldap.bindDn, cfg.ldap.bindPassword);

        // The login goes into a filter, so it is escaped per RFC 4515. Without
        // this, a login of `*` matches every account in the directory.
        const safe = String(login).replace(/[\\()*\0]/g, c => ({
            '\\': '\\5c', '(': '\\28', ')': '\\29', '*': '\\2a', '\0': '\\00',
        }[c]));
        const filter = cfg.ldap.userFilter.replace(/\{login\}/g, safe);

        const { searchEntries } = await client.search(cfg.ldap.baseDn, {
            filter,
            scope: 'sub',
            attributes: ['dn', 'userPrincipalName', 'mail', 'displayName', 'objectGUID'],
        });
        if (searchEntries.length !== 1) {
            // Zero and many are both refusals, and the message says neither —
            // "no such user" tells an attacker which logins exist.
            throw new Error('Invalid username or password');
        }
        const entry = searchEntries[0];

        // The user's own bind is the password check.
        const userClient = new Client({ url: cfg.ldap.url, timeout: 10000, connectTimeout: 10000 });
        try {
            await userClient.bind(entry.dn, password);
        } catch {
            throw new Error('Invalid username or password');
        } finally {
            await userClient.unbind().catch(() => {});
        }

        const guid = entry.objectGUID;
        return {
            subject: guid ? Buffer.from(guid).toString('hex') : entry.dn,
            email: String(entry.userPrincipalName || entry.mail || '').toLowerCase(),
            name: entry.displayName ? String(entry.displayName) : null,
        };
    } finally {
        await client.unbind().catch(() => {});
    }
};

module.exports = {
    loadConfig, availableModes, authorizationUrl, exchangeCode, ldapVerify, discover,
};
