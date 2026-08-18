const db = require('../db');
const moment = require('moment-timezone');

/** punch_state as written by punch_ingest.normalizeState: '0' in, '1' out. */
const OUT_STATE = '1';

/** Employment states meaning the person no longer works here. */
const HAS_LEFT = /resign|terminat|inactive|left|exit/i;
const settingsStore = require('../utils/settings');

const DEFAULTS = {
    timezone: 'Asia/Kolkata',
    shift_start: '09:00',
    grace_period_minutes: 15,
    full_day_threshold_hours: 8,
    half_day_threshold_hours: 4,
    overtime_threshold_hours: 9,
    all_sundays_off: true,
    saturdays_off: { 1: false, 2: false, 3: false, 4: false, 5: false }
};

/**
 * Attendance Processing Engine
 * Core logic to calculate daily attendance based on raw logs and shift rules.
 */
class AttendanceEngine {

    /**
     * Snapshot the Settings values this run should honour. Read once per batch
     * rather than per employee-day, so a settings change mid-run cannot produce
     * a summary calculated under two different rule sets.
     */
    async loadRules() {
        const attendance = await settingsStore.getCategory('attendance', {
            grace_period_minutes: DEFAULTS.grace_period_minutes,
            full_day_threshold_hours: DEFAULTS.full_day_threshold_hours,
            half_day_threshold_hours: DEFAULTS.half_day_threshold_hours,
            overtime_threshold_hours: DEFAULTS.overtime_threshold_hours
        });
        const weekend = await settingsStore.getCategory('weekend', {
            all_sundays_off: DEFAULTS.all_sundays_off,
            first_saturday_off: false,
            second_saturday_off: false,
            third_saturday_off: false,
            fourth_saturday_off: false,
            fifth_saturday_off: false
        });
        const timezone = await settingsStore.get('timezone', 'system_timezone', DEFAULTS.timezone);

        return {
            timezone: moment.tz.zone(timezone) ? timezone : DEFAULTS.timezone,
            shiftStart: DEFAULTS.shift_start,
            graceMinutes: attendance.grace_period_minutes,
            fullDayMinutes: attendance.full_day_threshold_hours * 60,
            halfDayMinutes: attendance.half_day_threshold_hours * 60,
            overtimeAfterMinutes: attendance.overtime_threshold_hours * 60,
            allSundaysOff: weekend.all_sundays_off,
            saturdaysOff: {
                1: weekend.first_saturday_off,
                2: weekend.second_saturday_off,
                3: weekend.third_saturday_off,
                4: weekend.fourth_saturday_off,
                5: weekend.fifth_saturday_off
            }
        };
    }

    /** True when the date is a configured weekly off (Sunday / nth Saturday). */
    isWeekOff(dateStr, rules) {
        const day = moment.tz(dateStr, rules.timezone);
        if (day.day() === 0) return rules.allSundaysOff;
        if (day.day() === 6) {
            const nth = Math.ceil(day.date() / 7);
            return Boolean(rules.saturdaysOff[nth]);
        }
        return false;
    }

