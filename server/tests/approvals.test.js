/**
 * Who may approve whose leave and attendance corrections.
 *
 * Getting this wrong has two failure modes and they point in opposite
 * directions: a request nobody can approve sits forever, and a request the
 * wrong person can approve is somebody signing off their own absence. Both are
 * covered here.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the service loads', () => {
    assert.doesNotThrow(() => require('../services/approvals'));
});

test('nobody approves their own request, at any level', () => {
    // A department approver requesting their own leave would otherwise sign it
    // off, and so would a manager who reports to themselves through a data
    // entry mistake.
    const src = read('services/approvals.js');
    assert.match(src, /if \(approverCode === targetCode\)/,
        'self-approval is not blocked');
    assert.match(src, /filter\(a => a\.employee_code !== employeeCode\)/,
        'the approver list can contain the employee themselves');
    assert.match(src, /e\.employee_code <> \$2/,
        'a department approver is offered their own request');
});

test('the chain is a union, so one absence cannot block a team', () => {
    // First-match was the obvious reading and it is wrong in practice: a
    // department head could not act while a reporting manager existed, so a
    // manager on leave stopped their whole team until the org chart was edited.
    const src = read('services/approvals.js');
    assert.match(src, /found\.push/, 'the chain returns at the first level instead of collecting');
    assert.ok(!/return \[\{ \.\.\.m\.rows\[0\], via: 'manager' \}\]/.test(src),
        'the manager level short-circuits the rest of the chain');
});

test('a manager who has left approves nothing', () => {
    const src = read('services/approvals.js');
    assert.match(src, /LOWER\(status\) IS DISTINCT FROM 'resigned'/,
        'a resigned manager is still offered requests to approve');
});

test('permission is checked on the request, not inherited from the list', () => {
    // The list is a convenience. Anyone can post an id.
    const src = read('routes/portal.js');
    const route = src.slice(src.indexOf("router.post('/approvals/:type/:id'"));
    assert.match(route, /approvals\.canApprove\(/,
        'a decision is recorded without re-checking who is allowed to make it');
});

test('an already-decided request is a conflict, not a silent overwrite', () => {
    // Two approvers sharing a queue is the normal case now that the chain is a
    // union. The second one must be told, not quietly reverse the first.
    const route = read('routes/portal.js');
    const block = route.slice(route.indexOf("router.post('/approvals/:type/:id'"));
    assert.match(block, /status\(409\)/, 'a second decision silently overwrites the first');
    assert.match(block, /has already been/, 'the conflict does not say what happened');
});

test('the level that authorised a decision is recorded on the request', () => {
    // Chains change. Six months on, "were they allowed to approve this" cannot
    // be answered by re-running today's chain against yesterday's decision.
    const sql = read('migrations/009_approval_chain.sql');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS approved_via/, 'nothing records how a decision was authorised');
    const route = read('routes/portal.js');
    assert.match(route, /approved_via = \$2|approved_via = \$3/, 'approved_via is never written');
});

test('removing a manager cannot remove their reports', () => {
    // Comments stripped first — the note above that constraint explains why
    // there is no ON DELETE CASCADE, and matching the explanation made this
    // fail on a file that was correct. Second time today.
    const sql = read('migrations/009_approval_chain.sql')
        .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    // Scoped to that one statement. Slicing to end of file caught the CASCADE
    // on department_approvers, which is correct there — removing an employee
    // should remove their approver rows.
    const from = sql.indexOf('ADD CONSTRAINT employees_reporting_manager_fkey');
    const fk = sql.slice(from, sql.indexOf(';', from));
    assert.ok(!/ON DELETE/.test(fk), 'deleting a manager would affect their reports');
});

test('saving an unrelated edit cannot reroute somebody approvals', () => {
    const src = read('server.js');
    assert.match(src, /reporting_manager_id = COALESCE\(\$20, reporting_manager_id\)/,
        'reporting_manager_id is overwritten by any save that omits it');
});

test('HR stays available so a request always reaches someone', () => {
    const src = read('services/approvals.js');
    assert.match(src, /DEFAULT_CHAIN = 'manager,department,hr'/,
        'the default chain does not end with hr — requests can reach nobody');
});
