/**
 * What gets alerted on, and the daily digest.
 *
 * Each check is written as a condition plus a stable key, and handed to
 * alerts.track() so the resolve half can never be forgotten — an issue left
 * permanently open silently suppresses the next real alert for the same thing.
 *
 * The keys are deliberately specific (`device_offline:<serial>`, not
 * `device_offline`) so two readers failing produce two alerts, and fixing one
 * does not clear the other.
 */

const db = require('../db');
const alerts = require('./alerts');
const settings = require('../utils/settings');

const log = (level, msg, data = {}) => {
    console.log(`[${new Date().toISOString()}] [${level}] [AlertChecks] ${msg}`,
        Object.keys(data).length ? JSON.stringify(data) : '');
};

/**
 * The check written specifically for the 31 July outage: an active integration
 * with attendance push switched off. Nothing about that is visible from the
 * inside — punches keep arriving and every screen looks healthy — so it needs to
 * announce itself.
 */
const checkAttendancePush = async () => {
    const res = await db.query(`
        SELECT id, name, sync_attendance, last_sync_status, last_sync_at
        FROM hrms_integrations WHERE is_active IS TRUE
    `);

    for (const row of res.rows) {
        await alerts.track(`push_disabled:${row.id}`, row.sync_attendance !== true, {
            severity: 'high',
            subject: `Attendance is not being sent to ${row.name}`,
            body: `Attendance push is switched off for "${row.name}".\n\n`
                + 'Punches are still being recorded in NeevTime, but none of them are '
                + 'reaching the HR system, so payroll will be short. This does not show '
                + 'up anywhere else — every other screen looks normal.\n\n'
                + 'Turn it back on under Integrations, or if it was disabled deliberately, '
                + 'ignore this and it will not be sent again.',
            details: { integration: row.name }
        });

        // A sync that is enabled but failing is a different problem from one
        // that is switched off, and needs its own key so fixing one does not
        // silence the other.
        await alerts.track(`sync_failing:${row.id}`,
            row.sync_attendance === true && row.last_sync_status === 'failed', {
                severity: 'high',
                subject: `Sync to ${row.name} is failing`,
                body: `The last sync attempt to "${row.name}" failed.\n\n`
                    + `Last attempt: ${row.last_sync_at || 'unknown'}\n\n`
                    + 'Check Integrations for the error, and whether the HR system is reachable.',
                details: { integration: row.name }
            });
    }
};

/**
 * Records that have not reached the HR system. This watches the data itself
 * rather than a status field, and that distinction has earned its place twice
 * in one day: sync_attendance being off reported nothing at all, and a batch
 * where every record was rejected reported "success — Synced 0 attendance
 * records". A backlog cannot lie in the same way. If punches are not arriving
 * at payroll, this fires regardless of what any flag says.
 */
const checkSyncBacklog = async () => {
    const res = await db.query(`
        SELECT count(*)::int AS n, min(punch_time) AS oldest
        FROM attendance_logs
        WHERE sync_status IS DISTINCT FROM 'synced'
          AND sync_status IS DISTINCT FROM 'skipped'
          AND punch_time > NOW() - INTERVAL '7 days'
    `);
    const { n, oldest } = res.rows[0];

    // A handful in flight between the punch and the next cycle is normal; a
    // stuck hour is not. The age matters more than the count — a backlog that
    // stops advancing is the signal, and anything older than the 7-day retry
    // window can never be recovered at all.
    const stuck = n > 0 && oldest && (Date.now() - new Date(oldest)) > 60 * 60 * 1000;

    await alerts.track('sync_backlog', stuck, {
        severity: 'high',
        subject: `${n} attendance records have not reached the HR system`,
        body: `${n} punches are waiting to sync, the oldest from ${oldest}.\n\n`
            + 'They are recorded safely in NeevTime — this is about them not reaching '
            + 'payroll. Records are retried automatically, but only for 7 days after '
            + 'the punch; anything older than that is never sent.\n\n'
            + 'Common causes: the HR system rejecting inserts, credentials expired, '
            + 'or attendance push switched off under Integrations.',
        details: { count: n }
    });
};

