/**
 * Contractors — the companies whose people work here and who invoice for it.
 *
 * The question this feature exists to answer is "what do I owe Sharma Services
 * for August". Everything below protects the parts of that answer somebody
 * would act on: the hours, and who they belong to.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the route loads', () => {
    assert.doesNotThrow(() => require('../routes/contractors'));
});

test('hours come from the stored summary, not recomputed', () => {
    // An invoice derived from different arithmetic than the register would be
    // the version the client argues with, and they would be right to.
    const src = read('routes/contractors.js');
    assert.match(src, /FROM employees e\s*\n\s*LEFT JOIN attendance_daily_summary/,
        'the contractor summary recomputes hours instead of reading the daily summary');
    assert.ok(!/FROM attendance_logs/.test(src),
        'hours are being derived from raw punches, which will disagree with the register');
});

test('no amount is shown without a rate somebody agreed', () => {
    // Many agencies bill a fixed monthly amount per head. A rate invented to
    // fill the column would end up in a total quoted at that agency.
    const src = read('routes/contractors.js');
    assert.match(src, /billable: rate \?/,
        'a billable amount is produced even when no rate is set');
});

test('deleting a contractor with people is refused, with the count', () => {
    // The alternatives are orphaning their attendance from the agency owed for
    // it, or deleting people whose attendance is payroll evidence.
    const src = read('routes/contractors.js');
    const del = src.slice(src.indexOf("router.delete('/contractors/:id'"));
    assert.match(del, /SELECT count\(\*\)::int AS n FROM employees WHERE contractor_id/,
        'a contractor can be deleted while people are still billed to it');
    assert.match(del, /employee_count/, 'the refusal does not say how many, so it cannot be acted on');
    assert.match(del, /deactivate/, 'the refusal does not name the alternative');
});

test('two agencies cannot share a name', () => {
    // Which one gets invoiced would be a coin toss.
    const sql = read('migrations/008_contractors.sql');
    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_name ON contractors \(LOWER\(name\)\)/,
        'duplicate contractor names are possible — "Sharma Services" twice, invoiced once');
    const src = read('routes/contractors.js');
    assert.match(src, /err\.code === '23505'/, 'a duplicate name returns a 500 instead of saying what is wrong');
});

test('moving somebody between agencies is audited', () => {
    // Who a person is billed under decides who gets paid for their hours.
    const sql = read('migrations/008_contractors.sql');
    assert.match(sql, /CREATE TRIGGER audit_contractors/, 'contractor changes are not audited');
});

test('saving an unrelated edit cannot unbill somebody', () => {
    // The employee update writes every column it names. contractor_id has to be
    // COALESCE'd for the same reason attendance_required was: a caller that
    // does not send it would silently detach the person from their agency.
    const src = read('server.js');
    assert.match(src, /contractor_id = COALESCE\(\$19, contractor_id\)/,
        'contractor_id is overwritten by any save that omits it');
});

test('the foreign key has no ON DELETE that would take employees with it', () => {
    const sql = read('migrations/008_contractors.sql');
    const fk = sql.slice(sql.indexOf('employees_contractor_id_fkey'));
    assert.ok(!/ON DELETE CASCADE/.test(fk),
        'deleting a contractor would delete employees, and their attendance is payroll evidence');
});

test('the health endpoint is not behind the contractors guard', () => {
    // app.use('/api', authenticateToken, router) applies that middleware to
    // EVERY /api request that reaches it, not only the router's own paths.
    // Mounting contractors above /api/health made the healthcheck return 401,
    // so every container reported unhealthy — caught by the CI stack job, and
    // invisible to every unit test.
    const src = read('server.js');
    assert.ok(src.indexOf("app.get('/api/health'") < src.indexOf("require('./routes/contractors')"),
        'contractors is mounted above /api/health — the healthcheck will 401');
});
