/**
 * Scheduled Reports Service
 * 
 * Automated report generation and delivery:
 * - Daily, Weekly, Monthly schedules
 * - Email delivery with attachments
 * - Report history tracking
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const db = require('../db');
const fs = require('fs');
const reports = require('./reports');
const emailService = require('./email');

// Logger
const log = (level, msg, data = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [Scheduler] ${msg} ${JSON.stringify(data)}`;
    console.log(logEntry);
    fs.appendFileSync('scheduler.log', logEntry + '\n');
};

/**
 * Calculate next run time based on schedule
 */
const calculateNextRun = (scheduleType, scheduleTime, scheduleDay = null) => {
    const now = new Date();
    const [hours, minutes] = scheduleTime.split(':').map(Number);
    let nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    switch (scheduleType) {
        case 'daily':
            if (nextRun <= now) {
                nextRun.setDate(nextRun.getDate() + 1);
            }
            break;

        case 'weekly':
            const targetDay = scheduleDay || 1; // Default Monday
            const currentDay = nextRun.getDay();
            let daysUntilTarget = (targetDay - currentDay + 7) % 7;
            if (daysUntilTarget === 0 && nextRun <= now) {
                daysUntilTarget = 7;
            }
            nextRun.setDate(nextRun.getDate() + daysUntilTarget);
            break;

        case 'monthly':
            const targetDate = scheduleDay || 1; // Default 1st of month
            nextRun.setDate(targetDate);
            if (nextRun <= now) {
                nextRun.setMonth(nextRun.getMonth() + 1);
            }
            break;
    }

    return nextRun;
};

/**
 * Get all scheduled reports
 */
const getScheduledReports = async () => {
    const result = await db.query(`
        SELECT sr.*, 
               (SELECT COUNT(*) FROM report_history WHERE scheduled_report_id = sr.id) as run_count
        FROM scheduled_reports sr
        ORDER BY sr.created_at DESC
    `);
    return result.rows;
};

/**
 * Get scheduled report by ID
 */
const getScheduledReport = async (id) => {
    const result = await db.query('SELECT * FROM scheduled_reports WHERE id = $1', [id]);
    return result.rows[0];
};

/**
 * Create scheduled report
 */
const createScheduledReport = async (reportConfig) => {
    const nextRun = calculateNextRun(
        reportConfig.schedule_type,
        reportConfig.schedule_time,
        reportConfig.schedule_day
    );

    const result = await db.query(`
        INSERT INTO scheduled_reports 
        (name, report_type, schedule_type, schedule_time, schedule_day, recipients, filters, format, is_active, next_run_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `, [
        reportConfig.name,
        reportConfig.report_type,
        reportConfig.schedule_type,
        reportConfig.schedule_time,
        reportConfig.schedule_day,
        reportConfig.recipients,
        JSON.stringify(reportConfig.filters || {}),
        reportConfig.format || 'csv',
        reportConfig.is_active ?? true,
        nextRun,
        reportConfig.created_by
    ]);

    log('INFO', 'Scheduled report created', { id: result.rows[0].id, name: reportConfig.name });
    return result.rows[0];
};

/**
 * Update scheduled report
 */
const updateScheduledReport = async (id, reportConfig) => {
    const nextRun = calculateNextRun(
        reportConfig.schedule_type,
        reportConfig.schedule_time,
        reportConfig.schedule_day
    );

    const result = await db.query(`
        UPDATE scheduled_reports SET
            name = COALESCE($2, name),
            report_type = COALESCE($3, report_type),
            schedule_type = COALESCE($4, schedule_type),
            schedule_time = COALESCE($5, schedule_time),
            schedule_day = COALESCE($6, schedule_day),
            recipients = COALESCE($7, recipients),
            filters = COALESCE($8, filters),
            format = COALESCE($9, format),
            is_active = COALESCE($10, is_active),
            next_run_at = $11,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
    `, [
        id,
        reportConfig.name,
        reportConfig.report_type,
        reportConfig.schedule_type,
        reportConfig.schedule_time,
        reportConfig.schedule_day,
        reportConfig.recipients,
        reportConfig.filters ? JSON.stringify(reportConfig.filters) : null,
        reportConfig.format,
        reportConfig.is_active,
        nextRun
    ]);

    return result.rows[0];
};

