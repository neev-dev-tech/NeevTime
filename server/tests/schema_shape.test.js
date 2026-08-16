/**
 * The statements the application actually issues, run against a real Postgres.
 *
 * Seventeen tables used to be defined more than once across database/*.sql,
 * every one with CREATE TABLE IF NOT EXISTS. The first definition loaded won and
 * the rest were silent no-ops, so a fresh install got whichever shape sorted
 * first rather than the shape the code writes. Three tables landed wrong:
 *
 *   areas    — the Areas page read and wrote parent_area_id against a table that
 *              only had parent_id, so every read returned 500;
 *   devices  — Add Device and Edit Device wrote seven columns the table did not
 *              have, so no reader could be added or edited at all;
 *   attendance_logs and attendance_daily_summary — already fixed defensively in
 *              ensureSchema before this file existed.
 *
 * None of it was visible to a test that stubs the database, and none of it was
 * visible on the deployment that already had the columns. What makes it hard to
 * catch by reading is that the losing definition is not absent from the repo —
 * it is right there in another file, looking authoritative.
 *
 * So this asks Postgres instead. Each statement below is copied from the file
 * and line named beside it and PREPAREd, which resolves every column reference
 * without writing a row. The ON CONFLICT ones are executed and rolled back
 * instead, because a conflict target is resolved when the statement is planned,
 * not when it is parsed — `ON CONFLICT (name)` against a table with no unique
 * index on name PREPAREs perfectly cleanly and then fails at runtime.
 *
 * Skips when no database is reachable, so `npm test` on a laptop is unaffected.
 */

const test = require('node:test');
const assert = require('node:assert');

const db = require('../db');

let usable = false;

test.before(async () => {
    try {
        await db.query('SELECT 1');
        usable = true;
    } catch {
        usable = false;
    }
});

