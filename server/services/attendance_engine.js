const db = require('../db');

/**
 * Attendance Processing Engine
 * Core logic to calculate daily attendance based on raw logs and shift rules.
 */
class AttendanceEngine {

    async processDateRange(startDate, endDate, employeeId = null) {
        // Build employee filter
        let empQuery = 'SELECT employee_code FROM employees';
        let params = [];
        if (employeeId) {
            empQuery += ' WHERE id = $1';
            params.push(employeeId);
        }

        const employees = await db.query(empQuery, params);

        let currentDate = new Date(startDate);
        const end = new Date(endDate);

        let results = [];

        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            console.log(`Processing ${dateStr}...`);

            for (const emp of employees.rows) {
                const res = await this.processDailyAttendance(emp.employee_code, dateStr);
                results.push(res);
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }
        return results;
    }

    async processDailyAttendance(employeeCode, date) {
        // 1. Fetch logs for the day in chronological order
        const logsResult = await db.query(`
            SELECT punch_time, punch_state
            FROM attendance_logs
            WHERE employee_code = $1
            AND DATE(punch_time) = $2
            ORDER BY punch_time ASC
        `, [employeeCode, date]);

        const logs = logsResult.rows.map((row) => ({
            punch_time: row.punch_time,
            punch_state: Number.parseInt(row.punch_state, 10)
        }));

        // 2. Determine IN and OUT
        // ZKTeco-compatible state map:
        // IN: 0(CheckIn), 3(BreakIn), 4(OT-In)
        // OUT: 1(CheckOut), 2(BreakOut), 5(OT-Out)
        const inStates = new Set([0, 3, 4]);
        const outStates = new Set([1, 2, 5]);

        const inLogs = logs.filter((log) => inStates.has(log.punch_state));
        const outLogs = logs.filter((log) => outStates.has(log.punch_state));

        let inTime = null;
        let outTime = null;
        let status = 'Absent';
        let durationMinutes = 0;

        if (inLogs.length > 0 && outLogs.length > 0) {
            inTime = inLogs[0].punch_time;

            // Pick latest OUT that occurs at/after first IN
            const firstInAt = new Date(inTime).getTime();
            for (let i = outLogs.length - 1; i >= 0; i--) {
                const outAt = new Date(outLogs[i].punch_time).getTime();
                if (outAt >= firstInAt) {
                    outTime = outLogs[i].punch_time;
                    break;
                }
            }

            if (outTime) {
                durationMinutes = Math.max(0, Math.floor((new Date(outTime) - new Date(inTime)) / (1000 * 60)));
                status = durationMinutes > 0 ? 'Present' : 'Miss Punch';
            } else {
                status = 'Miss Punch';
            }
        } else if (inLogs.length > 0 || outLogs.length > 0) {
            // One-sided punches only: treat as miss punch
            inTime = inLogs[0]?.punch_time || null;
            outTime = outLogs[outLogs.length - 1]?.punch_time || null;
            status = 'Miss Punch';
        }

        // 3. Apply shift rules (default shift 09:00 - 18:00)
        const shiftStart = `${date} 09:00:00`;
        let lateMinutes = 0;

        if (inTime) {
            const entry = new Date(inTime);
            const start = new Date(shiftStart);
            if (entry > start) {
                lateMinutes = Math.floor((entry - start) / (1000 * 60));
            }
        }

        // 4. Save summary (upsert)
        await db.query(`
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
        `, [employeeCode, date, inTime, outTime, durationMinutes, lateMinutes, status]);

        return { employeeCode, date, status, lateMinutes };
    }
}

module.exports = new AttendanceEngine();