/**
 * Records running out of time to sync.
 *
 * The scheduled retry is bounded by 7 days (see syncAttendanceToHRMS). Past
 * that a punch is never attempted again — it simply stays unsynced forever, and
 * the first anyone knows is payroll coming up short weeks later. Today's outage
 * lasted two hours so it was never close, but one spanning a long weekend plus
 * a couple of days would strand punches silently.
 *
 * Two tiers, because they need different responses. Approaching the cutoff is
 * still fixable by whatever is blocking the sync. Past it, only the backfill
 * script can recover them, and someone has to run it deliberately.
 */
const RETRY_WINDOW_DAYS = 7;
const WARN_AFTER_DAYS = 5;

const checkSyncAging = async () => {
    const res = await db.query(`
        SELECT
            count(*) FILTER (WHERE punch_time < NOW() - INTERVAL '${WARN_AFTER_DAYS} days'
                               AND punch_time >= NOW() - INTERVAL '${RETRY_WINDOW_DAYS} days')::int AS expiring,
            count(*) FILTER (WHERE punch_time < NOW() - INTERVAL '${RETRY_WINDOW_DAYS} days')::int AS stranded,
            min(punch_time) FILTER (WHERE punch_time < NOW() - INTERVAL '${RETRY_WINDOW_DAYS} days') AS oldest_stranded
        FROM attendance_logs
        WHERE sync_status IS DISTINCT FROM 'synced'
          AND sync_status IS DISTINCT FROM 'skipped'
    `);
    const { expiring, stranded, oldest_stranded } = res.rows[0];

    await alerts.track('sync_expiring', expiring > 0, {
        severity: 'high',
        subject: `${expiring} attendance records will stop retrying within ${RETRY_WINDOW_DAYS - WARN_AFTER_DAYS} days`,
        body: `${expiring} punches have been waiting to sync for more than ${WARN_AFTER_DAYS} days.\n\n`
            + `The automatic retry only covers ${RETRY_WINDOW_DAYS} days. Once they pass that, they are `
            + 'never attempted again and will be missing from payroll with nothing to indicate it.\n\n'
            + 'Fix whatever is blocking the sync now and they will go through on their own.',
        details: { count: expiring }
    });

    // Deliberately NOT auto-resolving into silence: these do not fix
    // themselves, so the alert stays open until someone runs the backfill and
    // the count actually reaches zero.
    await alerts.track('sync_stranded', stranded > 0, {
        severity: 'high',
        subject: `${stranded} attendance records will never sync without action`,
        body: `${stranded} punches are older than the ${RETRY_WINDOW_DAYS}-day retry window, the oldest from `
            + `${oldest_stranded}.\n\nThey are recorded in NeevTime but will never reach the HR system on `
            + 'their own — the scheduled sync no longer looks at them.\n\n'
            + 'Recovering them needs the backfill run by hand:\n'
            + '  docker exec attendance_app node scripts/sync_all_pending.js\n\n'
            + 'Check the HR system is accepting records first, or the run will fail through the whole backlog.',
        details: { count: stranded }
    });
};

/**
 * An account being locked out means repeated wrong passwords. Occasionally that
 * is someone fat-fingering; repeatedly, across accounts, it is someone trying
 * passwords against a system holding staff records and door access.
 */
const checkAccountLockouts = async () => {
    const res = await db.query(`
        SELECT username, locked_until
        FROM users
        WHERE locked_until IS NOT NULL AND locked_until > NOW()
        ORDER BY username
    `);

    const names = res.rows.map(r => r.username);
    await alerts.track('accounts_locked', names.length > 0, {
        severity: names.length > 1 ? 'high' : 'medium',
        subject: names.length > 1
            ? `${names.length} accounts locked out`
            : `Account "${names[0]}" locked out`,
        body: `Locked by repeated failed sign-ins: ${names.join(', ')}\n\n`
            + 'One account is usually a forgotten password. Several at once, or the same one '
            + 'repeatedly, is worth treating as someone guessing — this system holds staff '
            + 'records and controls door access.\n\n'
            + 'Recent sign-in attempts are in System Logs.',
        details: { accounts: names.join(', ') }
    });
};

