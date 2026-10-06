#!/usr/bin/env node
/**
 * Create any base table an older install is missing, before migrations.
 *
 *     node scripts/ensure_base_tables.js            # apply
 *     node scripts/ensure_base_tables.js --dry-run  # list what would be created
 *
 * database/000_schema.sql is the schema a new install starts from. An install
 * built from an earlier schema (the Omniware server, 6 Oct 2026) lacks some of
 * its tables — `leaves` among them — and migration 009 then fails on
 * `ALTER TABLE leaves`. Running the whole file is not safe on a live database:
 * it also INSERTs default departments, shifts, areas and settings, which would
 * duplicate an install's own. So this runs only the CREATE TABLE IF NOT EXISTS
 * and CREATE INDEX IF NOT EXISTS statements, in one transaction, and touches no
 * table that already exists.
 */

const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

const SCHEMA = path.join(__dirname, '../../database/000_schema.sql');

const statements = () => fs.readFileSync(SCHEMA, 'utf8')
    .replace(/--[^\n]*/g, '')
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => /^CREATE TABLE IF NOT EXISTS\b/i.test(s) || /^CREATE (UNIQUE )?INDEX IF NOT EXISTS\b/i.test(s));

(async () => {
    const dryRun = process.argv.includes('--dry-run');
    const existing = new Set((await db.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    )).rows.map(r => r.table_name));

    const all = statements();
    const tableOf = (sql) => (/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i.exec(sql)
        || /\bON\s+([a-z_]+)/i.exec(sql) || [])[1];
    const missing = new Set(all.filter(s => /^CREATE TABLE/i.test(s)).map(tableOf)
        .filter(t => t && !existing.has(t)));

    if (missing.size === 0) {
        console.log('All base tables present; nothing to do.');
        process.exit(0);
    }
    console.log(`Missing base tables (${missing.size}): ${[...missing].join(', ')}`);
    if (dryRun) process.exit(0);

    // Only the missing tables and the indexes on them.
    const toRun = all.filter(s => missing.has(tableOf(s)));
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        for (const sql of toRun) await client.query(sql);
        await client.query('COMMIT');
        console.log(`Created ${missing.size} table(s) and their indexes.`);
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed, nothing applied: ${err.message}`);
        process.exit(1);
    } finally {
        client.release();
    }
})();
