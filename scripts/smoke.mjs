#!/usr/bin/env node
/**
 * Drive the critical paths against a running deployment.
 *
 *     node scripts/smoke.mjs                     # http://localhost
 *     BASE=https://192.168.1.237 node scripts/smoke.mjs
 *
 * Roadmap item 0.3. Two regressions reached production in one week that opening
 * the page would have caught in seconds, and on 16 August the Areas page was
 * found to have been returning 500 on every install for as long as it has
 * existed — because it summed two columns that live on `devices` from
 * `employees`. Nothing exercised it. The database and the deployment are
 * verified by CI; until now the endpoints behind the screens were not.
 *
 * This is deliberately shallow. It signs in and asks each critical endpoint for
 * a response, and fails on anything that is not a 2xx. It does not assert
 * business meaning — the register and payroll figures are checked against a
 * real Postgres in server/tests/registers_db.test.js, which is the right place
 * for that. What this catches is the class of fault that has actually shipped
 * here repeatedly: a route that raises a 500 because the SQL underneath it
 * references something that is not there.
 *
 * The credentials are the seeded defaults. That is fine against the CI stack,
 * which is built from database/000_schema.sql and thrown away. It is worth
 * knowing that those same defaults exist on every fresh install.
 */

const BASE = (process.env.BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'admin';

// Self-signed certificates are the norm on these deployments.
if (BASE.startsWith('https:')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const monthStart = () => `${today().slice(0, 7)}-01`;

const CHECKS = [
    ['employee list', `/api/employees`],
    ['employee list — resigned view', `/api/employees?view=resigned`],
    ['employee list — deleted view', `/api/employees?view=deleted`],
    // Broken on every install until 2026-08-16: parent_id vs parent_area_id,
    // and enrolment counts summed from a table that never had them.
    ['areas', `/api/areas`],
    ['departments', `/api/departments`],
    // Writing to the wrong column made this page 500 on save until 2026-08-16.
    ['holidays', `/api/holidays`],
    ['shifts', `/api/shifts`],
    ['devices', `/api/devices`],
    ['dashboard', `/api/reports/dashboard`],
    ['punch log — today', `/api/logs?date=${today()}&limit=5`],
    ['punch count — today', `/api/logs/count?date=${today()}`],
    ['muster roll', `/api/reports/registers/muster?from=${monthStart()}&to=${today()}`],
    ['overtime register', `/api/reports/registers/overtime?from=${monthStart()}&to=${today()}`],
    ['leave register', `/api/reports/registers/leave?from=${monthStart()}&to=${today()}`],
    ['payroll summary', `/api/reports/payroll?from=${monthStart()}&to=${today()}`],
    ['payroll templates', `/api/reports/payroll-templates`],
    ['payroll export (CSV)', `/api/reports/payroll-export?from=${monthStart()}&to=${today()}&template=payroll-minimal`],
];

const fail = (msg) => { console.error(`  FAIL  ${msg}`); return false; };

const login = async () => {
    const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        throw new Error(`login returned ${res.status}: ${body}`);
    }
    const { token } = await res.json();
    if (!token) throw new Error('login succeeded but returned no token');
    return token;
};

const main = async () => {
    console.log(`Smoke test against ${BASE}`);

    let token;
    try {
        token = await login();
        console.log('  ok    sign in');
    } catch (err) {
        console.error(`  FAIL  sign in — ${err.message}`);
        process.exit(1);
    }

    const headers = { Authorization: `Bearer ${token}` };
    let failures = 0;

    for (const [name, path] of CHECKS) {
        try {
            const res = await fetch(`${BASE}${path}`, { headers });
            if (!res.ok) {
                // The body is where the useful part is — a 500 here is almost
                // always a column that does not exist, and printing the status
                // alone sends the reader back to the logs for no reason.
                const body = (await res.text()).slice(0, 240).replace(/\s+/g, ' ');
                failures += 1;
                fail(`${name} — HTTP ${res.status}\n        ${path}\n        ${body}`);
                continue;
            }
            const text = await res.text();
            if (!text.length) {
                failures += 1;
                fail(`${name} — 200 with an empty body\n        ${path}`);
                continue;
            }
            console.log(`  ok    ${name}`);
        } catch (err) {
            failures += 1;
            fail(`${name} — ${err.message}\n        ${path}`);
        }
    }

    console.log();
    if (failures) {
        console.error(`${failures} of ${CHECKS.length} critical paths failed.`);
        process.exit(1);
    }
    console.log(`All ${CHECKS.length} critical paths responded.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
