/**
 * An integration must not claim to do something it cannot.
 *
 * The base class returns [] from pullShifts, pullHolidayLists, pullLeaveTypes,
 * pullLeaveApplications and pullLeaveAllocations. That is indistinguishable from
 * "this HRMS has none of those" — so a deployment on Odoo or Horilla ran all
 * three pulls every 30 minutes, received nothing each time, and logged a clean
 * success. The effect is not cosmetic: without shifts everyone is measured
 * against one fallback start time, and without holidays and leave every public
 * holiday and every approved day off becomes an absence. That is the same fault
 * that produced 409 absences in a month on this deployment, except silent.
 *
 * Each adapter now declares its capabilities and the sync skips the rest with a
 * reason. These tests check the declaration matches the code, in both
 * directions — a claim without an implementation is a lie, and an
 * implementation without a claim is dead work.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'services', 'integrations');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
// Everything in here is an adapter except the shared helpers and the registry
// that lists them.
const NOT_ADAPTERS = new Set(['punch_format.js', 'registry.js']);
const adapters = fs.readdirSync(DIR)
    .filter(f => f.endsWith('.js') && !NOT_ADAPTERS.has(f));

/** Which capability each optional method backs. */
const METHOD_FOR = {
    'employees': 'pullEmployees',
    'shifts': 'pullShifts',
    'holidays': 'pullHolidayLists',
    'leave': 'pullLeaveApplications',
    'push_attendance': 'pushAttendance',
    'push_daily_attendance': 'pushDailyAttendance',
    'push_leave': 'pushLeaves'
};

const declared = (src) => {
    const m = /static capabilities = \[([\s\S]*?)\];/.exec(src);
    if (!m) return null;
    return [...m[1].matchAll(/CAPABILITY\.(\w+)/g)].map(x => x[1].toLowerCase());
};

test('every adapter declares its capabilities', () => {
    for (const f of adapters) {
        assert.ok(
            declared(read(f)) !== null,
            `${f} declares no capabilities. Without a declaration the sync treats it ` +
            `as supporting nothing — which is the safe default, but say so explicitly.`
        );
    }
});

test('a declared capability is actually implemented', () => {
    for (const f of adapters) {
        const src = read(f);
        for (const cap of declared(src) || []) {
            const method = METHOD_FOR[cap];
            assert.ok(method, `${f} declares unknown capability "${cap}"`);
            assert.ok(
                new RegExp(`async\\s+${method}\\s*\\(`).test(src),
                `${f} claims "${cap}" but does not implement ${method}(). The base ` +
                `class would return [] and the sync would report success having done ` +
                `nothing.`
            );
        }
    }
});

test('an implemented pull is declared, so it is not skipped', () => {
    for (const f of adapters) {
        const src = read(f);
        const caps = declared(src) || [];
        for (const [cap, method] of Object.entries(METHOD_FOR)) {
            if (!new RegExp(`async\\s+${method}\\s*\\(`).test(src)) continue;
            assert.ok(
                caps.includes(cap),
                `${f} implements ${method}() but does not declare "${cap}", so the ` +
                `sync skips it and the work never runs`
            );
        }
    }
});

test('the sync checks capability before running a pull', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8');
    for (const cap of ['SHIFTS', 'HOLIDAYS', 'LEAVE', 'EMPLOYEES', 'PUSH_ATTENDANCE']) {
        assert.ok(
            new RegExp(`supports\\(CAPABILITY\\.${cap}\\)`).test(src),
            `nothing checks CAPABILITY.${cap} before syncing it — an adapter without ` +
            `it will run the pull, get nothing, and log success`
        );
    }
});

test('adapters for closed vendors are gone, and say why', () => {
    for (const gone of ['sap-successfactors.js', 'workday.js', 'bamboohr.js', 'zoho-people.js']) {
        assert.ok(
            !fs.existsSync(path.join(DIR, gone)),
            `${gone} is back. These APIs need a partner agreement, a reviewed OAuth ` +
            `application or a paid tier — none of which this application can satisfy ` +
            `on a customer's behalf, so the adapter can never connect.`
        );
    }
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8');
    assert.ok(/RETIRED_TYPES/.test(src), 'retired types are no longer named');
    for (const t of ['sap_successfactors', 'workday', 'bamboohr', 'zoho_people']) {
        assert.ok(
            new RegExp(`${t}:`).test(src),
            `a saved integration of type "${t}" would get "Unsupported integration type" ` +
            `rather than an explanation`
        );
    }
});

