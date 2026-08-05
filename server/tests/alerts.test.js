/**
 * Alerting invariants.
 *
 * The behaviour was verified end-to-end against a real Postgres while it was
 * being written — raise/resolve/re-raise counts, and the broken-SMTP path. These
 * pin the properties that are easy to break later by a well-meaning edit, and
 * which no unit test would notice because the symptom is silence.
 *
 * One of them exists because it was already got wrong once: the first version
 * did not clear notified_at when a resolved issue re-opened, so a reader that
 * broke, recovered and broke again would alert the first time and never again.
 * Only running it caught that.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('a re-opened issue clears notified_at, so it alerts again', () => {
    // The regression. Without this the second outage of the same reader is
    // silent — and silence is indistinguishable from "everything is fine".
    const src = read('services/alerts.js');
    assert.ok(
        /notified_at = CASE WHEN alert_state\.resolved_at IS NOT NULL\s*\n?\s*THEN NULL/.test(src),
        'notified_at is not reset when a resolved alert re-opens; the next incident will be silent'
    );
});

test('an open issue is not re-sent on every check', () => {
    // Checks run every 5 minutes. Without the guard, one offline reader sends
    // 288 mails a day and people build filters — including for the one email
    // that mattered.
    const src = read('services/alerts.js');
    assert.ok(/if \(row\.notified_at\) \{[\s\S]{0,120}already open/.test(src),
        'raise() no longer suppresses repeats within an incident');
});

test('alerting never throws into the caller', () => {
    // raise() is called from the punch path. An exception here must not be able
    // to stop attendance being recorded.
    const src = read('services/alerts.js');
    for (const fn of ['raise', 'resolve']) {
        const start = src.indexOf(`const ${fn} = async`);
        const body = src.slice(start, src.indexOf('\n};', start));
        assert.ok(/catch \(err\) \{/.test(body), `${fn}() can throw into its caller`);
        assert.ok(/return \{ sent: false/.test(body), `${fn}() does not return a result on failure`);
    }
});

test('delivery failure is recorded rather than swallowed', () => {
    // Email is the only channel, so a broken SMTP means no alerts at all. That
    // must be visible in the app or the whole thing fails silently.
    const src = read('services/alerts.js');
    assert.ok(/recordDeliveryFailure/.test(src), 'delivery failures are not recorded');
    assert.ok(/last_error/.test(src), 'no failure detail is stored');

    const server = read('server.js');
    assert.ok(/alerts_undeliverable/.test(server),
        'the app does not surface undeliverable alerts, so broken alerting is invisible');
});

test('nothing is sent without an explicit recipient', () => {
    // The real invariant. The seed ships enabled with this install's own
    // address, so "off by default" is no longer the protection — the guard on
    // an empty recipient list is. Without it, enabling alerting with a blank
    // recipients field would attempt a send on every check and record a
    // delivery failure each time.
    const src = read('services/alerts.js');
    assert.ok(/if \(!cfg\.enabled\) return/.test(src), 'alerts send even when disabled');
    assert.ok(/recipientList\.length === 0/.test(src), 'alerts are attempted with no recipients');
});

test('the seeded alert settings are coherent', () => {
    // Enabled with no recipient would be a feature that looks on and does
    // nothing — the silent failure this whole thing exists to remove.
    const server = read('server.js');
    const enabled = /\['alerts', 'enabled', '(true|false)'/.exec(server);
    const recipients = /\['alerts', 'recipients', '([^']*)'/.exec(server);
    assert.ok(enabled && recipients, 'the alert settings are no longer seeded');
    if (enabled[1] === 'true') {
        assert.ok(recipients[1].includes('@'),
            'alerting is seeded on with no recipient address — it would silently send nothing');
    }
});

test('every check pairs a raise with a resolve', () => {
    // An issue left permanently open suppresses the next real alert for the same
    // thing. track() makes the pairing structural instead of remembered.
    const src = read('services/alert_checks.js');
    const raises = (src.match(/alerts\.track\(/g) || []).length;
    assert.ok(raises >= 4, `expected the health checks to use track(); found ${raises}`);

    // Config changes are the one deliberate exception: each is its own event
    // with nothing to resolve.
    const rawRaise = (src.match(/alerts\.raise\(/g) || []).length;
    assert.strictEqual(rawRaise, 1,
        'only the config-change notice should call raise() directly; everything else needs a resolve half');
});

test('the digest cannot send twice after a restart', () => {
    const src = read('services/alert_checks.js');
    assert.ok(/lastDigestDate === today/.test(src),
        'the daily digest is not guarded against sending more than once a day');
});

test('restarting after the send time does not fire a digest', () => {
    // It did: lastDigestDate started null, so the first tick after any restart
    // past 08:00 decided today's digest was still owed. A container restarted
    // three times in an afternoon would send three "daily" summaries. Seeding
    // the date at startup is what prevents it.
    const src = read('services/alert_checks.js');
    const start = src.indexOf('const startAlertChecks');
    const body = src.slice(start, src.indexOf('setInterval(async', start));
    assert.ok(/digestTimeReached\(cfg\)/.test(body) && /lastDigestDate = localDate\(\)/.test(body),
        'startup does not mark an already-due digest as sent, so a restart will send one');
});

test('the digest compares local time against a local date', () => {
    // toISOString() yields the UTC date while the hour check uses local hours.
    // In IST that pair disagrees every night until 05:30, so the guard would
    // either skip or repeat the digest.
    const { localDate, digestTimeReached } = require('../services/alert_checks.js');
    const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

    assert.strictEqual(digestTimeReached({ digest_time: '08:00' }, at(7, 59)), false);
    assert.strictEqual(digestTimeReached({ digest_time: '08:00' }, at(8, 0)), true);

    const now = new Date();
    const expected = [now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')].join('-');
    assert.strictEqual(localDate(), expected, 'localDate() is not returning the local calendar date');

    assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(read('services/alert_checks.js')),
        'the UTC date string is back; it will disagree with the local hour check');
});

test('sync health is judged on the data, not a status field', () => {
    // Status fields have misreported twice: sync_attendance off produced no
    // signal at all, and a batch where every record was rejected wrote
    // "success — Synced 0 attendance records". A backlog of unsynced rows
    // cannot lie in the same way.
    const src = read('services/alert_checks.js');
    assert.ok(/checkSyncBacklog/.test(src), 'the backlog check is gone');
    assert.ok(/sync_status IS DISTINCT FROM 'synced'/.test(src),
        'the backlog check no longer looks at per-record sync status');
    assert.ok(/INTERVAL '7 days'/.test(src),
        'the backlog check should be bounded by the same window the retry uses');
});

test('a batch that fails is not reported as a success', () => {
    // The bug this replaced: updateSyncStatus was called with a hardcoded
    // 'success' whatever the outcome, so the Integrations page showed success
    // through a two-hour outage — and made the sync_failing alert unreachable,
    // because nothing ever wrote the 'failed' value it watches for.
    const src = read('services/hrms-integration.js');
    assert.ok(!/updateSyncStatus\('success', `Synced \$\{stats\.success\}/.test(src),
        'sync status is hardcoded to success again');
    assert.ok(/stats\.success > 0 \? 'partial' : 'failed'/.test(src),
        'a batch where every record is rejected must report failed, not partial or success');
});

test('records are flagged before they age out of the retry window', () => {
    // The scheduled retry only covers 7 days. Past that a punch is never
    // attempted again and nothing says so — it just goes missing from payroll
    // weeks later. Two tiers because the responses differ: still-fixable versus
    // needs-the-backfill-run-by-hand.
    const src = read('services/alert_checks.js');
    assert.ok(/checkSyncAging/.test(src), 'the aging check is gone');
    assert.ok(/sync_expiring/.test(src) && /sync_stranded/.test(src),
        'both tiers must exist; a single alert cannot say whether it is still recoverable');

    // The warning threshold has to sit inside the window, or it never fires.
    const warn = Number(/WARN_AFTER_DAYS = (\d+)/.exec(src)[1]);
    const window = Number(/RETRY_WINDOW_DAYS = (\d+)/.exec(src)[1]);
    assert.ok(warn < window,
        `the warning fires at ${warn} days but records expire at ${window} — it would never be seen in time`);
});

test('the aging window matches the retry window it is warning about', () => {
    // If the scheduled sync's window changes and this does not, the alert
    // either cries wolf or misses the cutoff entirely.
    const checks = read('services/alert_checks.js');
    const sync = read('services/hrms-integration.js');
    const syncWindow = /INTERVAL '(\d+) days'/.exec(sync);
    const alertWindow = /RETRY_WINDOW_DAYS = (\d+)/.exec(checks);
    assert.ok(syncWindow && alertWindow, 'could not read one of the windows');
    assert.strictEqual(alertWindow[1], syncWindow[1],
        `the alert warns about a ${alertWindow[1]}-day window but the sync retries for ${syncWindow[1]} days`);
});

test('repeated failed sign-ins raise an alert', () => {
    const src = read('services/alert_checks.js');
    assert.ok(/accounts_locked/.test(src), 'account lockouts are not alerted');
    assert.ok(/locked_until > NOW\(\)/.test(src),
        'the lockout check should only report currently-locked accounts, not historic ones');
});

test('an event-shaped alert closes itself instead of sitting open forever', () => {
    // Config changes report something that happened, not a state that persists.
    // Left open they accumulate one row per save — seven appeared within an hour
    // of the feature going live — and every one shows in the daily digest as an
    // outstanding issue. A list that is always full is a list nobody reads.
    const src = read('services/alerts.js');
    assert.ok(/transient = false/.test(src), 'raise() no longer supports transient alerts');
    assert.ok(/if \(transient\)[\s\S]{0,200}resolved_at = NOW\(\)/.test(src),
        'a transient alert is not closed after sending');

    const checks = read('services/alert_checks.js');
    assert.ok(/transient: true/.test(checks),
        'the config-change notice no longer marks itself transient');
});

test('repeated saves of the same form do not send repeated mail', () => {
    // Six saves in thirty seconds sent six emails. That is the fastest possible
    // way to train someone to filter this sender — and the one that matters
    // would go with it.
    const src = read('services/alert_checks.js');
    assert.ok(/CONFIG_ALERT_QUIET_MS/.test(src), 'the config-change debounce is gone');
    assert.ok(/now - last < CONFIG_ALERT_QUIET_MS/.test(src),
        'the debounce is defined but not applied');

    const quiet = /CONFIG_ALERT_QUIET_MS = (\d+) \* 60 \* 1000/.exec(src);
    assert.ok(quiet && Number(quiet[1]) >= 1 && Number(quiet[1]) <= 30,
        'the quiet period should be minutes, not seconds or hours');
});
