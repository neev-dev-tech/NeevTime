/**
 * Advanced Reports Service
 * 
 * Comprehensive reporting system:
 * - Attendance Reports (Daily, Weekly, Monthly, Custom Range)
 * - Employee Summary Reports
 * - Device Health Reports
 * - Biometric Analysis Reports
 * - Late/Early/Absent Reports
 * - Overtime Reports
 * - Export to CSV, Excel, PDF
 * 
 * @author DevTeam
 * @version 2.0.0
 */

const db = require('../db');
const fs = require('fs');
const path = require('path');

// Report Types
const REPORT_TYPE = {
    DAILY_ATTENDANCE: 'daily_attendance',
    MONTHLY_SUMMARY: 'monthly_summary',
    EMPLOYEE_DETAIL: 'employee_detail',
    LATE_EARLY: 'late_early',
    ABSENT: 'absent',
    OVERTIME: 'overtime',
    DEVICE_HEALTH: 'device_health',
    BIOMETRIC_SUMMARY: 'biometric_summary'
};

/**
 * Generate Daily Attendance Report
 */
const generateDailyAttendance = async (date, departmentId = null, areaId = null) => {
    let whereClause = 'DATE(al.punch_time) = $1';
    const params = [date];
    let paramIndex = 2;

    if (departmentId) {
        whereClause += ` AND e.department_id = $${paramIndex}`;
        params.push(departmentId);
        paramIndex++;
    }

    if (areaId) {
        whereClause += ` AND e.area_id = $${paramIndex}`;
        params.push(areaId);
        paramIndex++;
    }

    const result = await db.query(`
        WITH attendance_data AS (
            SELECT 
                e.employee_code,
                e.name as employee_name,
                d.name as department_name,
                DATE(al.punch_time) as attendance_date,
                MIN(CASE WHEN al.punch_state::int <= 1 THEN al.punch_time END) as first_in,
                MAX(CASE WHEN al.punch_state::int > 1 THEN al.punch_time END) as last_out,
                COUNT(*) as punch_count,
                dev.device_name as in_device,
                al.verification_mode
            FROM employees e
            LEFT JOIN attendance_logs al ON e.employee_code = al.employee_code AND DATE(al.punch_time) = $1
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN devices dev ON al.device_serial = dev.serial_number
            WHERE e.status = 'active'
            ${departmentId ? 'AND e.department_id = $2' : ''}
            ${areaId ? `AND e.area_id = $${departmentId ? 3 : 2}` : ''}
            GROUP BY e.employee_code, e.name, d.name, DATE(al.punch_time), dev.device_name, al.verification_mode
        )
        SELECT 
            employee_code,
            employee_name,
            department_name,
            attendance_date,
            first_in,
            last_out,
            CASE 
                WHEN first_in IS NOT NULL AND last_out IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (last_out - first_in))/3600 
                ELSE 0 
            END as work_hours,
            punch_count,
            in_device,
            CASE WHEN first_in IS NOT NULL THEN 'Present' ELSE 'Absent' END as status
        FROM attendance_data
        ORDER BY department_name, employee_name
    `, params);

    // Calculate summary
    const summary = {
        total_employees: result.rows.length,
        present: result.rows.filter(r => r.status === 'Present').length,
        absent: result.rows.filter(r => r.status === 'Absent').length,
        average_hours: result.rows.filter(r => r.work_hours > 0)
            .reduce((sum, r) => sum + parseFloat(r.work_hours), 0) /
            Math.max(result.rows.filter(r => r.work_hours > 0).length, 1)
    };

    return {
        report_type: REPORT_TYPE.DAILY_ATTENDANCE,
        date: date,
        generated_at: new Date(),
        summary,
        data: result.rows
    };
};

/**
 * Generate Monthly Summary Report
 */
