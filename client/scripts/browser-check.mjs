#!/usr/bin/env node
/**
 * Load every screen in a real browser and fail on anything that breaks.
 *
 *     node scripts/browser-check.mjs                      # http://localhost
 *     BASE=https://192.168.1.237 node scripts/browser-check.mjs
 *
 * Roadmap 0.3, the half that scripts/smoke.mjs cannot reach. That one asks the
 * API for a response; this one renders the page the way a person does.
 *
 * The distinction matters here more than usual. Two regressions reached
 * production in one week that opening the page would have caught in seconds:
 * a crash from `transferType.toLowerCase()` on state initialised to null, and
 * an emptied Resign list from a query parameter the server never read. Neither
 * was visible to any API check — the endpoints were fine, the screens were not.
 * A vite build does not catch them either, because esbuild does not resolve
 * identifiers, so a missing import ships as a blank page.
 *
 * What counts as a failure:
 *   - an uncaught exception in the page
 *   - a console error
 *   - a failed request for a script or stylesheet
 *   - a root element that renders nothing
 *
 * Deliberately NOT a failure: an API returning 4xx/5xx for missing data. On the
 * empty CI database many screens legitimately have nothing to show; a screen
 * that renders "no records" is working. Those are reported and not fatal, so
 * this stays a check on the interface rather than a second copy of the smoke
 * test.
 *
 * Uses puppeteer-core against the system Chrome — no bundled browser download.
 */

import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin';

const CHROME = process.env.CHROME_PATH
    || ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        .find((p) => existsSync(p));

// Every authenticated screen. Kept in the order the sidebar presents them so a
// person reading a failure can find the page.
const ROUTES = [
    '/', '/employees', '/departments', '/positions', '/areas', '/resign',
    '/employees/deleted', '/employee-docs',
    '/reports/registers', '/reports/payroll', '/reports', '/reports/legacy',
    '/reports/first-last', '/reports/insights', '/advanced-reports', '/export', '/import',
    // The whole report tail. Two of the first three report screens a user
    // opened were broken while this list skipped them — every dashboard card
    // path is a screen, and every screen gets loaded.
    '/reports/transactions', '/reports/mobile-transactions', '/reports/total-punches',
    '/reports/scheduled-log', '/reports/time-card', '/reports/missed-punch',
    '/reports/late-coming', '/reports/early-leaving', '/reports/birthday',
    '/reports/overtime', '/reports/absent', '/reports/half-day',
    '/reports/daily-attendance', '/reports/daily-details', '/reports/daily-summary',
    '/reports/daily-status', '/reports/basic-status', '/reports/status-summary',
    '/reports/ot-summary', '/reports/work-duration', '/reports/work-detailed',
    '/reports/att-sheet', '/reports/att-status', '/reports/att-summary',
    '/reports/device-health', '/reports/biometric-summary',
    '/contractors', '/audit',
    '/devices', '/devices/data', '/device-commands', '/device-sync', '/device-messages',
    '/attendance-rules', '/attendance/manual', '/attendance-register', '/attendance-calendar',
    '/holidays', '/holiday-locations', '/geofences', '/break-times', '/timetables', '/shifts',
    '/schedule/department', '/schedule/employee', '/schedule/calendar',
    '/leaves', '/leave-types', '/leave-balance', '/regularizations',
    '/workflow/roles', '/workflow/flows', '/workflow/nodes',
    '/users', '/database/backup', '/system-logs', '/settings', '/integrations', '/logs',
];

