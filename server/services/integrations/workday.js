/**
 * Workday Integration
 * 
 * Integrates with Workday HCM:
 * - Pull workers via Workday REST API
 * - Push time tracking data
 * - Web Services (SOAP) fallback
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

class WorkdayIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.tenant = config.config?.tenant;
        this.clientId = config.api_key;
        this.clientSecret = config.api_secret;
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Get OAuth2 token
     */
    async authenticate() {
        try {
            const tokenUrl = `${this.baseUrl}/ccx/oauth2/${this.tenant}/token`;

            const response = await axios.post(tokenUrl, new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: this.clientId,
                client_secret: this.clientSecret
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                httpsAgent: httpsAgent
            });

            this.token = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return this.token;
        } catch (err) {
            throw new Error(`Workday authentication failed: ${err.message}`);
        }
    }

    /**
     * Ensure valid token
     */
    async ensureToken() {
        if (!this.token || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            await this.authenticate();
        }
        return this.token;
    }

    /**
     * Make API request
     */
    async request(method, path, data = null) {
        await this.ensureToken();

        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/ccx/api/v1/${this.tenant}${path}`,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                data,
                timeout: 30000,
                httpsAgent: httpsAgent
            });

            return response.data;
        } catch (err) {
            throw new Error(`Workday API error: ${err.response?.data?.error || err.message}`);
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            await this.ensureToken();
            // Try to get workers (limited)
            const response = await this.request('GET', '/workers?limit=1');

            return {
                success: true,
                message: 'Connected to Workday',
                tenant: this.tenant
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
     * Pull employees from Workday
     */
    async pullEmployees() {
        try {
            const employees = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;

            while (hasMore) {
                const response = await this.request('GET', `/workers?limit=${limit}&offset=${offset}`);
                const workers = response.data || [];

                for (const worker of workers) {
                    employees.push({
                        employee_code: worker.employeeID || worker.id,
                        name: worker.descriptor || `${worker.firstName} ${worker.lastName}`.trim(),
                        email: worker.primaryWorkEmail,
                        mobile: worker.primaryWorkPhone,
                        department_name: worker.supervisoryOrganization?.descriptor,
                        designation: worker.businessTitle,
                        workday_id: worker.id,
                        location: worker.primaryWorkaddress?.descriptor
                    });
                }

                offset += limit;
                hasMore = workers.length === limit;
            }

            return employees;
        } catch (err) {
            throw new Error(`Workday pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to Workday Time Tracking
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        const directions = await resolveDeviceDirections(records);

        // Group on the local calendar date, not the UTC one
        const grouped = {};
        for (const record of records) {
            const date = localDate(record.punch_time);
            if (!date) continue;
            const key = `${record.employee_code}_${date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    employee_code: record.employee_code,
                    date,
                    records: []
                };
            }
            grouped[key].records.push(record);
        }

        for (const [key, group] of Object.entries(grouped)) {
            stats.processed++;
            try {
                // Sort records
                group.records.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

                const dirOf = (r) => directions[r.device_serial] || 'in';
                const firstIn = group.records.find(r => isCheckIn(r.punch_state, dirOf(r)));
                const lastOut = [...group.records].reverse().find(r => !isCheckIn(r.punch_state, dirOf(r)));

                if (firstIn) {
                    // Calculate hours worked
                    const startTime = new Date(firstIn.punch_time);
                    const endTime = lastOut ? new Date(lastOut.punch_time) : null;
                    const hoursWorked = endTime ? (endTime - startTime) / 3600000 : 0;

                    // Submit time entry
                    await this.request('POST', '/timeTracking/timeBlocks', {
                        worker: { id: group.employee_code },
                        date: group.date,
                        in: startTime.toISOString(),
                        out: endTime?.toISOString(),
                        hours: hoursWorked
                    });
                }

                // Mark as synced (sync_status is boolean)
                const ids = group.records.map(r => r.id);
                await db.query(`UPDATE attendance_logs SET sync_status = true WHERE id = ANY($1)`, [ids]);

                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`Workday attendance push failed for ${group.employee_code}:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Get supervisory organizations (departments)
     */
    async getOrganizations() {
        try {
            const response = await this.request('GET', '/supervisoryOrganizations');
            return response.data || [];
        } catch (err) {
            throw new Error(`Workday get organizations failed: ${err.message}`);
        }
    }

    /**
     * Get locations
     */
    async getLocations() {
        try {
            const response = await this.request('GET', '/locations');
            return response.data || [];
        } catch (err) {
            throw new Error(`Workday get locations failed: ${err.message}`);
        }
    }
}

module.exports = WorkdayIntegration;
