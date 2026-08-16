/**
 * Every module the server requires must actually parse.
 *
 * This exists because a syntax error reached CI on 2026-08-16 with the full
 * 240-test suite passing. The cause was a backtick inside a SQL comment inside
 * a JS template literal:
 *
 *     const result = await db.query(`
 *         -- columns that exist on `devices` and have never existed...
 *                                    ^ terminates the template string
 *
 * Nothing in the suite required routes/organization.js — the tests that cover
 * that route read it as text and run its SQL directly against Postgres, which
 * is exactly the right way to test the query and completely blind to whether
 * the file is valid JavaScript. The server crashed on boot instead:
 *
 *     SyntaxError: missing ) after argument list
 *
 * The same shape as the missing-import problem the client's lint:break gate was
 * written for. A build that does not resolve, or a suite that does not load,
 * proves less than it appears to.
 *
 * Requiring a module runs its top level, so this also catches a route file that
 * throws while initialising.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..');

const jsFilesIn = (dir) => {
    const full = path.join(SERVER, dir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full)
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join(dir, f));
};

// Routes and services are what the server wires up at boot. Scripts are
// deliberately excluded: several are one-off migrations that connect on load.
const MODULES = [...jsFilesIn('routes'), ...jsFilesIn('services')];

test('every route and service module parses and loads', () => {
    assert.ok(MODULES.length > 5, 'found almost nothing to load — has the layout changed?');

    const broken = [];
    for (const rel of MODULES) {
        try {
            require(path.join(SERVER, rel));
        } catch (err) {
            // A module that cannot find its own dependencies is a different
            // problem from one that cannot be parsed, and only the second is
            // what this test is for. Both are worth failing on, but the message
            // should say which.
            broken.push(`${rel}\n      ${err.constructor.name}: ${err.message.split('\n')[0]}`);
        }
    }

    assert.deepStrictEqual(broken, [],
        `modules that will crash the server on boot:\n    ${broken.join('\n    ')}`);
});