/** A reader that has stopped talking is a reader whose punches are not arriving. */
const checkDevicesOffline = async () => {
    const cfg = await alerts.alertConfig();
    const minutes = Number(cfg.device_offline_minutes) || 30;

    const res = await db.query(`
        SELECT serial_number, device_name, last_activity,
               ROUND(EXTRACT(EPOCH FROM (NOW() - last_activity)) / 60)::int AS silent_minutes
        FROM devices
        WHERE retired_at IS NULL AND status IS DISTINCT FROM 'retired'
          -- The mobile app is a row in devices so mobile punches satisfy the
          -- foreign key and can be reported on by device. It has no heartbeat,
          -- so without this it would be announced as a dead reader every five
          -- minutes forever — and an alert that always fires is one people
          -- learn to delete unread.
          AND is_virtual IS NOT TRUE
    `);

    for (const d of res.rows) {
        const silent = d.last_activity === null || d.silent_minutes >= minutes;
        await alerts.track(`device_offline:${d.serial_number}`, silent, {
            severity: 'high',
            subject: `${d.device_name || d.serial_number} has stopped reporting`,
            body: `Reader "${d.device_name || d.serial_number}" (${d.serial_number}) has sent `
                + `nothing for ${d.silent_minutes ?? 'an unknown number of'} minutes.\n\n`
                + 'Punches made at this door may not be reaching NeevTime. Readers buffer '
                + 'internally and re-send when they reconnect, so a short outage usually '
                + 'recovers on its own — but a long one risks losing attendance.',
            details: { device: d.serial_number }
        });
    }
};

/**
 * Nobody has punched today.
 *
 * On 2026-08-16 this system was found to have recorded no attendance since
 * 2026-03-24 — 145 days. All four readers were powered on, on the network, and
 * polling every 30 seconds the entire time. nginx was proxying /iclock to a Node
 * process that had died inside its own container, so every poll got a 502 and
 * never reached the application.
 *
 * Every check in this file missed it:
 *
 *  - checkDevicesOffline reads devices.last_activity, which is only written when
 *    a request *reaches* Node. A 502 never does, so the readers looked exactly
 *    like readers that had been unplugged — and would have, had the check
 *    existed before the outage started.
 *  - the container healthcheck asks nginx, and nginx was healthy.
 *  - the attendance push and sync checks watch what leaves the system, and with
 *    nothing arriving there was nothing to push and nothing to complain about.
 *
 * Every one of those watches a component. This watches the outcome: did any
 * punch, from any reader, get stored today? It is indifferent to where the chain
 * broke — reader, network, proxy, ingest or database — which is exactly the
 * property the others lack.
 *
 * Deliberately not a rolling window. "No punches in the last 24 hours" fires
 * every Monday morning, because Friday evening to Monday is longer than that,
 * and a check that cries wolf weekly is a check people turn off. This asks a
 * question with an unambiguous answer: it is a working day, the morning is over,
 * and the attendance table is empty.
 */
/**
 * Everything checkNoPunches reasons about, in one query — shared with the fire
 * drill below so the drill exercises the identical SQL, timezone conversion
 * and gates rather than a copy that drifts.
 */
