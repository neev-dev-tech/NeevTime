/**
 * Whether an employee pull actually assigns a department.
 *
 * It did not, for the life of the integration, and nothing complained. Every
 * adapter returns `department_name`; the upsert read `emp.department_id`,
 * which no adapter has ever set. Reading a missing property is not an error in
 * JavaScript — it is `undefined`, which the pg driver sends as NULL — so the
 * sync reported "Synced 71" while assigning nobody to anything.
 *
 * It was invisible from the app: the register's department filter was empty and
 * the dashboard read "Unassigned 71", both of which look like data that has not
 * been entered rather than a mapping that never ran.
 *
 * Two things are pinned here: that the *name* is what gets read, and that
 * department_id survives a conflict. An insert-only mapping would have fixed
 * nothing, because on any live deployment every employee already exists.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8'
);

// Only the executable lines. The commentary above the fix quotes the old
// property name to explain the bug, and matching that would let the test pass
// against the very code it exists to reject.
const code = source
    .split('\n')
    .filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
    .join('\n');

test('the employee pull reads the department NAME the adapters actually return', () => {
    assert.ok(/department_name/.test(code),
        'nothing reads department_name — the adapters return a name, not an id');
    assert.ok(!/\bemp\.department_id\b/.test(code),
        'still reading emp.department_id, which no adapter sets: it is undefined, ' +
        'and undefined is written as NULL without raising anything');
});

test('department_id is written on conflict, not only on insert', () => {
    const start = code.indexOf('INSERT INTO employees');
    assert.ok(start !== -1, 'employee upsert not found');
    const upsert = code.slice(start, start + 900);

    assert.ok(/ON CONFLICT/.test(upsert), 'the upsert no longer handles a conflict');
    assert.ok(/department_id\s*=\s*COALESCE\(EXCLUDED\.department_id/.test(upsert),
        'department_id is missing from the DO UPDATE clause — on a live deployment ' +
        'every employee already exists, so an insert-only mapping assigns nobody');
});

test('a manual department assignment is not wiped by a sync that has none', () => {
    const start = code.indexOf('INSERT INTO employees');
    const upsert = code.slice(start, start + 900);
    // COALESCE(EXCLUDED.x, employees.x) keeps the stored value when the HRMS
    // sends nothing. A bare assignment would clear it on every sync.
    assert.ok(/department_id\s*=\s*COALESCE\(EXCLUDED\.department_id,\s*employees\.department_id\)/.test(upsert),
        'department_id must COALESCE onto the existing value, or a sync without a ' +
        'department clears one that was set by hand');
});

test('the Frappe company suffix is stripped before matching', () => {
    // ERPNext names departments "Engineering - INN". Matched literally against
    // a local "Engineering" that finds nothing, and would then create a second
    // department per company abbreviation.
    assert.ok(/replace\(\/\\s\+-\\s\+\[A-Z0-9\]/.test(code) || /-\s*\\s\+\[A-Z0-9\]/.test(code),
        'the company-abbreviation suffix is not stripped from the department name');
});

test('an unknown department is created rather than dropped', () => {
    assert.ok(/INSERT INTO departments/.test(code),
        'a department the HRMS knows about and this database does not is silently ' +
        'discarded, which is how the original bug stayed invisible');
});