// Statements whose every column reference must resolve. PREPARE is enough:
// parse and analyse is where a missing column is reported.
const PARSES = [
    ['routes/organization.js:113 — add an area',
        `INSERT INTO areas (name, code, parent_area_id) VALUES ($1, $2, $3) RETURNING *`],
    ['routes/organization.js:126 — re-parent an area',
        `UPDATE areas SET name = $1, code = COALESCE($2, code), parent_area_id = $3 WHERE id = $4 RETURNING *`],
    ['routes/organization.js:96 — the Areas page enrolment counts',
        `SELECT (SELECT COUNT(*)::int FROM biometric_templates bt
                   JOIN employees e ON e.employee_code = bt.employee_code
                  WHERE e.area_id = a.id AND bt.template_type IN (1, 2)) AS fp_count,
                (SELECT COUNT(*)::int FROM biometric_templates bt
                   JOIN employees e ON e.employee_code = bt.employee_code
                  WHERE e.area_id = a.id AND bt.template_type = 9) AS face_count
           FROM areas a`],
    ['routes/organization.js:100 — the Areas page tree',
        `SELECT a.* FROM areas a LEFT JOIN areas parent ON a.parent_area_id = parent.id`],
    ['server.js:1414 — add a reader', `
        INSERT INTO devices (serial_number, device_name, ip_address, port, status, last_activity, area_id,
            transfer_mode, timezone, is_registration_device, is_attendance_device,
            connection_interval, device_direction, enable_access_control)
        VALUES ($1,$2,$3,$4,'online',NOW(),$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (serial_number) DO UPDATE SET device_name = COALESCE($2, devices.device_name)
        RETURNING *`],
    ['server.js:1484 — edit a reader', `
        UPDATE devices SET device_name = COALESCE($1, device_name), port = COALESCE($2, port),
            transfer_mode = COALESCE($3, transfer_mode), timezone = COALESCE($4, timezone),
            is_registration_device = COALESCE($5, is_registration_device),
            is_attendance_device = COALESCE($6, is_attendance_device),
            connection_interval = COALESCE($7, connection_interval),
            device_direction = COALESCE($8, device_direction),
            enable_access_control = COALESCE($9, enable_access_control)
        WHERE serial_number = $10 RETURNING *`],
    ['services/adms.js:439 — reader marked online on log upload', `
        INSERT INTO devices (serial_number, status, last_activity, vendor, approval_status, first_seen_at)
        VALUES ($1, 'online', NOW(), 'ZKTeco', 'pending', NOW())
        ON CONFLICT (serial_number) DO UPDATE SET last_activity = NOW()
        RETURNING device_direction`],
    ['services/integrations/erpnext.js:424 — direction lookup while pushing attendance',
        `SELECT device_direction FROM devices WHERE serial_number = $1`],
    ['services/integrations/punch_format.js:104 — bulk direction lookup',
        `SELECT serial_number, device_direction FROM devices WHERE serial_number = ANY($1)`],
    ['routes/scheduling.js:17 — create a shift', `
        INSERT INTO shifts (name, start_time, end_time, shift_type, grace_in_minutes,
            late_threshold_minutes, break_duration_minutes, is_night_shift)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`],
    ['routes/scheduling.js:160 — create a timetable', `
        INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, overtime_start,
            min_hours_for_full_day, min_hours_for_half_day, is_overnight, is_flexible,
            grace_period_minutes, color, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`],
    ['routes/scheduling.js:215 — create a break',
        `INSERT INTO break_times (timetable_id, name, start_time, end_time, is_paid) VALUES ($1,$2,$3,$4,$5) RETURNING *`],
    ['routes/scheduling_extended.js:291 — create an attendance rule', `
        INSERT INTO attendance_rules (rule_type, department_id, name, late_threshold_minutes,
            early_leave_threshold_minutes, half_day_threshold_minutes, absent_threshold_minutes,
            overtime_enabled, overtime_threshold_minutes, overtime_multiplier, grace_period_minutes,
            grace_late_allowed_per_month, week_off_days, alternate_saturday,
            round_off_minutes, minimum_punch_gap_minutes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`],
    ['routes/organization.js:56 — create a position',
        `INSERT INTO positions (name, description) VALUES ($1, $2) RETURNING *`],
    ['routes/organization.js:19 — create a department',
        `INSERT INTO departments (name) VALUES ($1) RETURNING *`],
    ['routes/scheduling_extended.js:418 — create a holiday location',
        `INSERT INTO holiday_locations (name, description) VALUES ($1, $2) RETURNING *`],
    ['routes/auth.js:295 — create a user',
        `INSERT INTO users (username, password_hash, role, email) VALUES ($1,$2,$3,$4) RETURNING id`],
    ['utils/systemLogger.js:42 — write an audit line', `
        INSERT INTO system_logs (user_id, username, action, entity_type, entity_id,
            old_values, new_values, ip_address, user_agent, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`],
    ['routes/device_sync.js:47 — queue a device command',
        `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1,$2,'pending',1)`],
    ['services/hrms-integration.js:1216 — employee upsert', `
        INSERT INTO employees (employee_code, name, email, mobile, department_id,
            default_shift_id, holiday_location_id, designation, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')
        ON CONFLICT (employee_code) DO UPDATE SET name = COALESCE(EXCLUDED.name, employees.name)`]
];

