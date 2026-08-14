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

test('grace periods are read together with the flag that enables them', () => {
    // A late_entry_grace_period of 15 means nothing when
    // enable_entry_grace_period is unticked. Reading the number alone applies
    // a grace period the HR team believes is switched off.
    assert.ok(/enable_entry_grace_period\s*\?/.test(erp),
        'the entry grace period is read without checking whether it is enabled');
    assert.ok(/enable_exit_grace_period\s*\?/.test(erp),
        'the exit grace period is read without checking whether it is enabled');
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
