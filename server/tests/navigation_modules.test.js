/**
 * Every page in a sidebar must belong to the module whose sidebar shows it.
 *
 * MainLayout decides which top-level module is active by matching the path
 * against four lists. Those lists are maintained by hand, and navigation.js is
 * maintained separately — so a page can sit in attendanceSidebar while the
 * layout resolves its path to Personnel.
 *
 * The result is not a broken link. The link works. But the sidebar swaps to a
 * different module the moment you arrive, so the entry you just clicked is no
 * longer anywhere on screen, and the page cannot be found a second time except
 * by typing the URL. Geofences and Mobile Entry were both in that state, which
 * is how the owner came to ask where geofences were.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../client/src', p), 'utf8');

/** The four sidebars, and the module each belongs to. */
const SIDEBARS = {
    personnelSidebar: 'Personnel',
    deviceSidebar: 'Device',
    attendanceSidebar: 'Attendance',
    systemSidebar: 'System',
};

const sidebarPaths = () => {
    const nav = read('config/navigation.js');
    const starts = Object.keys(SIDEBARS)
        .map((name) => ({ name, at: nav.indexOf(`export const ${name}`) }))
        .filter((s) => s.at > -1)
        .sort((a, b) => a.at - b.at);

    assert.strictEqual(starts.length, Object.keys(SIDEBARS).length,
        'a sidebar has been renamed or removed');

    const out = {};
    starts.forEach((s, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].at : nav.length;
        out[s.name] = [...nav.slice(s.at, end).matchAll(/path: '([^']+)'/g)]
            .map((m) => m[1].split('?')[0]);   // query strings are the same page
    });
    return out;
};

/** The prefix lists MainLayout matches on, in the order it tries them. */
const moduleRules = () => {
    const layout = read('layouts/MainLayout.jsx');
    const rules = [...layout.matchAll(
        /\[([^\]]*)\]\.some\(p => path\.startsWith\(p\)\)\)\s*\{\s*setActiveModule\('(\w+)'\)/g
    )].map(([, list, module]) => ({
        module,
        prefixes: [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    }));

    assert.ok(rules.length >= 3,
        'could not read the module rules from MainLayout — has the shape changed?');
    return rules;
};

const resolve = (rules, p) =>
    rules.find((r) => r.prefixes.some((prefix) => p.startsWith(prefix)))?.module || 'Personnel';

test('every sidebar entry resolves to the module that shows it', () => {
    const rules = moduleRules();
    const wrong = [];

    for (const [sidebar, paths] of Object.entries(sidebarPaths())) {
        for (const p of paths) {
            const got = resolve(rules, p);
            if (got !== SIDEBARS[sidebar]) {
                wrong.push(`${p} is in ${sidebar} but MainLayout puts it under ${got}`);
            }
        }
    }

    assert.deepStrictEqual(wrong, [],
        'these pages swap the sidebar out from under whoever opens them, so the entry '
        + 'they just clicked disappears:\n    ' + wrong.join('\n    '));
});

test('the dashboard is its own module and not caught by a prefix', () => {
    const rules = moduleRules();
    // '/' would match nothing and fall through to Personnel; the layout handles
    // it before the lists, and that ordering is worth keeping.
    assert.match(read('layouts/MainLayout.jsx'),
        /if \(path === '\/' \|\| path === '\/dashboard'\)/,
        'the dashboard case has moved — check it still runs before the prefix lists');
    assert.strictEqual(resolve(rules, '/dashboard-extra'), 'Personnel');
});

test('the portal tab bar scrolls itself, never the page', () => {
    // Six tabs no longer fit a 375px phone. The bar used to widen the page, so
    // the entire portal scrolled sideways and two tabs hung outside the card —
    // on the surface whose primary device is a phone. Found by looking at the
    // rendered page, not by any unit test, which is why this pins the source.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
        path.join(__dirname, '../../client/src/pages/portal/EmployeePortal.jsx'), 'utf8');

    assert.match(src, /className="flex overflow-x-auto[^"]*rounded-xl/,
        'the portal tab bar lost its own overflow — six tabs will widen the page again');
    assert.match(src, /shrink-0 sm:flex-1[^`]*whitespace-nowrap/,
        'tab pills wrap or shrink again instead of scrolling');
});