const generateMonthlySummary = async (year, month, departmentId = null) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    let whereClause = 'DATE(al.punch_time) BETWEEN $1 AND $2';
    const params = [startDate, endDate];

    if (departmentId) {
        whereClause += ' AND e.department_id = $3';
        params.push(departmentId);
    }

    const result = await db.query(`
        SELECT 
            e.employee_code,
            e.name as employee_name,
            d.name as department_name,
            COUNT(DISTINCT DATE(al.punch_time)) as days_present,
            SUM(CASE WHEN al.punch_state::int <= 1 THEN 1 ELSE 0 END) as total_check_ins,
            SUM(CASE WHEN al.punch_state::int > 1 THEN 1 ELSE 0 END) as total_check_outs,
            AVG(
                CASE 
                    WHEN al.punch_state::int <= 1 
                    THEN EXTRACT(HOUR FROM al.punch_time) + EXTRACT(MINUTE FROM al.punch_time)/60 
                END
            ) as avg_check_in_time,
            AVG(
                CASE 
                    WHEN al.punch_state::int > 1 
                    THEN EXTRACT(HOUR FROM al.punch_time) + EXTRACT(MINUTE FROM al.punch_time)/60 
                END
            ) as avg_check_out_time
        FROM employees e
        LEFT JOIN attendance_logs al ON e.employee_code = al.employee_code 
            AND ${whereClause}
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.status = 'active'
        GROUP BY e.employee_code, e.name, d.name
        ORDER BY d.name, e.name
    `, params);

    // Calculate working days in month
    const workingDays = getWorkingDays(year, month);

    const data = result.rows.map(row => ({
        ...row,
        days_absent: workingDays - (row.days_present || 0),
        attendance_percentage: Math.round((row.days_present || 0) / workingDays * 100),
        avg_check_in_formatted: row.avg_check_in_time ? formatDecimalTime(row.avg_check_in_time) : '-',
        avg_check_out_formatted: row.avg_check_out_time ? formatDecimalTime(row.avg_check_out_time) : '-'
    }));

    const summary = {
        total_employees: data.length,
        working_days: workingDays,
        avg_attendance: Math.round(data.reduce((sum, r) => sum + r.attendance_percentage, 0) / Math.max(data.length, 1)),
        perfect_attendance: data.filter(r => r.attendance_percentage === 100).length
    };

    return {
        report_type: REPORT_TYPE.MONTHLY_SUMMARY,
        year,
        month,
        period: `${startDate} to ${endDate}`,
        generated_at: new Date(),
        summary,
        data
    };
};

/**
 * Generate Late/Early Report
 */
const generateLateEarlyReport = async (startDate, endDate, shiftStartTime = '09:00', shiftEndTime = '18:00', graceMinutes = 15) => {
    const result = await db.query(`
        WITH daily_attendance AS (
            SELECT 
                e.employee_code,
                e.name as employee_name,
                d.name as department_name,
                DATE(al.punch_time) as attendance_date,
                MIN(CASE WHEN al.punch_state::int <= 1 THEN al.punch_time::time END) as first_in,
                MAX(CASE WHEN al.punch_state::int > 1 THEN al.punch_time::time END) as last_out
            FROM attendance_logs al
            JOIN employees e ON al.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE DATE(al.punch_time) BETWEEN $1 AND $2
            GROUP BY e.employee_code, e.name, d.name, DATE(al.punch_time)
        )
        SELECT 
            employee_code,
            employee_name,
            department_name,
            attendance_date,
            first_in,
            last_out,
            CASE 
                WHEN first_in > ($3::time + ($5 || ' minutes')::interval) THEN 'Late'
                WHEN first_in IS NULL THEN 'No Check-in'
                ELSE 'On Time'
            END as in_status,
            CASE 
                WHEN last_out < $4::time THEN 'Early Out'
                WHEN last_out IS NULL THEN 'No Check-out'
                ELSE 'Normal'
            END as out_status,
            CASE 
                WHEN first_in > ($3::time + ($5 || ' minutes')::interval)
                THEN EXTRACT(EPOCH FROM (first_in - $3::time))/60
                ELSE 0
            END as late_minutes,
            CASE 
                WHEN last_out < $4::time
                THEN EXTRACT(EPOCH FROM ($4::time - last_out))/60
                ELSE 0
            END as early_minutes
        FROM daily_attendance
        WHERE first_in > ($3::time + ($5 || ' minutes')::interval) OR last_out < $4::time
        ORDER BY attendance_date DESC, late_minutes DESC
    `, [startDate, endDate, shiftStartTime, shiftEndTime, graceMinutes]);

    const summary = {
        late_count: result.rows.filter(r => r.in_status === 'Late').length,
        early_out_count: result.rows.filter(r => r.out_status === 'Early Out').length,
        total_late_hours: Math.round(result.rows.reduce((sum, r) => sum + (r.late_minutes || 0), 0) / 60),
        frequent_late_employees: getFrequentOffenders(result.rows, 'in_status', 'Late', 3)
    };

    return {
        report_type: REPORT_TYPE.LATE_EARLY,
        period: `${startDate} to ${endDate}`,
        shift_time: `${shiftStartTime} - ${shiftEndTime}`,
        grace_minutes: graceMinutes,
        generated_at: new Date(),
        summary,
        data: result.rows
    };
};