/**
 * Delete scheduled report
 */
const deleteScheduledReport = async (id) => {
    await db.query('DELETE FROM scheduled_reports WHERE id = $1', [id]);
    log('INFO', 'Scheduled report deleted', { id });
};

/**
 * Generate and send a scheduled report
 */
const runScheduledReport = async (scheduleId) => {
    const schedule = await getScheduledReport(scheduleId);
    if (!schedule) {
        throw new Error('Scheduled report not found');
    }

    log('INFO', 'Running scheduled report', { id: scheduleId, name: schedule.name });

    let reportData;
    const filters = schedule.filters || {};

    try {
        // Generate report based on type
        switch (schedule.report_type) {
            case 'daily-attendance':
                reportData = await reports.generateDailyAttendance(
                    filters.date || new Date().toISOString().split('T')[0],
                    filters.department_id,
                    filters.area_id
                );
                break;
            case 'monthly-summary':
                const now = new Date();
                reportData = await reports.generateMonthlySummary(
                    filters.year || now.getFullYear(),
                    filters.month || now.getMonth() + 1,
                    filters.department_id
                );
                break;
            case 'late-early':
                const defaultStart = new Date();
                defaultStart.setDate(1);
                reportData = await reports.generateLateEarlyReport(
                    filters.start_date || defaultStart.toISOString().split('T')[0],
                    filters.end_date || new Date().toISOString().split('T')[0]
                );
                break;
            case 'absent':
                const absentStart = new Date();
                absentStart.setDate(1);
                reportData = await reports.generateAbsentReport(
                    filters.start_date || absentStart.toISOString().split('T')[0],
                    filters.end_date || new Date().toISOString().split('T')[0],
                    filters.department_id
                );
                break;
            case 'overtime':
                const otStart = new Date();
                otStart.setDate(1);
                reportData = await reports.generateOvertimeReport(
                    filters.start_date || otStart.toISOString().split('T')[0],
                    filters.end_date || new Date().toISOString().split('T')[0],
                    filters.regular_hours || 8
                );
                break;
            case 'device-health':
                reportData = await reports.generateDeviceHealthReport();
                break;
            case 'biometric-summary':
                reportData = await reports.generateBiometricSummary();
                break;
            default:
                throw new Error(`Unknown report type: ${schedule.report_type}`);
        }

        // Convert to requested format
        let reportContent;
        if (schedule.format === 'html') {
            reportContent = reports.toHTML(reportData);
        } else {
            reportContent = reports.toCSV(reportData);
        }

        // Send email
        await emailService.sendReportEmail(
            schedule.recipients,
            schedule.name,
            reportContent,
            schedule.format
        );

        // Update schedule status
        const nextRun = calculateNextRun(
            schedule.schedule_type,
            schedule.schedule_time,
            schedule.schedule_day
        );

        await db.query(`
            UPDATE scheduled_reports SET
                last_run_at = NOW(),
                last_run_status = 'success',
                next_run_at = $2
            WHERE id = $1
        `, [scheduleId, nextRun]);

        // Log to history
        await db.query(`
            INSERT INTO report_history (scheduled_report_id, report_type, recipients, status, sent_at)
            VALUES ($1, $2, $3, 'success', NOW())
        `, [scheduleId, schedule.report_type, schedule.recipients]);

        log('INFO', 'Scheduled report sent successfully', { id: scheduleId, recipients: schedule.recipients });

        return { success: true, message: 'Report generated and sent' };
    } catch (err) {
        log('ERROR', 'Scheduled report failed', { id: scheduleId, error: err.message });

        // Update schedule status
        await db.query(`
            UPDATE scheduled_reports SET
                last_run_at = NOW(),
                last_run_status = 'failed'
            WHERE id = $1
        `, [scheduleId]);

        // Log to history
        await db.query(`
            INSERT INTO report_history (scheduled_report_id, report_type, recipients, status, error_message)
            VALUES ($1, $2, $3, 'failed', $4)
        `, [scheduleId, schedule.report_type, schedule.recipients, err.message]);

        throw err;
    }
};

/**
 * Mirror the Settings → Auto Reports tab into scheduled_reports rows.
 *
 * The scheduler runs off table rows, but the only UI for auto reports is the
 * Settings tab, whose values previously went nowhere. This reconciles the two:
 * each of the three cadences becomes at most one managed row, created, updated,
 * or deactivated to match what the tab says. Rows created by hand are left
 * alone — only names in MANAGED_NAMES are touched.
 */