const main = async () => {
    if (!CHROME) {
        console.error('No Chrome found. Set CHROME_PATH.');
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Load the origin first — fetch and localStorage both need one. Then sign in
    // through the API and seed the token rather than typing into the form: the
    // login screen is covered by scripts/smoke.mjs, and driving it here would
    // make every route failure look like an authentication failure.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

    const seeded = await page.evaluate(async (base, u, p) => {
        const r = await fetch(`${base}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p }),
        });
        if (!r.ok) return false;
        const { token: t, user } = await r.json();
        localStorage.setItem('token', t);
        if (user) localStorage.setItem('user', JSON.stringify(user));
        return true;
    }, BASE, USER, PASS);

    if (!seeded) {
        console.error('  FAIL  could not sign in — every route would fail for the same reason');
        await browser.close();
        process.exit(1);
    }

    const broken = [];
    const socketNoise = [];
    const thirdParty = new Set();

    for (const route of ROUTES) {
        const problems = [];
        const onConsole = (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            // A failed API call on an empty database is data, not a broken
            // screen. Anything else in the console is the page itself.
            // "Failed to load resource" never names the URL in a form worth
            // matching on, and every one of them also arrives as a response
            // event — which does carry the URL. Classified there instead.
            if (/Failed to load resource/i.test(text)) return;

            // The websocket fault this block used to tolerate was fixed on
            // 18 August (two origin gates; engine.io's CORS pass ran before
            // the same-origin check). Socket errors are ordinary failures
            // again — a tolerance that outlives its defect is how the next
            // regression ships silently.
            problems.push(`console: ${text.slice(0, 160)}`);
        };
        const onPageError = (err) => problems.push(`uncaught: ${String(err).slice(0, 160)}`);
        const onFailed = (req) => {
            const type = req.resourceType();
            if (type === 'script' || type === 'stylesheet') {
                problems.push(`${type} failed: ${req.url().split('/').pop()}`);
            }
        };

        // Classify failed responses by URL, which the console message lacks.
        // A 4xx from /api on an empty database is missing data, not a broken
        // screen; a 4xx from /socket.io is the known upgrade defect; anything
        // else failing to load is the page.
        const onResponse = (res) => {
            if (res.status() < 400) return;
            const url = res.url();
            if (/\/socket\.io/.test(url)) { socketNoise.push(`${route}: ${res.status()} ${url.slice(0, 70)}`); return; }
            if (/\/api\//.test(url)) return;

            // Only same-origin failures are this application's problem. The
            // pages request fonts from fonts.gstatic.com, which 404s from the
            // CI runner, and 46 of 47 screens were reported broken because of
            // a third party this check does not control and cannot fix.
            //
            // Those fonts are a real issue, but a different one: they are an
            // external dependency on every page load, they tell Google who uses
            // this system, and the Content-Security-Policy already declares
            // font-src 'self' data: — so the day that policy stops being
            // report-only, they stop loading. Self-hosting them is the fix, and
            // it is not this check's job to fail the build until then.
            try {
                if (new URL(url).origin !== new URL(BASE).origin) {
                    thirdParty.add(new URL(url).host);
                    return;
                }
            } catch { /* unparseable URL: treat as this app's */ }

            problems.push(`${res.status()} for ${url.slice(0, 100)}`);
        };

        page.on('console', onConsole);
        page.on('pageerror', onPageError);
        page.on('requestfailed', onFailed);
        page.on('response', onResponse);

        try {
            await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 25000 });
            // Give React a moment past the last request to render or throw.
            await new Promise((r) => setTimeout(r, 400));

            const rendered = await page.evaluate(() => {
                const root = document.getElementById('root') || document.body;
                return (root.innerText || '').trim().length;
            });
            if (rendered < 20) problems.push(`rendered ${rendered} characters — blank page`);

            // A page that CAUGHT its error renders politely and passes every
            // console check — which is exactly how two broken report screens
            // sat in production while this sweep reported all green. The error
            // panels this app draws carry known phrases; a screen showing one
            // is a failing screen, however tidy it looks.
            const shownError = await page.evaluate(() => {
                const text = document.body.innerText || '';
                const m = text.match(/Could not generate the report[^\n]*|invalid input syntax[^\n]*|Something went wrong[^\n]*|column "[^"]+" does not exist[^\n]*/);
                return m ? m[0].slice(0, 140) : null;
            });
            if (shownError) problems.push(`page shows an error: ${shownError}`);

            // Open what a person would open. Roughly forty dialogs live behind
            // Add/New/Create buttons, and this check used to stop at the page:
            // a modal that crashed on open passed CI for months. Each opener is
            // clicked, the dialog given a moment to render and misbehave under
            // the same console/pageerror listeners, then closed with Escape.
            // Generic on purpose — per-dialog assertions rot; "opening it does
            // not break" is the invariant every dialog owes.
            try {
                const openers = await page.$$eval('button', (btns) =>
                    btns.map((b, i) => ({ i, t: (b.innerText || '').trim() }))
                        .filter(b => /^(\+?\s*)?(add|new|create|issue|run accrual)\b/i.test(b.t))
                        .slice(0, 3).map(b => b.i));
                for (const idx of openers) {
                    const before = problems.length;
                    await page.evaluate((i) => document.querySelectorAll('button')[i]?.click(), idx);
                    await new Promise(r => setTimeout(r, 500));
                    const dialogError = await page.evaluate(() => {
                        const text = document.body.innerText || '';
                        const m = text.match(/Something went wrong[^\n]*|invalid input[^\n]*/);
                        return m ? m[0].slice(0, 120) : null;
                    });
                    if (dialogError) problems.push(`dialog error: ${dialogError}`);
                    if (problems.length > before) {
                        const label = await page.evaluate((i) =>
                            (document.querySelectorAll('button')[i]?.innerText || '').trim(), idx);
                        problems[problems.length - 1] += ` (after clicking "${label}")`;
                    }
                    await page.keyboard.press('Escape');
                    await new Promise(r => setTimeout(r, 150));
                }
            } catch { /* a page with no buttons is fine */ }
        } catch (err) {
            problems.push(`navigation: ${err.message.split('\n')[0]}`);
        }

        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('requestfailed', onFailed);
        page.off('response', onResponse);

        if (problems.length) {
            broken.push({ route, problems });
            console.error(`  FAIL  ${route}`);
            problems.forEach((p) => console.error(`          ${p}`));
        } else {
            console.log(`  ok    ${route}`);
        }
    }

    await browser.close();

    console.log();
    if (thirdParty.size) {
        console.log(`NOTE: resources failed to load from ${[...thirdParty].join(', ')}.`);
        console.log('      Third-party, so not a build failure — but every page depends on');
        console.log('      them loading, and the CSP already says font-src \'self\' data:.');
        console.log();
    }
    if (socketNoise.length) {
        console.log(`NOTE: ${socketNoise.length} socket.io upgrade failures across the run.`);
        console.log('      Known open defect — the live monitor falls back to polling.');
        console.log(`      e.g. ${socketNoise[0]}`);
        console.log();
    }
    if (broken.length) {
        console.error(`${broken.length} of ${ROUTES.length} screens failed to render cleanly.`);
        process.exit(1);
    }
    console.log(`All ${ROUTES.length} screens rendered without errors.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
