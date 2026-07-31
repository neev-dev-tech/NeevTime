/**
 * Zoho People Integration
 * 
 * Integrates with Zoho People HRMS:
 * - Pull employees from Zoho People
 * - Push attendance records
 * - Sync leave requests
 * 
 * API Docs: https://www.zoho.com/people/api/
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

class ZohoPeopleIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.refreshToken = config.config?.refresh_token;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.zohoAccountsUrl = config.config?.accounts_url || 'https://accounts.zoho.com';
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken() {
        try {
            const response = await axios.post(`${this.zohoAccountsUrl}/oauth/v2/token`, null, {
                params: {
                    refresh_token: this.refreshToken,
                    client_id: this.apiKey,
                    client_secret: this.apiSecret,
                    grant_type: 'refresh_token'
                },
                httpsAgent: httpsAgent
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return this.accessToken;
        } catch (err) {
            throw new Error(`Zoho token refresh failed: ${err.message}`);
        }
    }

    /**
     * Ensure valid access token
     */
    async ensureToken() {
        if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            await this.refreshAccessToken();
        }
        return this.accessToken;
    }

    /**
     * Make API request
     */
    async request(method, endpoint, data = null, params = {}) {
        await this.ensureToken();

        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/people/api/${endpoint}`,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                data,
                params,
                timeout: 30000,
                httpsAgent: httpsAgent
            });

            return response.data;
        } catch (err) {
            throw new Error(`Zoho API error: ${err.response?.data?.message || err.message}`);
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            await this.ensureToken();
            const response = await this.request('GET', 'forms');

            return {
                success: true,
                message: 'Connected to Zoho People',
                forms: response.response?.result?.length || 0
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
     * Pull employees from Zoho People
     */
    async pullEmployees() {
        try {
            const response = await this.request('GET', 'forms/employee/getRecords', null, {
                sIndex: 1,
                limit: 200
            });

            const records = response.response?.result || [];

            return records.map(record => {
                const data = record.Employee || record;
                return {
                    employee_code: data.EmployeeID || data.Employeeid,
                    name: `${data.FirstName || ''} ${data.LastName || ''}`.trim() || data.Name,
                    email: data.EmailID || data.Work_Email,
                    mobile: data.Mobile || data.Phone,
                    department_name: data.Department,
                    designation: data.Designation,
                    zoho_record_id: data.recordId,
                    joining_date: data.Dateofjoining
                };
            });
        } catch (err) {
            throw new Error(`Zoho pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to Zoho People
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        const directions = await resolveDeviceDirections(records);

        for (const record of records) {
            stats.processed++;
            try {
                // Zoho People expects the employee's local wall clock; sending UTC
                // logged everyone one offset early.
                const local = formatLocal(record.punch_time);
                if (!local) { stats.failed++; continue; }
                const date = local.date;
                const time = local.timeShort;
                const isEntry = isCheckIn(record.punch_state, directions[record.device_serial] || 'in');

                // Zoho People attendance API
                const attendanceData = {
                    dateFormat: 'yyyy-MM-dd',
                    empId: record.employee_code,
                    checkIn: isEntry ? `${date} ${time}` : undefined,
                    checkOut: isEntry ? undefined : `${date} ${time}`
                };

                await this.request('POST', 'attendance', attendanceData);

                // Mark as synced (sync_status is boolean)
                await db.query(`
                    UPDATE attendance_logs SET sync_status = true WHERE id = $1
                `, [record.id]);

                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`Zoho attendance push failed:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Get departments from Zoho
     */
    async getDepartments() {
        try {
            const response = await this.request('GET', 'forms/department/getRecords');
            return response.response?.result || [];
        } catch (err) {
            throw new Error(`Zoho get departments failed: ${err.message}`);
        }
    }

    /**
     * Get leave types
     */
    async getLeaveTypes() {
        try {
            const response = await this.request('GET', 'leave/getLeaveTypeDetails');
            return response.response?.result || [];
        } catch (err) {
            throw new Error(`Zoho get leave types failed: ${err.message}`);
        }
    }
}

module.exports = ZohoPeopleIntegration;
