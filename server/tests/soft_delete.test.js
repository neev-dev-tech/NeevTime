/**
 * Deleting an employee must not destroy their attendance.
 *
 * The Delete button on the Employees page ran DELETE against attendance_logs,
 * attendance_daily_summary, leave_applications, biometric_templates,
 * leave_balances, employee_docs and then employees. Every punch a person had
 * ever made, gone on one click, with no undo and no record that it happened.
 * Attendance data is what payroll is argued from — it is not the app's to throw
 * away, and the standing instruction on this deployment is not to delete
 * anything in production.
 *
 * Delete is now a status change. These tests exist because the destructive
 * version is the easier one to write, and someone tidying up "dead" code could
 * reasonably reintroduce it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SERVER, p), 'utf8');
const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('no route deletes attendance history', () => {
    const src = stripComments(read('server.js'));
    for (const table of [
        'attendance_logs', 'attendance_daily_summary', 'leave_applications',
        'leave_balances', 'employee_docs', 'biometric_templates'
    ]) {
        assert.ok(
            !new RegExp(`DELETE\\s+FROM\\s+${table}`, 'i').test(src),
            `server.js deletes from ${table}. Removing an employee must keep their ` +
            `history — the record moves to the Deleted view instead.`
        );
    }
});

test('deleting an employee is a status change, not a row removal', () => {
    const src = stripComments(read('server.js'));

    assert.ok(
        !/DELETE\s+FROM\s+employees/i.test(src),
        'an employee row is being deleted outright; delete must be soft'
    );
    for (const route of ["app.delete('/api/employees'", "app.delete('/api/employees/:id'"]) {
        const i = src.indexOf(route);
        assert.ok(i > 0, `${route} is gone`);
        const body = src.slice(i, i + 2500);
        assert.ok(
            /status = 'deleted'/.test(body) && /deleted_at = NOW\(\)/.test(body),
            `${route} no longer marks the employee deleted`
        );
    }
});

test('a deleted employee cannot still open a door', () => {
    const src = stripComments(read('server.js'));
    const helper = src.slice(src.indexOf('const queueTemplateRemoval'));
    assert.ok(helper.length > 0, 'queueTemplateRemoval is gone');

    const body = helper.slice(0, helper.indexOf('\n};') + 3);
    // USERINFO, not USER. USER is rejected by every reader with Return=-1004,
    // which is how records once vanished from the app while the finger still worked.
    assert.ok(/DATA DELETE USERINFO PIN=/.test(body), 'the USERINFO removal command is gone');
    assert.ok(/DATA DELETE FINGERTMP PIN=/.test(body), 'the fingerprint removal command is gone');
    assert.ok(/DATA DELETE FACE PIN=/.test(body), 'the face removal command is gone');
    assert.ok(
        !/DATA DELETE USER PIN=/.test(body),
        'the command says USER, which every reader rejects with Return=-1004'
    );

    for (const route of ["app.delete('/api/employees'", "app.delete('/api/employees/:id'"]) {
        const i = src.indexOf(route);
        assert.ok(
            /queueTemplateRemoval/.test(src.slice(i, i + 2500)),
            `${route} does not revoke biometric access`
        );
    }
});

test('the employee list does not return resigned or deleted people by default', () => {
    const src = stripComments(read('server.js'));
    const i = src.indexOf("app.get('/api/employees'");
    const body = src.slice(i, i + 2000);

    assert.ok(/req\.query\.view/.test(body), 'the view parameter is gone');
    assert.ok(
        /active:\s*`WHERE LOWER\(e\.status\) NOT IN \('resigned', 'deleted', 'terminated'\)`/.test(body),
        'the default view no longer excludes resigned and deleted employees — they ' +
        'come back into the Employees page and into every employee dropdown'
    );
    assert.ok(/deleted:/.test(body) && /resigned:/.test(body), 'the resigned/deleted views are gone');
});

test('restore only revives someone who was deleted', () => {
    const src = stripComments(read('server.js'));
    const i = src.indexOf("app.post('/api/employees/restore'");
    assert.ok(i > 0, 'the restore route is gone');
    const body = src.slice(i, i + 900);

    assert.ok(
        /LOWER\(status\) = 'deleted'/.test(body),
        'restore does not check the employee was deleted — it would also revive ' +
        'someone who had resigned, undoing that decision'
    );
    assert.ok(/deleted_at = NULL/.test(body), 'restore leaves deleted_at set');
});

test('deleted_at is guaranteed by ensureSchema', () => {
    assert.ok(
        /ADD COLUMN IF NOT EXISTS deleted_at/.test(read('server.js')),
        'deleted_at is written by the delete routes but nothing creates it'
    );
});

test('an unrecognised view is rejected rather than silently defaulted', () => {
    const src = stripComments(read('server.js'));
    const i = src.indexOf("app.get('/api/employees'");
    const body = src.slice(i, i + 2200);

    assert.ok(
        /Unknown view/.test(body) && /status\(400\)/.test(body),
        'an unknown view falls back to the default. That is how the resigned ' +
        'list emptied without a word: Resign.jsx asked for ?status=resigned, a ' +
        'parameter the server never read, and quietly received current staff.'
    );
    assert.ok(
        !/\?\?\s*VIEWS\.active/.test(body),
        'the ?? fallback is back — an unknown view resolves to active again'
    );
});

test('a setting with no seeded row still saves', () => {
    // UPDATE ... WHERE category AND setting_key affects nothing when the row
    // does not exist, and returns success. A setting added in code but never
    // seeded would appear to save and silently not — the same shape as the
    // sync_leaves toggle nothing read, and the ?status= parameter the server
    // ignored. backup_external_path was exactly this case.
    const src = stripComments(read('routes/settings.js'));
    const i = src.indexOf("router.put('/:category'");
    const body = src.slice(i, i + 1800);

    assert.ok(
        /INSERT INTO app_settings/.test(body) && /ON CONFLICT \(category, setting_key\)/.test(body),
        'the settings write is a bare UPDATE again, so any setting without a seeded ' +
        'row saves nothing and says it worked'
    );
    assert.ok(
        !/^\s*UPDATE app_settings\s*$/m.test(body),
        'a bare UPDATE against app_settings has returned'
    );
});

test('a backup is copied to the external path when one is set', () => {
    const src = stripComments(read('routes/database.js'));

    assert.ok(/const copyToExternal/.test(src), 'the external copy helper is gone');

    // The slice runs from loadDestination, not from copyToExternal. Destination
    // support for S3, SFTP and SharePoint moved the settings read into
    // loadDestination, and the original assertion — which looked only between
    // copyToExternal and createBackup — failed on a refactor that kept every
    // behaviour it was protecting. Assert the behaviour, not the address.
    const start = src.indexOf('const loadDestination');
    const helper = src.slice(start > -1 ? start : src.indexOf('const copyToExternal'),
        src.indexOf('const createBackup'));

    assert.ok(
        /backup_external_path/.test(helper),
        'the copy no longer honours backup_external_path — an install that only ever ' +
        'set a path must keep working with nothing to re-enter'
    );
    assert.ok(
        /catch \(err\)/.test(helper),
        'a failing external copy must not fail the backup — a dump in one place ' +
        'beats an error and no dump at all'
    );
    assert.ok(
        /copyToExternal\(filepath, filename\)/.test(src),
        'createBackup no longer calls the external copy'
    );
});

test('the backup schedule cannot silently skip a day', () => {
    const src = stripComments(read('routes/database.js'));
    const i = src.indexOf('const startAutoBackup');
    const body = src.slice(i, i + 2600);

    // Exact HH:MM match on a 60-second timer: setInterval drifts, a tick moves
    // from 01:59:58 to 02:01:00, and that day has no backup and no log line.
    assert.ok(
        !/current !== String\(time\)/.test(body),
        'the schedule fires only on an exact minute match again, so timer drift ' +
        'skips a day with nothing recorded'
    );
    assert.ok(
        /< dueMinutes\) return/.test(body),
        'the at-or-after comparison is gone'
    );

    // In-memory only: this box redeploys several times a day, and each restart
    // after the scheduled time would take another dump until retention pruned
    // the older days away.
    assert.ok(
        /startsWith\(`auto-\$\{stamp\}`\)/.test(body),
        'the once-a-day check reads a variable rather than the backup directory, ' +
        'so a container restart takes an extra dump'
    );

    // Local date, not UTC. IST is UTC+5:30, so a 02:00 run stamped with
    // toISOString() carries the previous day.
    assert.ok(
        !/stamp = now\.toISOString\(\)/.test(body),
        'the daily stamp is UTC again while the schedule is read in local time'
    );
});