/**
 * Generate Absent Report
 */
const generateAbsentReport = async (startDate, endDate, departmentId = null) => {
    let departmentFilter = '';
    const params = [startDate, endDate];

    if (departmentId) {
        departmentFilter = 'AND e.department_id = $3';
        params.push(departmentId);
    }

    const result = await db.query(`
        WITH date_series AS (
            SELECT generate_series($1::date, $2::date, '1 day'::interval)::date as work_date
        ),
        expected_attendance AS (
            SELECT 
                e.employee_code,
                e.name as employee_name,
                d.name as department_name,
                ds.work_date
            FROM employees e
            CROSS JOIN date_series ds
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE e.status = 'active'
            AND EXTRACT(DOW FROM ds.work_date) NOT IN (0, 6)  -- Exclude weekends
            ${departmentFilter}
        ),
        actual_attendance AS (
            SELECT DISTINCT 
                employee_code,
                DATE(punch_time) as attendance_date
            FROM attendance_logs
            WHERE DATE(punch_time) BETWEEN $1 AND $2
        )
        SELECT 
            ea.employee_code,
            ea.employee_name,
            ea.department_name,
            ea.work_date as absent_date,
            'Absent' as status
        FROM expected_attendance ea
        LEFT JOIN actual_attendance aa ON ea.employee_code = aa.employee_code 
            AND ea.work_date = aa.attendance_date
        WHERE aa.employee_code IS NULL
        ORDER BY ea.work_date DESC, ea.department_name, ea.employee_name
    `, params);

    // Group by employee for summary
    const byEmployee = {};
    result.rows.forEach(row => {
        if (!byEmployee[row.employee_code]) {
            byEmployee[row.employee_code] = {
                employee_code: row.employee_code,
                employee_name: row.employee_name,
                department_name: row.department_name,
                absent_days: []
            };
        }
        byEmployee[row.employee_code].absent_days.push(row.absent_date);
    });

    const employeeSummary = Object.values(byEmployee).map(e => ({
        ...e,
        absent_count: e.absent_days.length
    })).sort((a, b) => b.absent_count - a.absent_count);

    const summary = {
        total_absent_days: result.rows.length,
        employees_with_absences: Object.keys(byEmployee).length,
        most_absences: employeeSummary.slice(0, 5)
    };

    return {
        report_type: REPORT_TYPE.ABSENT,
        period: `${startDate} to ${endDate}`,
        generated_at: new Date(),
        summary,
        data: result.rows,
        by_employee: employeeSummary
    };
};

/**
 * Generate Overtime Report
 */
