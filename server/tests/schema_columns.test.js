/**
 * Columns the code writes must exist.
 *
 * Two separate outages came from the same shape of mistake: SQL naming a column
 * that was never created. Postgres only complains at execution time, so the
 * route looks fine in review, passes lint, and fails the moment a user touches
 * it — `column "remarks" does not exist`, `column "rule_type" does not exist`.
 *
 * This walks every INSERT in the server and checks its column list against the
 * schema the application itself guarantees: the CREATE TABLE statements in the
 * repo plus the ALTER TABLE ... ADD COLUMN statements in ensureSchema. If a
 * route writes a column nothing creates, that is caught here rather than by
 * whoever tried to correct a missed punch.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');

const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'tests') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith('.js') || entry.name.endsWith('.sql')) out.push(full);
    }
    return out;
};

const FILES = walk(SERVER);
const readAll = () => FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n');

/** Columns the codebase creates, per table, from CREATE TABLE and ADD COLUMN. */
const declaredColumns = () => {
    const all = readAll();
    const tables = {};

    // The closing paren may or may not carry a semicolon — these blocks are
    // written both as .sql files and as template literals passed to a helper.
    for (const m of all.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*[;`,)]/gi)) {
        const table = m[1].toLowerCase();
        tables[table] = tables[table] || new Set();
        for (const line of m[2].split('\n')) {
            const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s+[A-Za-z]/);
            if (col && !/^(primary|foreign|unique|constraint|check)$/i.test(col[1])) {
                tables[table].add(col[1].toLowerCase());
            }
        }
    }

    for (const m of all.matchAll(/ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)) {
        const table = m[1].toLowerCase();
        tables[table] = tables[table] || new Set();
        tables[table].add(m[2].toLowerCase());
    }

    return tables;
};

/** Every INSERT INTO <table> (cols...) written anywhere in the server. */
const insertSites = () => {
    const sites = [];
    for (const file of FILES) {
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
            const cols = m[2].split(',')
                .map(c => c.trim().replace(/"/g, '').toLowerCase())
                .filter(c => /^[a-z_][a-z0-9_]*$/.test(c));
            sites.push({
                file: path.relative(SERVER, file),
                line: src.slice(0, m.index).split('\n').length,
                table: m[1].toLowerCase(),
                cols
            });
        }
    }
    return sites;
};

/**
 * Sites that already trip the scan. Two different reasons, kept apart on
 * purpose:
 *
 *  - FALSE POSITIVE: the column does exist in production; the table is created
 *    by a migration that predates this repo, so the scan cannot see its
 *    definition and wrongly reports it. Verified by hand against the live
 *    schema on 2026-08-03.
 *  - REAL: the column genuinely does not exist and the INSERT fails at runtime.
 *
 * Nothing may be added to this list to silence a new failure. Fix the column or
 * the query instead — the whole point is that the list only ever shrinks.
 */
const BASELINE = new Set([
    // REAL — mobile punching writes six columns attendance_logs does not have,
    // and the geofences table it references does not exist at all. The feature
    // was never provisioned in this database. Left failing deliberately: fixing
    // it means deciding whether GPS attendance is wanted, which is not a
    // question a schema patch should answer quietly.
    'routes/mobile_attendance.js|attendance_logs',

    // FALSE POSITIVE — all present in production
    'server.js|devices',
    'services/hrms-integration.js|integration_sync_logs',
    'services/scheduled-reports.js|scheduled_reports',

    // Development-only scripts, not on any request path
    'scripts/apply_easytime_schema.js|positions',
    'scripts/apply_easytime_schema.js|holiday_locations',
    'scripts/seed_test_data.js|shifts',
    'scripts/seed_test_data.js|employees'
]);

test('no new INSERT writes a column that nothing creates', () => {
    const declared = declaredColumns();
    const problems = [];

    for (const site of insertSites()) {
        const known = declared[site.table];
        // A table this repo never creates at all is out of scope.
        if (!known || known.size === 0) continue;
        if (BASELINE.has(`${site.file}|${site.table}`)) continue;
        const missing = site.cols.filter(c => !known.has(c));
        if (missing.length) {
            problems.push(`  ${site.file}:${site.line} — ${site.table} has no ${missing.join(', ')}`);
        }
    }

    assert.deepStrictEqual(problems, [],
        'these INSERTs name columns nothing creates, and will fail at runtime:\n' + problems.join('\n'));
});

test('the columns behind the two known outages are declared', () => {
    // Named explicitly so a refactor of the scanner above cannot quietly stop
    // covering the cases that caused real failures.
    const declared = declaredColumns();
    assert.ok(declared['attendance_daily_summary']?.has('remarks'),
        'attendance_daily_summary.remarks is missing — Manual Entry and regularisation approval both write it');
    assert.ok(declared['attendance_rules']?.has('rule_type'),
        'attendance_rules.rule_type is missing — the Attendance Rules page reads it');
});