const MANAGED_NAMES = {
    daily: 'Auto Daily Attendance (Settings)',
    weekly: 'Auto Weekly Attendance (Settings)',
    monthly: 'Auto Monthly Summary (Settings)'
};

const parseRecipients = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return String(raw).split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
};

const syncFromSettings = async () => {
    const settingsStore = require('../utils/settings');
    const cfg = await settingsStore.getCategory('reports', {});

    const plans = [
        {
            cadence: 'daily',
            enabled: cfg.daily_report_enabled,
            time: cfg.daily_report_time || '08:00',
            day: null,
            recipients: parseRecipients(cfg.daily_report_recipients),
            reportType: 'daily_attendance'
        },
        {
            cadence: 'weekly',
            enabled: cfg.weekly_report_enabled,
            time: cfg.daily_report_time || '08:00',
            day: Number(cfg.weekly_report_day) || 1,
            recipients: parseRecipients(cfg.weekly_report_recipients),
            reportType: 'daily_attendance'
        },
        {
            cadence: 'monthly',
            enabled: cfg.monthly_report_enabled,
            time: cfg.daily_report_time || '08:00',
            day: Number(cfg.monthly_report_day) || 1,
            recipients: parseRecipients(cfg.monthly_report_recipients),
            reportType: 'monthly_summary'
        }
    ];

    for (const plan of plans) {
        const name = MANAGED_NAMES[plan.cadence];
        const existing = await db.query('SELECT id FROM scheduled_reports WHERE name = $1', [name]);

        // Enabled but with nobody to send to is a misconfiguration, not a schedule
        const active = Boolean(plan.enabled) && plan.recipients.length > 0;

        if (existing.rows.length === 0) {
            if (!active) continue;
            await createScheduledReport({
                name,
                report_type: plan.reportType,
                schedule_type: plan.cadence,
                schedule_time: plan.time,
                schedule_day: plan.day,
                recipients: plan.recipients,
                format: 'csv',
                is_active: true,
                created_by: null
            });
        } else {
            await updateScheduledReport(existing.rows[0].id, {
                name,
                report_type: plan.reportType,
                schedule_type: plan.cadence,
                schedule_time: plan.time,
                schedule_day: plan.day,
                recipients: plan.recipients,
                format: 'csv',
                is_active: active
            });
        }
    }

    log('INFO', 'Auto report schedules synced from settings');
};

/**
 * Check and run due scheduled reports
 */
const checkDueReports = async () => {
    try {
        const dueReports = await db.query(`
            SELECT * FROM scheduled_reports
            WHERE is_active = true
            AND next_run_at <= NOW()
        `);

        for (const schedule of dueReports.rows) {
            try {
                await runScheduledReport(schedule.id);
            } catch (err) {
                log('ERROR', 'Failed to run due report', { id: schedule.id, error: err.message });
            }
        }

        if (dueReports.rows.length > 0) {
            log('INFO', 'Processed due reports', { count: dueReports.rows.length });
        }
    } catch (err) {
        log('ERROR', 'Check due reports failed', { error: err.message });
    }
};

/**
 * Get report history
 */
const getReportHistory = async (scheduleId = null, limit = 50) => {
    let query = `
        SELECT rh.*, sr.name as schedule_name
        FROM report_history rh
        LEFT JOIN scheduled_reports sr ON rh.scheduled_report_id = sr.id
    `;
    const params = [limit];

    if (scheduleId) {
        query += ' WHERE rh.scheduled_report_id = $2';
        params.push(scheduleId);
    }

    query += ' ORDER BY rh.generated_at DESC LIMIT $1';

    const result = await db.query(query, params);
    return result.rows;
};

/**
 * Start scheduler (check every minute)
 */
const startScheduler = () => {
    setInterval(checkDueReports, 60 * 1000);
    log('INFO', 'Report scheduler started');

    // Run initial check after 5 seconds
    setTimeout(checkDueReports, 5000);
};

module.exports = {
    getScheduledReports,
    getScheduledReport,
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    runScheduledReport,
    checkDueReports,
    getReportHistory,
    startScheduler,
    syncFromSettings,
    calculateNextRun
};
