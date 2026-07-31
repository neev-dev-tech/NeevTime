const db = require('../db');
const moment = require('moment-timezone');
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
        let logsQuery = `
            SELECT employee_code, punch_time 
            FROM attendance_logs 
            WHERE punch_time >= $1 AND punch_time <= $2
        `;
        const logsParams = [
          moment.tz(startDate, rules.timezone).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
          moment.tz(endDate, rules.timezone).endOf('day').format('YYYY-MM-DD HH:mm:ss')
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
        
        // 2. Group logs by employee and date (IST)
        const logsMap = {};
        allLogs.rows.forEach(log => {
            const dateStr = moment.tz(log.punch_time, rules.timezone).format('YYYY-MM-DD');
            const key = `${log.employee_code}_${dateStr}`;
            if (!logsMap[key]) logsMap[key] = [];
            logsMap[key].push(log.punch_time);
        });

        // 3. Get all employees (if not already filtered)
        let empQuery = 'SELECT employee_code FROM employees';
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
                
                const stats = this.calculateDayStats(emp.employee_code, dateStr, logs, rules);
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

    calculateDayStats(employeeCode, date, logs, rules = null) {
        const r = rules || {
            timezone: DEFAULTS.timezone,
            shiftStart: DEFAULTS.shift_start,
            graceMinutes: DEFAULTS.grace_period_minutes,
            fullDayMinutes: DEFAULTS.full_day_threshold_hours * 60,
            halfDayMinutes: DEFAULTS.half_day_threshold_hours * 60,
            overtimeAfterMinutes: DEFAULTS.overtime_threshold_hours * 60,
            allSundaysOff: DEFAULTS.all_sundays_off,
            saturdaysOff: DEFAULTS.saturdays_off
        };

        let inTime = null;
        let outTime = null;
        let status = this.isWeekOff(date, r) ? 'Weekly Off' : 'Absent';
        let durationMinutes = 0;
        let lateMinutes = 0;
        let otMinutes = 0;

        if (logs.length > 0) {
            const sortedLogs = logs.sort((a, b) => moment(a).valueOf() - moment(b).valueOf());
            inTime = sortedLogs[0];
            outTime = sortedLogs.length > 1 ? sortedLogs[sortedLogs.length - 1] : null;

            if (outTime) {
                durationMinutes = Math.floor(moment(outTime).diff(moment(inTime), 'minutes'));

                // Thresholds come from Settings → Attendance Rules
                if (durationMinutes >= r.fullDayMinutes) status = 'Present';
                else if (durationMinutes >= r.halfDayMinutes) status = 'Half Day';
                else status = 'Short Day';

                if (durationMinutes > r.overtimeAfterMinutes) {
                    otMinutes = durationMinutes - r.overtimeAfterMinutes;
                }
            } else {
                status = 'Miss Punch';
            }

            // Late is measured from shift start plus the configured grace period,
            // so a grace of 15 minutes means 09:16 is the first late minute.
            const graceEnd = moment.tz(`${date} ${r.shiftStart}:00`, r.timezone)
                .add(r.graceMinutes, 'minutes');
            const entry = moment(inTime);
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
