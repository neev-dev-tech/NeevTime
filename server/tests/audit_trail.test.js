/**
 * The audit trail, exercised against a real database.
 *
 * `audit_logs` existed from the first schema and nothing ever wrote to it, while
 * Manual Entry could create attendance from nothing and the Employees page could
 * switch off someone's tracking — all untraceable. In a payroll dispute the
 * first question is who changed the record.
 *
 * These run against Postgres because triggers are a database behaviour, and
 * reading the migration proves only that it was written. Skipped unless
 * AUDIT_TEST_DB is set, so `npm test` stays offline.
 */

const test = require('node:test');
const assert = require('node:assert');

const DBNAME = process.env.AUDIT_TEST_DB;

if (!DBNAME) {
    test('audit trail (skipped: set AUDIT_TEST_DB to run)', { skip: true }, () => {});
} else {
    process.env.DB_NAME = DBNAME;
    process.env.DB_HOST = process.env.AUDIT_TEST_HOST || 'localhost';
    process.env.DB_PORT = process.env.AUDIT_TEST_PORT || '5432';
    process.env.DB_USER = process.env.AUDIT_TEST_USER;
    process.env.DB_PASSWORD = process.env.AUDIT_TEST_PASSWORD;
    process.env.DB_PASS = process.env.AUDIT_TEST_PASSWORD;
    process.env.DB_SERVER = process.env.AUDIT_TEST_HOST || 'localhost';

    const db = require('../db');
    const code = () => `AUD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const latest = async (table, id) => {
        const { rows } = await db.query(
            `SELECT * FROM audit_logs WHERE table_name = $1 AND record_id = $2
             ORDER BY id DESC LIMIT 1`, [table, id]);
        return rows[0];
    };

    test('an edit records who made it', async () => {
        const c = code();
        const ins = await db.query(
            'INSERT INTO employees (employee_code, name) VALUES ($1, $2) RETURNING id', [c, 'Before']);
        const id = ins.rows[0].id;

        await db.withActor(4242, () =>
            db.query('UPDATE employees SET name = $2 WHERE id = $1', [id, 'After']));

        const row = await latest('employees', id);
        assert.ok(row, 'no audit row was written for the update');
        assert.strictEqual(row.action, 'UPDATE');
        assert.strictEqual(row.user_id, 4242,
            'the change was recorded without an actor — the connection is not carrying it');
    });

    test('the previous value is kept, not just the new one', async () => {
        // Without old_data the log says something changed but not what it was,
        // which answers none of the questions a dispute actually asks.
        const c = code();
        const ins = await db.query(
            'INSERT INTO employees (employee_code, name) VALUES ($1, $2) RETURNING id', [c, 'Original']);
        const id = ins.rows[0].id;

        await db.withActor(7, () =>
            db.query('UPDATE employees SET name = $2 WHERE id = $1', [id, 'Changed']));

        const row = await latest('employees', id);
        assert.strictEqual(row.old_data.name, 'Original', 'the previous value was not kept');
        assert.strictEqual(row.new_data.name, 'Changed');
    });

    test('deleting a record keeps what it said', async () => {
        const c = code();
        const ins = await db.query(
            'INSERT INTO employees (employee_code, name) VALUES ($1, $2) RETURNING id', [c, 'Doomed']);
        const id = ins.rows[0].id;

        await db.withActor(9, () => db.query('DELETE FROM employees WHERE id = $1', [id]));

        const row = await latest('employees', id);
        assert.strictEqual(row.action, 'DELETE');
        assert.strictEqual(row.old_data.name, 'Doomed',
            'the deleted row was not preserved, so the record is gone in both places');
        assert.strictEqual(row.new_data, null);
    });

    test('secrets are not copied into the log', async () => {
        // The audit history is readable by a wider audience than the users table.
        const name = `audituser${Date.now()}`;
        const ins = await db.query(
            `INSERT INTO users (username, password_hash, role)
             VALUES ($1, $2, 'viewer') RETURNING id`, [name, 'hash-should-not-appear']);
        const id = ins.rows[0].id;

        const row = await latest('users', id);
        assert.ok(row, 'creating a user was not audited');
        assert.strictEqual(row.new_data.password_hash, undefined,
            'the password hash was copied into the audit log');
        assert.strictEqual(row.new_data.username, name, 'the username should still be recorded');

        await db.query('DELETE FROM users WHERE id = $1', [id]);
    });

    test('an update that changes nothing is not recorded', async () => {
        // Routes that write every column on every save would otherwise fill the
        // table with rows saying a value stayed the same.
        const c = code();
        const ins = await db.query(
            'INSERT INTO employees (employee_code, name) VALUES ($1, $2) RETURNING id', [c, 'Same']);
        const id = ins.rows[0].id;

        const before = await db.query(
            'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
            ['employees', id]);
        await db.query('UPDATE employees SET name = $2 WHERE id = $1', [id, 'Same']);
        const after = await db.query(
            'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
            ['employees', id]);

        assert.strictEqual(after.rows[0].n, before.rows[0].n,
            'a no-op update produced an audit row');
    });

    test('work nobody triggered records no actor rather than a wrong one', async () => {
        // A device posting a punch, or a scheduled sync. NULL is true; attributing
        // it to whoever last used the connection would not be.
        const c = code();
        const ins = await db.query(
            'INSERT INTO employees (employee_code, name) VALUES ($1, $2) RETURNING id', [c, 'System']);
        const row = await latest('employees', ins.rows[0].id);
        assert.strictEqual(row.user_id, null,
            'an unattributed change was given a user id — probably one left on a pooled connection');
    });

    test('a punch that is edited is audited; a punch that arrives is not', async () => {
        // ~900 punches a day. Auditing arrivals would double the write volume to
        // record the normal case. An edit is what a dispute turns on.
        const c = code();
        await db.query('INSERT INTO employees (employee_code, name) VALUES ($1, $2)', [c, 'Puncher']);

        const punch = await db.query(
            `INSERT INTO attendance_logs (employee_code, punch_time, punch_type)
             VALUES ($1, now(), 'IN') RETURNING id`, [c]);
        const id = punch.rows[0].id;

        const onInsert = await db.query(
            'SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1 AND record_id = $2',
            ['attendance_logs', id]);
        assert.strictEqual(onInsert.rows[0].n, 0, 'an ordinary punch was audited');

        await db.withActor(99, () =>
            db.query("UPDATE attendance_logs SET punch_type = 'OUT' WHERE id = $1", [id]));

        const row = await latest('attendance_logs', id);
        assert.ok(row, 'editing a punch was not audited — this is the case that matters most');
        assert.strictEqual(row.user_id, 99);
        assert.strictEqual(row.old_data.punch_type, 'IN');
    });

    test('a reader heartbeat is not a change', async () => {
        // Within a minute of the trail going live, the pilot's audit_logs held
        // nothing but these: every reader posts a heartbeat every few seconds
        // and adms.js answers with UPDATE devices SET status, last_activity.
        // Five readers make roughly ten thousand rows a day, none recording a
        // decision anybody took — and a log of machine noise is how an audit
        // trail stops being read, which is worse than not having one because it
        // is still there to be pointed at.
        const serial = `ZZ${Date.now()}`.slice(0, 20);
        await db.query(
            "INSERT INTO devices (serial_number, device_name, status) VALUES ($1, 'probe', 'online')",
            [serial]);

        const before = await db.query('SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1', ['devices']);
        for (let i = 0; i < 5; i++) {
            await db.query("UPDATE devices SET status = 'online', last_activity = now() WHERE serial_number = $1", [serial]);
        }
        const after = await db.query('SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1', ['devices']);
        assert.strictEqual(after.rows[0].n, before.rows[0].n,
            'repeated heartbeats are filling the audit trail');
    });

    test('a real edit to a device is recorded, heartbeat column and all', async () => {
        // The risk of ignoring housekeeping columns is ignoring the change that
        // arrives alongside one. A rename writes last_activity too.
        const serial = `ZZ${Date.now() + 1}`.slice(0, 20);
        await db.query(
            "INSERT INTO devices (serial_number, device_name, status) VALUES ($1, 'before', 'online')",
            [serial]);

        const before = await db.query('SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1', ['devices']);
        await db.withActor(7, () => db.query(
            "UPDATE devices SET device_name = 'after', last_activity = now() WHERE serial_number = $1", [serial]));
        const rows = await db.query(
            `SELECT user_id, old_data, new_data FROM audit_logs
              WHERE table_name = 'devices' ORDER BY id DESC LIMIT 1`);

        const count = await db.query('SELECT count(*)::int AS n FROM audit_logs WHERE table_name = $1', ['devices']);
        assert.strictEqual(count.rows[0].n, before.rows[0].n + 1, 'a device rename was not recorded');
        assert.strictEqual(rows.rows[0].user_id, 7);
        assert.strictEqual(rows.rows[0].old_data.device_name, 'before');
        assert.ok('last_activity' in rows.rows[0].new_data,
            'the housekeeping column was stripped from a row worth keeping');
    });

    test.after(async () => { await db.pool.end(); });
}

// Runs everywhere, database or not.
test('the migration creates the table it writes to', () => {
    // It was written believing audit_logs had existed since the first schema.
    // It has — in database/000_schema.sql, which Postgres loads only into an
    // EMPTY data directory. The pilot deployment's database predates every
    // schema file here, so the migration reached CREATE INDEX on a table that
    // did not exist and rolled back. An install is defined by what is in the
    // database, not by what the schema file says should be.
    const fs = require('node:fs');
    const path = require('node:path');
    const sql = fs.readFileSync(
        path.join(__dirname, '../migrations/003_audit_trail.sql'), 'utf8');

    assert.match(sql, /CREATE TABLE IF NOT EXISTS audit_logs/,
        'the migration assumes audit_logs exists — it does not on older databases');

    // Comments stripped first: the prose above explains what CREATE INDEX did
    // on a missing table, and matching that sentence made this fail on a file
    // that was correct.
    const statements = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    assert.ok(statements.indexOf('CREATE TABLE IF NOT EXISTS audit_logs')
        < statements.indexOf('CREATE INDEX'),
        'the table is created after the indexes that need it');
    // Skipping a missing table is how the trigger loop already behaves; the
    // table this writes to gets created instead, because there is no useful
    // audit trail without it.
    assert.match(sql, /ADD COLUMN IF NOT EXISTS new_data/,
        'an older audit_logs of a different shape is not brought up to date');
});
