/**
 * ERPNext Integration
 * 
 * Integrates with ERPNext/Frappe HRMS:
 * - Pull employees from Employee doctype
 * - Push attendance to Attendance doctype
 * - Auto-create attendance records
 * 
 * API Docs: https://frappeframework.com/docs/user/en/api
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const axios = require('axios');
const https = require('https');
const { BaseIntegration } = require('../hrms-integration');
const { formatLocal, decodeDirection } = require('./punch_format');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class ERPNextIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `token ${this.apiKey ? this.apiKey.trim() : ''}:${this.apiSecret ? this.apiSecret.trim() : ''}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            httpsAgent: httpsAgent
        });
    }

    /**
     * Test connection to ERPNext
     */
    async testConnection() {
        try {
            const response = await this.client.get('/api/method/frappe.auth.get_logged_user');
            return {
                success: true,
                message: `Connected as ${response.data.message}`,
                user: response.data.message
            };
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || err.message,
                error: err.message
            };
        }
    }

    /**
     * Pull employees from ERPNext
     */
    async pullEmployees() {
        try {
            const response = await this.client.get('/api/resource/Employee', {
                params: {
                    fields: JSON.stringify([
                        'name', 'employee_name', 'company_email', 'cell_number',
                        'department', 'designation', 'status', 'date_of_joining'
                    ]),
                    filters: JSON.stringify([['status', '=', 'Active']]),
                    limit_page_length: 0  // Get all
                }
            });

            const employees = response.data.data.map(emp => ({
                employee_code: emp.name,
                name: emp.employee_name,
                email: emp.company_email,
                mobile: emp.cell_number,
                department_name: emp.department,
                designation: emp.designation,
                joining_date: emp.date_of_joining
            }));

            return employees;
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            console.error('ERPNext pull details:', detail);
            throw new Error(`ERPNext pull employees failed: ${detail}`);
        }
    }

    /**
     * Push attendance to ERPNext (Employee Checkin)
     * 
     * Handles devices that don't distinguish IN/OUT (punch_state=255 or 0):
     * Uses alternating logic per employee per day (1st=IN, 2nd=OUT, 3rd=IN, etc.)
     * Counts already-synced records to maintain correct alternation on re-syncs.
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        // Cache device directions to avoid repeated DB queries
        const deviceDirectionCache = {};

        for (const record of records) {
            stats.processed++;
            try {
                // Reconstruct the wall clock the device originally sent. This used
                // to read UTC components, which was only correct while the server
                // ran in UTC; server.js now pins the process to the attendance
                // timezone, so that produced times one offset early.
                const local = formatLocal(record.punch_time);
                if (!local) {
                    stats.failed++;
                    continue;
                }
                const dateKey = local.date;
                const timestamp = local.datetime;

                // Ambiguous states fall back to how the reader is configured, so
                // the direction is looked up before decoding. Same rules as
                // before, now shared with every other integration.
                const deviceSerial = record.device_serial;
                if (deviceSerial && deviceDirectionCache[deviceSerial] === undefined) {
                    const devResult = await db.query(
                        'SELECT device_direction FROM devices WHERE serial_number = $1',
                        [deviceSerial]
                    );
                    deviceDirectionCache[deviceSerial] = devResult.rows[0]?.device_direction || 'in';
                }

                const logType = decodeDirection(
                    record.punch_state,
                    deviceDirectionCache[deviceSerial] || 'in'
                );

                await this.client.post('/api/resource/Employee Checkin', {
                    employee: record.employee_code,
                    latitude: 0.0001,
                    longitude: 0.0001,
                    time: timestamp,
                    log_type: logType,
                    device_id: record.device_serial || record.device_id || 'BIOMETRIC'
                });

                // Add small delay to prevent ERPNext bcrypt worker overload (which throws random AuthenticationError)
                await new Promise(resolve => setTimeout(resolve, 200));

                // Mark as synced
                await db.query(
                    `UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`,
                    [record.id]
                );

                stats.success++;
                console.log(`ERPNext checkin: ${record.employee_code} ${logType} at ${timestamp}`);
            } catch (err) {
                // Check if duplicate (can happen on retry), consider success
                const errDataStr = err.response?.data ? JSON.stringify(err.response.data) : '';
                const isDuplicate = errDataStr.includes('DuplicateEntryError') ||
                        errDataStr.includes('UniqueValidationError') ||
                        errDataStr.includes('This employee already has a log with the same timestamp') ||
                        errDataStr.includes('already exists');

                if (isDuplicate) {
                    await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`, [record.id]);
                    stats.success++;
                } else {
                    stats.failed++;
                    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                    if (!stats.failed_details) stats.failed_details = [];
                    // Only store first 5 errors to avoid huge responses
                    if (stats.failed_details.length < 5) {
                        stats.failed_details.push({ emp: record.employee_code, err: errorDetails });
                    }
                    console.error(`ERPNext checkin push failed for ${record.employee_code}:`, errorDetails);
                }
            }
        }

        return stats;
    }

    /**
     * Create or update employee in ERPNext
     */
    async pushEmployee(employee) {
        try {
            // Check if exists
            const checkResponse = await this.client.get(`/api/resource/Employee/${employee.employee_code}`);

            if (checkResponse.data.data) {
                // Update
                await this.client.put(`/api/resource/Employee/${employee.employee_code}`, {
                    employee_name: employee.name,
                    company_email: employee.email,
                    cell_number: employee.mobile
                });
            }
        } catch (err) {
            if (err.response?.status === 404) {
                // Create new
                await this.client.post('/api/resource/Employee', {
                    name: employee.employee_code,
                    employee_name: employee.name,
                    company_email: employee.email,
                    cell_number: employee.mobile,
                    gender: employee.gender || 'Male',
                    date_of_birth: employee.dob || '1990-01-01',
                    date_of_joining: employee.joining_date || new Date().toISOString().split('T')[0],
                    status: 'Active'
                });
            } else {
                throw err;
            }
        }
    }

    /**
     * Get attendance summary from ERPNext
     */
    async getAttendanceSummary(employeeCode, fromDate, toDate) {
        try {
            const response = await this.client.get('/api/resource/Attendance', {
                params: {
                    fields: JSON.stringify(['attendance_date', 'status', 'in_time', 'out_time']),
                    filters: JSON.stringify([
                        ['employee', '=', employeeCode],
                        ['attendance_date', '>=', fromDate],
                        ['attendance_date', '<=', toDate]
                    ])
                }
            });
            return response.data.data;
        } catch (err) {
            throw new Error(`ERPNext get attendance failed: ${err.message}`);
        }
    }
}

module.exports = ERPNextIntegration;
