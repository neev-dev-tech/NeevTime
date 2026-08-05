/**
 * Whether a stalled attendance push can go unnoticed.
 *
 * It did, for four days. On 2026-07-31 an admin saved the Integrations form
 * with sync_attendance switched off. Both push paths check that flag, so
 * everything stopped — but nothing anywhere said so. Punches kept arriving,
 * reports kept working, the Devices page stayed green, and the only symptom was
 * records missing at the far end, in ERPNext, where nobody was looking.
 *
 * Diagnosis was slower than it should have been because integration_sync_logs
 * reported "last push 31 July" even while the real-time path was running: that
 * path pushed every punch and recorded nothing, so the table described a system
 * that had stopped when it had not.
 *
 * These lock in the two things that would have caught it: the flag being off is
 * surfaced, and the real-time path reports its own health.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ─────────────────── the outage is visible in the app ────────────────────

test('the notification summary reports integrations with attendance push off', () => {
    const src = read('server.js');
    const start = src.indexOf("app.get('/api/notifications/summary'");
    const body = src.slice(start, start + 3000);

    assert.ok(/sync_attendance IS NOT TRUE/.test(body),
        'the summary no longer detects an integration with attendance push disabled');
    assert.ok(/is_active IS TRUE/.test(body),
        'a disabled integration would be reported as a problem; only active ones matter');
    assert.ok(/attendance_push_disabled/.test(body),
        'the summary does not expose the field the notification bell reads');
});

test('the warning names the integration rather than counting it', () => {
    // "InnopayHR is not pushing attendance" is actionable. "1 integration" is a
    // number someone has to go and investigate.
    const src = read('server.js');
    const start = src.indexOf("app.get('/api/notifications/summary'");
    const body = src.slice(start, start + 3000);
    assert.ok(/SELECT name FROM hrms_integrations/.test(body),
        'the query should select the integration name, not just a count');
});

// ───────────────── the real-time path reports its health ─────────────────

const punchIngest = () => {
    const src = read('services/punch_ingest.js');
    const start = src.indexOf('const hrmsIntegration = require');
    assert.ok(start > -1, 'the HRMS push block has moved or been removed');
    return src.slice(start, start + 2600);
};

test('a successful live push updates the integration heartbeat', () => {
    // Without this, last_sync_at stays frozen at the last batch run and the
    // sync-health view lies about a system that is working.
    assert.ok(/updateSyncStatus\(/.test(punchIngest()),
        'the real-time push does not record that it ran');
});

test('a failed live push is written to integration_sync_logs', () => {
    // A rejected punch never reaches payroll. Those are the rows worth keeping.
    const body = punchIngest();
    assert.ok(/logSync\(\s*'attendance',\s*'push',\s*'failed'/.test(body),
        'a live push that throws is not logged');
    assert.ok(/logSync\('attendance', 'push', 'partial'/.test(body),
        'a live push that is rejected by the HRMS is not logged');
});

test('successful live pushes do NOT write a log row each', () => {
    // Hundreds of punches a day, one row each, would bury the batch entries and
    // make the table useless for exactly the question it should answer.
    const body = punchIngest();
    assert.ok(!/logSync\([^)]*'success'/.test(body),
        'a row per successful punch would flood integration_sync_logs');
});

test('the push still cannot delay or fail a punch', () => {
    // The original guarantee. Attendance capture must survive an HRMS outage —
    // losing a punch is worse than a late sync.
    const src = read('services/punch_ingest.js');
    const block = src.slice(src.indexOf('HRMS push must never hold up'));
    assert.ok(/^\s*\(async \(\) => \{/m.test(block),
        'the HRMS push is no longer detached from the punch write');
    assert.ok(/catch \(err\) \{[\s\S]{0,200}HRMS push skipped/.test(block),
        'a push failure is no longer swallowed before it can affect the punch');
});

test('the backfill script does not resurrect deliberately skipped punches', () => {
    // It selected everything that was not 'synced', which includes 'skipped' —
    // the facility, security and test accounts held back on purpose. That made
    // it target 8,838 records when ~90 were stuck, and running it after an
    // outage would have pushed every excluded person into the HR system,
    // silently undoing exclude_from_hrms.
    const src = read('scripts/sync_all_pending.js');
    assert.ok(!/sync_status != 'synced'/.test(src),
        "the backfill excludes only 'synced' again, so 'skipped' records would be pushed");

    const guarded = (src.match(/NOT IN \('synced', 'skipped'\)/g) || []).length;
    assert.ok(guarded >= 2,
        `both the count and the batch query must exclude skipped; found ${guarded}`);
});

test('the backfill and the scheduled sync agree on what is unsynced', () => {
    // Two queries answering the same question differently is how they drifted
    // apart in the first place.
    const batch = read('services/hrms-integration.js');
    const script = read('scripts/sync_all_pending.js');
    const shape = /NOT IN \('synced', 'skipped'\)/;
    assert.ok(shape.test(batch) && shape.test(script),
        'the scheduled sync and the backfill script no longer use the same definition of unsynced');
});
