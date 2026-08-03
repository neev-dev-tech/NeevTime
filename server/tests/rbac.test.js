/**
 * Role enforcement.
 *
 * The gap these close: before the tiers existed, any non-admin account could
 * bulk-delete employees and post manual attendance — erase people and invent
 * hours — because everything outside a short admin-only list needed nothing more
 * than being logged in.
 *
 * The negative cases matter most. A guard that never refuses anything is not a
 * guard, and the failure is invisible until it is exploited.
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'rbac-test-secret';
const jwt = require('jsonwebtoken');
const { enforceRole, normaliseRole, ROLES } = require('../utils/rbac');

const tokenFor = (role) => jwt.sign({ id: 1, username: 'u', role }, process.env.JWT_SECRET);

/** Drive the middleware and report what it decided. */
const attempt = ({ role, method = 'POST', path = '/employees', token = true, malformed = null }) => {
    const req = {
        method,
        path,
        headers: malformed !== null
            ? { authorization: malformed }
            : (token ? { authorization: `Bearer ${tokenFor(role)}` } : {})
    };
    let allowed = false;
    let status = null;
    let body = null;
    const res = {
        status(code) { status = code; return this; },
        json(payload) { body = payload; return this; }
    };
    enforceRole(req, res, () => { allowed = true; });
    return { allowed, status, body };
};

// ───────────────────────────── role mapping ─────────────────────────────

test('legacy "user" accounts become hr, not admin', () => {
    // They predate the tiers; silently promoting them would recreate the gap
    assert.strictEqual(normaliseRole('user'), ROLES.HR);
});

test('an unknown or missing role never becomes admin', () => {
    for (const r of ['operator', '', null, undefined, 'ADMINISTRATOR']) {
        assert.notStrictEqual(normaliseRole(r), ROLES.ADMIN, `role ${r} was treated as admin`);
    }
});

test('role matching is case-insensitive', () => {
    assert.strictEqual(normaliseRole('Admin'), ROLES.ADMIN);
    assert.strictEqual(normaliseRole('VIEWER'), ROLES.VIEWER);
});

// ────────────────────────────── viewer ──────────────────────────────────

test('viewer can read', () => {
    assert.ok(attempt({ role: 'viewer', method: 'GET' }).allowed);
});

test('viewer cannot delete employees', () => {
    const r = attempt({ role: 'viewer', method: 'DELETE', path: '/employees/12' });
    assert.ok(!r.allowed, 'a read-only account deleted an employee');
    assert.strictEqual(r.status, 403);
});

test('viewer cannot post manual attendance', () => {
    // Fabricating hours is the quietest kind of damage — no error, wrong pay
    const r = attempt({ role: 'viewer', method: 'POST', path: '/attendance/manual' });
    assert.ok(!r.allowed);
    assert.strictEqual(r.status, 403);
});

test('viewer is refused on every mutating method', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.ok(!attempt({ role: 'viewer', method: m }).allowed, `${m} was allowed`);
    }
});

// ──────────────────────────────── hr ────────────────────────────────────

test('hr can do day-to-day work', () => {
    for (const path of ['/employees', '/attendance/manual', '/leave-applications/3/status', '/devices']) {
        assert.ok(attempt({ role: 'hr', method: 'POST', path }).allowed, `hr blocked from ${path}`);
    }
});

test('hr cannot change settings, database, users or integrations', () => {
    for (const path of ['/settings/security', '/database/backups', '/users', '/hrms/integrations', '/system-logs']) {
        const r = attempt({ role: 'hr', method: 'POST', path });
        assert.ok(!r.allowed, `hr reached ${path}`);
        assert.strictEqual(r.status, 403);
    }
});

test('a legacy "user" account is held to the hr boundary', () => {
    assert.ok(attempt({ role: 'user', method: 'POST', path: '/employees' }).allowed);
    assert.ok(!attempt({ role: 'user', method: 'POST', path: '/settings/security' }).allowed);
});

// ─────────────────────────────── admin ──────────────────────────────────

test('admin is not restricted', () => {
    for (const path of ['/settings/security', '/database/backups', '/users', '/employees']) {
        assert.ok(attempt({ role: 'admin', method: 'POST', path }).allowed, `admin blocked from ${path}`);
    }
});

// ──────────────────────────── token handling ────────────────────────────

test('a request with no token is left to the auth layer', () => {
    // Public routes (login, portal login, device ingest) pass through here
    assert.ok(attempt({ method: 'POST', token: false }).allowed);
});

test('a forged token cannot grant admin', () => {
    const forged = jwt.sign({ id: 1, role: 'admin' }, 'not-the-real-secret');
    const r = attempt({ method: 'POST', path: '/settings/security', malformed: `Bearer ${forged}` });
    // Unverifiable, so no role is granted; authenticateToken then rejects it
    assert.ok(r.allowed, 'should defer rather than authorise');
    assert.strictEqual(r.status, null, 'must not have been treated as an admin decision');
});

test('a garbage authorization header does not throw', () => {
    assert.doesNotThrow(() => attempt({ method: 'POST', malformed: 'Bearer not.a.jwt' }));
    assert.doesNotThrow(() => attempt({ method: 'POST', malformed: 'Basic abc123' }));
});
