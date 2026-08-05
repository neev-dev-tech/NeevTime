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

test('alerting is off until recipients are configured', () => {
    const src = read('services/alerts.js');
    assert.ok(/if \(!cfg\.enabled\) return/.test(src), 'alerts send even when disabled');
    assert.ok(/recipientList\.length === 0/.test(src), 'alerts are attempted with no recipients');

    const server = read('server.js');
    assert.ok(/\['alerts', 'enabled', 'false', 'boolean'/.test(server),
        'alerting must be seeded off — a fresh install must not mail an address nobody chose');
});

test('every check pairs a raise with a resolve', () => {
    // An issue left permanently open suppresses the next real alert for the same
    // thing. track() makes the pairing structural instead of remembered.
    const src = read('services/alert_checks.js');
    const raises = (src.match(/alerts\.track\(/g) || []).length;
    assert.ok(raises >= 3, `expected the health checks to use track(); found ${raises}`);

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
