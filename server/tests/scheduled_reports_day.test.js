/**
 * Weekly auto-report day.
 *
 * Settings stores the day as a name ("Wednesday"); the scheduler read it with
 * Number(), got NaN and fell back to Monday, so a weekly report went out on
 * Monday whatever day was chosen. Sunday (0) was also lost to `|| 1`.
 */

const test = require('node:test');
const assert = require('node:assert');
const { weekdayNumber, normalizeType, parseRecipientList, parseRecipients } = require('../services/scheduled-reports');

test('day names map to getDay() numbers', () => {
    assert.strictEqual(weekdayNumber('Sunday'), 0);
    assert.strictEqual(weekdayNumber('Monday'), 1);
    assert.strictEqual(weekdayNumber('wednesday'), 3);
    assert.strictEqual(weekdayNumber(' Saturday '), 6);
});

test('numbers still work, and Sunday (0) survives', () => {
    assert.strictEqual(weekdayNumber(0), 0);
    assert.strictEqual(weekdayNumber('5'), 5);
});

test('anything else falls back to Monday', () => {
    assert.strictEqual(weekdayNumber(''), 1);
    assert.strictEqual(weekdayNumber(undefined), 1);
    assert.strictEqual(weekdayNumber('Funday'), 1);
    assert.strictEqual(weekdayNumber(9), 1);
});

test('the weekly schedule keeps Sunday instead of coercing 0 to Monday', () => {
    const src = require('node:fs').readFileSync(require.resolve('../services/scheduled-reports'), 'utf8');
    assert.ok(!/targetDay = scheduleDay \|\| 1/.test(src), 'scheduleDay || 1 turns Sunday into Monday');
});

test('report types from Settings are understood by the runner', () => {
    // Settings wrote daily_attendance; the runner only knew daily-attendance,
    // so every auto report failed with "Unknown report type".
    assert.strictEqual(normalizeType('daily_attendance'), 'daily-attendance');
    assert.strictEqual(normalizeType('monthly_summary'), 'monthly-summary');
    assert.strictEqual(normalizeType('late-early'), 'late-early');
    const src = require('node:fs').readFileSync(require.resolve('../services/scheduled-reports'), 'utf8');
    assert.ok(!/reportType: '[a-z]+_[a-z]+'/.test(src), 'Settings sync writes underscore report types again');
});

test('history reads a sorted, existing column and returns recipient lists', () => {
    const src = require('node:fs').readFileSync(require.resolve('../services/scheduled-reports'), 'utf8');
    assert.ok(!/rh\.generated_at/.test(src), 'report_history has no generated_at column');
    assert.deepStrictEqual(parseRecipientList('{a@x.com,"b@y.com"}'), ['a@x.com', 'b@y.com']);
    assert.deepStrictEqual(parseRecipientList(['a']), ['a']);
    assert.deepStrictEqual(parseRecipientList(null), []);
});

test('recipients from a json setting are real addresses', () => {
    assert.deepStrictEqual(parseRecipients('["a@x.com","b@y.com"]'), ['a@x.com', 'b@y.com']);
    assert.deepStrictEqual(parseRecipients(['a@x.com', ' ']), ['a@x.com']);
    assert.deepStrictEqual(parseRecipients('a@x.com, b@y.com;c@z.com'), ['a@x.com', 'b@y.com', 'c@z.com']);
    assert.deepStrictEqual(parseRecipients(''), []);
});
