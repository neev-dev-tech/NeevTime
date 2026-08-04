/**
 * Where the vendor adapter is mounted, and whether it is on at all.
 *
 * `app.use('/api', authenticateToken, someRouter)` applies that middleware to
 * every /api path, not only the paths its router happens to serve. This codebase
 * has been caught by that three separate times — the health check returning 401
 * and marking the container unhealthy, the RBAC guard sitting below the routes
 * it was meant to protect, and public routes landing behind the auth wall.
 *
 * The Hikvision endpoint authenticates with a per-device ingest token in the
 * query string rather than a JWT. Registered below those mounts it would be
 * rejected as unauthenticated before the adapter ever ran, and the symptom would
 * be indistinguishable from a device problem: events arriving, nothing stored.
 *
 * Ordering cannot be checked by exercising the router in isolation, which is
 * exactly why it kept regressing. These read server.js instead.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const lines = () => fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8').split('\n');

/**
 * Real code only. The comment above the adapter mount quotes the very pattern
 * these tests search for, and matching it made the check fail against its own
 * documentation — the mount was correct all along.
 */
const isCode = (line) => {
    const t = line.trim();
    return t !== '' && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
};

const AUTH_MOUNT = /app\.use\(\s*['"`]\/api['"`]\s*,\s*authenticateToken/;

test('the adapter is mounted above every authenticated /api mount', () => {
    const src = lines();
    const adapterLine = src.findIndex(l => l.includes("app.use('/api/adapters/hikvision'"));
    assert.ok(adapterLine > -1, 'the Hikvision adapter is not mounted at all');

    const authMounts = [];
    src.forEach((line, i) => {
        if (isCode(line) && AUTH_MOUNT.test(line)) {
            authMounts.push(`${i + 1}: ${line.trim().slice(0, 72)}`);
        }
    });
    assert.ok(authMounts.length > 0, 'no authenticated /api mounts found — has server.js been restructured?');

    const firstAuthMount = src.findIndex(l => isCode(l) && AUTH_MOUNT.test(l));
    assert.ok(
        adapterLine < firstAuthMount,
        `the adapter is mounted at line ${adapterLine + 1}, below the first authenticated /api mount:\n  `
        + authMounts[0]
        + '\nEvery event would be rejected as unauthenticated before the adapter ran.'
    );
});

test('the adapter is off unless explicitly enabled', () => {
    // A vendor ingest route that appears by default is a route nobody decided to
    // expose. It must take a deliberate act.
    const src = lines();
    const guard = src.findIndex(l => /process\.env\.ADAPTERS_ENABLED\s*===\s*'true'/.test(l));
    assert.ok(guard > -1, 'the adapter mount is not behind an ADAPTERS_ENABLED check');

    const adapterLine = src.findIndex(l => l.includes("app.use('/api/adapters/hikvision'"));
    assert.ok(adapterLine > guard, 'the adapter is mounted outside the ADAPTERS_ENABLED guard');
    assert.ok(adapterLine - guard <= 3, 'the mount has drifted away from its guard');
});

test('enabling adapters is opt-in, never defaulted on', () => {
    // `|| true`, `!== 'false'` and friends all invert the default silently.
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const guard = src.match(/process\.env\.ADAPTERS_ENABLED[^\n)]*/);
    assert.ok(guard, 'ADAPTERS_ENABLED check is missing');
    assert.ok(
        /=== *'true'/.test(guard[0]),
        `the guard must be an explicit equality against 'true'; found: ${guard[0]}`
    );
    assert.ok(
        !/!==|\|\|/.test(guard[0]),
        `a negated or defaulted guard turns the adapter on by accident: ${guard[0]}`
    );
});

test('the ingest endpoint never answers with an error status', () => {
    // A Hikvision controller retries an errored event indefinitely, so one bad
    // payload becomes a flood. Everything is acknowledged and refusals logged.
    const route = fs.readFileSync(path.join(__dirname, '../routes/adapter_hikvision.js'), 'utf8');
    const body = route.slice(route.indexOf("router.post('/event'"));
    const badStatus = body.match(/res\.status\((4\d\d|5\d\d)\)/g) || [];
    assert.deepStrictEqual(badStatus, [],
        'the ingest route returns an error status; the device will retry that event forever:\n  '
        + badStatus.join(', '));
});
