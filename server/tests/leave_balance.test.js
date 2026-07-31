/**
 * Leave balance arithmetic.
 *
 * The bug these exist to prevent: approving the same application twice used to
 * deduct the days twice. Nobody notices immediately — it surfaces months later
 * as an employee having fewer days than they took, with no record of why.
 */

const test = require('node:test');
const assert = require('node:assert');
const { planStatusChange } = require('../services/leave_balance');

test('approving a pending application consumes the days', () => {
    const plan = planStatusChange('Pending', 'Approved', 3);
    assert.strictEqual(plan.outcome, 'changed');
    assert.strictEqual(plan.usedDelta, 3);
});

test('approving an already-approved application does nothing', () => {
    const plan = planStatusChange('Approved', 'Approved', 3);
    assert.strictEqual(plan.outcome, 'unchanged');
    assert.strictEqual(plan.usedDelta, 0, 'a repeat approval must not deduct again');
});

test('ten repeat approvals still consume the days exactly once', () => {
    // Models a double click or a client retry loop
    let used = 0;
    let status = 'Pending';
    for (let i = 0; i < 10; i++) {
        const plan = planStatusChange(status, 'Approved', 2.5);
        used += plan.usedDelta;
        if (plan.outcome === 'changed') status = 'Approved';
    }
    assert.strictEqual(used, 2.5, `balance drifted: ${used} days consumed instead of 2.5`);
});

test('rejecting an approved application gives the days back', () => {
    const plan = planStatusChange('Approved', 'Rejected', 4);
    assert.strictEqual(plan.usedDelta, -4);
});

test('rejecting a pending application leaves the balance alone', () => {
    const plan = planStatusChange('Pending', 'Rejected', 4);
    assert.strictEqual(plan.outcome, 'changed');
    assert.strictEqual(plan.usedDelta, 0);
});

test('repeat rejections do not refund twice', () => {
    let used = 10;
    let status = 'Approved';
    for (let i = 0; i < 5; i++) {
        const plan = planStatusChange(status, 'Rejected', 3);
        used += plan.usedDelta;
        if (plan.outcome === 'changed') status = 'Rejected';
    }
    assert.strictEqual(used, 7, `refunded more than once: used ended at ${used}, expected 7`);
});

test('approve → reject → approve nets a single deduction', () => {
    let used = 0;
    let status = 'Pending';
    for (const next of ['Approved', 'Rejected', 'Approved']) {
        const plan = planStatusChange(status, next, 5);
        used += plan.usedDelta;
        if (plan.outcome === 'changed') status = next;
    }
    assert.strictEqual(used, 5, `expected 5 days consumed, got ${used}`);
});

test('half-day applications keep their fraction', () => {
    assert.strictEqual(planStatusChange('Pending', 'Approved', 0.5).usedDelta, 0.5);
    assert.strictEqual(planStatusChange('Approved', 'Rejected', 0.5).usedDelta, -0.5);
});

test('a missing or unparseable total_days is treated as zero, not NaN', () => {
    // A NaN reaching the UPDATE would corrupt the stored balance
    for (const bad of [null, undefined, '', 'abc']) {
        const plan = planStatusChange('Pending', 'Approved', bad);
        assert.strictEqual(plan.usedDelta, 0, `total_days=${bad} produced ${plan.usedDelta}`);
        assert.ok(!Number.isNaN(plan.usedDelta));
    }
});

test('numeric strings from the database are handled', () => {
    // pg returns NUMERIC columns as strings
    assert.strictEqual(planStatusChange('Pending', 'Approved', '2').usedDelta, 2);
});
