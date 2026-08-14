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
