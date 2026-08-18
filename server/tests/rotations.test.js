/**
 * Rotation patterns and shift swaps.
 *
 * A rotation GENERATES employee_schedules rows: the engine and the Schedule
 * screens need no knowledge of patterns, and history survives a pattern
 * change. These pin the arithmetic and the rules that keep generation safe.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { slotFor } = require('../services/rotations');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('slots step through the pattern and wrap', () => {
    // Weekly two-slot pattern anchored Monday the 17th.
    assert.strictEqual(slotFor('2026-08-17', '2026-08-17', 7, 2), 0);
    assert.strictEqual(slotFor('2026-08-24', '2026-08-17', 7, 2), 1);
    assert.strictEqual(slotFor('2026-08-31', '2026-08-17', 7, 2), 0);
});

test('offsets stagger crews so both shifts stay covered', () => {
    // Crew B, offset 1: on week one it works slot 1 while crew A works slot 0.
    assert.strictEqual(slotFor('2026-08-17', '2026-08-17', 7, 2, 1), 1);
    assert.strictEqual(slotFor('2026-08-24', '2026-08-17', 7, 2, 1), 0);
});

test('dates before the anchor generate nothing', () => {
    assert.strictEqual(slotFor('2026-08-10', '2026-08-17', 7, 2), null);
});

test('a hand-entered schedule beats the generator', () => {
    // The generator owns only rows it marked. Overwriting a human decision
    // with a pattern would undo exactly the exceptions patterns exist to have.
    const src = read('services/rotations.js');
    assert.match(src, /existing\.reason !== marker\) continue/,
        'the generator overwrites hand-entered schedules');
    assert.match(src, /rotation:\$\{a\.rotation_id\}/, 'generated rows are not marked as generated');
});

test('a swap needs the counterpart before any approver sees it', () => {
    // An approver countersigns an agreement, not a proposal one side has not
    // seen. The queue filter and the decision route both enforce it.
    const svc = read('services/approvals.js');
    assert.match(svc, /counterpart_accepted IS TRUE/,
        'unaccepted swaps reach approvers');
    const portal = read('routes/portal.js');
    assert.match(portal, /has not accepted this swap yet/,
        'the decision route approves swaps the counterpart never saw');
    assert.match(portal, /counterpart_code = \$3 AND LOWER\(status\) = 'pending'/,
        'someone other than the named counterpart can answer a swap');
});

test('an approved swap becomes two one-day schedule overrides', () => {
    const src = read('services/rotations.js');
    assert.match(src, /swap:\$\{swap\.id\}/, 'applied swaps are not traceable to their request');
    assert.match(src, /VALUES \(\$1, \$2, \$3, \$3, \$4, true\)/,
        'a swap override is not confined to exactly one day');
    const portal = read('routes/portal.js');
    assert.match(portal, /applySwap\(Number\(id\)\)/, 'approving a swap changes no schedule');
});