test('the picker offers only what has an adapter', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'integrations.js'), 'utf8');
    for (const t of ['sap_successfactors', 'workday', 'bamboohr', 'zoho_people']) {
        assert.ok(
            !new RegExp(`type: '${t}'`).test(src),
            `the integration picker still offers ${t}, which has no adapter`
        );
    }
});

test('the registry is the only place a service is declared', () => {
    const registry = require('../services/integrations/registry');
    const types = registry.list().map(a => a.type);

    // Every adapter file is reachable through the registry. One that is not is
    // dead weight nobody can select.
    for (const f of adapters) {
        const found = registry.ADAPTERS.some(entry => {
            try { return entry.load() === require(path.join(DIR, f)); }
            catch { return false; }
        });
        assert.ok(found, `${f} is not in the registry, so no integration can use it`);
    }

    // And the resolver goes through it rather than a switch of its own.
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8');
    assert.ok(
        /registry\.find\(config\.type\)/.test(src),
        'getIntegrationInstance no longer resolves through the registry — a second ' +
        'list of services has appeared and the two will drift'
    );

    // The picker too.
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'integrations.js'), 'utf8');
    assert.ok(
        /registry\.list\(\)/.test(routes),
        'the integration-types route hand-maintains its own list again. It already ' +
        'drifted once: it offered four vendors that could not connect and claimed a ' +
        'capability Horilla does not implement.'
    );

    assert.ok(types.includes('erpnext'), 'ERPNext is missing from the registry');
});

test('an alias keeps an existing saved integration working', () => {
    const registry = require('../services/integrations/registry');
    // custom_api was its own type in the old switch and resolved to the webhook
    // adapter. Rows with that type still exist.
    assert.strictEqual(
        registry.find('custom_api'), registry.find('webhook'),
        'custom_api no longer resolves — any integration saved with that type breaks'
    );
    assert.ok(registry.find('ERPNext'), 'type matching is case-sensitive again');
});

test('the payroll push is off unless an integration asks for it', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8');

    assert.ok(
        /config\?\.push_daily_attendance/.test(src),
        'daily attendance is pushed without an explicit opt-in. This writes the ' +
        'documents payroll pays people from; it must not start doing that because ' +
        'a version was deployed.'
    );
    assert.ok(
        /supports\(CAPABILITY\.PUSH_DAILY_ATTENDANCE\)/.test(src),
        'nothing checks the adapter can push daily attendance before calling it'
    );
});

test('only settled days are sent to payroll', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'hrms-integration.js'), 'utf8');
    const i = src.indexOf('syncDailyAttendanceToHRMS');
    const body = src.slice(i, i + 1600);

    assert.ok(
        /ads\.date < CURRENT_DATE/.test(body),
        "today is included in the payroll push. Someone who has punched in and not " +
        "yet out would go across as a short day, and ERPNext cannot edit a " +
        "submitted Attendance record afterwards."
    );
    assert.ok(
        /exclude_from_hrms IS NOT TRUE/.test(body),
        'door-access staff are pushed to the HRMS, which rejects codes it has ' +
        'never heard of and retries forever'
    );
});

test('an attendance status with no equivalent is skipped, not guessed', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'integrations', 'erpnext.js'), 'utf8');
    const i = src.indexOf('async pushDailyAttendance');
    const body = src.slice(i, i + 2600);

    // ERPNext accepts four statuses. Ours has six.
    assert.ok(/'short day': 'Present'/.test(body), 'Short Day no longer maps to Present — a worked day would be docked');
    assert.ok(!/'miss punch'/.test(body), 'Miss Punch is being mapped; an unresolved record must not reach payroll');
    assert.ok(!/'weekly off'/.test(body), 'Weekly Off is being mapped; ERPNext has no such status');
    assert.ok(
        /if \(!status\) \{ stats\.skipped\+\+; continue; \}/.test(body),
        'an unrecognised status falls through to a default instead of being skipped'
    );
    assert.ok(/docstatus: 1/.test(body), 'the record is left in draft, so payroll will not count it');
});
