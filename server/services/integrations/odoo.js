/**
 * Odoo Integration
 * 
 * Integrates with Odoo HRMS:
 * - Pull employees from hr.employee model
 * - Push attendance to hr.attendance model
 * - Support for Odoo 14, 15, 16, 17
 * 
 * Uses JSON-RPC API
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

class OdooIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.database = config.database_name || config.config?.database;
        this.uid = null;  // User ID from authentication
        this.sessionId = null;
    }

    /**
     * Authenticate with Odoo
     */
    async authenticate() {
        try {
            const response = await axios.post(`${this.baseUrl}/web/session/authenticate`, {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    db: this.database,
                    login: this.username,
                    password: this.password
                },
                id: Date.now()
            }, {
                headers: { 'Content-Type': 'application/json' },
                httpsAgent: httpsAgent
            });

            if (response.data.error) {
                throw new Error(response.data.error.message);
            }

            this.uid = response.data.result.uid;
            this.sessionId = response.headers['set-cookie']?.[0]?.split(';')[0];

            return this.uid;
        } catch (err) {
            throw new Error(`Odoo authentication failed: ${err.message}`);
        }
    }

    /**
     * Make JSON-RPC call to Odoo
     */
    async rpc(model, method, args = [], kwargs = {}) {
        if (!this.uid) {
            await this.authenticate();
        }

        try {
            const response = await axios.post(`${this.baseUrl}/web/dataset/call_kw`, {
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    model: model,
                    method: method,
                    args: args,
                    kwargs: kwargs
                },
                id: Date.now()
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': this.sessionId
                },
                httpsAgent: httpsAgent
            });

            if (response.data.error) {
                throw new Error(response.data.error.data?.message || response.data.error.message);
            }

            return response.data.result;
        } catch (err) {
            // Try re-authentication on session expiry
            if (err.response?.status === 401 || err.message.includes('Session')) {
                this.uid = null;
                await this.authenticate();
                return this.rpc(model, method, args, kwargs);
            }
            throw err;
        }
    }

    /**
     * Test connection to Odoo
     */
    async testConnection() {
        try {
            await this.authenticate();
            const user = await this.rpc('res.users', 'read', [[this.uid]], { fields: ['name', 'login'] });
            return {
                success: true,
                message: `Connected to Odoo as ${user[0]?.name}`,
                user: user[0]
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
     * Pull employees from Odoo
     */
    async pullEmployees() {
        try {
            // Search for active employees
            const employeeIds = await this.rpc('hr.employee', 'search', [
                [['active', '=', true]]
            ]);

            if (employeeIds.length === 0) {
                return [];
            }

            // Read employee details
            const employees = await this.rpc('hr.employee', 'read', [employeeIds], {
                fields: ['name', 'work_email', 'mobile_phone', 'department_id', 'job_id', 'barcode', 'identification_id']
            });

            return employees.map(emp => ({
                employee_code: emp.barcode || emp.identification_id || `EMP${emp.id}`,
                name: emp.name,
                email: emp.work_email,
                mobile: emp.mobile_phone,
                department_name: emp.department_id?.[1],
                designation: emp.job_id?.[1],
                odoo_id: emp.id
            }));
        } catch (err) {
            throw new Error(`Odoo pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to Odoo
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        const directions = await resolveDeviceDirections(records);

        // Group by employee for check-in/check-out pairing
        const byEmployee = {};
        for (const record of records) {
            if (!byEmployee[record.employee_code]) {
                byEmployee[record.employee_code] = [];
            }
            byEmployee[record.employee_code].push(record);
        }

        for (const [employeeCode, empRecords] of Object.entries(byEmployee)) {
            try {
                // Find Odoo employee ID
                const employeeIds = await this.rpc('hr.employee', 'search', [
                    ['|', ['barcode', '=', employeeCode], ['identification_id', '=', employeeCode]]
                ]);

                if (employeeIds.length === 0) {
                    console.warn(`Odoo employee not found: ${employeeCode}`);
                    stats.failed += empRecords.length;
                    continue;
                }

                const odooEmployeeId = employeeIds[0];

                // Sort records by time
                empRecords.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

                for (const record of empRecords) {
                    stats.processed++;
                    try {
                        // Odoo stores hr.attendance datetimes in UTC and renders them
                        // in the user's timezone, so a UTC instant is correct here —
                        // unlike the other integrations, which want local wall clocks.
                        const checkTime = new Date(record.punch_time).toISOString().replace('T', ' ').substring(0, 19);
                        // 0 is IN and 1 is OUT; the old `<= 1` matched both
                        const isEntry = isCheckIn(record.punch_state, directions[record.device_serial] || 'in');

                        if (isEntry) {
                            // Create check-in record
                            await this.rpc('hr.attendance', 'create', [{
                                employee_id: odooEmployeeId,
                                check_in: checkTime
                            }]);
                        } else {
                            // Find open attendance and set check-out
                            const openAttendance = await this.rpc('hr.attendance', 'search', [
                                [['employee_id', '=', odooEmployeeId], ['check_out', '=', false]]
                            ], { limit: 1, order: 'check_in desc' });

                            if (openAttendance.length > 0) {
                                await this.rpc('hr.attendance', 'write', [openAttendance, {
                                    check_out: checkTime
                                }]);
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
                        console.error(`Odoo attendance push failed for ${employeeCode}:`, err.message);
                    }
                }
            } catch (err) {
                stats.failed += empRecords.length;
                console.error(`Odoo employee lookup failed for ${employeeCode}:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Get departments from Odoo
     */
    async getDepartments() {
        const deptIds = await this.rpc('hr.department', 'search', [[]]);
        const departments = await this.rpc('hr.department', 'read', [deptIds], {
            fields: ['name', 'parent_id', 'manager_id']
        });
        return departments;
    }

    /**
     * Get jobs/positions from Odoo
     */
    async getJobs() {
        const jobIds = await this.rpc('hr.job', 'search', [[]]);
        const jobs = await this.rpc('hr.job', 'read', [jobIds], {
            fields: ['name', 'department_id']
        });
        return jobs;
    }
}

module.exports = OdooIntegration;
