/**
 * A departure in the HRMS must reach this database, and must not bounce back.
 *
 * The employee pull filtered on `status = 'Active'` and never mapped the status
 * field it asked for. Anyone marked Left in ERPNext therefore dropped out of the
 * payload entirely — the upsert never saw them, their row here stayed 'active'
 * for good, and they went on counting as staff and accruing an absence for every
 * working day after they left.
 *
 * The opposite mistake is just as bad and much easier to make while fixing the
 * first one. A resignation entered in this app writes status='resigned'
 * directly, and ERPNext frequently still lists that person as Active for a
 * while. Mapping status straight across in both directions would flip them back
 * on the next sync and silently undo the decision. Deactivation flows in;
 * reactivation does not.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SERVER, p), 'utf8');

/** Comments describe intent; they must not be able to satisfy an assertion. */
const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the employee pull does not filter the HRMS down to active staff', () => {
    const src = stripComments(read('services/integrations/erpnext.js'));
    const pull = src.slice(src.indexOf('async pullEmployees'), src.indexOf('async pullShifts'));
    assert.ok(pull.length > 0, 'pullEmployees not found');

    assert.ok(
        !/filters:\s*JSON\.stringify\(\[\[\s*'status'/.test(pull),
        'pullEmployees filters on status again — anyone marked Left disappears ' +
        'from the payload and is never retired here'
    );
});

test('the employee pull carries the HRMS status through', () => {
    const src = stripComments(read('services/integrations/erpnext.js'));
    const pull = src.slice(src.indexOf('async pullEmployees'), src.indexOf('async pullShifts'));

    assert.ok(/'status'/.test(pull), 'status is no longer requested from the HRMS');
    assert.ok(
        /hrms_status:\s*emp\.status/.test(pull),
        'status is requested but not mapped onto the returned employee, which is ' +
        'exactly the bug this file exists for'
    );
});

test('Left retires an employee, Active never revives one', () => {
    const src = stripComments(read('services/hrms-integration.js'));
    const fn = src.slice(src.indexOf('const retirementFor'));
    assert.ok(fn.length > 0, 'retirementFor is gone');
    const body = fn.slice(0, fn.indexOf('};') + 2);

    assert.ok(/case 'left':\s*return 'resigned'/.test(body), "Left no longer maps to resigned");
    assert.ok(/return null/.test(body), 'there is no longer a do-nothing branch');

    // The dangerous edit: turning the default into an activation.
    assert.ok(
        !/default:\s*return\s*'active'/.test(body),
        "the default branch reactivates from the HRMS — a resignation entered " +
        "here would be undone on the next sync"
    );
    assert.ok(
        !/=\s*'active'/.test(body),
        'retirementFor can now produce an active status; it must only ever retire'
    );
});

test('retiring an employee also clears attendance_required', () => {
    const src = stripComments(read('services/hrms-integration.js'));
    const idx = src.indexOf('retirementFor');
    const region = src.slice(idx, idx + 3000);

    assert.ok(
        /SET status = \$2,\s*attendance_required = FALSE/.test(region),
        'a retired employee keeps attendance_required, so the absent report ' +
        'goes on expecting them every working day'
    );
});

test('resigning through the app applies the attendance choice', () => {
    const src = stripComments(read('routes/personnel_expansion.js'));
    const idx = src.indexOf("status = 'resigned'");
    assert.ok(idx > 0, 'the resignation status update is gone');
    const stmt = src.slice(idx - 200, idx + 400);

    assert.ok(
        /attendance_required = \$2/.test(stmt),
        'the dialog asks whether attendance stays enabled, records it on the ' +
        'resignation row, and then never applies it to the employee'
    );
});

test('every column these writes touch is guaranteed by ensureSchema', () => {
    const ensure = read('server.js');
    for (const col of ['attendance_required', 'status']) {
        const created = new RegExp(
            `ADD COLUMN IF NOT EXISTS ${col}\\b|\\b${col}\\s+(BOOLEAN|VARCHAR|TEXT)`, 'i'
        );
        const inSchemaFiles = fs.readdirSync(path.join(SERVER, '..', 'database'))
            .filter(f => f.endsWith('.sql'))
            .some(f => created.test(fs.readFileSync(path.join(SERVER, '..', 'database', f), 'utf8')));
        assert.ok(
            created.test(ensure) || inSchemaFiles,
            `employees.${col} is written by the sync but nothing creates it`
        );
    }
    // attendance_required specifically: the schema files are history, and only
    // ensureSchema runs on every deployment.
    assert.ok(
        /ADD COLUMN IF NOT EXISTS attendance_required/.test(ensure),
        'attendance_required is only created by a schema file; ensureSchema is ' +
        'the only thing that runs everywhere, and the sync now writes this column'
    );
});

test('an unidentified card is not counted as staff', () => {
    const src = stripComments(read('services/punch_ingest.js'));
    const idx = src.indexOf("VALUES ($1, 'Unknown'");
    assert.ok(idx > 0, 'the placeholder insert is gone');
    const stmt = src.slice(idx - 200, idx + 200);

    assert.ok(
        /attendance_required/.test(stmt) && /FALSE/i.test(stmt),
        'a placeholder employee is created attendance_required by default, so ' +
        'every unrecognised card is marked absent for each working day it does ' +
        'not appear — five such rows were in the active headcount on production'
    );
});

test('the HRMS sync does not force attendance_required back on', () => {
    const src = stripComments(read('services/hrms-integration.js'));
    const upsert = src.slice(src.indexOf('INSERT INTO employees'), src.indexOf('stats.success++'));

    assert.ok(
        !/attendance_required\s*=\s*(TRUE|true|EXCLUDED)/.test(upsert),
        'the employee upsert sets attendance_required, which would override a ' +
        'deliberate exclusion — a service account in the HRMS as Active would ' +
        'start being tracked again on the next sync'
    );
});
