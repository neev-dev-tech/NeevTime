/**
 * ADMS command vocabulary.
 *
 * The readers answer a fixed set of keywords and reject anything else with
 * Return=-1004 — a failure that looks identical to a network problem from the
 * app's side, because the command simply never succeeds and eventually
 * dead-letters.
 *
 * Employee deletion shipped with `DATA DELETE USER`, which is not one of those
 * keywords. Production ran it 12 times and got 12 rejections, against 9,385
 * accepted `DATA DELETE FACE` commands. The visible effect was worse than a
 * failed sync: the employee disappeared from the app while their finger kept
 * opening the door.
 *
 * These read the source rather than the database, so the check survives a fresh
 * install with an empty queue.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Keywords this fleet actually accepts after DATA <verb>. The first five are
 * confirmed against production, which has thousands of successful commands for
 * each. USERVF, facev7 and templatev10 are deliberately absent: all three were
 * tried and rejected every single time.
 */
const KNOWN_ENTITIES = new Set([
    'USERINFO', 'FINGERTMP', 'FACE', 'BIODATA', 'ATTLOG',
    'USERPIC', 'SMS', 'WORKCODE', 'OPLOG'
]);

const SOURCES = [
    'server.js',
    'routes/device_sync.js',
    'services/adms.js',
    'scripts/debug_delete_logic.js'
];

/** Every `DATA <verb> <entity>` literal built anywhere in the server. */
const commandLiterals = () => {
    const found = [];
    for (const rel of SOURCES) {
        const file = path.join(__dirname, '..', rel);
        if (!fs.existsSync(file)) continue;
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            const m = line.match(/DATA\s+(UPDATE|DELETE|QUERY)\s+([A-Za-z]+)/);
            if (m) found.push({ file: rel, line: i + 1, verb: m[1], entity: m[2].toUpperCase() });
        });
    }
    return found;
};

test('every DATA command targets an entity the readers recognise', () => {
    const bad = commandLiterals().filter(c => !KNOWN_ENTITIES.has(c.entity));
    assert.deepStrictEqual(bad, [],
        'these will be rejected with Return=-1004:\n'
        + bad.map(c => `  ${c.file}:${c.line} — DATA ${c.verb} ${c.entity}`).join('\n'));
});

test('"USER" is never used where "USERINFO" is meant', () => {
    // The exact regression. USER is a prefix of USERINFO, so a careless match
    // would pass; compare the whole word.
    const offenders = commandLiterals().filter(c => c.entity === 'USER');
    assert.strictEqual(offenders.length, 0,
        'DATA ... USER is not a valid entity:\n'
        + offenders.map(c => `  ${c.file}:${c.line}`).join('\n'));
});

test('deleting an employee clears their biometrics as well as their record', () => {
    // Removing the user row on a device does not reliably take enrolled
    // templates with it, and a stranded template can still be matched.
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const block = src.slice(src.indexOf('Queue Device Deletion Commands'));
    assert.ok(block.includes('DATA DELETE USERINFO PIN='), 'user record is not removed from devices');
    assert.ok(block.includes('DATA DELETE FINGERTMP PIN='), 'fingerprints are left on devices');
    assert.ok(block.includes('DATA DELETE FACE PIN='), 'face templates are left on devices');
});
