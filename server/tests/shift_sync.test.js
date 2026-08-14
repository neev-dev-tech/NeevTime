/**
 * Whether shift definitions arrive, and whether employees end up on one.
 *
 * The late report measures each employee against their assigned shift and
 * falls back to a hardcoded 09:00 for anyone without one. Nobody had one:
 * `default_shift_id` was never written by anything, so all 71 employees were
 * judged against a 09:00 start and anyone on a later shift was late every day
 * they worked.
 *
 * That is the same failure as the department bug — a column nothing populated,
 * producing a plausible number rather than an error — which is why it is
 * pinned rather than trusted.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Executable lines only. The comments explain the bug by naming the broken
// behaviour, and matching those would let a test pass against the code it
// exists to reject.
const strip = (src) => src
    .split('\n')
    .filter(l => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
    })
    .join('\n');

const core = strip(read('services/hrms-integration.js'));
const erp = strip(read('services/integrations/erpnext.js'));

test('the ERPNext adapter asks for Shift Type', () => {
    assert.ok(/resource\/Shift Type/.test(erp),
        'nothing requests Shift Type, so no shift can ever reach the shifts table');
    assert.ok(/start_time/.test(erp) && /end_time/.test(erp),
        'a shift without start and end times cannot measure lateness');
});

test('the Shift Type list asks for no optional fields', () => {
    // Frappe validates every requested field against the doctype and rejects
    // the ENTIRE query if one is unknown. Asking for the grace-period fields
    // up front failed the whole pull in production with "Field not permitted
    // in query: enable_entry_grace_period" — one optimistic field cost every
    // shift. The list call must stay minimal; details come per document.
    const i = erp.indexOf("get('/api/resource/Shift Type'");
    assert.ok(i !== -1, 'no Shift Type list request');
    const call = erp.slice(i, i + 320);
    assert.ok(!/fields:/.test(call),
        'the Shift Type list request names fields; any one of them being absent on ' +
        'this ERPNext version fails the whole query, not just that field');
});

test('grace periods are read defensively, flag or no flag', () => {
    // A period only counts when its enable flag is on — but on a version
    // without the flag, the presence of a period is the intent. Requiring the
    // flag would silently zero every grace period on those versions.
    assert.ok(/enable_entry_grace_period === undefined/.test(erp),
        'the entry grace period assumes its enable flag exists; on a version without it ' +
        'the grace period silently becomes zero');
    assert.ok(/enable_exit_grace_period === undefined/.test(erp),
        'the exit grace period assumes its enable flag exists');
});

test('one unreadable shift does not lose the others', () => {
    const i = erp.indexOf('async pullShifts');
    const fn = erp.slice(i, i + 2600);
    assert.ok(/for \(const name of names\)/.test(fn) && /catch/.test(fn),
        'a per-shift fetch failure must be caught, or one bad Shift Type costs the whole pull');
});

test('the employee pull asks for default_shift and carries it through', () => {
    assert.ok(/'default_shift'/.test(erp),
        'default_shift is not requested, so no employee can be assigned a shift');
    assert.ok(/shift_code:\s*emp\.default_shift/.test(erp),
        'default_shift is fetched but never mapped onto the returned employee');
});

test('shifts are upserted on their code, not inserted blindly', () => {
    const i = core.indexOf('INSERT INTO shifts');
    assert.ok(i !== -1, 'nothing writes to the shifts table');
    const q = core.slice(i, i + 900);
    assert.ok(/ON CONFLICT \(code\)/.test(q),
        'without ON CONFLICT (code) every sync either duplicates shifts or fails on the unique index');
});

test('a shift crossing midnight is flagged as a night shift', () => {
    // end < start means the shift runs through midnight. Untreated it reads as
    // a negative-length day, and everyone on it looks absent.
    assert.ok(/is_night_shift/.test(core),
        'a shift ending before it starts is not detected, so night shifts compute as negative-length days');
});

test('default_shift_id is written on conflict, not only on insert', () => {
    const i = core.indexOf('INSERT INTO employees');
    const q = core.slice(i, i + 1100);
    assert.ok(/default_shift_id\s*=\s*COALESCE\(EXCLUDED\.default_shift_id,\s*employees\.default_shift_id\)/.test(q),
        'default_shift_id must be in the DO UPDATE clause and COALESCE onto the stored value — every ' +
        'employee already exists, so an insert-only mapping assigns nobody, and a bare assignment ' +
        'would wipe a shift set by hand');
});

test('an unknown shift resolves to null rather than being invented', () => {
    const i = core.indexOf('const resolveShift');
    assert.ok(i !== -1, 'no shift resolution step');
    const fn = core.slice(i, i + 700);
    assert.ok(!/INSERT INTO shifts/.test(fn),
        'an unrecognised shift name must not be created on the fly — a shift needs real start and end ' +
        'times, and guessing them silently decides who counts as late');
});

test('shifts are pulled before employees, and a shift failure does not stop them', () => {
    const shiftCall = core.indexOf('syncShiftsFromHRMS(integration)');
    const empPull = core.indexOf('await integration.pullEmployees()');
    assert.ok(shiftCall !== -1 && shiftCall < empPull,
        'shifts must be pulled before employees, or every employee shift fails to resolve');

    const around = core.slice(Math.max(0, shiftCall - 300), shiftCall + 300);
    assert.ok(/try\s*{/.test(around) && /catch/.test(around),
        'a failed shift pull must not abort the employee pull — employees without a shift are still ' +
        'worth having, and the fallback start time keeps working');
});

test('the shift pull is logged whatever it does — including nothing', () => {
    // The first version returned early on an empty result, before writing a
    // log row, and reported a failure only as a console warning. Both cases
    // then looked identical in integration_sync_logs to a sync that never ran,
    // which is the one question that log exists to answer. It cost a full
    // deploy cycle to work out which had happened.
    const i = core.indexOf('const syncShiftsFromHRMS');
    assert.ok(i !== -1, 'no shift sync');
    const fn = core.slice(i, core.indexOf('const syncEmployeesFromHRMS'));

    const logged = fn.match(/logSync\('shifts'/g) || [];
    assert.ok(logged.length >= 3,
        `the shift sync writes ${logged.length} log rows; it needs one for success, ` +
        'one for an empty result and one for a failure, or those outcomes are ' +
        'indistinguishable from never having run');

    assert.ok(/'failed'/.test(fn),
        'a failed shift pull is not recorded in the sync log, only in the container log');
});
