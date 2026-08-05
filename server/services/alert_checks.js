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

/** A reader that has stopped talking is a reader whose punches are not arriving. */
const checkDevicesOffline = async () => {
    const cfg = await alerts.alertConfig();
    const minutes = Number(cfg.device_offline_minutes) || 30;

    const res = await db.query(`
        SELECT serial_number, device_name, last_activity,
               ROUND(EXTRACT(EPOCH FROM (NOW() - last_activity)) / 60)::int AS silent_minutes
        FROM devices
        WHERE retired_at IS NULL AND status IS DISTINCT FROM 'retired'
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

/** Reports config changes, so a repeat of 31 July is noticed the same day. */
const notifyConfigChange = async ({ username, entity, action, summary }) => {
    try {
        const cfg = await alerts.alertConfig();
        if (!cfg.enabled || cfg.notify_config_changes !== true) return;

        // Not deduped: each change is its own event, and there is nothing to
        // "resolve". The timestamp in the key keeps them distinct.
        await alerts.raise(`config_change:${entity}:${Date.now()}`, {
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
        ['devices offline', checkDevicesOffline],
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
    checkAttendancePush, checkSyncBacklog, checkDevicesOffline, checkDeadLetters
};
