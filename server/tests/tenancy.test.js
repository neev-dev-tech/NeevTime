/**
 * Tenant isolation, exercised against a real database.
 *
 * Unlike the other tests here this one connects to Postgres, because the thing
 * being tested is a Postgres behaviour. Reading the source to check a policy
 * exists proves nothing about whether it holds.
 *
 * It is skipped unless TENANCY_TEST_DB is set, so `npm test` stays offline:
 *
 *   createdb neevtime_tenancy
 *   psql -f database/00_init_all.sql neevtime_tenancy   (plus the other schema files)
 *   node migrations/runner.js up
 *   TENANCY_TEST_DB=neevtime_tenancy TENANCY_TEST_USER=neevtime_app \
 *     TENANCY_TEST_PASSWORD=... npm test
 *
 * The role must not be a superuser. A superuser bypasses row-level security
 * entirely, so these tests would pass against a database with no isolation at
 * all — which is exactly the false negative that would matter most.
 */

const test = require('node:test');
const assert = require('node:assert');

const DBNAME = process.env.TENANCY_TEST_DB;

if (!DBNAME) {
    test('tenant isolation (skipped: set TENANCY_TEST_DB to run)', { skip: true }, () => {});
} else {
    // Every connection variable is pinned, including the ones this test does not
    // care about. db/index.js calls dotenv, and server/.env points at a separate
    // project-local Postgres on port 55432 — leaving DB_PORT unset let dotenv
    // supply it, and the test connected to a different server entirely and
    // reported that the role did not exist.
    process.env.DB_NAME = DBNAME;
    process.env.DB_HOST = process.env.TENANCY_TEST_HOST || 'localhost';
    process.env.DB_PORT = process.env.TENANCY_TEST_PORT || '5432';
    process.env.DB_USER = process.env.TENANCY_TEST_USER;
    process.env.DB_PASSWORD = process.env.TENANCY_TEST_PASSWORD;
    process.env.DB_PASS = process.env.TENANCY_TEST_PASSWORD;
    process.env.DB_SERVER = process.env.TENANCY_TEST_HOST || 'localhost';

    const db = require('../db');

    test('the test role is not a superuser', async () => {
        const { rows } = await db.asTenant(1, () =>
            db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'));
        assert.strictEqual(rows[0].rolsuper, false,
            'the test role is a superuser, which bypasses row-level security — every ' +
            'assertion below would pass against a database with no isolation');
        assert.strictEqual(rows[0].rolbypassrls, false, 'the test role has BYPASSRLS');
    });

    test('a tenant sees only its own rows', async () => {
        const name = `iso-${Date.now()}`;
        await db.asTenant(1, () => db.query('INSERT INTO departments (name) VALUES ($1)', [name]));

        const mine = await db.asTenant(1, () =>
            db.query('SELECT count(*)::int AS n FROM departments WHERE name = $1', [name]));
        assert.strictEqual(mine.rows[0].n, 1, 'tenant 1 cannot see the row it just wrote');

        const theirs = await db.asTenant(2, () =>
            db.query('SELECT count(*)::int AS n FROM departments WHERE name = $1', [name]));
        assert.strictEqual(theirs.rows[0].n, 0,
            "tenant 2 can read tenant 1's department — isolation is not holding");
    });

    test('company_id comes from the connection, not the statement', async () => {
        // The reason 614 existing INSERTs did not have to be rewritten.
        const name = `default-${Date.now()}`;
        await db.asTenant(2, () => db.query('INSERT INTO departments (name) VALUES ($1)', [name]));
        const { rows } = await db.asTenant(2, () =>
            db.query('SELECT company_id FROM departments WHERE name = $1', [name]));
        assert.strictEqual(rows[0].company_id, 2,
            'the column default no longer picks up the tenant, so every insert that ' +
            'does not name company_id would land on the wrong tenant');
    });

    test('a write cannot reach across the boundary', async () => {
        const name = `untouched-${Date.now()}`;
        await db.asTenant(2, () => db.query('INSERT INTO departments (name) VALUES ($1)', [name]));

        // No WHERE clause at all: the worst thing a buggy query could do.
        await db.asTenant(1, () => db.query("UPDATE departments SET name = name || '-clobbered'"));

        const { rows } = await db.asTenant(2, () =>
            db.query('SELECT count(*)::int AS n FROM departments WHERE name = $1', [name]));
        assert.strictEqual(rows[0].n, 1,
            "tenant 1's unqualified UPDATE modified tenant 2's row");
    });

    test('no tenant is an error, not an empty result', async () => {
        // Deliberately loud. Returning zero rows would let a scheduled job run,
        // find nothing, and report success — the shape of bug that has shipped
        // here twice already.
        await assert.rejects(
            () => db.query('SELECT count(*) FROM departments'),
            /no tenant in scope/i,
            'a query outside any tenant context succeeded. It must fail, so that ' +
            'work which has lost its tenant stops instead of quietly doing nothing'
        );
    });

    test('no tenant means an insert fails loudly', async () => {
        await assert.rejects(
            () => db.query('INSERT INTO departments (name) VALUES ($1)', ['orphan']),
            /no tenant in scope/i,
            'an insert with no tenant in scope was accepted; it would belong to nobody'
        );
    });

    test('a pooled connection does not inherit the previous tenant', async () => {
        // The bug this design exists to prevent: the pool hands the same
        // connection to the next request with the last tenant still set on it.
        const name = `pool-${Date.now()}`;
        await db.asTenant(2, () => db.query('INSERT INTO departments (name) VALUES ($1)', [name]));

        for (let i = 0; i < 12; i++) {
            const seen = await db.asTenant(1, () =>
                db.query('SELECT count(*)::int AS n FROM departments WHERE name = $1', [name]));
            assert.strictEqual(seen.rows[0].n, 0,
                `iteration ${i}: tenant 1 saw tenant 2's row — a connection carried a ` +
                'stale app.tenant_id back out of the pool');
        }
    });

    test('a transaction is scoped too', async () => {
        const name = `tx-${Date.now()}`;
        await db.asTenant(2, () => db.query('INSERT INTO departments (name) VALUES ($1)', [name]));

        await db.asTenant(1, async () => {
            const client = await db.getClient();
            try {
                await client.query('BEGIN');
                const { rows } = await client.query(
                    'SELECT count(*)::int AS n FROM departments WHERE name = $1', [name]);
                assert.strictEqual(rows[0].n, 0,
                    "a transaction opened by tenant 1 could read tenant 2's row");
                await client.query('COMMIT');
            } finally {
                client.release();
            }
        });
    });

    test.after(async () => {
        await db.asTenant(1, () => db.query("DELETE FROM departments WHERE name LIKE '%-clobbered'"));
        await db.pool.end();
    });
}
