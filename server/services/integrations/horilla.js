/**
 * Horilla Integration
 * 
 * Integrates with Horilla Open Source HRMS:
 * - Pull employees from Employee model
 * - Push attendance records
 * - Sync leaves
 * 
 * Horilla uses Django REST Framework
 * https://github.com/horlocom/horilla
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const axios = require('axios');
const https = require('https');
const { BaseIntegration } = require('../hrms-integration');
const { formatLocal, localDate, isCheckIn, resolveDeviceDirections } = require('./punch_format');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class HorillaIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            httpsAgent: httpsAgent
        });
        this.token = null;
    }

    /**
     * Authenticate with Horilla
     */
    async authenticate() {
        try {
            const response = await this.client.post('/api/auth/login/', {
                username: this.username,
                password: this.password
            });

            this.token = response.data.token || response.data.access;
            this.client.defaults.headers['Authorization'] = `Token ${this.token}`;

            return this.token;
        } catch (err) {
            throw new Error(`Horilla authentication failed: ${err.message}`);
        }
    }

    /**
     * Make authenticated request
     */
    async request(method, url, data = null) {
        if (!this.token) {
            await this.authenticate();
        }

        try {
            const response = await this.client.request({
                method,
                url,
                data
            });
            return response.data;
        } catch (err) {
            if (err.response?.status === 401) {
                // Re-authenticate
                this.token = null;
                await this.authenticate();
                return this.request(method, url, data);
            }
            throw err;
        }
    }

    /**
     * Test connection to Horilla
     */
    async testConnection() {
        try {
            await this.authenticate();
            const user = await this.request('GET', '/api/auth/user/');
            return {
                success: true,
                message: `Connected to Horilla as ${user.username}`,
                user: user
            };
        } catch (err) {
            return {
                success: false,
                message: err.message,
                error: err.message
            };
        }
    }

    /**
     * Pull employees from Horilla
     */
    async pullEmployees() {
        try {
            const response = await this.request('GET', '/api/employee/employees/');
            const employees = response.results || response;

            return employees.map(emp => ({
                employee_code: emp.badge_id || emp.employee_id || `EMP${emp.id}`,
                name: `${emp.employee_first_name} ${emp.employee_last_name}`.trim(),
                email: emp.employee_work_email || emp.email,
                mobile: emp.phone,
                department_name: emp.department?.department,
                designation: emp.job_position?.job_position,
                horilla_id: emp.id
            }));
        } catch (err) {
            throw new Error(`Horilla pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to Horilla
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        const directions = await resolveDeviceDirections(records);

        for (const record of records) {
            stats.processed++;
            try {
                // attendance_date is a calendar date, so it must be the local one —
                // the UTC date filed early-morning punches under the previous day.
                // The timestamp itself stays a UTC instant, which is what Horilla's
                // Django datetime fields expect.
                const attendanceDate = localDate(record.punch_time);
                const punchTime = new Date(record.punch_time).toISOString();
                const isIn = isCheckIn(record.punch_state, directions[record.device_serial] || 'in');

                // Horilla attendance format
                const attendanceData = {
                    employee: record.employee_code,  // or horilla_id
                    attendance_date: attendanceDate,
                    attendance_clock_in: isIn ? punchTime : null,
                    attendance_clock_out: isIn ? null : punchTime,
                    shift: null,  // Will use default shift
                    is_validate: true
                };

                // Try to update existing or create new
                try {
                    await this.request('POST', '/api/attendance/attendances/', attendanceData);
                } catch (err) {
                    // If exists, try to update (PATCH)
                    if (err.response?.status === 400 && err.response?.data?.attendance_date) {
                        // Already exists for this date, need to update
                        const existing = await this.request('GET',
                            `/api/attendance/attendances/?employee=${record.employee_code}&attendance_date=${attendanceDate}`);

                        if (existing.results?.length > 0) {
                            await this.request('PATCH',
                                `/api/attendance/attendances/${existing.results[0].id}/`,
                                {
                                    attendance_clock_out: punchTime
                                }
                            );
                        }
                    } else {
                        throw err;
                    }
                }

                // sync_status is VARCHAR; writing a boolean stored 'true', which
                // never matches the != 'synced' filter, so the record was re-pushed
                // on every cycle and duplicated in the HR system
                await db.query(`
                    UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1
                `, [record.id]);

                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`Horilla attendance push failed for ${record.employee_code}:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Pull departments from Horilla
     */
    async getDepartments() {
        const response = await this.request('GET', '/api/base/departments/');
        return response.results || response;
    }

    /**
     * Pull job positions from Horilla
     */
    async getJobPositions() {
        const response = await this.request('GET', '/api/base/job-positions/');
        return response.results || response;
    }

    /**
     * Pull shifts from Horilla
     */
    async getShifts() {
        const response = await this.request('GET', '/api/base/employee-shifts/');
        return response.results || response;
    }

    /**
     * Push leave request to Horilla
     */
    async pushLeaveRequest(leaveData) {
        try {
            const response = await this.request('POST', '/api/leave/leave-requests/', {
                employee: leaveData.employee_code,
                leave_type: leaveData.leave_type,
                start_date: leaveData.start_date,
                end_date: leaveData.end_date,
                description: leaveData.reason,
                status: 'requested'
            });
            return response;
        } catch (err) {
            throw new Error(`Horilla leave request failed: ${err.message}`);
        }
    }
}

module.exports = HorillaIntegration;