// Statements whose ON CONFLICT target must resolve to a real unique index.
// These have to run, not merely parse.
const PLANS = [
    ['services/adms.js:369 — reader registration', `
        INSERT INTO devices (serial_number, status, last_activity, vendor, approval_status, first_seen_at)
        VALUES ('ZZTEST-SHAPE','online',NOW(),'ZKTeco','pending',NOW())
        ON CONFLICT (serial_number) DO UPDATE SET last_activity = NOW()`],
    ['services/adms.js:297 — auto-enrol an unknown PIN',
        `INSERT INTO employees (employee_code, name, department_id, status)
         VALUES ('ZZTEST-SHAPE','Unknown',NULL,'Active') ON CONFLICT (employee_code) DO NOTHING`],
    ['services/hrms-integration.js:720 — shift upsert',
        `INSERT INTO shifts (code, name, start_time, end_time) VALUES ('ZZTEST-SHAPE','Probe','09:00','18:00')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`],
    ['services/hrms-integration.js:804 — holiday list upsert',
        `INSERT INTO holiday_locations (code, name) VALUES ('ZZTEST-SHAPE','Probe')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`],
    ['services/hrms-integration.js:824 — holiday upsert',
        `INSERT INTO holidays (holiday_location_id, date, name, type)
         VALUES (NULL,'2099-01-01','ZZTEST-SHAPE','public')
         ON CONFLICT (COALESCE(holiday_location_id, 0), date) DO UPDATE SET name = EXCLUDED.name`],
    // The three holiday write paths, all of which wrote location_id while the
    // index, the HRMS sync and the muster roll use holiday_location_id. The
    // POST additionally named a conflict target matching no index, so it failed
    // outright rather than merely writing somewhere nothing reads.
    ['routes/scheduling.js:99 — add a holiday from the UI',
        `INSERT INTO holidays (name, date, holiday_location_id, is_optional)
         VALUES ('ZZTEST-SHAPE', DATE '2031-01-01', NULL, false)
         ON CONFLICT (COALESCE(holiday_location_id, 0), date)
         DO UPDATE SET name = EXCLUDED.name, is_optional = EXCLUDED.is_optional`],
    ['routes/scheduling.js:340 — import a holiday from CSV',
        `INSERT INTO holidays (name, date, holiday_location_id, is_optional)
         VALUES ('ZZTEST-SHAPE', DATE '2031-01-02', NULL, false)`],
    ['services/adms.js:47 — punch ingest',
        `INSERT INTO attendance_logs (employee_code, punch_time, punch_state, verification_mode, device_serial)
         VALUES ('ZZTEST-SHAPE','2099-01-01 09:00','check_in',1,'ZZTEST-SHAPE')
         ON CONFLICT (employee_code, punch_time) DO NOTHING`],
    ['services/attendance_engine.js:284 — daily summary upsert',
        `INSERT INTO attendance_daily_summary (employee_code, date, ot_minutes)
         VALUES ('ZZTEST-SHAPE','2099-01-01',0)
         ON CONFLICT (employee_code, date) DO UPDATE SET ot_minutes = EXCLUDED.ot_minutes`]
];

test('every statement the application issues resolves its columns', async (t) => {
    if (!usable) return t.skip('no database reachable');

    const broken = [];
    for (let i = 0; i < PARSES.length; i++) {
        const [origin, sql] = PARSES[i];
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(`PREPARE shape_${i} AS ${sql}`);
        } catch (err) {
            broken.push(`${origin}\n      ${err.message}`);
        } finally {
            await client.query('ROLLBACK').catch(() => {});
            client.release();
        }
    }

    assert.deepStrictEqual(broken, [],
        `statements the database rejects:\n    ${broken.join('\n    ')}`);
});

test('every ON CONFLICT names a unique index that exists', async (t) => {
    if (!usable) return t.skip('no database reachable');

    const broken = [];
    for (const [origin, sql] of PLANS) {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(sql);
        } catch (err) {
            // A missing parent row means the conflict target resolved and the
            // insert simply had nothing to point at, which is not the failure
            // this is looking for.
            if (!/violates foreign key|null value in column/.test(err.message)) {
                broken.push(`${origin}\n      ${err.message}`);
            }
        } finally {
            await client.query('ROLLBACK').catch(() => {});
            client.release();
        }
    }

    assert.deepStrictEqual(broken, [],
        `ON CONFLICT targets that do not resolve:\n    ${broken.join('\n    ')}`);
});

test('no table is defined more than once across database/*.sql', async (t) => {
    const fs = require('node:fs');
    const path = require('node:path');

    const dir = path.join(__dirname, '..', '..', 'database');
    if (!fs.existsSync(dir)) return t.skip('no database directory');

    // Only the top level. database/legacy/ holds the superseded files on
    // purpose, and nothing loads them.
    const seen = new Map();
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
            const table = m[1].toLowerCase();
            if (!seen.has(table)) seen.set(table, []);
            seen.get(table).push(file);
        }
    }

    const duplicated = [...seen.entries()]
        .filter(([, files]) => files.length > 1)
        .map(([table, files]) => `${table}: ${files.join(', ')}`);

    assert.deepStrictEqual(duplicated, [],
        `a table defined twice is a silent no-op — the second CREATE TABLE IF NOT EXISTS
         does nothing and the shape a fresh install gets depends on filename order:\n    ${duplicated.join('\n    ')}`);
});
