/**
 * The notification summary, and the module references it depends on.
 *
 * Adding the pending-device count to this endpoint introduced a call to
 * `settings.get(...)` in server.js, where `settings` was never required —
 * server.js imports `settingsRouter` (the HTTP surface) but not `utils/settings`
 * (the value reader), and the two are easy to confuse. `node --check` passes on
 * that happily: it is valid syntax, and only a ReferenceError at request time.
 * Because the handler wraps everything in try/catch, the symptom would have been
 * a 500 from the header bell on every poll for every user, with the real cause
 * buried in a log.
 *
 * So this checks two things: that the endpoint still reports what the client
 * reads, and that every module-style identifier it uses is actually imported.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_JS = path.join(__dirname, '../server.js');
const src = () => fs.readFileSync(SERVER_JS, 'utf8');

/** The body of the /api/notifications/summary handler. */
const summaryHandler = () => {
    const all = src();
    const start = all.indexOf("app.get('/api/notifications/summary'");
    assert.ok(start > -1, 'the notifications summary endpoint has been removed or renamed');
    // Ends at the next top-level app.<verb>( registration
    const rest = all.slice(start + 10);
    const end = rest.search(/\napp\.(get|post|put|patch|delete|use)\(/);
    return all.slice(start, end === -1 ? undefined : start + 10 + end);
};

test('the summary reports every field the notification bell reads', () => {
    // Kept in step with client/src/components/NotificationCenter.jsx.
    const body = summaryHandler();
    for (const field of [
        'pending_leave',
        'pending_regularizations',
        'devices_offline',
        'devices_pending_approval',
        'device_approval_enforced'
    ]) {
        assert.ok(body.includes(field), `the summary no longer returns ${field}`);
    }
});

test('pending devices exclude retired ones', () => {
    // A retired reader is not awaiting anything, and counting it would put a
    // permanent unclearable badge in the header.
    const body = summaryHandler();
    assert.ok(/approval_status = 'pending'/.test(body), 'pending devices are not filtered by approval_status');
    assert.ok(/status IS DISTINCT FROM 'retired'/.test(body), 'retired devices are counted as awaiting approval');
});

test('every module identifier used in server.js is required', () => {
    // The actual regression: settings.get(...) with no require('./utils/settings').
    const all = src();

    // Identifiers bound by a top-level require, destructured or not.
    const imported = new Set();
    for (const m of all.matchAll(/(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*require\(/g)) {
        const bound = m[1];
        if (bound.startsWith('{')) {
            bound.slice(1, -1).split(',').forEach(part => {
                const name = part.split(':').pop().trim();
                if (name) imported.add(name);
            });
        } else {
            imported.add(bound);
        }
    }

    // Locally declared names — anything assigned, destructured, or a parameter —
    // so ordinary locals are not mistaken for missing imports.
    const local = new Set();
    for (const m of all.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    for (const m of all.matchAll(/\{([^{}]*)\}\s*=/g)) {
        m[1].split(',').forEach(p => {
            const n = p.split(':').pop().split('=')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
        });
    }
    for (const m of all.matchAll(/\(([^()]*)\)\s*=>/g)) {
        m[1].split(',').forEach(p => {
            const n = p.split('=')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
        });
    }
    for (const m of all.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^()]*)\)/g)) {
        m[1].split(',').forEach(p => {
            const n = p.split('=')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
        });
    }

    // Globals and built-ins that are never imported.
    const AMBIENT = new Set([
        'console', 'process', 'require', 'module', 'exports', 'JSON', 'Math', 'Date',
        'Promise', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Error', 'Map',
        'Set', 'RegExp', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout',
        'clearInterval', 'globalThis', '__dirname', '__filename', 'res', 'req',
        'next', 'err', 'e', 'this'
    ]);

    // Module-style calls: identifier.method(...) at least three chars long. The
    // lookbehind is essential — without it `result.rows.map(` reads `rows` as a
    // bare identifier, and the test drowns in false positives.
    const used = new Set();
    for (const m of all.matchAll(/(?<![.\w$])([a-z][\w$]{2,})\.[a-zA-Z_$][\w$]*\s*\(/g)) used.add(m[1]);

    const missing = [...used].filter(n => !imported.has(n) && !local.has(n) && !AMBIENT.has(n));

    assert.deepStrictEqual(missing, [],
        'these are called as modules but never required or declared — a ReferenceError at request time:\n  '
        + missing.join('\n  '));
});
