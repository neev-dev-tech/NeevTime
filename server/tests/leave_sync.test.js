/**
 * Whether approved leave stops counting as absence.
 *
 * The absent report has always excluded approved leave, and nothing ever
 * populated the table it checks — so anyone on approved leave has been counted
 * absent for the whole life of the system.
 *
 * `sync_leaves` was the toggle for this. The column existed, the switch was on
 * the Integrations screen, and no code read it: you could turn it on and
 * nothing would happen, with no error and no log line. A switch that lies is
 * worse than a missing feature, because it stops anyone looking further.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const strip = (src) => src.split('\n')
    .filter(l => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('--');
    })
    .join('\n');

const core = strip(read('services/hrms-integration.js'));
const erp = strip(read('services/integrations/erpnext.js'));
const boot = strip(read('server.js'));

test('the sync_leaves toggle actually runs something', () => {
    assert.ok(/if \(integration\.sync_leaves\)/.test(core),
        'sync_leaves is still read by nothing — the switch on the Integrations screen does nothing');
    assert.ok(/syncLeavesFromHRMS\(instance\)/.test(core),
        'the toggle is read but never calls the leave sync');
});

test('leave is pulled after employees, because of the foreign key', () => {
    // leave_applications references employees(employee_code). Somebody hired
    // today has to arrive before their leave can be stored.
    const emp = core.indexOf('syncEmployeesFromHRMS(instance)');
    const lv = core.indexOf('syncLeavesFromHRMS(instance)');
    assert.ok(emp !== -1 && lv !== -1 && emp < lv,
        'leave must be pulled after employees, or every application for a new hire fails its foreign key');
});

test('leave for an unknown employee is skipped, not counted as a failure', () => {
    const i = core.indexOf('const syncLeavesFromHRMS');
    const fn = core.slice(i, core.indexOf('const syncEmployeesFromHRMS'));
    assert.ok(/SELECT 1 FROM employees WHERE employee_code = \$1/.test(fn),
        'an application for someone this system has never seen — a leaver, or a record the employee ' +
        'pull filtered out — would fail the foreign key and be logged as an error every single sync');
});

test('applications upsert on the HRMS identifier, not on employee and dates', () => {
    const i = core.indexOf('INSERT INTO leave_applications');
    assert.ok(i !== -1, 'nothing writes leave applications');
    const q = core.slice(i, i + 1200);
    assert.ok(/ON CONFLICT \(external_id\)/.test(q),
        'matching on employee and dates duplicates the moment a leave is edited in ERPNext, and ' +
        'leaves the old row behind still exempting them from absence');
    assert.ok(/from_date\s*=\s*EXCLUDED\.from_date/.test(q) && /status\s*=\s*EXCLUDED\.status/.test(q),
        'dates and status must overwrite, not COALESCE — a leave that is cancelled or moved in the ' +
        'HRMS has to change here, and COALESCE would keep the stale value forever');
});

test('a NOT NULL reason is always supplied', () => {
    // leave_applications.reason is NOT NULL and ERPNext's description is
    // optional, so a leave entered without one fails the insert.
    const i = core.indexOf('const syncLeavesFromHRMS');
    const fn = core.slice(i, core.indexOf('const syncEmployeesFromHRMS'));
    assert.ok(/a\.reason \|\|/.test(fn),
        'reason is NOT NULL on this table; an application with no description would fail to insert');
});

test('ERPNext status is lowercased to match what the absent report looks for', () => {
    // The report matches LOWER(status) = 'approved', but ERPNext capitalises
    // its workflow states.
    assert.ok(/toLowerCase\(\)/.test(erp), 'leave status is not normalised');
});

test('paid leave is derived from is_lwp, which is its inverse', () => {
    // ERPNext has no is_paid. It marks unpaid leave with is_lwp — leave without
    // pay — so reading a missing is_paid would make every leave type unpaid.
    assert.ok(/is_paid: !t\.is_lwp/.test(erp),
        'is_paid must be derived from is_lwp; ERPNext has no is_paid field');
});

test('the leave pull is bounded to a window', () => {
    const i = core.indexOf('const syncLeavesFromHRMS');
    const fn = core.slice(i, core.indexOf('const syncEmployeesFromHRMS'));
    assert.ok(/pullLeaveApplications\(iso\(from\), iso\(to\)\)/.test(fn),
        'an unbounded pull fetches a company\'s entire leave history every five minutes');
});

test('the list request falls back to per-document reads, not to failure', () => {
    // Frappe rejects the whole query when one requested field is unknown to
    // that doctype — the Shift Type pull failed outright on exactly that. Here
    // the fields are worth asking for, because per-document reads on hundreds
    // of leave applications would be slow, so it degrades instead of failing.
    assert.ok(/Field not permitted in query/i.test(erp),
        'nothing detects Frappe rejecting a field, so one unknown field fails the whole leave pull');
    assert.ok(/_listOrFetch/.test(erp), 'no fallback path from a fielded list to per-document reads');
});

test('every column the leave sync writes is added at boot', () => {
    const added = new Set(
        [...boot.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)].map(m => `${m[1]}.${m[2]}`)
    );
    const guaranteed = new Set([
        'leave_applications.employee_code', 'leave_applications.leave_type_id',
        'leave_applications.from_date', 'leave_applications.to_date',
        'leave_applications.total_days', 'leave_applications.status',
        'leave_applications.reason', 'leave_types.name'
    ]);
    const missing = [];
    for (const m of core.matchAll(/INSERT INTO (leave_applications|leave_types)\s*\(([^)]+)\)/g)) {
        for (const col of m[2].split(',').map(c => c.trim()).filter(Boolean)) {
            const key = `${m[1]}.${col}`;
            if (!added.has(key) && !guaranteed.has(key)) missing.push(key);
        }
    }
    assert.deepEqual(missing, [],
        'written by the sync but never added by ensureSchema: ' + missing.join(', '));
});
