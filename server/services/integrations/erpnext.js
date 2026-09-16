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

const allowSelfSigned = process.env.ALLOW_SELF_SIGNED_CERTS === 'true';

// Secure by default: verify TLS certificates unless explicitly overridden
const httpsAgent = new https.Agent({
    rejectUnauthorized: !allowSelfSigned
});

class ERPNextIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.employeeResolutionCache = new Map();
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `token ${this.apiKey}:${this.apiSecret}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            httpsAgent: httpsAgent
        });
    }

    getEmployeeCodeVariants(employeeCode) {
        const raw = String(employeeCode || '').trim();
        if (!raw) return [];

        const variants = new Set([raw]);
        const digitsOnly = /^\d+$/.test(raw);

        if (digitsOnly) {
            const trimmed = raw.replace(/^0+/, '') || '0';
            variants.add(trimmed);
            variants.add(trimmed.padStart(2, '0'));
            variants.add(trimmed.padStart(3, '0'));
            variants.add(trimmed.padStart(4, '0'));
        }

        return Array.from(variants);
    }

    normalizeEmployeeToken(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^\d+$/.test(raw)) {
            return String(parseInt(raw, 10));
        }
        return raw.toLowerCase();
    }

    async resolveEmployeeForCheckin(employeeCode, context = {}) {
        const code = String(employeeCode || '').trim();
        if (!code) return null;

        if (this.employeeResolutionCache.has(code)) {
            return this.employeeResolutionCache.get(code);
        }

        const findByFilters = async (filters) => {
            const response = await this.client.get('/api/resource/Employee', {
                params: {
                    fields: JSON.stringify(['name']),
                    filters: JSON.stringify(filters),
                    limit_page_length: 1
                }
            });
            return response?.data?.data?.[0]?.name || null;
        };

        const cacheResolution = (keys, value) => {
            for (const key of keys) {
                this.employeeResolutionCache.set(key, value);
            }
        };

        try {
            const variants = this.getEmployeeCodeVariants(code);
            for (const variant of variants) {
                // 1) Direct Employee ID lookup
                let mapped = await findByFilters([['name', '=', variant]]);
                if (mapped) {
                    cacheResolution(variants, mapped);
                    return mapped;
                }

                // 2) Map biometric/device PIN to Employee
                mapped = await findByFilters([
                    ['attendance_device_id', '=', variant]
                ]);
                if (mapped) {
                    cacheResolution(variants, mapped);
                    return mapped;
                }
            }

            // 3) Fallback: exact employee_name (if source sends names)
            let mapped = await findByFilters([
                ['employee_name', '=', code]
            ]);

            if (!mapped && context.employee_name) {
                mapped = await findByFilters([
                    ['employee_name', '=', String(context.employee_name).trim()]
                ]);
            }

            if (!mapped) {
                // 4) Broad fallback: scan active employees and normalize tokens
                const response = await this.client.get('/api/resource/Employee', {
                    params: {
                        fields: JSON.stringify(['name', 'employee_name', 'attendance_device_id', 'status']),
                        limit_page_length: 0
                    }
                });

                const candidates = response?.data?.data || [];
                const codeTokens = new Set(this.getEmployeeCodeVariants(code).map(v => this.normalizeEmployeeToken(v)));
                if (context.employee_name) {
                    codeTokens.add(this.normalizeEmployeeToken(context.employee_name));
                }
                const match = candidates.find(emp => {
                    const tokens = new Set([
                        this.normalizeEmployeeToken(emp.name),
                        this.normalizeEmployeeToken(emp.employee_name),
                        this.normalizeEmployeeToken(emp.attendance_device_id)
                    ]);
                    for (const token of tokens) {
                        if (token && codeTokens.has(token)) {
                            return true;
                        }
                    }
                    return false;
                });

                mapped = match?.name || null;
            }

            if (!mapped && context.employee_name) {
                // 5) Fuzzy fallback by employee_name for minor casing/spaces variations
                mapped = await findByFilters([
                    ['employee_name', 'like', `%${String(context.employee_name).trim()}%`]
                ]);
            }

            cacheResolution(variants, mapped || null);
            return mapped || null;
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            console.warn(`ERPNext employee resolution failed for ${code}: ${detail}`);
            this.employeeResolutionCache.set(code, null);
            return null;
        }
    }

    formatERPNextError(err) {
        if (!err.response?.data) {
            return err.message;
        }

        const data = err.response.data;
        const messages = [];

        if (data._server_messages) {
            try {
                const serverMessages = JSON.parse(data._server_messages);
                for (const item of serverMessages) {
                    const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                    if (parsed.message) messages.push(parsed.message);
                }
            } catch (parseErr) {
                messages.push(String(data._server_messages));
            }
        }

        if (data.exception) messages.push(data.exception);
        if (data.exc_type) messages.push(data.exc_type);
        if (data.message) messages.push(typeof data.message === 'string' ? data.message : JSON.stringify(data.message));

        return messages.length > 0 ? messages.join(' | ') : JSON.stringify(data);
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
                        'department', 'designation', 'status', 'date_of_joining', 'attendance_device_id'
                    ]),
                    filters: JSON.stringify([['status', '=', 'Active']]),
                    limit_page_length: 0  // Get all
                }
            });

            const employees = response.data.data.map(emp => ({
                employee_code: emp.attendance_device_id || emp.name,
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
     * Push attendance to ERPNext
     */
    /**
     * Push attendance to ERPNext (Employee Checkin)
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0, errors: [] };
        const db = require('../../db');

        const addError = (record, message) => {
            const error = {
                employee_code: record.employee_code,
                punch_time: record.punch_time,
                error: message
            };
            stats.errors.push(error);
            if (stats.errors.length > 25) {
                stats.errors.shift();
            }
        };

        for (const record of records) {
            stats.processed++;
            try {
                const targetEmployee = await this.resolveEmployeeForCheckin(record.employee_code, {
                    employee_name: record.employee_name
                });
                if (!targetEmployee) {
                    if (record.id) {
                        await db.query(`
                            UPDATE attendance_logs SET sync_status = 'unmapped' WHERE id = $1
                        `, [record.id]);
                    }
                    stats.failed++;
                    const message = `Employee not found in ERPNext by name, attendance_device_id, or employee_name: ${record.employee_code}`;
                    addError(record, message);
                    console.warn(`ERPNext checkin skipped (unmapped employee): ${record.employee_code}`);
                    continue;
                }

                // Determine Log Type (IN or OUT) from punch_state
                // Standard ZK: 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OT-In, 5=OT-Out
                // Extended: 8=Meal-In, 9=Meal-Out
                let logType = 'IN';
                const state = parseInt(record.punch_state || 0);
                if ([1, 2, 5, 9].includes(state)) {
                    logType = 'OUT';
                }

                // Debug log to trace what's being sent
                console.log(`[ERPNext] Pushing ${logType} for ${record.employee_code} at ${record.punch_time} (state: ${state})`);

                // Format timestamp manually to preserve wall-clock time
                // (Avoids timezone shifting issues if server/db mismatch)
                const d = new Date(record.punch_time);
                const timestamp = d.getFullYear() + "-" +
                    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
                    ("0" + d.getDate()).slice(-2) + " " +
                    ("0" + d.getHours()).slice(-2) + ":" +
                    ("0" + d.getMinutes()).slice(-2) + ":" +
                    ("0" + d.getSeconds()).slice(-2);

                await this.client.post('/api/resource/Employee%20Checkin', {
                    employee: targetEmployee,
                    time: timestamp,
                    log_type: logType,
                    device_id: record.device_serial || record.device_id || 'MANUAL',
                    latitude: 0.0001,
                    longitude: 0.0001
                });

                // Mark as synced
                if (record.id) {
                    await db.query(`
                        UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1
                    `, [record.id]);
                } else {
                    // For real-time pushes where ID might not be passed, find and update
                    await db.query(`
                        UPDATE attendance_logs 
                        SET sync_status = 'synced' 
                        WHERE employee_code = $1 AND punch_time = $2
                    `, [record.employee_code, record.punch_time]);
                }

                stats.success++;
            } catch (err) {
                // Check if duplicate (can happen on retry / real-time + batch race), consider success.
                // ERPNext signals duplicates a few ways: low-level DuplicateEntryError/UniqueValidationError
                // in `exc`, or the Employee Checkin validation message in the formatted error.
                const errorDetails = this.formatERPNextError(err);
                const excText = err.response?.data?.exc || '';
                const isDuplicate =
                    excText.includes('DuplicateEntryError') ||
                    excText.includes('UniqueValidationError') ||
                    /already has a log with the same timestamp/i.test(errorDetails);

                if (isDuplicate) {
                    if (record.id) {
                        await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`, [record.id]);
                    } else {
                        await db.query(`
                            UPDATE attendance_logs 
                            SET sync_status = 'synced' 
                            WHERE employee_code = $1 AND punch_time = $2
                        `, [record.employee_code, record.punch_time]);
                    }
                    stats.success++;
                } else {
                    stats.failed++;
                    addError(record, errorDetails);
                    if (record.id) {
                        await db.query(`UPDATE attendance_logs SET sync_status = 'failed' WHERE id = $1`, [record.id]);
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
                    attendance_device_id: employee.employee_code,
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
                    attendance_device_id: employee.employee_code,
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