const generateOvertimeReport = async (startDate, endDate, regularHours = 8) => {
    const result = await db.query(`
        WITH daily_hours AS (
            SELECT 
                e.employee_code,
                e.name as employee_name,
                d.name as department_name,
                DATE(al.punch_time) as work_date,
                MIN(CASE WHEN al.punch_state::int <= 1 THEN al.punch_time END) as first_in,
                MAX(CASE WHEN al.punch_state::int > 1 THEN al.punch_time END) as last_out
            FROM attendance_logs al
            JOIN employees e ON al.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE DATE(al.punch_time) BETWEEN $1 AND $2
            GROUP BY e.employee_code, e.name, d.name, DATE(al.punch_time)
        )
        SELECT 
            employee_code,
            employee_name,
            department_name,
            work_date,
            first_in,
            last_out,
            EXTRACT(EPOCH FROM (last_out - first_in))/3600 as total_hours,
            GREATEST(0, EXTRACT(EPOCH FROM (last_out - first_in))/3600 - $3) as overtime_hours
        FROM daily_hours
        WHERE first_in IS NOT NULL AND last_out IS NOT NULL
        AND EXTRACT(EPOCH FROM (last_out - first_in))/3600 > $3
        ORDER BY overtime_hours DESC, work_date DESC
    `, [startDate, endDate, regularHours]);

    // Group by employee
    const byEmployee = {};
    result.rows.forEach(row => {
        if (!byEmployee[row.employee_code]) {
            byEmployee[row.employee_code] = {
                employee_code: row.employee_code,
                employee_name: row.employee_name,
                department_name: row.department_name,
                total_overtime_hours: 0,
                overtime_days: 0
            };
        }
        byEmployee[row.employee_code].total_overtime_hours += parseFloat(row.overtime_hours);
        byEmployee[row.employee_code].overtime_days++;
    });

    const employeeSummary = Object.values(byEmployee)
        .map(e => ({ ...e, total_overtime_hours: Math.round(e.total_overtime_hours * 100) / 100 }))
        .sort((a, b) => b.total_overtime_hours - a.total_overtime_hours);

    const summary = {
        total_overtime_hours: Math.round(employeeSummary.reduce((sum, e) => sum + e.total_overtime_hours, 0) * 100) / 100,
        employees_with_overtime: employeeSummary.length,
        top_overtime_employees: employeeSummary.slice(0, 5)
    };

    return {
        report_type: REPORT_TYPE.OVERTIME,
        period: `${startDate} to ${endDate}`,
        regular_hours: regularHours,
        generated_at: new Date(),
        summary,
        data: result.rows,
        by_employee: employeeSummary
    };
};

/**
 * Generate Device Health Report
 */
const generateDeviceHealthReport = async () => {
    const result = await db.query(`
        WITH device_stats AS (
            SELECT 
                d.serial_number,
                d.device_name,
                d.device_model,
                d.firmware_version,
                d.status,
                d.last_activity,
                dc.face_supported,
                dc.finger_supported,
                dc.face_major_ver,
                COUNT(DISTINCT al.id) as log_count_7d,
                COUNT(DISTINCT al.employee_code) as unique_users_7d,
                COUNT(DISTINCT CASE WHEN cmd.status = 'success' THEN cmd.id END) as cmd_success,
                COUNT(DISTINCT CASE WHEN cmd.status IN ('failed', 'dead_letter') THEN cmd.id END) as cmd_failed
            FROM devices d
            LEFT JOIN device_capabilities dc ON d.serial_number = dc.device_serial
            LEFT JOIN attendance_logs al ON d.serial_number = al.device_serial 
                AND al.punch_time > NOW() - INTERVAL '7 days'
            LEFT JOIN device_commands cmd ON d.serial_number = cmd.device_serial
                AND cmd.created_at > NOW() - INTERVAL '7 days'
            GROUP BY d.serial_number, d.device_name, d.device_model, d.firmware_version, 
                     d.status, d.last_activity, dc.face_supported, dc.finger_supported, dc.face_major_ver
        )
        SELECT 
            *,
            CASE 
                WHEN status = 'offline' THEN 0
                WHEN EXTRACT(EPOCH FROM (NOW() - last_activity)) > 1800 THEN 50
                WHEN cmd_failed > cmd_success THEN 60
                ELSE 100
            END as health_score
        FROM device_stats
        ORDER BY health_score ASC, device_name
    `);

    const summary = {
        total_devices: result.rows.length,
        online: result.rows.filter(d => d.status === 'online').length,
        offline: result.rows.filter(d => d.status === 'offline').length,
        healthy: result.rows.filter(d => d.health_score >= 80).length,
        warning: result.rows.filter(d => d.health_score >= 50 && d.health_score < 80).length,
        critical: result.rows.filter(d => d.health_score < 50).length
    };

    return {
        report_type: REPORT_TYPE.DEVICE_HEALTH,
        generated_at: new Date(),
        summary,
        data: result.rows
    };
};

/**
 * Generate Biometric Summary Report
 */