const noPunchesStatus = async () => {
    const cfg = await alerts.alertConfig();
    // Late enough that a genuinely quiet morning has ended. First shift starts
    // well before this; if nothing is recorded by now, something is wrong.
    const afterHour = Number(cfg.no_punch_after_hour) || 11;

    // The database container runs UTC while punch_time holds local wall-clock
    // time. CURRENT_DATE and LOCALTIME are therefore the UTC day and hour: the
    // "past 11:00" gate would not become true until 16:30 in IST, and the day
    // would roll over at 05:30. Every date this check reasons about has to be
    // converted explicitly.
    const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');

    const res = await db.query(`
        WITH t AS (SELECT (NOW() AT TIME ZONE $1) AS local_now)
        SELECT
            local_now::date                               AS today,
            EXTRACT(HOUR FROM local_now)::int             AS hour_now,
            EXTRACT(DOW  FROM local_now)::int             AS dow,
            (SELECT count(*)::int FROM attendance_logs
              WHERE punch_time >= local_now::date
                AND punch_time <  local_now::date + 1)    AS punches_today,
            (SELECT max(punch_time) FROM attendance_logs) AS last_punch,
            (SELECT count(*)::int FROM holidays
              WHERE date = local_now::date)               AS is_holiday
        FROM t
    `, [tz]);

    const r = res.rows[0];
    const weekend = r.dow === 0 || r.dow === 6;
    const silentDays = r.last_punch
        ? Math.floor((Date.now() - new Date(r.last_punch).getTime()) / 86400000)
        : null;
    return { ...r, weekend, silentDays, afterHour,
             gated: weekend || r.is_holiday > 0 || r.hour_now < afterHour };
};

const noPunchesPayload = (r) => ({
        severity: 'critical',
        subject: 'No attendance recorded today — collection may be broken',
        body: 'Not one punch from any reader has been stored today.\n\n'
            + (r.last_punch
                // localDate, not toISOString — the latter reports the UTC date,
                // which in IST is the previous day for everything before 05:30.
                // An alert about attendance dates must not name the wrong day.
                ? `The most recent punch in the database is ${localDate(new Date(r.last_punch))}`
                  + `${r.silentDays ? `, ${r.silentDays} day(s) ago` : ''}.\n\n`
                : 'There are no punches in the database at all.\n\n')
            + 'This is the outcome check: it does not care which part of the chain '
            + 'failed. Readers can be powered on and polling and still have every '
            + 'request rejected before it reaches the application — that state is '
            + 'invisible to the device-offline alert, and it went unnoticed for 145 '
            + 'days once already.\n\n'
            + 'Check, in order: that /iclock returns 200 through the same address '
            + 'the readers use (not just directly against the API port), that the '
            + 'server process is actually running, and only then the readers '
            + 'themselves.',
        details: { punches_today: 0, last_punch: r.last_punch, silent_days: r.silentDays }
});

const checkNoPunches = async () => {
    const r = await noPunchesStatus();
    // Only ask on a working day, once the morning has passed. Outside that the
    // check is silent rather than guessing — and critically, it does not resolve
    // an open alert either, so an outage raised on Friday stays open over the
    // weekend instead of appearing to fix itself.
    if (r.gated) return;
    await alerts.track('no_punches_today', r.punches_today === 0, noPunchesPayload(r));
};

/**
 * Fire drill: make checkNoPunches actually fire, once, on purpose.
 *
 * This check is the one written to catch a dead ingest — the 145-day failure —
 * and it had never fired even once, so its query, its timezone gates and its
 * delivery were all assumed rather than observed. Detection without delivery is
 * not monitoring, and delivery nobody has seen is not delivery.
 *
 * The drill runs the real query and composes the real body from real data; the
 * only thing forced is the verdict. The mail is labelled a drill in the
 * subject, because an operator who cannot tell a drill from an outage will
 * ignore the one that matters.
 */
const drillNoPunches = async () => {
    const r = await noPunchesStatus();
    const payload = noPunchesPayload(r);

    const key = 'no_punches_today_drill';
    await db.query('DELETE FROM alert_state WHERE alert_key = $1', [key]);
    const raised = await alerts.raise(key, {
        ...payload,
        subject: `[DRILL] ${payload.subject}`,
        body: 'THIS IS A DRILL. Punches are arriving normally; the verdict below is '
            + 'forced so the alert path is proven end to end.\n\n' + payload.body,
    });
    const resolved = await alerts.resolve(key);

    return {
        sent: raised.sent === true,
        reason: raised.reason || null,
        recovery_sent: resolved.sent === true,
        // What the real check would decide this minute, so the response also
        // documents that the gates evaluate sensibly on this installation.
        gates: {
            local_hour: r.hour_now, weekend: r.weekend,
            holiday: r.is_holiday > 0, fires_after_hour: r.afterHour,
            gated_right_now: r.gated, punches_today: r.punches_today,
        },
    };
};

