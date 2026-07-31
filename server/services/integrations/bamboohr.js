/**
 * BambooHR Integration
 * 
 * Integrates with BambooHR:
 * - Pull employees from Employee Directory
 * - Push time tracking entries
 * - Sync time off requests
 * 
 * API Docs: https://documentation.bamboohr.com/reference
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

class BambooHRIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.subdomain = config.config?.subdomain || this.extractSubdomain(config.base_url);
        this.client = axios.create({
            baseURL: `https://api.bamboohr.com/api/gateway.php/${this.subdomain}/v1`,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            auth: {
                username: this.apiKey,
                password: 'x'  // BambooHR uses API key as username, any password works
            },
            timeout: 30000,
            httpsAgent: httpsAgent
        });
    }

    /**
     * Extract subdomain from URL
     */
    extractSubdomain(url) {
        try {
            const match = url.match(/https?:\/\/([^.]+)\.bamboohr\.com/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            const response = await this.client.get('/meta/fields');
            return {
                success: true,
                message: 'Connected to BambooHR',
                fields: response.data?.length || 0
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
     * Pull employees from BambooHR
     */
    async pullEmployees() {
        try {
            // Get employee directory
            const response = await this.client.get('/employees/directory');
            const employees = response.data.employees || [];

            return employees.map(emp => ({
                employee_code: emp.employeeNumber || `BHR${emp.id}`,
                name: emp.displayName || `${emp.firstName} ${emp.lastName}`.trim(),
                email: emp.workEmail,
                mobile: emp.mobilePhone || emp.workPhone,
                department_name: emp.department,
                designation: emp.jobTitle,
                bamboohr_id: emp.id,
                location: emp.location,
                photo_url: emp.photoUrl
            }));
        } catch (err) {
            throw new Error(`BambooHR pull employees failed: ${err.message}`);
        }
    }

    /**
     * Get detailed employee info
     */
    async getEmployeeDetails(employeeId) {
        try {
            const response = await this.client.get(`/employees/${employeeId}?fields=all`);
            return response.data;
        } catch (err) {
            throw new Error(`BambooHR get employee failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to BambooHR Time Tracking
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        // Reader directions resolve punch states the device left ambiguous
        const directions = await resolveDeviceDirections(records);

        // Group by employee and date, using the local calendar date — grouping on
        // the UTC date filed early-morning punches under the previous day.
        const grouped = {};
        for (const record of records) {
            const date = localDate(record.punch_time);
            if (!date) continue;
            const key = `${record.employee_code}_${date}`;
            if (!grouped[key]) {
                grouped[key] = {
                    employee_code: record.employee_code,
                    date,
                    records: [],
                    bamboohr_id: null
                };
            }
            grouped[key].records.push(record);
        }

        for (const [key, group] of Object.entries(grouped)) {
            stats.processed++;
            try {
                // Find BambooHR employee ID
                if (!group.bamboohr_id) {
                    const empResult = await db.query(
                        `SELECT bamboohr_id FROM employees WHERE employee_code = $1`,
                        [group.employee_code]
                    );

                    if (empResult.rows.length === 0 || !empResult.rows[0].bamboohr_id) {
                        // Try to find by matching
                        const employees = await this.pullEmployees();
                        const match = employees.find(e => e.employee_code === group.employee_code);
                        if (match) {
                            group.bamboohr_id = match.bamboohr_id;
                        } else {
                            throw new Error('Employee not found in BambooHR');
                        }
                    } else {
                        group.bamboohr_id = empResult.rows[0].bamboohr_id;
                    }
                }

                // Sort and find in/out times
                group.records.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));
                // 0 is IN and 1 is OUT, so the old `<= 1` test matched both and
                // `> 1` matched neither — every punch became an entry and the exit
                // was always null.
                const dirOf = (r) => directions[r.device_serial] || 'in';
                const firstIn = group.records.find(r => isCheckIn(r.punch_state, dirOf(r)));
                const lastOut = [...group.records].reverse().find(r => !isCheckIn(r.punch_state, dirOf(r)));

                if (firstIn) {
                    // Add time tracking entry
                    await this.client.post(`/employees/${group.bamboohr_id}/time_tracking/clock_entries`, {
                        date: group.date,
                        start: formatLocal(firstIn.punch_time).timeShort,
                        end: lastOut ? formatLocal(lastOut.punch_time).timeShort : null
                    });
                }

                // Mark as synced (sync_status is boolean)
                const ids = group.records.map(r => r.id);
                await db.query(`UPDATE attendance_logs SET sync_status = true WHERE id = ANY($1)`, [ids]);

                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`BambooHR attendance push failed for ${group.employee_code}:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Get time off requests
     */
    async getTimeOffRequests(startDate, endDate) {
        try {
            const response = await this.client.get('/time_off/requests', {
                params: { start: startDate, end: endDate, status: 'approved' }
            });
            return response.data;
        } catch (err) {
            throw new Error(`BambooHR get time off failed: ${err.message}`);
        }
    }

    /**
     * Get departments
     */
    async getDepartments() {
        try {
            const response = await this.client.get('/meta/lists/4');  // Department list ID
            return response.data.options || [];
        } catch (err) {
            throw new Error(`BambooHR get departments failed: ${err.message}`);
        }
    }
}

module.exports = BambooHRIntegration;
