/**
 * Versioned migrations, run when someone decides to — not at boot.
 *
 * `ensureSchema` runs on every start, which is why an unrelated deploy can carry
 * a schema change into production. That is acceptable for adding a nullable
 * column and completely unacceptable for anything that can empty a table or
 * change who can read it. Those belong here.
 *
 * Each migration runs inside one transaction. If it throws, nothing it did
 * survives, so a half-applied schema is not a state this can produce. Applied
 * versions are recorded in schema_migrations along with how long they took and
 * the checksum of the file that ran — an edited migration that has already been
 * applied is refused rather than silently skipped, because "it works on mine"
 * usually means the file changed after it ran somewhere else.
 *
 *   node migrations/runner.js status     what is applied, what is pending
 *   node migrations/runner.js up         apply everything pending
 *   node migrations/runner.js up 002     apply up to and including 002
 *
 * Down migrations are deliberately not automated. Reversing a schema change on
 * a database holding attendance history is a decision that deserves a human
 * reading the file, not a flag.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');

const DIR = __dirname;

const ensureTable = async (client) => {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version     TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            checksum    TEXT NOT NULL,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            duration_ms INTEGER
        )
    `);
};

/** Migration files are NNN_name.sql, applied in filename order. */
const discover = () =>
    fs.readdirSync(DIR)
        .filter(f => /^\d{3}_.+\.sql$/.test(f))
        .sort()
        .map(file => {
            const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
            return {
                file,
                version: file.slice(0, 3),
                name: file.slice(4, -4),
                sql,
                checksum: crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16)
            };
        });

const applied = async (client) => {
    const { rows } = await client.query('SELECT version, checksum, applied_at FROM schema_migrations');
    return new Map(rows.map(r => [r.version, r]));
};

const status = async () => {
    const client = await db.getClient();
    try {
        await ensureTable(client);
        const done = await applied(client);
        const all = discover();
        console.log(`\n  ${'ver'.padEnd(5)}${'name'.padEnd(34)}state\n`);
        for (const m of all) {
            const rec = done.get(m.version);
            let state = 'pending';
            if (rec) {
                state = rec.checksum === m.checksum
                    ? `applied ${new Date(rec.applied_at).toISOString().slice(0, 16).replace('T', ' ')}`
                    : 'APPLIED — FILE HAS CHANGED SINCE';
            }
            console.log(`  ${m.version.padEnd(5)}${m.name.padEnd(34)}${state}`);
        }
        const pending = all.filter(m => !done.has(m.version)).length;
        console.log(`\n  ${all.length} migration(s), ${pending} pending\n`);
    } finally {
        client.release();
    }
};

const up = async (target) => {
    const client = await db.getClient();
    try {
        await ensureTable(client);
        const done = await applied(client);
        const all = discover();

        for (const m of all) {
            const rec = done.get(m.version);
            if (rec) {
                if (rec.checksum !== m.checksum) {
                    throw new Error(
                        `${m.file} was already applied, but the file has changed since ` +
                        `(recorded ${rec.checksum}, now ${m.checksum}). Write a new migration ` +
                        `rather than editing one that has run.`
                    );
                }
                continue;
            }
            if (target && m.version > target) break;

            process.stdout.write(`  ${m.version} ${m.name} … `);
            const started = Date.now();
            // One transaction per migration: a failure leaves nothing behind.
            await client.query('BEGIN');
            try {
                await client.query(m.sql);
                const ms = Date.now() - started;
                await client.query(
                    `INSERT INTO schema_migrations (version, name, checksum, duration_ms)
                     VALUES ($1, $2, $3, $4)`,
                    [m.version, m.name, m.checksum, ms]
                );
                await client.query('COMMIT');
                console.log(`ok (${ms}ms)`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.log('failed — rolled back');
                throw err;
            }
        }
    } finally {
        client.release();
    }
};

const main = async () => {
    const [cmd, arg] = process.argv.slice(2);
    try {
        if (cmd === 'up') await up(arg);
        else await status();
        process.exit(0);
    } catch (err) {
        console.error(`\n  ${err.message}\n`);
        process.exit(1);
    }
};

if (require.main === module) main();

module.exports = { discover, up, status };