const generateBiometricSummary = async () => {
    const result = await db.query(`
        SELECT 
            e.employee_code,
            e.name as employee_name,
            d.name as department_name,
            COUNT(CASE WHEN bt.template_type = 9 THEN 1 END) as face_count,
            COUNT(CASE WHEN bt.template_type IN (1, 2) THEN 1 END) as fingerprint_count,
            MAX(bt.updated_at) as last_updated,
            ARRAY_AGG(DISTINCT bt.source_device) as devices
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN biometric_templates bt ON e.employee_code = bt.employee_code
        WHERE e.status = 'active'
        GROUP BY e.employee_code, e.name, d.name
        ORDER BY d.name, e.name
    `);

    const summary = {
        total_employees: result.rows.length,
        with_face: result.rows.filter(e => e.face_count > 0).length,
        with_fingerprint: result.rows.filter(e => e.fingerprint_count > 0).length,
        with_both: result.rows.filter(e => e.face_count > 0 && e.fingerprint_count > 0).length,
        without_biometrics: result.rows.filter(e => e.face_count === 0 && e.fingerprint_count === 0).length
    };

    return {
        report_type: REPORT_TYPE.BIOMETRIC_SUMMARY,
        generated_at: new Date(),
        summary,
        data: result.rows
    };
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getWorkingDays(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    let workingDays = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) workingDays++;
    }

    return workingDays;
}

function formatDecimalTime(decimal) {
    const hours = Math.floor(decimal);
    const minutes = Math.round((decimal - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getFrequentOffenders(data, statusField, statusValue, minCount) {
    const counts = {};
    data.filter(r => r[statusField] === statusValue).forEach(r => {
        counts[r.employee_code] = counts[r.employee_code] || { name: r.employee_name, count: 0 };
        counts[r.employee_code].count++;
    });

    return Object.entries(counts)
        .filter(([_, v]) => v.count >= minCount)
        .map(([code, v]) => ({ employee_code: code, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

/**
 * Convert report data to CSV with proper escaping
 */
const toCSV = (reportData) => {
    if (!reportData.data || reportData.data.length === 0) {
        return '';
    }

    const BOM = '\uFEFF';  // UTF-8 BOM for Excel compatibility
    const headers = Object.keys(reportData.data[0]);
    
    // Proper CSV escaping
    const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };
    
    const headerRow = headers.map(escapeCSV).join(',');
    const dataRows = reportData.data.map(row =>
        headers.map(h => escapeCSV(row[h])).join(',')
    );
    
    return BOM + [headerRow, ...dataRows].join('\n');
};

/**
 * Generate HTML for PDF export
 */
const toHTML = (reportData) => {
    const tableRows = reportData.data.map(row =>
        `<tr>${Object.values(row).map(v => `<td>${v ?? '-'}</td>`).join('')}</tr>`
    ).join('');

    const headers = reportData.data.length > 0
        ? `<tr>${Object.keys(reportData.data[0]).map(h => `<th>${h}</th>`).join('')}</tr>`
        : '';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 8px; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #4a90d9; color: white; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <h1>${reportData.report_type.replace(/_/g, ' ').toUpperCase()}</h1>
            <p>Generated: ${new Date(reportData.generated_at).toLocaleString()}</p>
            ${reportData.period ? `<p>Period: ${reportData.period}</p>` : ''}
            
            <div class="summary">
                <h3>Summary</h3>
                ${Object.entries(reportData.summary).map(([k, v]) =>
        `<p><strong>${k.replace(/_/g, ' ')}:</strong> ${typeof v === 'object' ? JSON.stringify(v) : v}</p>`
    ).join('')}
            </div>
            
            <table>
                <thead>${headers}</thead>
                <tbody>${tableRows}</tbody>
            </table>
            
            <div class="footer">
                <p>Attendance Management System - Report generated automatically</p>
            </div>
        </body>
        </html>
    `;
};

module.exports = {
    REPORT_TYPE,
    generateDailyAttendance,
    generateMonthlySummary,
    generateLateEarlyReport,
    generateAbsentReport,
    generateOvertimeReport,
    generateDeviceHealthReport,
    generateBiometricSummary,
    toCSV,
    toHTML
};