/** Commands the readers refused for good — someone has to look at these. */
const checkDeadLetters = async () => {
    const res = await db.query(
        `SELECT count(*)::int AS n FROM device_commands WHERE status = 'dead_letter'`
    );
    const n = res.rows[0].n;
    await alerts.track('command_dead_letter', n > 0, {
        severity: 'medium',
        subject: `${n} device command${n === 1 ? '' : 's'} gave up`,
        body: `${n} command${n === 1 ? ' has' : 's have'} exhausted their retries and will not `
            + 'be sent again.\n\nThese are usually user enrolments or deletions that never '
            + 'reached a reader — which can mean someone who has left still has door access. '
            + 'Review them under Devices → Sync & Queue.',
        details: {}
    });
};

/**
 * Repeated saves of the same settings form collapse into one alert. Five
 * minutes is long enough to cover someone adjusting several fields and saving
 * between each, short enough that a genuinely separate change an hour later
 * still reports.
 */
const CONFIG_ALERT_QUIET_MS = 5 * 60 * 1000;
const lastConfigAlert = new Map();

/** Reports config changes, so a repeat of 31 July is noticed the same day. */
const notifyConfigChange = async ({ username, entity, action, summary }) => {
    try {
        const cfg = await alerts.alertConfig();
        if (!cfg.enabled || cfg.notify_config_changes !== true) return;

        // Saving a settings form several times in a minute is one act of
        // configuration, not six incidents. Without this, six saves in thirty
        // seconds sent six emails — the fastest possible way to teach someone
        // to filter this sender.
        const now = Date.now();
        const last = lastConfigAlert.get(entity) || 0;
        if (now - last < CONFIG_ALERT_QUIET_MS) return;
        lastConfigAlert.set(entity, now);

        // transient: this reports an event, not a condition. Nothing recovers
        // from "a setting changed", so it closes itself rather than sitting in
        // the open-issues list and every digest from now on.
        await alerts.raise(`config_change:${entity}:${now}`, {
            transient: true,
            severity: 'medium',
            subject: `${entity} settings changed by ${username || 'unknown user'}`,
            body: `${action} on ${entity}\n\nBy: ${username || 'unknown'}\n\n${summary || ''}\n\n`
                + 'If this was not you, review it — a change here can stop attendance '
                + 'reaching payroll without anything appearing broken.',
            details: {}
        });
    } catch (err) {
        log('ERROR', 'config change alert failed', { error: err.message });
    }
};

/** Once-a-day summary: what was collected, what was sent, what was held back. */
const sendDigest = async () => {
    const cfg = await alerts.alertConfig();
    if (!cfg.enabled || cfg.digest_enabled !== true || cfg.recipientList.length === 0) return;

    const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');

    const [punches, sync, devices, open] = await Promise.all([
        db.query(`SELECT count(*)::int AS total, count(DISTINCT employee_code)::int AS people
                  FROM attendance_logs WHERE punch_time::date = CURRENT_DATE - 1`),
        db.query(`SELECT sync_status, count(*)::int AS n FROM attendance_logs
                  WHERE punch_time::date = CURRENT_DATE - 1 GROUP BY 1`),
        db.query(`SELECT count(*) FILTER (WHERE status = 'online')::int AS online,
                         count(*)::int AS total
                  FROM devices WHERE retired_at IS NULL`),
        alerts.openAlerts()
    ]);

    const byStatus = Object.fromEntries(sync.rows.map(r => [r.sync_status, r.n]));
    const p = punches.rows[0];
    const d = devices.rows[0];

    const body = [
        `Yesterday: ${p.total} punches from ${p.people} people.`,
        '',
        `  synced to HR system : ${byStatus.synced || 0}`,
        `  held back           : ${byStatus.skipped || 0}   (facility, security and test accounts)`,
        `  still queued        : ${byStatus.pending || 0}`,
        '',
        `Readers online: ${d.online} of ${d.total}`,
        '',
        open.length === 0
            ? 'No open issues.'
            : `Open issues (${open.length}):\n` + open.map(a => `  - ${a.subject}`).join('\n'),
        '',
        // A digest that arrives while nothing works is worse than no digest, so
        // say plainly when the numbers themselves indicate a problem.
        (byStatus.pending || 0) > 500
            ? 'NOTE: a large number of records are still queued. Attendance may not be reaching payroll.'
            : ''
    ].filter(Boolean).join('\n');

    try {
        const email = require('./email');
        await email.sendAlertEmail(cfg.recipientList, 'NeevTime daily summary', body,
            { severity: 'low', timezone: tz });
        log('INFO', 'Digest sent', { recipients: cfg.recipientList.length });
    } catch (err) {
        log('ERROR', 'Digest failed', { error: err.message });
    }
};

