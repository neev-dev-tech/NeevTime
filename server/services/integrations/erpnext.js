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
const { BaseIntegration, CAPABILITY } = require('../hrms-integration');
const { formatLocal, decodeDirection } = require('./punch_format');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class ERPNextIntegration extends BaseIntegration {
    /**
     * The only adapter that implements the whole contract.
     *
     * Anything not listed here is skipped by the sync with a reason, rather
     * than running, returning nothing and reporting success.
     */
    static capabilities = [CAPABILITY.EMPLOYEES, CAPABILITY.SHIFTS, CAPABILITY.HOLIDAYS,
        CAPABILITY.LEAVE, CAPABILITY.PUSH_ATTENDANCE];

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
                        'department', 'designation', 'status', 'date_of_joining',
                        // The employee's own shift. Without it every person is
                        // measured against one hardcoded 09:00 start, which
                        // makes anyone on a later shift late every day they
                        // work.
                        'default_shift',
                        // Which holiday list applies to this person.
                        'holiday_list'
                    ]),
                    // No status filter. Filtering to Active meant anyone marked
                    // Left in the HRMS simply vanished from the payload, so the
                    // upsert never saw them and their row here stayed active
                    // forever — people who had resigned months ago still
                    // counted as staff and still accrued absences.
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
                joining_date: emp.date_of_joining,
                shift_code: emp.default_shift,
                holiday_list_code: emp.holiday_list,
                // Active | Inactive | Suspended | Left, per the Employee doctype.
                hrms_status: emp.status
            }));

            return employees;
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            console.error('ERPNext pull details:', detail);
            throw new Error(`ERPNext pull employees failed: ${detail}`);
        }
    }

    /**
     * Pull Shift Type definitions.
     *
     * ERPNext keeps the grace periods behind their own enable flags — a
     * late_entry_grace_period of 15 means nothing if enable_entry_grace_period
     * is unticked, and reading the number without the flag would apply a grace
     * period the HR team believes is switched off. Both are fetched and the
     * flag decides.
     */
    async pullShifts() {
        let names;
        try {
            // Only `name`, which every doctype has.
            //
            // Frappe validates every requested field against the doctype and
            // rejects the *entire* query if one is unknown — not the field, the
            // whole request. Asking for the grace-period fields up front failed
            // the whole pull with "Field not permitted in query:
            // enable_entry_grace_period", because Shift Type does not carry
            // them in this ERPNext version. One optimistic field cost every
            // shift.
            const list = await this.client.get('/api/resource/Shift Type', {
                params: { limit_page_length: 0 }
            });
            names = (list.data.data || []).map(r => r.name).filter(Boolean);
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            throw new Error(`ERPNext pull shifts failed: ${detail}`);
        }

        // Fetching each document individually returns whatever fields that
        // doctype actually has, with no field validation to fail. It costs one
        // request per shift, which is nothing — a company has a handful of
        // shift types, not thousands — and it is the difference between
        // working on any ERPNext version and working on one.
        const shifts = [];
        for (const name of names) {
            try {
                const doc = (await this.client.get(
                    `/api/resource/Shift Type/${encodeURIComponent(name)}`
                )).data.data || {};

                if (!doc.start_time || !doc.end_time) continue;

                // Read defensively: a grace period only counts when its enable
                // flag is on, but on a version without the flag the presence of
                // a period is the intent. Absent both, zero.
                const graceIn = doc.enable_entry_grace_period === undefined
                    ? (doc.late_entry_grace_period ?? 0)
                    : (doc.enable_entry_grace_period ? (doc.late_entry_grace_period ?? 0) : 0);
                const graceOut = doc.enable_exit_grace_period === undefined
                    ? (doc.early_exit_grace_period ?? 0)
                    : (doc.enable_exit_grace_period ? (doc.early_exit_grace_period ?? 0) : 0);

                shifts.push({
                    // ERPNext's `name` is both the identifier and the label a
                    // person sees, so it lands in both columns; `code` is what
                    // the upsert matches on.
                    code: doc.name || name,
                    name: doc.shift_name || doc.name || name,
                    start_time: doc.start_time,
                    end_time: doc.end_time,
                    grace_in_minutes: Number(graceIn) || 0,
                    grace_out_minutes: Number(graceOut) || 0
                });
            } catch (err) {
                // One unreadable shift should not cost the other nine.
                console.error(`ERPNext: could not read Shift Type "${name}":`, err.message);
            }
        }

        return shifts;
    }

    /**
     * Pull Holiday Lists and the dates inside them.
     *
     * The dates are a child table on the document. Frappe's list endpoint
     * never returns child tables no matter what fields are asked for, so each
     * list has to be fetched as a document — the same shape the Shift Type pull
     * ended up needing, for a different reason.
     *
     * Returns `[{ code, name, holidays: [{ date, description, weekly_off }] }]`.
     */
    async pullHolidayLists() {
        let names;
        try {
            const list = await this.client.get('/api/resource/Holiday List', {
                params: { limit_page_length: 0 }
            });
            names = (list.data.data || []).map(r => r.name).filter(Boolean);
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            throw new Error(`ERPNext pull holiday lists failed: ${detail}`);
        }

        const lists = [];
        for (const name of names) {
            try {
                const doc = (await this.client.get(
                    `/api/resource/Holiday List/${encodeURIComponent(name)}`
                )).data.data || {};

                const rows = Array.isArray(doc.holidays) ? doc.holidays : [];

                // The holiday description is a rich-text field in ERPNext, so
                // it arrives wrapped in editor markup:
                //
                //   <div class="ql-editor read-mode"><p>Republic Day</p></div>
                //
                // Stored as-is it renders literally on the Holidays screen and
                // in every report that names the day. Only the text is wanted.
                //
                // Block-level tags become a space rather than nothing, so a
                // two-line description does not run its words together.
                const plain = (html) => {
                    if (!html) return null;
                    const text = String(html)
                        .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, ' ')
                        .replace(/<[^>]*>/g, '')
                        .replace(/&nbsp;/gi, ' ')
                        .replace(/&amp;/gi, '&')
                        .replace(/&lt;/gi, '<')
                        .replace(/&gt;/gi, '>')
                        .replace(/&quot;/gi, '"')
                        .replace(/&#39;/gi, "'")
                        .replace(/\s+/g, ' ')
                        .trim();
                    return text || null;
                };
                lists.push({
                    code: doc.name || name,
                    name: doc.holiday_list_name || doc.name || name,
                    holidays: rows
                        .filter(h => h && h.holiday_date)
                        .map(h => ({
                            date: String(h.holiday_date).split(' ')[0],
                            description: plain(h.description),
                            // ERPNext puts weekly offs in the same table as real
                            // holidays. They are every Sunday, not a holiday, and
                            // importing them would mark 52 Sundays a year as
                            // company holidays on top of the weekend rule that
                            // already covers them.
                            weekly_off: Boolean(h.weekly_off)
                        }))
                });
            } catch (err) {
                console.error(`ERPNext: could not read Holiday List "${name}":`, err.message);
            }
        }

        return lists;
    }

    /**
     * Fetch a doctype as a list, falling back to per-document reads.
     *
     * Frappe rejects the whole query when any requested field is unknown to
     * that doctype — the Shift Type pull failed outright on one optional
     * field. Fetching every document individually avoids that but costs a
     * request each, which is fine for a handful of shifts and wrong for
     * hundreds of leave applications.
     *
     * So: ask for the fields, and if Frappe objects to any of them, fall back
     * to names plus per-document reads. Fast where the fields exist, correct
     * where they do not.
     */
    async _listOrFetch(doctype, fields, params = {}) {
        try {
            const res = await this.client.get(`/api/resource/${encodeURIComponent(doctype)}`, {
                params: { fields: JSON.stringify(fields), limit_page_length: 0, ...params }
            });
            return res.data.data || [];
        } catch (err) {
            const body = err.response?.data ? JSON.stringify(err.response.data) : '';
            if (!/Field not permitted in query/i.test(body)) {
                throw new Error(`ERPNext list ${doctype} failed: ${body || err.message}`);
            }
            console.warn(`ERPNext: ${doctype} rejected a requested field; falling back to per-document reads`);
        }

        const list = await this.client.get(`/api/resource/${encodeURIComponent(doctype)}`, {
            params: { limit_page_length: 0, ...params }
        });
        const docs = [];
        for (const row of (list.data.data || [])) {
            if (!row.name) continue;
            try {
                const doc = await this.client.get(
                    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(row.name)}`
                );
                docs.push(doc.data.data || {});
            } catch (e) {
                console.error(`ERPNext: could not read ${doctype} "${row.name}":`, e.message);
            }
        }
        return docs;
    }

    /**
     * Pull leave types.
     */
    async pullLeaveTypes() {
        const rows = await this._listOrFetch('Leave Type', ['name', 'is_lwp', 'max_leaves_allowed']);
        return rows.filter(t => t.name).map(t => ({
            code: t.name,
            name: t.name,
            // ERPNext marks unpaid leave with is_lwp ("leave without pay"), so
            // paid is its inverse rather than a field of its own.
            is_paid: !t.is_lwp,
            // The type-level entitlement. Without it every quota is zero, so
            // "Initialize Year" seeds every balance at zero and the Leave
            // Balances screen is a grid of noughts.
            annual_quota: Number(t.max_leaves_allowed) || 0
        }));
    }

    /**
     * Pull per-employee leave allocations.
     *
     * The type-level quota is only a default. What an individual is actually
     * entitled to lives in Leave Allocation, which is what ERPNext itself uses
     * to compute a balance — so a quota alone would show everyone the same
     * entitlement regardless of joining date, grade or carry-forward.
     */
    async pullLeaveAllocations(fromDate, toDate) {
        const rows = await this._listOrFetch(
            'Leave Allocation',
            ['name', 'employee', 'leave_type', 'from_date', 'to_date',
             'total_leaves_allocated', 'carry_forwarded_leaves_count'],
            { filters: JSON.stringify([['to_date', '>=', fromDate], ['from_date', '<=', toDate]]) }
        );

        return rows.filter(r => r.employee && r.leave_type && r.from_date).map(r => ({
            employee_code: r.employee,
            leave_type_code: r.leave_type,
            year: new Date(String(r.from_date).split(' ')[0]).getFullYear(),
            total_allocated: Number(r.total_leaves_allocated) || 0,
            carry_forwarded: Number(r.carry_forwarded_leaves_count) || 0
        }));
    }

    /**
     * Pull leave applications over a date window.
     *
     * Bounded because the whole history is not wanted — the absent report looks
     * back six months, and an unbounded pull on a company with years of leave
     * would fetch thousands of rows every five minutes.
     */
    async pullLeaveApplications(fromDate, toDate) {
        const rows = await this._listOrFetch(
            'Leave Application',
            ['name', 'employee', 'leave_type', 'from_date', 'to_date',
             'total_leave_days', 'status', 'description', 'half_day'],
            { filters: JSON.stringify([['to_date', '>=', fromDate], ['from_date', '<=', toDate]]) }
        );

        return rows.filter(r => r.name && r.employee && r.from_date && r.to_date).map(r => ({
            external_id: r.name,
            employee_code: r.employee,
            leave_type_code: r.leave_type,
            from_date: String(r.from_date).split(' ')[0],
            to_date: String(r.to_date).split(' ')[0],
            total_days: Number(r.total_leave_days) || 1,
            // Lowercased because the absent report matches on 'approved', and
            // ERPNext capitalises its workflow states.
            status: String(r.status || 'Open').toLowerCase(),
            reason: r.description || null,
            is_half_day: Boolean(r.half_day)
        }));
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
