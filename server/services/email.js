/**
 * Email Service
 * 
 * Handles email delivery for:
 * - Scheduled report delivery
 * - Alert notifications
 * - System notifications
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const nodemailer = require('nodemailer');
const db = require('../db');
const fs = require('fs');
const path = require('path');

let transporter = null;
let emailConfig = null;

// Logger
const log = (level, msg, data = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [Email] ${msg} ${JSON.stringify(data)}`;
    console.log(logEntry);
    fs.appendFileSync('email.log', logEntry + '\n');
};

/**
 * Initialize email transporter from database settings
 */
const initTransporter = async () => {
    try {
        // Primary source: Settings page (app_settings, category 'notifications').
        // Fallback: legacy email_settings table.
        const appRes = await db.query(`
            SELECT setting_key, setting_value FROM app_settings
            WHERE category = 'notifications'
        `);
        const appCfg = appRes.rows.reduce((acc, r) => { acc[r.setting_key] = r.setting_value; return acc; }, {});

        if (appCfg.smtp_host) {
            emailConfig = {
                smtp_host: appCfg.smtp_host,
                smtp_port: parseInt(appCfg.smtp_port) || 587,
                smtp_user: appCfg.smtp_username,
                smtp_password: appCfg.smtp_password,
                from_email: appCfg.smtp_from_email || appCfg.smtp_username,
                from_name: appCfg.smtp_from_name || 'NeevTime'
            };
        } else {
            const result = await db.query('SELECT * FROM email_settings WHERE is_active = true LIMIT 1');
            if (result.rows.length === 0) {
                log('WARN', 'No email settings configured');
                return null;
            }
            emailConfig = result.rows[0];
        }

        transporter = nodemailer.createTransport({
            host: emailConfig.smtp_host,
            port: emailConfig.smtp_port,
            secure: emailConfig.smtp_port === 465,
            auth: {
                user: emailConfig.smtp_user,
                pass: emailConfig.smtp_password
            }
        });

        // Verify connection
        await transporter.verify();
        log('INFO', 'Email transporter initialized', { host: emailConfig.smtp_host });

        return transporter;
    } catch (err) {
        log('ERROR', 'Failed to initialize email transporter', { error: err.message });
        transporter = null;
        return null;
    }
};

/**
 * Get or create transporter
 */
const getTransporter = async () => {
    if (!transporter) {
        await initTransporter();
    }
    return transporter;
};

/**
 * Send email
 */
const sendEmail = async (options) => {
    const transport = await getTransporter();

    if (!transport) {
        throw new Error('Email not configured or unavailable');
    }

    const mailOptions = {
        from: `"${emailConfig.from_name}" <${emailConfig.from_email}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments || []
    };

    try {
        const info = await transport.sendMail(mailOptions);
        log('INFO', 'Email sent', { messageId: info.messageId, to: options.to });
        return info;
    } catch (err) {
        log('ERROR', 'Email send failed', { error: err.message, to: options.to });
        throw err;
    }
};

/**
 * Send report email with attachment
 */
const sendReportEmail = async (recipients, reportName, reportContent, format = 'csv') => {
    const filename = `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.${format}`;

    const attachments = [{
        filename,
        content: reportContent,
        contentType: format === 'csv' ? 'text/csv' : 'text/html'
    }];

    const emailOptions = {
        to: recipients,
        subject: `📊 Scheduled Report: ${reportName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">📊 Report Generated</h1>
                </div>
                <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
                    <p>Hello,</p>
                    <p>Your scheduled report <strong>${reportName}</strong> has been generated and is attached to this email.</p>
                    <p style="background: #e3f2fd; padding: 10px; border-radius: 4px;">
                        📎 <strong>Attachment:</strong> ${filename}
                    </p>
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Generated on ${new Date().toLocaleString()}<br>
                        Attendance Management System
                    </p>
                </div>
            </div>
        `,
        text: `Your scheduled report "${reportName}" has been generated and is attached to this email.`,
        attachments
    };

    return sendEmail(emailOptions);
};

/**
 * Send alert notification
 */
const sendAlertEmail = async (recipients, alertType, alertMessage, details = {}) => {
    const severityColors = {
        high: '#f44336',
        medium: '#ff9800',
        low: '#2196f3'
    };

    const severity = details.severity || 'medium';
    const color = severityColors[severity];

    const emailOptions = {
        to: recipients,
        subject: `⚠️ Alert: ${alertType}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: ${color}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">⚠️ System Alert</h1>
                </div>
                <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
                    <h2 style="color: ${color};">${alertType}</h2>
                    <p>${alertMessage}</p>
                    ${details.device ? `<p><strong>Device:</strong> ${details.device}</p>` : ''}
                    ${details.action ? `<p><strong>Recommended Action:</strong> ${details.action}</p>` : ''}
                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Alert generated at ${new Date().toLocaleString()}<br>
                        Attendance Management System
                    </p>
                </div>
            </div>
        `,
        text: `Alert: ${alertType}\n\n${alertMessage}`
    };

    return sendEmail(emailOptions);
};

/**
 * Test email configuration
 */
const testEmailConfig = async (testRecipient) => {
    try {
        await initTransporter(); // Refresh config

        await sendEmail({
            to: testRecipient,
            subject: '✅ Email Configuration Test',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #4CAF50;">✅ Email Test Successful!</h2>
                    <p>This is a test email from your Attendance Management System.</p>
                    <p>If you're receiving this, your email configuration is working correctly.</p>
                    <p style="color: #666; font-size: 12px;">
                        Sent at ${new Date().toLocaleString()}
                    </p>
                </div>
            `,
            text: 'Email configuration test successful!'
        });

        return { success: true, message: 'Test email sent successfully' };
    } catch (err) {
        return { success: false, message: err.message };
    }
};

/**
 * Get email configuration (masked)
 */
const getEmailConfig = async () => {
    const result = await db.query('SELECT * FROM email_settings LIMIT 1');
    if (result.rows.length === 0) {
        return null;
    }

    const config = result.rows[0];
    return {
        ...config,
        smtp_password: config.smtp_password ? '****' : null
    };
};

/**
 * Save email configuration
 */
const saveEmailConfig = async (config) => {
    const existing = await db.query('SELECT id FROM email_settings LIMIT 1');

    if (existing.rows.length > 0) {
        await db.query(`
            UPDATE email_settings SET
                smtp_host = $1,
                smtp_port = $2,
                smtp_secure = $3,
                smtp_user = $4,
                smtp_password = CASE WHEN $5 = '****' THEN smtp_password ELSE $5 END,
                from_email = $6,
                from_name = $7,
                is_active = $8,
                updated_at = NOW()
            WHERE id = $9
        `, [
            config.smtp_host, config.smtp_port, config.smtp_secure,
            config.smtp_user, config.smtp_password,
            config.from_email, config.from_name, config.is_active,
            existing.rows[0].id
        ]);
    } else {
        await db.query(`
            INSERT INTO email_settings 
            (smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_email, from_name, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            config.smtp_host, config.smtp_port, config.smtp_secure,
            config.smtp_user, config.smtp_password,
            config.from_email, config.from_name, config.is_active ?? true
        ]);
    }

    // Reinitialize transporter
    transporter = null;
    await initTransporter();

    return { success: true };
};

module.exports = {
    initTransporter,
    sendEmail,
    sendReportEmail,
    sendAlertEmail,
    testEmailConfig,
    getEmailConfig,
    saveEmailConfig
};