    async processDateRange(startDate, endDate, employeeId = null, employeeCode = null) {
        console.log(`[ATTENDANCE ENGINE] Starting batch process: ${startDate} to ${endDate}`);

        const rules = await this.loadRules();

        // 1. Fetch all required logs in ONE query
        // punch_time comes back as text, deliberately.
        //
        // The column is `timestamp without time zone` holding local wall-clock,
        // and node-postgres turns that into a Date in the container's zone —
        // UTC, since nothing sets TZ. Everything downstream then read 09:09 as
        // 09:09Z and compared it against a shift written in IST: nine minutes
        // late scored 324, and the grouping below pushed any punch after 18:30
        // onto the following day. Handing the wall clock over as digits keeps
        // the reading in the zone the shift is written in.
        let logsQuery = `
            SELECT employee_code,
                   to_char(punch_time, 'YYYY-MM-DD HH24:MI:SS') AS punch_time,
                   punch_state
            FROM attendance_logs
            WHERE punch_time >= $1 AND punch_time <= $2
        `;
        const logsParams = [
          moment.tz(startDate, rules.timezone).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
          // Noon of the day AFTER the range, not midnight of its last day: a
          // night shift ending 06:00 puts its exit punch past endDate's
          // midnight, and cutting there re-created the split-night bug for the
          // final day of every range. Day workers' punches in that overhang
          // group to endDate+1 and fall out of the loop below untouched.
          moment.tz(endDate, rules.timezone).add(1, 'day').hour(12).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss')
        ];
        
        // Filter by numeric DB id (API callers) or employee_code (ADMS punches)
        let filterCode = employeeCode || null;
        if (!filterCode && employeeId) {
            const emp = await db.query('SELECT employee_code FROM employees WHERE id = $1', [employeeId]);
            if (emp.rows.length === 0) return [];
            filterCode = emp.rows[0].employee_code;
        }
        if (filterCode) {
            logsQuery += ' AND employee_code = $3';
            logsParams.push(filterCode);
        }

        const allLogs = await db.query(logsQuery, logsParams);

        // Shift assignments, so scoring honours them.
        //
        // These tables have existed since the schedules module was built, and
        // this function never read them: every employee was scored against the
        // single global shift_start in Settings, so assigning somebody the
        // 14:00 shift marked them five hours late every day they worked it.
        // The whole shift module was decorative.
        //
        // An employee with no assignment behaves exactly as before — the
        // global rules — which also means deploying this changes nobody's
        // numbers until a shift is actually assigned.
        // employee_schedules, NOT employee_shifts — the table the Schedule
        // screens actually write. The first version of this read
        // employee_shifts, which no screen has ever written: shift-aware
        // scoring shipped exactly as decorative as the module it was meant to
        // fix, and the user found it by looking for the feature and not
        // finding it. Two parallel assignment tables exist in this schema;
        // the one the UI writes is the one that means anything.
        //
        // Tolerating a missing table is load-bearing, not defensive habit:
        // this runs inside EVERY recompute, and throwing 42P01 on an older
        // database would stop attendance summarisation entirely — a worse
        // failure than shifts not applying.
        let assignmentRows = [];
        try {
            const assignments = await db.query(`
                SELECT e.employee_code, es.effective_from, es.effective_to,
                       s.start_time, s.grace_in_minutes, s.is_night_shift,
                       s.half_day_threshold_hours
                  FROM employee_schedules es
                  JOIN employees e ON e.id = es.employee_id
                  JOIN shifts s ON s.id = es.shift_id AND s.is_active IS NOT FALSE
                 ORDER BY e.employee_code, es.effective_from`);
            assignmentRows = assignments.rows;
        } catch (err) {
            if (err.code !== '42P01') throw err;
        }
        const shiftHistory = {};
        for (const a of assignmentRows) {
            (shiftHistory[a.employee_code] ||= []).push(a);
        }
        // The assignment covering the date: started on or before it, and not
        // yet ended — temporary schedules carry an effective_to. Later rows
        // win ties, matching what the Schedule screen shows topmost.
        const shiftFor = (employeeCode, dateStr) => {
            const list = shiftHistory[employeeCode];
            if (!list) return null;
            let found = null;
            for (const a of list) {
                const from = moment(a.effective_from).format('YYYY-MM-DD');
                if (from > dateStr) break;
                const to = a.effective_to ? moment(a.effective_to).format('YYYY-MM-DD') : null;
                if (!to || to >= dateStr) found = a;
            }
            return found;
        };
        
        // 2. Group logs by employee and SHIFT day.
        //
        // For a day worker the shift day is the calendar day. For a night
        // shift it cannot be: a 22:00–06:00 shift's punches land on two
        // calendar dates, and grouping by date split one worked night into an
        // evening with no exit and a dawn with no entry — two broken days.
        //
        // The boundary moves to noon for night workers: a punch before 12:00
        // belongs to the previous day's shift. Noon because no night shift
        // starts before it and none ends after it, so the rule needs no
        // knowledge of the particular shift's hours.
        const logsMap = {};
        allLogs.rows.forEach(log => {
            const local = moment.tz(log.punch_time, rules.timezone);
            const nominal = local.format('YYYY-MM-DD');
            const shift = shiftFor(log.employee_code, nominal);
            const dateStr = (shift?.is_night_shift && local.hour() < 12)
                ? local.clone().subtract(1, 'day').format('YYYY-MM-DD')
                : nominal;
            const key = `${log.employee_code}_${dateStr}`;
            if (!logsMap[key]) logsMap[key] = [];
            logsMap[key].push({ time: log.punch_time, state: log.punch_state });
        });

        // 3. Get all employees (if not already filtered)
        // status comes along so people who have left are not marked Absent every
        // day forever. See the guard in the loop below.
        let empQuery = 'SELECT employee_code, status FROM employees';
        if (filterCode) empQuery += ' WHERE employee_code = $1';
        const employees = await db.query(empQuery, filterCode ? [filterCode] : []);

        const results = [];
        const summaryData = [];

        // 4. Process each day/employee in memory
        let currentDate = moment.tz(startDate, rules.timezone);
        const endDay = moment.tz(endDate, rules.timezone);

        while (currentDate.isSameOrBefore(endDay, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            
            for (const emp of employees.rows) {
                const key = `${emp.employee_code}_${dateStr}`;
                const logs = logsMap[key] || [];

                // Someone who has left is not absent, they are gone. Scoring
                // every employee row regardless of status gave seven resigned
                // people an Absent record for every single day, growing daily
                // and quietly inflating every absence report.
                //
                // Deliberately keyed on whether punches exist rather than on a
                // resignation date: the date is often missing, and this keeps
                // their real attendance up to their last day while creating
                // nothing after it. A punch that does appear is still scored,
                // which is what you want — a former employee badging in is
                // worth seeing, not hiding.
                if (HAS_LEFT.test(emp.status || '') && logs.length === 0) continue;
                
                const stats = this.calculateDayStats(
                    emp.employee_code, dateStr, logs, rules, shiftFor(emp.employee_code, dateStr));
                results.push(stats);
                summaryData.push(stats);
            }
            currentDate.add(1, 'day');
        }

        // 5. Bulk Upsert to Database
        if (summaryData.length > 0) {
            await this.bulkUpsertSummaries(summaryData);
        }

        return results;
    }

    calculateDayStats(employeeCode, date, logs, rules = null, shift = null) {
        let r = rules || {
            timezone: DEFAULTS.timezone,
            shiftStart: DEFAULTS.shift_start,
            graceMinutes: DEFAULTS.grace_period_minutes,
            fullDayMinutes: DEFAULTS.full_day_threshold_hours * 60,
            halfDayMinutes: DEFAULTS.half_day_threshold_hours * 60,
            overtimeAfterMinutes: DEFAULTS.overtime_threshold_hours * 60,
            allSundaysOff: DEFAULTS.all_sundays_off,
            saturdaysOff: DEFAULTS.saturdays_off
        };

        // The assigned shift overrides the parts of the rules it defines.
        // Everything it does not define — OT threshold, weekly offs, timezone —
        // stays global, and an employee with no assignment is scored exactly as
        // before this parameter existed.
        if (shift) {
            r = {
                ...r,
                shiftStart: String(shift.start_time).slice(0, 5),
                graceMinutes: Number(shift.grace_in_minutes ?? r.graceMinutes),
                halfDayMinutes: shift.half_day_threshold_hours
                    ? Number(shift.half_day_threshold_hours) * 60 : r.halfDayMinutes,
            };
        }

        let inTime = null;
        let outTime = null;
        let status = this.isWeekOff(date, r) ? 'Weekly Off' : 'Absent';
        let durationMinutes = 0;
        let lateMinutes = 0;
        let otMinutes = 0;

        // A day that has not finished cannot be judged against a full-day
        // threshold. At 13:00 everyone who arrived at 09:00 is four hours in, and
        // scoring them now labels the whole workforce Short Day, or Miss Punch if
        // they simply have not left yet. Verdicts wait until the day is over.
        let dayInProgress = date === moment().tz(r.timezone).format('YYYY-MM-DD');
        // At 03:00 a night worker is mid-shift on YESTERDAY'S shift day. Without
        // this, the guard sees a different calendar date, judges the day over,
        // and scores someone still standing at their machine a Miss Punch.
        if (shift?.is_night_shift) {
            const localNow = moment().tz(r.timezone);
            const shiftToday = localNow.hour() < 12
                ? localNow.clone().subtract(1, 'day').format('YYYY-MM-DD')
                : localNow.format('YYYY-MM-DD');
            dayInProgress = date === shiftToday;
        }

        if (logs.length > 0) {
            // Accepts either shape: {time, state} from the query above, or a
            // bare timestamp. Bare timestamps carry no direction, and so does
            // any row whose punch_state was never populated — older data, or a
            // vendor that does not report it.
            const normalized = logs.map(l =>
                (l && typeof l === 'object' && 'time' in l)
                    ? { time: l.time, state: l.state }
                    : { time: l, state: null });

            const sortedLogs = normalized
                .sort((a, b) => moment(a.time).valueOf() - moment(b.time).valueOf());

            // Without direction there is nothing better than the last punch, and
            // guessing would be worse: treating an unknown state as "not an
            // exit" would relabel every historic day a Miss Punch.
            const hasDirection = sortedLogs.some(l => l.state !== null && l.state !== undefined);

            inTime = sortedLogs[0].time;

            // Direction matters. Taking simply the last punch of the day made a
            // forgotten badge-out invisible: someone who arrived at 10:30, left
            // at 13:49, returned at 14:45 and never badged out again was
            // recorded as working 10:30 to 14:45 — a shorter day, quietly, with
            // no indication anything was missing. Now the out-time is the last
            // punch that is actually an exit, and a day ending on an entry is
            // reported as a Miss Punch for someone to correct.
            //
            // punch_state is set from each reader's configured direction at
            // ingest ('0' in, '1' out). Verified across a week of this fleet:
            // 3,701 of 3,702 punches agreed with their reader's direction.
            const last = sortedLogs[sortedLogs.length - 1];
            const lastExit = hasDirection
                ? [...sortedLogs].reverse().find(l => String(l.state) === OUT_STATE)
                : (sortedLogs.length > 1 ? last : null);
            const endsOnEntry = hasDirection && String(last.state) !== OUT_STATE;

            outTime = lastExit && moment(lastExit.time).isAfter(moment(inTime))
                ? lastExit.time
                : null;

            if (outTime) {
                durationMinutes = Math.floor(moment(outTime).diff(moment(inTime), 'minutes'));
                if (durationMinutes > r.overtimeAfterMinutes) {
                    otMinutes = durationMinutes - r.overtimeAfterMinutes;
                }
            }

            if (dayInProgress) {
                // They are at work; hours so far are recorded, the verdict is not
                status = 'Present';
            } else if (endsOnEntry) {
                // Hours up to the last exit are kept so the day is not blank,
                // but the label says a punch is missing rather than implying a
                // short day someone did not actually work.
                status = 'Miss Punch';
            } else if (outTime) {
                // Thresholds come from Settings → Attendance Rules
                if (durationMinutes >= r.fullDayMinutes) status = 'Present';
                else if (durationMinutes >= r.halfDayMinutes) status = 'Half Day';
                else status = 'Short Day';
            } else {
                status = 'Miss Punch';
            }

            // Late is measured from shift start plus the configured grace period,
            // so a grace of 15 minutes means 09:16 is the first late minute.
            const graceEnd = moment.tz(`${date} ${r.shiftStart}:00`, r.timezone)
                .add(r.graceMinutes, 'minutes');
            // Both sides must be read in the same zone.
            //
            // punch_time is `timestamp without time zone` holding local
            // wall-clock, and node-postgres turns that into a Date in the
            // container's zone — UTC, since nothing sets TZ. So 09:09 came back
            // as 09:09Z and was compared against a grace end built in IST,
            // 03:45Z: someone nine minutes late scored 324, and every arrival
            // in the working day scored at least 5h24m late. Late minutes drive
            // deductions.
            //
            // Formatting the Date back to wall-clock recovers exactly the
            // digits stored, whatever zone the process runs in, and reading
            // those in the rule's zone puts entry and graceEnd on the same
            // clock — the one the shift is written in.
            const entry = moment.tz(inTime, r.timezone);
            if (entry.isAfter(graceEnd)) {
                lateMinutes = entry.diff(graceEnd, 'minutes');
            }
        }

        return { employeeCode, date, inTime, outTime, durationMinutes, lateMinutes, otMinutes, status };
    }

    async bulkUpsertSummaries(data) {
        // Implementation of bulk upsert using a single query
        // For Postgres, we can construct a massive VALUES string or use UNNEST
        // Using a simpler loop for now but within a single transaction would be better.
        // Advanced: Use pg-promise's helpers if available, or build a custom string.
        
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            for (const row of data) {
                 await client.query(`
                    INSERT INTO attendance_daily_summary
                    (employee_code, date, in_time, out_time, duration_minutes, late_minutes, ot_minutes, status, last_calculated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                    ON CONFLICT (employee_code, date) DO UPDATE
                    SET in_time = EXCLUDED.in_time,
                        out_time = EXCLUDED.out_time,
                        duration_minutes = EXCLUDED.duration_minutes,
                        late_minutes = EXCLUDED.late_minutes,
                        ot_minutes = EXCLUDED.ot_minutes,
                        status = EXCLUDED.status,
                        last_calculated_at = NOW()
                    -- Manual Log entries and approved regularizations set
                    -- is_finalized. A human decided those days; recomputing from
                    -- raw punches must not quietly undo that decision.
                    WHERE attendance_daily_summary.is_finalized IS NOT TRUE
                `, [row.employeeCode, row.date, row.inTime, row.outTime, row.durationMinutes, row.lateMinutes, row.otMinutes || 0, row.status]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new AttendanceEngine();
