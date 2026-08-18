/**
 * Rotation patterns: a repeating shift sequence that GENERATES
 * employee_schedules rows ahead of time.
 *
 * Generation rather than interpretation, deliberately. The attendance engine
 * reads employee_schedules and needs no knowledge of rotations; the Schedule
 * screens show exactly what will be worked with no special casing; and
 * deactivating a rotation simply stops future generation without touching
 * what was already planned. The cost is a horizon — rows exist only as far
 * ahead as the generator has run — so the generator runs with the other
 * nightly jobs and keeps a rolling window ahead.
 */

const db = require('../db');
const moment = require('moment-timezone');
const settings = require('../utils/settings');

const HORIZON_DAYS = 35;   // five weeks planned ahead, regenerated nightly

/**
 * Which slot of the pattern a date falls in, for a given anchor and offset.
 * Pure, for tests: slot((anchor+8d), anchor, 7d period, seq len 2, offset 0) = 1.
 */
const slotFor = (date, anchorDate, periodDays, seqLength, slotOffset = 0) => {
    const days = moment(date).diff(moment(anchorDate), 'days');
    if (days < 0) return null;
    const slot = (Math.floor(days / periodDays) + slotOffset) % seqLength;
    return slot < 0 ? slot + seqLength : slot;
};

/**
 * Generate employee_schedules for every active rotation assignment, from
 * `from` for `days` days. Idempotent: a (employee, date-range) already covered
 * by a generated row for the same shift is left alone; a CHANGED pattern
 * replaces only rows this generator owns (reason marks them), never rows a
 * person entered by hand.
 */
const generate = async ({ from = null, days = HORIZON_DAYS } = {}) => {
    const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');
    const start = from ? moment.tz(from, tz) : moment.tz(tz);
    const created = [];

    const assignments = await db.query(`
        SELECT er.employee_id, er.slot_offset, er.starts_on, er.ends_on,
               r.id AS rotation_id, r.name, r.shift_sequence, r.period_days, r.anchor_date
          FROM employee_rotations er
          JOIN shift_rotations r ON r.id = er.rotation_id AND r.is_active IS NOT FALSE
          JOIN employees e ON e.id = er.employee_id
         WHERE LOWER(e.status) IS DISTINCT FROM 'resigned'`);

    for (const a of assignments.rows) {
        const seq = a.shift_sequence;
        if (!seq?.length) continue;

        for (let d = 0; d < days; d += a.period_days) {
            // Period boundaries aligned to the anchor, not to `from` — running
            // the generator on a Wednesday must not shift everyone's weeks.
            const dayCursor = start.clone().add(d, 'days');
            const daysFromAnchor = dayCursor.diff(moment.tz(a.anchor_date, tz), 'days');
            const periodStart = moment.tz(a.anchor_date, tz)
                .add(Math.floor(daysFromAnchor / a.period_days) * a.period_days, 'days');
            const periodEnd = periodStart.clone().add(a.period_days - 1, 'days');

            if (a.starts_on && periodEnd.isBefore(moment(a.starts_on))) continue;
            if (a.ends_on && periodStart.isAfter(moment(a.ends_on))) continue;

            const slot = slotFor(periodStart, a.anchor_date, a.period_days, seq.length, a.slot_offset);
            if (slot === null) continue;
            const shiftId = seq[slot];
            if (!shiftId) continue;   // an off-pattern slot assigns nothing

            const marker = `rotation:${a.rotation_id}`;
            // One generated row per period. Replace only rows this rotation
            // generated; a hand-entered schedule for the same span wins and
            // the generator steps around it.
            const clash = await db.query(`
                SELECT id, shift_id, reason FROM employee_schedules
                 WHERE employee_id = $1 AND effective_from = $2`,
                [a.employee_id, periodStart.format('YYYY-MM-DD')]);
            const existing = clash.rows[0];
            if (existing) {
                if (existing.reason !== marker) continue;          // human wins
                if (existing.shift_id === shiftId) continue;       // already right
                await db.query('DELETE FROM employee_schedules WHERE id = $1', [existing.id]);
            }

            await db.query(`
                INSERT INTO employee_schedules
                    (employee_id, shift_id, effective_from, effective_to, reason)
                VALUES ($1, $2, $3, $4, $5)`,
                [a.employee_id, shiftId,
                 periodStart.format('YYYY-MM-DD'), periodEnd.format('YYYY-MM-DD'), marker]);
            created.push({ employee_id: a.employee_id, from: periodStart.format('YYYY-MM-DD'), shift_id: shiftId });
        }
    }
    return { generated: created.length, horizon_days: days };
};

/**
 * Apply an approved swap: each person takes the other's shift for one day.
 * A one-day override row per person; the engine's latest-effective rule and
 * effective_to make it land on exactly that date.
 */
const applySwap = async (swapId) => {
    const swap = (await db.query('SELECT * FROM shift_swaps WHERE id = $1', [swapId])).rows[0];
    if (!swap || swap.status !== 'approved') return { applied: false, reason: 'not approved' };

    const shiftOn = async (code, date) => {
        const r = await db.query(`
            SELECT es.shift_id FROM employee_schedules es
              JOIN employees e ON e.id = es.employee_id
             WHERE e.employee_code = $1 AND es.effective_from <= $2
               AND (es.effective_to IS NULL OR es.effective_to >= $2)
             ORDER BY es.effective_from DESC LIMIT 1`, [code, date]);
        return r.rows[0]?.shift_id ?? null;
    };
    const idOf = async (code) =>
        (await db.query('SELECT id FROM employees WHERE employee_code = $1', [code])).rows[0]?.id;

    const [reqShift, cptShift] = await Promise.all([
        shiftOn(swap.requester_code, swap.requester_date),
        shiftOn(swap.counterpart_code, swap.counterpart_date),
    ]);
    const put = async (code, date, shiftId) => {
        if (!shiftId) return;
        const empId = await idOf(code);
        await db.query(`
            INSERT INTO employee_schedules (employee_id, shift_id, effective_from, effective_to, reason, is_temporary)
            VALUES ($1, $2, $3, $3, $4, true)`,
            [empId, shiftId, date, `swap:${swap.id}`]);
    };
    // Each works the OTHER's shift on their own date.
    await put(swap.requester_code, swap.requester_date, cptShift);
    await put(swap.counterpart_code, swap.counterpart_date, reqShift);
    return { applied: true };
};

/** Nightly, alongside the recompute: keep the horizon rolling. */
let lastRunDate = null;
const startRotationJob = () => {
    setInterval(async () => {
        try {
            const tz = await settings.get('timezone', 'system_timezone', 'Asia/Kolkata');
            const today = moment.tz(tz).format('YYYY-MM-DD');
            if (lastRunDate === today) return;
            if (moment.tz(tz).hour() < 1) return;
            lastRunDate = today;
            const out = await generate();
            if (out.generated) console.log(`[Rotations] generated ${out.generated} schedule row(s)`);
        } catch (err) {
            console.error('[Rotations] failed:', err.message);
        }
    }, 10 * 60 * 1000);
};

module.exports = { slotFor, generate, applySwap, startRotationJob, HORIZON_DAYS };
