/**
 * Give finished days a final verdict.
 *
 * The engine deliberately refuses to judge a day that is still running: at
 * 13:00 everyone who arrived at 09:00 is four hours in, and scoring them then
 * labels the whole workforce Short Day. So a day in progress is recorded as
 * Present and the verdict waits.
 *
 * Nothing ever came back to deliver that verdict. The only recompute trigger is
 * a punch arriving, so the last calculation of any day happens at that day's
 * final punch — while it is still "in progress" — and the provisional Present
 * becomes permanent.
 *
 * It hid because it is only wrong when someone worked short. For a normal full
 * day, provisional Present is also the correct final answer. Measured over one
 * week: 19 of 429 Present rows should have read Short Day, Half Day or Miss
 * Punch — including three showing a person present for zero minutes.
 *
 * The days that did get correct verdicts came from punches arriving after
 * midnight for the previous day, where the day was already over and the engine
 * judged it properly. That is the behaviour this makes deliberate rather than
 * accidental.
 *
 * Hand-corrections are safe: bulkUpsertSummaries skips rows where is_finalized
 * is set, which is what Manual Entry and approved regularisations write.
 */

const moment = require('moment-timezone');
const settings = require('../utils/settings');

const log = (level, msg, data = {}) => {
    console.log(`[${new Date().toISOString()}] [${level}] [Recompute] ${msg}`,
        Object.keys(data).length ? JSON.stringify(data) : '');
};

/**
 * Recompute the last `days` complete days, never today.
 *
 * More than one day because a late device upload can add punches to a day
 * already scored — readers buffer when they lose the network, and those punches
 * can arrive hours later. Re-running a few days costs little and catches them.
 */
const recomputeFinishedDays = async (days = 3) => {
    const engine = require('./attendance_engine');
    const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');

    const end = moment().tz(tz).subtract(1, 'day').format('YYYY-MM-DD');
    const start = moment().tz(tz).subtract(days, 'days').format('YYYY-MM-DD');

    log('INFO', 'Recomputing finished days', { start, end, timezone: tz });
    const results = await engine.processDateRange(start, end);
    log('INFO', 'Recompute complete', { start, end, rows: results?.length ?? 'unknown' });
    return results;
};

/**
 * Runs shortly after midnight in the configured zone.
 *
 * Checks every 10 minutes rather than sleeping until a computed time: a
 * container restart must not be able to skip the run, and a sleep long enough
 * to span midnight is a sleep long enough to be lost to a redeploy. The date
 * guard makes repeats harmless.
 */
let lastRunDate = null;
const startRecomputeJob = async () => {
    const CHECK_MS = 10 * 60 * 1000;
    const RUN_AFTER_HOUR = 1; // 01:00 local — well past the last night shift punch

    const localDate = (d) => [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
    ].join('-');

    // On boot, treat today's run as done if the hour has passed. Otherwise every
    // restart during the working day would recompute — harmless, but it would
    // churn through every employee for no reason.
    if (new Date().getHours() >= RUN_AFTER_HOUR) {
        lastRunDate = localDate(new Date());
    }

    setInterval(async () => {
        try {
            const now = new Date();
            const today = localDate(now);
            if (lastRunDate === today || now.getHours() < RUN_AFTER_HOUR) return;

            lastRunDate = today;
            await recomputeFinishedDays();
        } catch (err) {
            log('ERROR', 'Nightly recompute failed', { error: err.message });
        }
    }, CHECK_MS);

    log('INFO', `Recompute job started (nightly after ${String(RUN_AFTER_HOUR).padStart(2, '0')}:00)`);
};

module.exports = { recomputeFinishedDays, startRecomputeJob };
