/**
 * Reports Routes
 * 
 * API endpoints for generating and exporting reports:
 * - Attendance Reports
 * - Employee Reports
 * - Device Reports
 * - Export functionality (CSV, HTML/PDF)
 * 
 * @author DevTeam
 * @version 2.0.0
 */

const express = require('express');
const router = express.Router();
const reports = require('../services/reports');
const { authenticateToken } = require('./auth');
const { validateDateRange } = require('../middleware/validation');

// ==========================================
// AUTHENTICATION - PROTECT ALL ROUTES
// ==========================================
router.use(authenticateToken);

// ==========================================
// ATTENDANCE REPORTS
// ==========================================

// Daily Attendance Report
router.get('/daily-attendance', validateDateRange, async (req, res) => {
    try {
        const { date, department_id, area_id } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const report = await reports.generateDailyAttendance(
            reportDate,
            department_id ? parseInt(department_id) : null,
            area_id ? parseInt(area_id) : null
        );

        res.json(report);
    } catch (err) {
        console.error('Daily Attendance Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Monthly Summary Report
router.get('/monthly-summary', validateDateRange, async (req, res) => {
    try {
        const now = new Date();
        const { year, month, department_id } = req.query;

        const report = await reports.generateMonthlySummary(
            parseInt(year) || now.getFullYear(),
            parseInt(month) || now.getMonth() + 1,
            department_id ? parseInt(department_id) : null
        );

        res.json(report);
    } catch (err) {
        console.error('Monthly Summary Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Late/Early Report
router.get('/late-early', validateDateRange, async (req, res) => {
    try {
        const {
            start_date,
            end_date,
            shift_start = '09:00',
            shift_end = '18:00',
            grace_minutes = 15
        } = req.query;

        // Default to current month
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];

        const report = await reports.generateLateEarlyReport(
            start_date || defaultStart,
            end_date || defaultEnd,
            shift_start,
            shift_end,
            parseInt(grace_minutes)
        );

        res.json(report);
    } catch (err) {
        console.error('Late/Early Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Absent Report
router.get('/absent', validateDateRange, async (req, res) => {
    try {
        const { start_date, end_date, department_id } = req.query;

        // Default to current month
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];

        const report = await reports.generateAbsentReport(
            start_date || defaultStart,
            end_date || defaultEnd,
            department_id ? parseInt(department_id) : null
        );

        res.json(report);
    } catch (err) {
        console.error('Absent Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Overtime Report
router.get('/overtime', validateDateRange, async (req, res) => {
    try {
        const { start_date, end_date, regular_hours = 8 } = req.query;

        // Default to current month
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = now.toISOString().split('T')[0];

        const report = await reports.generateOvertimeReport(
            start_date || defaultStart,
            end_date || defaultEnd,
            parseInt(regular_hours)
        );

        res.json(report);
    } catch (err) {
        console.error('Overtime Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DEVICE & BIOMETRIC REPORTS
// ==========================================

// Device Health Report
router.get('/device-health', async (req, res) => {
    try {
        const report = await reports.generateDeviceHealthReport();
        res.json(report);
    } catch (err) {
        console.error('Device Health Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Biometric Summary Report
router.get('/biometric-summary', async (req, res) => {
    try {
        const report = await reports.generateBiometricSummary();
        res.json(report);
    } catch (err) {
        console.error('Biometric Summary Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// EXPORT ENDPOINTS
// ==========================================

// Export Daily Attendance as CSV
router.get('/daily-attendance/export/csv', async (req, res) => {
    try {
        const { date, department_id, area_id } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const report = await reports.generateDailyAttendance(
            reportDate,
            department_id ? parseInt(department_id) : null,
            area_id ? parseInt(area_id) : null
        );

        const csv = reports.toCSV(report);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=daily_attendance_${reportDate}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export Monthly Summary as CSV
router.get('/monthly-summary/export/csv', async (req, res) => {
    try {
        const now = new Date();
        const { year, month, department_id } = req.query;
        const y = parseInt(year) || now.getFullYear();
        const m = parseInt(month) || now.getMonth() + 1;

        const report = await reports.generateMonthlySummary(y, m, department_id ? parseInt(department_id) : null);
        const csv = reports.toCSV(report);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=monthly_summary_${y}_${m}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export any report as HTML (for PDF printing)
router.get('/:reportType/export/html', async (req, res) => {
    try {
        const { reportType } = req.params;
        const { start_date, end_date, date, year, month, department_id, area_id } = req.query;

        let report;
        const now = new Date();

        switch (reportType) {
            case 'daily-attendance':
                report = await reports.generateDailyAttendance(
                    date || now.toISOString().split('T')[0],
                    department_id ? parseInt(department_id) : null,
                    area_id ? parseInt(area_id) : null
                );
                break;
            case 'monthly-summary':
                report = await reports.generateMonthlySummary(
                    parseInt(year) || now.getFullYear(),
                    parseInt(month) || now.getMonth() + 1,
                    department_id ? parseInt(department_id) : null
                );
                break;
            case 'late-early':
                const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                report = await reports.generateLateEarlyReport(
                    start_date || defaultStart,
                    end_date || now.toISOString().split('T')[0]
                );
                break;
            case 'absent':
                const absentStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                report = await reports.generateAbsentReport(
                    start_date || absentStart,
                    end_date || now.toISOString().split('T')[0],
                    department_id ? parseInt(department_id) : null
                );
                break;
            case 'overtime':
                const otStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                report = await reports.generateOvertimeReport(
                    start_date || otStart,
                    end_date || now.toISOString().split('T')[0]
                );
                break;
            case 'device-health':
                report = await reports.generateDeviceHealthReport();
                break;
            case 'biometric-summary':
                report = await reports.generateBiometricSummary();
                break;
            default:
                return res.status(400).json({ error: 'Unknown report type' });
        }

        const html = reports.toHTML(report);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DASHBOARD DATA
// ==========================================

// Get dashboard summary for reports page
router.get('/dashboard', async (req, res) => {
    try {
        const db = require('../db');
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const [
            todayAttendance,
            monthlyStats,
            deviceStatus,
            recentLogs
        ] = await Promise.all([
            // Today's attendance
            db.query(`
                SELECT 
                    COUNT(DISTINCT employee_code) as present_today,
                    (SELECT COUNT(*) FROM employees WHERE status = 'active') as total_employees
                FROM attendance_logs
                WHERE DATE(punch_time) = $1
            `, [today]),

            // Monthly statistics
            db.query(`
                SELECT 
                    COUNT(DISTINCT DATE(punch_time)) as working_days,
                    COUNT(DISTINCT employee_code) as unique_employees,
                    COUNT(*) as total_punches
                FROM attendance_logs
                WHERE DATE(punch_time) >= $1
            `, [monthStart]),

            // Device status
            db.query(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'online') as online,
                    COUNT(*) FILTER (WHERE status = 'offline') as offline
                FROM devices
            `),

            // Recent attendance logs
            db.query(`
                SELECT 
                    al.employee_code,
                    e.name as employee_name,
                    al.punch_time,
                    al.punch_state,
                    d.device_name
                FROM attendance_logs al
                LEFT JOIN employees e ON al.employee_code = e.employee_code
                LEFT JOIN devices d ON al.device_serial = d.serial_number
                ORDER BY al.punch_time DESC
                LIMIT 10
            `)
        ]);

        res.json({
            today: {
                date: today,
                present: parseInt(todayAttendance.rows[0].present_today),
                total: parseInt(todayAttendance.rows[0].total_employees),
                attendance_rate: Math.round(
                    (todayAttendance.rows[0].present_today / Math.max(todayAttendance.rows[0].total_employees, 1)) * 100
                )
            },
            month: {
                start: monthStart,
                working_days: parseInt(monthlyStats.rows[0].working_days),
                unique_employees: parseInt(monthlyStats.rows[0].unique_employees),
                total_punches: parseInt(monthlyStats.rows[0].total_punches)
            },
            devices: {
                total: parseInt(deviceStatus.rows[0].total),
                online: parseInt(deviceStatus.rows[0].online),
                offline: parseInt(deviceStatus.rows[0].offline)
            },
            recent_logs: recentLogs.rows
        });
    } catch (err) {
        console.error('Reports Dashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get available report types
router.get('/types', (req, res) => {
    res.json([
        {
            id: 'daily-attendance',
            name: 'Daily Attendance Report',
            description: 'View attendance for a specific date with in/out times',
            params: ['date', 'department_id', 'area_id'],
            exports: ['csv', 'html']
        },
        {
            id: 'monthly-summary',
            name: 'Monthly Summary Report',
            description: 'Attendance summary for the entire month per employee',
            params: ['year', 'month', 'department_id'],
            exports: ['csv', 'html']
        },
        {
            id: 'late-early',
            name: 'Late Arrival & Early Departure',
            description: 'Employees who came late or left early',
            params: ['start_date', 'end_date', 'shift_start', 'shift_end', 'grace_minutes'],
            exports: ['csv', 'html']
        },
        {
            id: 'absent',
            name: 'Absent Report',
            description: 'List of absent employees by date',
            params: ['start_date', 'end_date', 'department_id'],
            exports: ['csv', 'html']
        },
        {
            id: 'overtime',
            name: 'Overtime Report',
            description: 'Employees who worked beyond regular hours',
            params: ['start_date', 'end_date', 'regular_hours'],
            exports: ['csv', 'html']
        },
        {
            id: 'device-health',
            name: 'Device Health Report',
            description: 'Status and health of all biometric devices',
            params: [],
            exports: ['csv', 'html']
        },
        {
            id: 'biometric-summary',
            name: 'Biometric Summary',
            description: 'Overview of registered biometrics per employee',
            params: [],
            exports: ['csv', 'html']
        }
    ]);
});

// ==========================================
// SCHEDULED REPORTS
// ==========================================

const scheduledReports = require('../services/scheduled-reports');
const emailService = require('../services/email');

// Get all scheduled reports
router.get('/scheduled', async (req, res) => {
    try {
        const reports = await scheduledReports.getScheduledReports();
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get scheduled report by ID
router.get('/scheduled/:id', async (req, res) => {
    try {
        const report = await scheduledReports.getScheduledReport(req.params.id);
        if (!report) {
            return res.status(404).json({ error: 'Scheduled report not found' });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create scheduled report
router.post('/scheduled', async (req, res) => {
    try {
        const report = await scheduledReports.createScheduledReport({
            ...req.body,
            created_by: req.user?.id
        });
        res.status(201).json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update scheduled report
router.put('/scheduled/:id', async (req, res) => {
    try {
        const report = await scheduledReports.updateScheduledReport(req.params.id, req.body);
        if (!report) {
            return res.status(404).json({ error: 'Scheduled report not found' });
        }
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete scheduled report
router.delete('/scheduled/:id', async (req, res) => {
    try {
        await scheduledReports.deleteScheduledReport(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Run scheduled report now
router.post('/scheduled/:id/run', async (req, res) => {
    try {
        const result = await scheduledReports.runScheduledReport(parseInt(req.params.id));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get report history
router.get('/history', async (req, res) => {
    try {
        const { schedule_id, limit } = req.query;
        const history = await scheduledReports.getReportHistory(
            schedule_id ? parseInt(schedule_id) : null,
            parseInt(limit) || 50
        );
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// EMAIL SETTINGS
// ==========================================

// Get email configuration
router.get('/email-settings', async (req, res) => {
    try {
        const config = await emailService.getEmailConfig();
        res.json(config || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save email configuration
router.post('/email-settings', async (req, res) => {
    try {
        const result = await emailService.saveEmailConfig(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test email configuration
router.post('/email-settings/test', async (req, res) => {
    try {
        const { test_email } = req.body;
        if (!test_email) {
            return res.status(400).json({ error: 'Test email address required' });
        }
        const result = await emailService.testEmailConfig(test_email);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
