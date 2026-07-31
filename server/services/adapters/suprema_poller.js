/**
 * Suprema BioStar 2 poller — NOT STARTED BY DEFAULT.
 *
 * BioStar keeps its events on its own server, so this asks for them on an
 * interval rather than being pushed to. Each cycle fetches events newer than the
 * last one already seen and hands them to punch_ingest.
 *
 * To enable, call startSupremaPoller(config) from server.js after the schedulers.
 * It is intentionally not started until it has been run against a real BioStar
 * install — see docs/adapters.md.
 *
 *   startSupremaPoller({
 *     baseUrl: 'https://biostar.local',
 *     username: 'admin',
 *     password: process.env.BIOSTAR_PASSWORD,
 *     deviceSerial: 'BIOSTAR-1',      // must exist in the devices table
 *     allowSelfSigned: true,
 *     intervalMs: 60000
 *   }, io)
 */

const { BioStarClient, mapEvent } = require('./suprema');
const { recordPunch } = require('../punch_ingest');
const { isDeviceAllowed } = require('../device_registry');
const logger = require('../../utils/logger');

const startSupremaPoller = (config, io = null) => {
    const intervalMs = config.intervalMs || 60000;
    const client = new BioStarClient(config);

    // Start from now rather than replaying history on first run; an operator who
    // wants a backfill can pass an explicit `since`.
    let cursor = config.since ? new Date(config.since) : new Date();
    let running = false;

    const tick = async () => {
        if (running) return; // a slow cycle must not overlap the next one
        running = true;

        try {
            const trust = await isDeviceAllowed(config.deviceSerial);
            if (!trust.allowed) {
                logger.info(`[Suprema] skipping poll: ${trust.reason}`);
                return;
            }

            const start = cursor.toISOString();
            const end = new Date().toISOString();

            const rows = await client.searchEvents({ start, end });
            let stored = 0;
            const ignored = new Map();

            for (const row of rows) {
                const parsed = mapEvent(row, config);
                if (!parsed.punch) {
                    ignored.set(parsed.ignored, (ignored.get(parsed.ignored) || 0) + 1);
                    continue;
                }

                const outcome = await recordPunch(
                    { ...parsed.punch, deviceSerial: config.deviceSerial },
                    { io }
                );
                if (outcome.stored) stored += 1;
            }

            // Only advance past events actually examined, so a mid-cycle failure
            // re-reads rather than skips. Duplicates are harmless — punch_ingest
            // upserts on (employee_code, punch_time).
            cursor = new Date(end);

            if (stored > 0 || ignored.size > 0) {
                const summary = [...ignored].map(([reason, count]) => `${count}× ${reason}`).join('; ');
                logger.info(`[Suprema] ${rows.length} events, ${stored} stored${summary ? ` — ignored: ${summary}` : ''}`);
            }
        } catch (err) {
            // Leave the cursor where it is so the window is retried next tick
            logger.error(`[Suprema] poll failed: ${err.message}`);
        } finally {
            running = false;
        }
    };

    const timer = setInterval(tick, intervalMs);
    if (timer.unref) timer.unref();
    tick();

    logger.info(`[Suprema] poller started for ${config.deviceSerial} every ${intervalMs / 1000}s`);
    return () => clearInterval(timer);
};

module.exports = { startSupremaPoller };