/** One sweep of every condition. Individually guarded: one bad check must not stop the rest. */
const runChecks = async () => {
    const cfg = await alerts.alertConfig();
    if (!cfg.enabled) return;

    for (const [name, fn] of [
        ['attendance push', checkAttendancePush],
        ['sync backlog', checkSyncBacklog],
        ['sync aging', checkSyncAging],
        ['account lockouts', checkAccountLockouts],
        ['devices offline', checkDevicesOffline],
        ['no punches today', checkNoPunches],
        ['dead letters', checkDeadLetters]
    ]) {
        try {
            await fn();
        } catch (err) {
            log('ERROR', `check "${name}" failed`, { error: err.message });
        }
    }
};

/**
 * Checks every 5 minutes; digest once a day at the configured local time.
 * The digest guards on the date it last ran so a restart cannot send it twice.
 */
let lastDigestDate = null;

/**
 * Local calendar date. toISOString() would give the UTC date, and the time
 * comparison below uses local hours — mixing the two makes the guard wrong
 * between midnight and the UTC offset, which in IST is every night until 05:30.
 */
const localDate = (d = new Date()) => [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
].join('-');

/** Has the configured send time already passed today? */
const digestTimeReached = (cfg, now = new Date()) => {
    const [h, m] = String(cfg.digest_time || '08:00').split(':').map(Number);
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= (m || 0));
};

const startAlertChecks = async () => {
    const CHECK_MS = 5 * 60 * 1000;

    setInterval(() => { runChecks().catch(() => {}); }, CHECK_MS);

    // Without this, restarting after the send time fires a digest immediately:
    // lastDigestDate is null, the time has passed, so the first tick decides
    // today's is still owed. A container restarted three times in an afternoon
    // sends three "daily" summaries. Treat today's as already sent and wait for
    // tomorrow — a missed digest is a far smaller problem than a feature that
    // cries wolf on every deploy.
    try {
        const cfg = await alerts.alertConfig();
        if (digestTimeReached(cfg)) {
            lastDigestDate = localDate();
            log('INFO', 'Digest already due today; next one tomorrow', { at: cfg.digest_time });
        }
    } catch { /* fall through: worst case is one extra digest */ }

    setInterval(async () => {
        try {
            const cfg = await alerts.alertConfig();
            if (!cfg.enabled || cfg.digest_enabled !== true) return;

            const today = localDate();
            if (lastDigestDate === today) return;

            if (digestTimeReached(cfg)) {
                lastDigestDate = today;
                await sendDigest();
            }
        } catch { /* the digest must not crash the loop */ }
    }, 60 * 1000);

    log('INFO', 'Alert checks started (5 min interval, daily digest)');
};

module.exports = {
    runChecks, sendDigest, startAlertChecks, notifyConfigChange,
    localDate, digestTimeReached,
    checkAttendancePush, checkSyncBacklog, checkSyncAging, checkAccountLockouts,
    checkDevicesOffline, checkDeadLetters, checkNoPunches, drillNoPunches
};
