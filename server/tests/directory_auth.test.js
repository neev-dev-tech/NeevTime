/**
 * Employee sign-in against a company directory.
 *
 * This decides who a punch belongs to, so the failure modes that matter are the
 * ones where somebody signs in as somebody else, or a password leaves the
 * building in clear text. The protocol round-trips are not exercised here —
 * that needs a real tenant — but every check that stands between an identity
 * and a session is.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(SERVER, f), 'utf8');

const directory = require('../services/directory_auth');

test('a fresh install offers local sign-in and nothing else', async () => {
    // Nothing configured must not mean nobody can log in.
    const modes = await directory.availableModes();
    assert.strictEqual(modes.local, true);
    assert.strictEqual(modes.oidc, false, 'single sign-on was offered without being configured');
    assert.strictEqual(modes.ldap, false, 'directory sign-in was offered without being configured');
});

test('secrets are read from the environment, never from settings', () => {
    const src = read('services/directory_auth.js');
    assert.match(src, /process\.env\.OIDC_CLIENT_SECRET/);
    assert.match(src, /process\.env\.LDAP_BIND_PASSWORD/);
    // A secret in a settings row is in every backup, every export, and every
    // screenshot of the settings page.
    assert.ok(!/settings\.get\([^)]*client_secret/i.test(src),
        'the OIDC client secret is being read from the settings table');
    assert.ok(!/settings\.get\([^)]*bind_password/i.test(src),
        'the LDAP bind password is being read from the settings table');
});

test('a plain ldap:// bind is refused', async () => {
    // A simple bind sends the password in clear text. On a flat factory network
    // that is every employee's domain password on the wire.
    const src = read('services/directory_auth.js');
    assert.match(src, /startsWith\('ldaps:\/\/'\)/,
        'nothing checks that the directory connection is encrypted');
    assert.match(src, /LDAP_ALLOW_INSECURE/,
        'there is no explicit opt-out, so operators will be tempted to remove the check');
});

test('the login is escaped before it reaches an LDAP filter', () => {
    const src = read('services/directory_auth.js');
    // A login of * matches every account in the directory.
    assert.match(src, /\\\\5c|\\\\2a/,
        'the LDAP filter is built from user input without RFC 4515 escaping');
});

test('an id_token minted for another application is rejected', () => {
    const src = read('services/directory_auth.js');
    assert.match(src, /aud\.includes\(cfg\.oidc\.clientId\)/,
        'the audience claim is not checked — a token for a different app would sign someone in');
});

test('single sign-on is state and nonce protected', () => {
    const src = read('routes/portal.js');
    // Without state, an attacker can complete their own sign-in in somebody
    // else's browser; without nonce, an id_token from an earlier sign-in can be
    // replayed.
    assert.match(src, /expected\.state !== state/, 'the OIDC state is not verified');
    assert.match(src, /identity\.nonce !== expected\.nonce/, 'the OIDC nonce is not verified');
});

test('the session token comes back in the fragment, not the query string', () => {
    const src = read('routes/portal.js');
    assert.match(src, /portal\/login#token=/,
        'a session token in the query string lands in access logs and Referer headers');
    assert.ok(!/portal\/login\?token=/.test(src), 'the token is being passed in the query string');
});

test('an unmatched directory account cannot create itself an employee record', () => {
    const src = read('routes/portal.js');
    // Otherwise anyone in the company could generate themselves an attendance
    // history by signing in once.
    assert.match(src, /is not linked to an employee record/);
    assert.ok(!/INSERT INTO employees/.test(src),
        'the portal creates employee records from whoever signs in');
});

test('the immutable directory id is stored on first sign-in', () => {
    const src = read('routes/portal.js');
    // UPNs change — a marriage, or a tenant moving domain, which is exactly
    // what happened between innopay.in and innopayad.in. Matching on the
    // address forever would lock people out of their own attendance history.
    assert.match(src, /SET directory_subject = \$1/,
        'nothing binds the account to its immutable id, so a UPN change locks the employee out');
    assert.match(src, /directory_subject = \$1\s*$|directory_subject = \$1/m);
});

test('a resigned employee cannot sign in through a directory', () => {
    const src = read('routes/portal.js');
    const link = src.slice(src.indexOf('const linkIdentity'));
    assert.match(link, /status\) IS DISTINCT FROM 'resigned'/,
        'someone who has left the company can still sign in with their directory account');
});

test('bulk enablement will not enable someone who cannot then sign in', () => {
    const src = read('server.js');
    assert.match(src, /require_directory_email/,
        'portal access can be switched on for employees with no directory address');
    assert.match(src, /skipped/,
        'employees that were skipped are not reported, so it looks like they were enabled');
});

test('directory_email is stored lower-cased', () => {
    // Directories are not case sensitive about the address, so a stored
    // Name@company.com would never match a returned name@company.com.
    const src = read('server.js');
    assert.match(src, /String\(directory_email\)\.trim\(\)\.toLowerCase\(\)/);
});
