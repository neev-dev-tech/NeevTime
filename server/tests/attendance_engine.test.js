/**
 * Attendance calculation.
 *
 * calculateDayStats decides what a person's day was worth — Present, Half Day,
 * Short Day — and how much overtime they earned. Those values feed payroll, so a
 * silent change here costs somebody money without producing an error anywhere.
 *
 * Rules are passed in explicitly rather than read from the database, which keeps
 * these tests pure and makes the boundary conditions the subject rather than
 * whatever the Settings page happens to hold today.
 */

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../services/attendance_engine');

// Mirrors the shipped defaults: 8h full day, 4h half day, OT after 9h,
// 15 minute grace on a 09:00 start, Sundays off, Saturdays worked.
const RULES = {
    timezone: 'Asia/Kolkata',
    shiftStart: '09:00',
    graceMinutes: 15,
    fullDayMinutes: 8 * 60,
    halfDayMinutes: 4 * 60,
    overtimeAfterMinutes: 9 * 60,
    allSundaysOff: true,
    saturdaysOff: { 1: false, 2: false, 3: false, 4: false, 5: false }
};

// 2026-07-15 is a Wednesday; 2026-07-19 a Sunday; 2026-07-11 the 2nd Saturday.
const WEDNESDAY = '2026-07-15';
const SUNDAY = '2026-07-19';
const SECOND_SATURDAY = '2026-07-11';

const at = (date, time) => `${date}T${time}:00+05:30`;
const day = (logs, date = WEDNESDAY, rules = RULES) =>
    engine.calculateDayStats('T1', date, logs, rules);

// ───────────────────────────── status thresholds ─────────────────────────────

test('a full 9 hour day is Present', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '18:00')]);
    assert.strictEqual(s.status, 'Present');
    assert.strictEqual(s.durationMinutes, 540);
});

test('exactly the full-day threshold is Present, not Half Day', () => {
    // 8h on the nose — the boundary payroll argues about
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '17:00')]);
    assert.strictEqual(s.status, 'Present');
    assert.strictEqual(s.durationMinutes, 480);
});

test('one minute under the full day drops to Half Day', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '16:59')]);
    assert.strictEqual(s.status, 'Half Day');
});

test('exactly the half-day threshold is Half Day, not Short Day', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '13:00')]);
    assert.strictEqual(s.status, 'Half Day');
    assert.strictEqual(s.durationMinutes, 240);
});

test('one minute under the half day is Short Day', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '12:59')]);
    assert.strictEqual(s.status, 'Short Day');
});

test('a single punch is Miss Punch, not a zero-length day', () => {
    const s = day([at(WEDNESDAY, '09:00')]);
    assert.strictEqual(s.status, 'Miss Punch');
    assert.strictEqual(s.outTime, null);
});

test('no punches on a working day is Absent', () => {
    assert.strictEqual(day([]).status, 'Absent');
});

// ────────────────────────────────── overtime ─────────────────────────────────

test('overtime accrues only past the threshold', () => {
    const s = day([at(WEDNESDAY, '08:00'), at(WEDNESDAY, '19:00')]); // 11h
    assert.strictEqual(s.durationMinutes, 660);
    assert.strictEqual(s.otMinutes, 120);
});

test('a day exactly at the overtime threshold earns none', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '18:00')]); // 9h
    assert.strictEqual(s.otMinutes, 0, 'overtime must start after the threshold, not at it');
});

test('a short day never produces negative overtime', () => {
    const s = day([at(WEDNESDAY, '09:00'), at(WEDNESDAY, '11:00')]);
    assert.strictEqual(s.otMinutes, 0);
});

// ──────────────────────────────── lateness ───────────────────────────────────

test('arriving within the grace period is not late', () => {
    const s = day([at(WEDNESDAY, '09:15'), at(WEDNESDAY, '18:00')]);
    assert.strictEqual(s.lateMinutes, 0, '09:15 is the last non-late minute with 15 min grace');
});

test('arriving after the grace period is late from the end of grace', () => {
    const s = day([at(WEDNESDAY, '09:45'), at(WEDNESDAY, '18:00')]);
    assert.strictEqual(s.lateMinutes, 30, 'late is measured from 09:15, not 09:00');
});

test('arriving early is not negative lateness', () => {
    const s = day([at(WEDNESDAY, '08:30'), at(WEDNESDAY, '18:00')]);
    assert.strictEqual(s.lateMinutes, 0);
});

// ───────────────────────────────── weekly off ────────────────────────────────

