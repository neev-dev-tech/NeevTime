const db = require('../db');
const moment = require('moment-timezone');

/**
 * Attendance Processing Engine
 * Core logic to calculate daily attendance based on raw logs and shift rules.
 */
class AttendanceEngine {

    async processDateRange(startDate, endDate, employeeId = null) {
        console.log(`[ATTENDANCE ENGINE] Starting batch process: ${startDate} to ${endDate}`);
        
        // 1. Fetch all required logs in ONE query
        let logsQuery = `
            SELECT employee_code, punch_time 
            FROM attendance_logs 
            WHERE punch_time >= $1 AND punch_time <= $2
        `;
        const logsParams = [
          moment.tz(startDate, 'Asia/Kolkata').startOf('day').format('YYYY-MM-DD HH:mm:ss'),
          moment.tz(endDate, 'Asia/Kolkata').endOf('day').format('YYYY-MM-DD HH:mm:ss')
        ];
        
        if (employeeId) {
            // Need to get employee_code for the ID first if not provided, 
            // but usually we have it. Assuming we might need to filter.
            const emp = await db.query('SELECT employee_code FROM employees WHERE id = $1', [employeeId]);
            if (emp.rows.length === 0) return [];
            logsQuery += ' AND employee_code = $3';
            logsParams.push(emp.rows[0].employee_code);
        }

        const allLogs = await db.query(logsQuery, logsParams);
        
        // 2. Group logs by employee and date (IST)
        const logsMap = {};
        allLogs.rows.forEach(log => {
            const dateStr = moment.tz(log.punch_time, 'Asia/Kolkata').format('YYYY-MM-DD');
            const key = `${log.employee_code}_${dateStr}`;
            if (!logsMap[key]) logsMap[key] = [];
            logsMap[key].push(log.punch_time);
        });

        // 3. Get all employees (if not already filtered)
        let empQuery = 'SELECT employee_code FROM employees';
        if (employeeId) empQuery += ' WHERE id = $1';
        const employees = await db.query(empQuery, employeeId ? [employeeId] : []);

        const results = [];
        const summaryData = [];

        // 4. Process each day/employee in memory
        let currentDate = moment.tz(startDate, 'Asia/Kolkata');
        const endDay = moment.tz(endDate, 'Asia/Kolkata');

        while (currentDate.isSameOrBefore(endDay, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            
            for (const emp of employees.rows) {
                const key = `${emp.employee_code}_${dateStr}`;
                const logs = logsMap[key] || [];
                
                const stats = this.calculateDayStats(emp.employee_code, dateStr, logs);
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

    calculateDayStats(employeeCode, date, logs) {
        let inTime = null;
        let outTime = null;
        let status = 'Absent';
        let durationMinutes = 0;
        let lateMinutes = 0;

        if (logs.length > 0) {
            const sortedLogs = logs.sort((a, b) => moment(a).valueOf() - moment(b).valueOf());
            inTime = sortedLogs[0];
            outTime = sortedLogs.length > 1 ? sortedLogs[sortedLogs.length - 1] : null;

            if (outTime) {
                status = 'Present';
                durationMinutes = Math.floor(moment(outTime).diff(moment(inTime), 'minutes'));
            } else {
                status = 'Miss Punch';
            }

            // Calculation based on default shift 09:00 (IST)
            const shiftStart = moment.tz(`${date} 09:00:00`, 'Asia/Kolkata');
            const entry = moment(inTime);
            if (entry.isAfter(shiftStart)) {
                lateMinutes = entry.diff(shiftStart, 'minutes');
            }
        }

        return { employeeCode, date, inTime, outTime, durationMinutes, lateMinutes, status };
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
                    (employee_code, date, in_time, out_time, duration_minutes, late_minutes, status, last_calculated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    ON CONFLICT (employee_code, date) DO UPDATE 
                    SET in_time = EXCLUDED.in_time,
                        out_time = EXCLUDED.out_time,
                        duration_minutes = EXCLUDED.duration_minutes,
                        late_minutes = EXCLUDED.late_minutes,
                        status = EXCLUDED.status,
                        last_calculated_at = NOW()
                `, [row.employeeCode, row.date, row.inTime, row.outTime, row.durationMinutes, row.lateMinutes, row.status]);
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
