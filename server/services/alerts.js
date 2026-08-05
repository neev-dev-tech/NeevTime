/**
 * Outbound alerting.
 *
 * The problem this exists for: on 2026-07-31 attendance sync was switched off
 * and nobody knew for four days. Punches kept arriving, reports kept working,
 * the dashboard stayed green, and the only symptom was records missing in
 * ERPNext, where nobody was looking. Health information existed the whole time —
 * health-monitor.js was generating alerts and emitting them to any dashboard
 * that happened to be open — but nothing left the building.
 *
 * Design constraints, in order of importance:
 *
 * 1. **One alert per issue.** An alert raised on every check would send a mail
 *    every five minutes for as long as a reader stayed offline. People filter
 *    that, and then they filter the one that mattered. State lives in
 *    alert_state; a key is notified once when it opens and once when it clears.
 *
 * 2. **Alerting must never break attendance.** Every entry point swallows its
 *    own errors. A dead SMTP server must not stop a punch being recorded.
 *
 * 3. **Silent alerting is worse than none.** Email is the only channel, so a
 *    broken SMTP would mean no alerts at all with no sign of it. Delivery
 *    failures are written to alert_state.last_error and surfaced in the app, so
 *    "the alerts are broken" is itself visible.
 *
 * 4. **Off by default.** Enabled only once recipients are set, so a fresh
 *    install cannot start mailing an address nobody chose.
 */

const db = require('../db');
const settings = require('../utils/settings');

const log = (level, msg, data = {}) => {
    console.log(`[${new Date().toISOString()}] [${level}] [Alerts] ${msg}`,
        Object.keys(data).length ? JSON.stringify(data) : '');
};

/** Alerts are dropped rather than queued when disabled — no backlog to flush. */
const alertConfig = async () => {
    const cfg = await settings.getCategory('alerts', {
        enabled: false,
        recipients: '',
        device_offline_minutes: 30,
        digest_enabled: true,
        digest_time: '08:00',
        notify_config_changes: true
    });
    cfg.recipientList = String(cfg.recipients || '')
        .split(',').map(r => r.trim()).filter(Boolean);
    return cfg;
};

/** Records that delivery itself failed, so a broken SMTP is not invisible. */
const recordDeliveryFailure = async (key, message) => {
    try {
        await db.query(
            `UPDATE alert_state SET last_error = $2 WHERE alert_key = $1`,
            [key, String(message).slice(0, 500)]
        );
    } catch { /* the failure log must not fail */ }
};

const deliver = async (key, subject, body, details) => {
    const cfg = await alertConfig();
    if (!cfg.enabled) return { sent: false, reason: 'alerting disabled' };
    if (cfg.recipientList.length === 0) {
        return { sent: false, reason: 'no recipients configured' };
    }

    try {
        const email = require('./email');
        await email.sendAlertEmail(cfg.recipientList, subject, body, details);
        await db.query(
            `UPDATE alert_state SET notified_at = NOW(), last_error = NULL WHERE alert_key = $1`,
            [key]
        );
        return { sent: true };
    } catch (err) {
        log('ERROR', 'Alert delivery failed', { key, error: err.message });
        await recordDeliveryFailure(key, err.message);
        return { sent: false, reason: err.message };
    }
};

/**
 * Report a problem. Sends on the first call; subsequent calls with the same key
 * only bump the counter until resolve() is called.
 *
 * @param {string} key    stable identity for the issue, e.g. `device_offline:NYU7254000077`
 */
const raise = async (key, { subject, body, severity = 'medium', details = {} } = {}) => {
    try {
        // ON CONFLICT makes this safe against two checks racing: the first
        // insert wins and only it reports rowCount, so only one mail goes out.
        const opened = await db.query(`
            INSERT INTO alert_state (alert_key, severity, subject, opened_at, occurrences)
            VALUES ($1, $2, $3, NOW(), 1)
            ON CONFLICT (alert_key) DO UPDATE
                SET occurrences = alert_state.occurrences + 1,
                    -- A re-raise after a resolve is a NEW incident, so the
                    -- notified flag has to be cleared too. Without that, the
                    -- guard below sees a still-set notified_at and stays quiet —
                    -- a reader that breaks, recovers and breaks again would go
                    -- silent forever after the first time. In ON CONFLICT DO
                    -- UPDATE, alert_state.col refers to the pre-update value.
                    opened_at   = CASE WHEN alert_state.resolved_at IS NOT NULL
                                       THEN NOW() ELSE alert_state.opened_at END,
                    notified_at = CASE WHEN alert_state.resolved_at IS NOT NULL
                                       THEN NULL ELSE alert_state.notified_at END,
                    resolved_at = NULL
            RETURNING notified_at, resolved_at, occurrences
        `, [key, severity, subject]);

        const row = opened.rows[0];
        // Already told them about this incident: stay quiet. notified_at is
        // cleared above whenever a resolved issue re-opens, so this suppresses
        // repeats within an incident without suppressing the next one.
        if (row.notified_at) {
            return { sent: false, reason: 'already open' };
        }
        return await deliver(key, subject, body, { ...details, severity });
    } catch (err) {
        log('ERROR', 'raise failed', { key, error: err.message });
        return { sent: false, reason: err.message };
    }
};

/** Report that a previously raised issue has cleared. Silent if it was never open. */
const resolve = async (key, { subject, body } = {}) => {
    try {
        const res = await db.query(`
            UPDATE alert_state SET resolved_at = NOW()
            WHERE alert_key = $1 AND resolved_at IS NULL AND notified_at IS NOT NULL
            RETURNING subject, opened_at
        `, [key]);
        if (res.rowCount === 0) return { sent: false, reason: 'not open' };

        const original = res.rows[0];
        const minutes = Math.round((Date.now() - new Date(original.opened_at)) / 60000);
        return await deliver(
            key,
            subject || `Resolved: ${original.subject}`,
            body || `This cleared after ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            { severity: 'low' }
        );
    } catch (err) {
        log('ERROR', 'resolve failed', { key, error: err.message });
        return { sent: false, reason: err.message };
    }
};

/**
 * Raise or resolve in one call, from a boolean condition. Most checks are this
 * shape, and writing them by hand invites forgetting the resolve half — which
 * leaves an issue permanently "open" and suppresses the next real alert.
 */
const track = async (key, isProblem, payload) => (
    isProblem ? raise(key, payload) : resolve(key)
);

/** Issues currently open, for the app to display. */
const openAlerts = async () => {
    const res = await db.query(`
        SELECT alert_key, severity, subject, opened_at, occurrences, last_error
        FROM alert_state
        WHERE resolved_at IS NULL
        ORDER BY opened_at DESC
    `);
    return res.rows;
};

/** Alerts that could not be delivered — i.e. the alerting itself is broken. */
const undeliverable = async () => {
    const res = await db.query(
        `SELECT count(*)::int AS n FROM alert_state WHERE resolved_at IS NULL AND last_error IS NOT NULL`
    );
    return res.rows[0].n;
};

module.exports = { raise, resolve, track, openAlerts, undeliverable, alertConfig };
