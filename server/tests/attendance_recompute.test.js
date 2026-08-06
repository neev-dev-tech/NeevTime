/**
 * Finished days must get a final verdict.
 *
 * The engine refuses to judge a day still in progress — scoring at 13:00 would
 * label everyone Short Day — so it records Present provisionally. Nothing ever
 * came back once the day ended, because the only recompute trigger is a punch
 * arriving, and the last punch of a day happens while that day is still
 * running. The provisional label became the permanent one.
 *
 * Invisible for anyone working a normal day, since provisional Present is also
 * the right answer. Measured over one week in production: 19 of 429 Present
 * rows should have read Short Day, Half Day or Miss Punch, three of them
 * showing a person present for zero minutes.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('a recompute job exists and is started at boot', () => {
    const svc = read('services/attendance_recompute.js');
    assert.ok(/recomputeFinishedDays/.test(svc), 'the recompute function is gone');

    const server = read('server.js');
    assert.ok(/startRecomputeJob\(\)/.test(server),
        'the recompute job is never started, so finished days keep their provisional status');
});

test('the recompute never touches today', () => {
    // Today is still in progress. Recomputing it would re-apply the very
    // provisional verdict this exists to replace, and could relabel people
    // mid-shift.
    const svc = read('services/attendance_recompute.js');
    assert.ok(/subtract\(1, 'day'\)/.test(svc),
        'the range must end yesterday; including today defeats the purpose');
});

test('it recomputes more than one day', () => {
    // Readers buffer when they lose the network and can deliver punches hours
    // later, landing them on a day already scored.
    const svc = read('services/attendance_recompute.js');
    const days = /recomputeFinishedDays = async \(days = (\d+)\)/.exec(svc);
    assert.ok(days, 'the day count is no longer configurable');
    assert.ok(Number(days[1]) >= 2,
        `recomputing only ${days[1]} day misses punches that arrive late for earlier days`);
});

test('hand-corrections survive a recompute', () => {
    // Manual Entry and approved regularisations set is_finalized. A nightly job
    // that silently reverted a human decision about someone's pay would be far
    // worse than the bug it fixes.
    const engine = read('services/attendance_engine.js');
    assert.ok(/WHERE attendance_daily_summary\.is_finalized IS NOT TRUE/.test(engine),
        'the upsert no longer protects finalized rows; a recompute would overwrite manual corrections');
});

test('a restart cannot skip or repeat the nightly run', () => {
    // Sleeping until a computed time loses the run to any redeploy; no date
    // guard means every restart after the hour recomputes again.
    const svc = read('services/attendance_recompute.js');
    assert.ok(/lastRunDate === today/.test(svc), 'nothing prevents the job running twice in a day');
    assert.ok(/setInterval/.test(svc), 'a long sleep would be lost on restart; poll instead');
    assert.ok(/getHours\(\) >= RUN_AFTER_HOUR/.test(svc),
        'startup does not mark an already-passed run as done, so a daytime restart recomputes needlessly');
});

test('the job runs after midnight, not during the working day', () => {
    const svc = read('services/attendance_recompute.js');
    const hour = /RUN_AFTER_HOUR = (\d+)/.exec(svc);
    assert.ok(hour, 'the run hour is gone');
    assert.ok(Number(hour[1]) >= 1 && Number(hour[1]) <= 5,
        `running at ${hour[1]}:00 risks catching night-shift punches or colliding with the working day`);
});