test('an empty Sunday is Weekly Off, not Absent', () => {
    assert.strictEqual(day([], SUNDAY).status, 'Weekly Off');
});

test('working on a Sunday still records the hours', () => {
    const s = day([at(SUNDAY, '09:00'), at(SUNDAY, '18:00')], SUNDAY);
    assert.strictEqual(s.status, 'Present');
    assert.strictEqual(s.durationMinutes, 540);
});

test('Saturdays are worked unless configured off', () => {
    assert.strictEqual(day([], SECOND_SATURDAY).status, 'Absent');
});

test('the configured nth Saturday becomes Weekly Off', () => {
    const rules = { ...RULES, saturdaysOff: { ...RULES.saturdaysOff, 2: true } };
    assert.strictEqual(day([], SECOND_SATURDAY, rules).status, 'Weekly Off');
    // The 1st Saturday, 2026-07-04, is still a working day
    assert.strictEqual(day([], '2026-07-04', rules).status, 'Absent');
});

test('Sundays can be turned into working days', () => {
    const rules = { ...RULES, allSundaysOff: false };
    assert.strictEqual(day([], SUNDAY, rules).status, 'Absent');
});

// ────────────────────────── settings actually apply ──────────────────────────

test('changing the thresholds changes the verdict for the same day', () => {
    const logs = [at(WEDNESDAY, '09:00'), at(WEDNESDAY, '15:00')]; // 6h
    assert.strictEqual(day(logs).status, 'Half Day');

    const relaxed = { ...RULES, fullDayMinutes: 6 * 60 };
    assert.strictEqual(day(logs, WEDNESDAY, relaxed).status, 'Present');
});

// ──────────────────────────── ordering and edges ─────────────────────────────

test('punches arriving out of order still give the first in and last out', () => {
    const s = day([
        at(WEDNESDAY, '13:20'),
        at(WEDNESDAY, '18:00'),
        at(WEDNESDAY, '09:00'),
        at(WEDNESDAY, '14:05')
    ]);
    assert.strictEqual(s.durationMinutes, 540, 'duration must span first to last punch');
    assert.strictEqual(s.status, 'Present');
});

test('an early-morning punch belongs to its own day, not the previous one', () => {
    // 02:00 IST is the previous day in UTC — the bug class that shifted reports
    const s = day([at(WEDNESDAY, '02:00'), at(WEDNESDAY, '10:30')]);
    assert.strictEqual(s.date, WEDNESDAY);
    assert.strictEqual(s.durationMinutes, 510);
});

test('calculateDayStats works without explicit rules, using the defaults', () => {
    const s = engine.calculateDayStats('T1', WEDNESDAY, [at(WEDNESDAY, '09:00'), at(WEDNESDAY, '18:00')]);
    assert.strictEqual(s.status, 'Present');
});

// ───────────────────── a day that has not finished yet ──────────────────────

// These use the real current date, because "in progress" is defined relative to
// now. Mid-morning, a person who has punched in is at work — not a Short Day and
// not a Miss Punch. Judging an unfinished day was labelling the whole workforce
// Short Day every morning and showing 0% attendance on the dashboard.
const todayStr = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

test('someone still at work today is Present, not Short Day', () => {
    const today = todayStr();
    const s = day([`${today}T09:00:00+05:30`, `${today}T11:30:00+05:30`], today);
    assert.strictEqual(s.status, 'Present', 'a 2.5h-so-far day was scored as if it had ended');
    assert.strictEqual(s.durationMinutes, 150, 'hours so far are still recorded');
});

test('a single punch today is Present, not Miss Punch', () => {
    const today = todayStr();
    const s = day([`${today}T09:00:00+05:30`], today);
    assert.strictEqual(s.status, 'Present', 'someone who has not left yet has not missed a punch');
});

test('no punch at all today is still Absent', () => {
    const today = todayStr();
    const s = day([], today);
    assert.ok(['Absent', 'Weekly Off'].includes(s.status));
});

test('yesterday is complete, so thresholds do apply', () => {
    const d = new Date(Date.now() - 86400000);
    const p = (n) => String(n).padStart(2, '0');
    const y = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const s = day([`${y}T09:00:00+05:30`, `${y}T11:30:00+05:30`], y);
    assert.strictEqual(s.status, 'Short Day', 'a finished 2.5h day should be judged');
});

test('isWeekOff is driven by the rules it is given', () => {
    assert.strictEqual(engine.isWeekOff(SUNDAY, RULES), true);
    assert.strictEqual(engine.isWeekOff(WEDNESDAY, RULES), false);
});
