/**
 * Whether holidays arrive, and whether they apply to the right people.
 *
 * The absent report treats any working day with no punch as an absence, and the
 * holidays table was empty, so every public holiday read as the entire company
 * being absent. That is a large part of the inflated absence figures.
 *
 * The second half matters as much as the first: ERPNext keeps a Holiday List
 * per location, so importing them into one flat set would exempt everyone from
 * absence on a day only one office was closed — trading an over-count for an
 * under-count, which is worse, because nobody notices an absence that quietly
 * disappears.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const strip = (src) => src.split('\n')
    .filter(l => {
        const t = l.trim();
        return !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('--');
    })
    .join('\n');

const core = strip(read('services/hrms-integration.js'));
const erp = strip(read('services/integrations/erpnext.js'));
const reports = strip(read('services/reports.js'));
const boot = strip(read('server.js'));

test('holiday lists are fetched as documents, not from the list endpoint', () => {
    // The dates are a child table. Frappe's list endpoint never returns child
    // tables whatever fields are requested, so a list-only fetch returns
    // holiday lists with no holidays in them.
    assert.ok(/resource\/Holiday List\/\$\{encodeURIComponent/.test(erp),
        'each Holiday List must be fetched as a document, or its dates never arrive');
});

test('weekly offs are not imported as holidays', () => {
    // ERPNext puts weekly offs in the same child table as real holidays. They
    // are every Sunday, already covered by the weekend rule in the absent
    // report, and importing them adds 52 rows a year per list that change
    // nothing.
    assert.ok(/weekly_off/.test(erp), 'weekly_off is not read from the holiday rows');
    assert.ok(/if \(h\.weekly_off\) continue;/.test(core),
        'weekly offs are imported as holidays; they are Sundays, which the weekend rule already covers');
});

test('the holiday upsert key folds NULL location to a value', () => {
    // A holiday with no location has NULL there, and NULLs never conflict in a
    // unique index — so the same company-wide date would insert again on every
    // sync, growing the table forever.
    assert.ok(/COALESCE\(holiday_location_id, 0\), date/.test(boot),
        'the unique index does not fold NULL location, so company-wide holidays duplicate each sync');
    assert.ok(/ON CONFLICT \(COALESCE\(holiday_location_id, 0\), date\)/.test(core),
        'the upsert must infer against the same expression the index is built on');
});

test('the absent report matches a holiday to the employee it applies to', () => {
    const i = reports.indexOf('const generateAbsentReport');
    const fn = reports.slice(i, i + 4000);

    assert.ok(/FROM holidays h/.test(fn), 'the absent report no longer excludes holidays at all');
    assert.ok(/h\.holiday_location_id IS NULL/.test(fn),
        'a holiday with no location must still apply to everyone, or every hand-entered holiday stops working');
    assert.ok(/e\.holiday_location_id IS NULL/.test(fn),
        'an employee with no holiday list must still match any holiday, or the fix makes absences appear ' +
        'for staff the HRMS has not placed');
    assert.ok(/h\.holiday_location_id = e\.holiday_location_id/.test(fn),
        'holidays are applied company-wide regardless of list, which exempts staff whose site was open');
});

test('the holiday pull is logged whatever it does', () => {
    const i = core.indexOf('const syncHolidaysFromHRMS');
    assert.ok(i !== -1, 'no holiday sync');
    const fn = core.slice(i, core.indexOf('const syncEmployeesFromHRMS'));

    const logged = fn.match(/logSync\('holidays'/g) || [];
    assert.ok(logged.length >= 3,
        `the holiday sync writes ${logged.length} log rows; it needs success, empty and failed, ` +
        'or those outcomes cannot be told apart from never having run');
});

test('holiday_location_id is written on conflict, not only on insert', () => {
    const i = core.indexOf('INSERT INTO employees');
    const q = core.slice(i, i + 1300);
    assert.ok(/holiday_location_id = COALESCE\(EXCLUDED\.holiday_location_id, employees\.holiday_location_id\)/.test(q),
        'every employee already exists, so an insert-only mapping assigns nobody a holiday list');
});

test('an unknown holiday list resolves to null rather than being created', () => {
    const i = core.indexOf('const resolveHolidayList');
    assert.ok(i !== -1, 'no holiday list resolution');
    const fn = core.slice(i, i + 700);
    assert.ok(!/INSERT INTO holiday_locations/.test(fn),
        'an unrecognised list must not be created empty — it would exempt nobody while looking configured');
});

test('every column the HRMS sync writes is added at boot, not assumed', () => {
    // The holiday sync failed on production with
    //   column "type" of relation "holidays" does not exist
    // while passing here, because `type` is created by 00_init_all.sql and that
    // deployment's holidays table came from somewhere else.
    //
    // The existing schema test cannot catch this. It proves that *some* schema
    // file creates a column — not that the database in front of you ran that
    // file. Schema files are history; ensureSchema is the only thing that runs
    // everywhere. So anything the sync writes has to be added there.
    const added = new Set(
        [...boot.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)]
            .map(m => `${m[1]}.${m[2]}`)
    );

    // The primary key and the one column each table is keyed on are part of the
    // CREATE TABLE everywhere; everything else is an addition somebody made.
    const guaranteed = new Set(['holidays.date', 'holidays.name', 'shifts.name',
                                'shifts.start_time', 'shifts.end_time',
                                'holiday_locations.name', 'employees.employee_code']);

    const missing = [];
    for (const m of core.matchAll(/INSERT INTO (holidays|shifts|holiday_locations)\s*\(([^)]+)\)/g)) {
        const table = m[1];
        for (const col of m[2].split(',').map(c => c.trim()).filter(Boolean)) {
            const key = `${table}.${col}`;
            if (!added.has(key) && !guaranteed.has(key)) missing.push(key);
        }
    }

    assert.deepEqual(missing, [],
        'these columns are written by the sync but never added by ensureSchema, so they exist ' +
        'only on databases that happened to run the right schema file: ' + missing.join(', '));
});
