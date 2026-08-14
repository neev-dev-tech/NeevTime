/**
 * HRMS Integration Framework
 * 
 * Base framework for integrating with external HR systems:
 * - ERPNext
 * - Odoo
 * - Horilla
 * - Generic Webhook/API
 * 
 * Supports bi-directional sync:
 * - Pull employees from HRMS
 * - Push attendance to HRMS
 * - Sync leave requests
 * 
 * @author DevTeam
 * @version 2.0.0
 */

const db = require('../db');
const fs = require('fs');

// Logger
const log = (level, msg, data = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [Integration] ${msg} ${JSON.stringify(data)}`;
    console.log(logEntry);
    fs.appendFileSync('integration.log', logEntry + '\n');
};

// Sync Direction
const SYNC_DIRECTION = {
    PUSH: 'push',   // Send data to HRMS
    PULL: 'pull'    // Get data from HRMS
};

// Sync Type
const SYNC_TYPE = {
    EMPLOYEES: 'employees',
    ATTENDANCE: 'attendance',
    LEAVES: 'leaves'
};

// Integration Type
const INTEGRATION_TYPE = {
    ERPNEXT: 'erpnext',
    ODOO: 'odoo',
    HORILLA: 'horilla',
    WEBHOOK: 'webhook',
    CUSTOM_API: 'custom_api',
    SAP: 'sap_successfactors',
    WORKDAY: 'workday',
    BAMBOOHR: 'bamboohr',
    ZOHO: 'zoho_people'
};

/**
 * Base Integration Class
 * All specific integrations extend this
 */
class BaseIntegration {
    constructor(config) {
        this.id = config.id;
        this.name = config.name;
        this.type = config.type;
        this.baseUrl = config.base_url;
        this.apiKey = config.api_key;
        this.apiSecret = config.api_secret;
        this.username = config.username;
        this.password = config.password;
        this.config = config.config || {};
        this.fieldMappings = {};
    }

    /**
     * Load field mappings from database
     */
    async loadFieldMappings() {
        const result = await db.query(`
            SELECT * FROM integration_field_mappings WHERE integration_id = $1
        `, [this.id]);

        result.rows.forEach(mapping => {
            if (!this.fieldMappings[mapping.entity_type]) {
                this.fieldMappings[mapping.entity_type] = {};
            }
            this.fieldMappings[mapping.entity_type][mapping.local_field] = {
                remote: mapping.remote_field,
                transform: mapping.transform_function,
                required: mapping.is_required,
                default: mapping.default_value
            };
        });
    }

    /**
     * Test connection to HRMS
     */
    async testConnection() {
        throw new Error('testConnection must be implemented by subclass');
    }

    /**
     * Pull employees from HRMS
     */
    async pullEmployees() {
        throw new Error('pullEmployees must be implemented by subclass');
    }

    /**
     * Pull shift definitions from the HRMS.
     *
     * Optional, unlike the methods either side of it. An HRMS that has no
     * concept of shifts returns an empty array and the sync simply does
     * nothing, rather than every adapter having to implement a stub. Returns
     * `[{ code, name, start_time, end_time, grace_in_minutes,
     *     grace_out_minutes }]`.
     */
    async pullShifts() {
        return [];
    }

    /**
     * Push attendance to HRMS
     */
    async pushAttendance(records) {
        throw new Error('pushAttendance must be implemented by subclass');
    }

    /**
     * Push leaves to HRMS
     */
    async pushLeaves(records) {
        throw new Error('pushLeaves must be implemented by subclass');
    }

    /**
     * Map local fields to remote fields
     */
    mapFields(entityType, localData) {
        const mappings = this.fieldMappings[entityType] || {};
        const mapped = {};

        for (const [localField, config] of Object.entries(mappings)) {
            let value = localData[localField];

            // Apply default if no value
            if (value === undefined || value === null) {
                value = config.default;
            }

            // Apply transformation if specified
            if (config.transform && value !== undefined) {
                value = this.applyTransform(config.transform, value);
            }

            if (config.remote) {
                mapped[config.remote] = value;
            }
        }

        return mapped;
    }

    /**
     * Apply transformation function
     */
    applyTransform(transform, value) {
        switch (transform) {
            case 'uppercase':
                return String(value).toUpperCase();
            case 'lowercase':
                return String(value).toLowerCase();
            case 'date_to_string':
                return new Date(value).toISOString().split('T')[0];
            case 'datetime_to_string':
                return new Date(value).toISOString();
            case 'time_to_string':
                return new Date(value).toISOString().split('T')[1].substring(0, 8);
            case 'boolean_to_int':
                return value ? 1 : 0;
            case 'int_to_boolean':
                return Boolean(value);
            default:
                return value;
        }
    }

    /**
     * Log sync operation
     */
    async logSync(syncType, direction, status, stats, errorMessage = null) {
        try {
            await db.query(`
                INSERT INTO integration_sync_logs 
                (integration_id, sync_type, direction, status, records_processed, records_success, records_failed, error_message, completed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            `, [
                this.id, syncType, direction, status,
                stats.processed || 0, stats.success || 0, stats.failed || 0,
                errorMessage
            ]);
        } catch (err) {
            log('ERROR', 'Failed to log sync', { error: err.message });
        }
    }

    /**
     * Update last sync status
     */
    async updateSyncStatus(status, message = null) {
        try {
            await db.query(`
                UPDATE hrms_integrations 
                SET last_sync_at = NOW(), last_sync_status = $2, last_sync_message = $3, updated_at = NOW()
                WHERE id = $1
            `, [this.id, status, message]);
        } catch (err) {
            log('ERROR', 'Failed to update sync status', { error: err.message });
        }
    }
}

/**
 * Get integration instance by type
 */
const getIntegrationInstance = async (integrationId) => {
    try {
        const result = await db.query('SELECT * FROM hrms_integrations WHERE id = $1', [integrationId]);
        if (result.rows.length === 0) {
            throw new Error(`Integration with ID ${integrationId} not found`);
        }

        const config = result.rows[0];

        // Parse config if it's a string
        if (config.config && typeof config.config === 'string') {
            try {
                config.config = JSON.parse(config.config);
            } catch (e) {
                log('WARN', 'Failed to parse config JSON', { error: e.message });
                config.config = {};
            }
        }

        if (!config.type) {
            throw new Error('Integration type is not set');
        }

        let instance;

        try {
            switch (config.type) {
                case INTEGRATION_TYPE.ERPNEXT:
                case 'erpnext':
                    const ERPNextIntegration = require('./integrations/erpnext');
                    instance = new ERPNextIntegration(config);
                    break;
                case INTEGRATION_TYPE.ODOO:
                case 'odoo':
                    const OdooIntegration = require('./integrations/odoo');
                    instance = new OdooIntegration(config);
                    break;
                case INTEGRATION_TYPE.HORILLA:
                case 'horilla':
                    const HorillaIntegration = require('./integrations/horilla');
                    instance = new HorillaIntegration(config);
                    break;
                case INTEGRATION_TYPE.WEBHOOK:
                case INTEGRATION_TYPE.CUSTOM_API:
                case 'webhook':
                case 'custom_api':
                    const WebhookIntegration = require('./integrations/webhook');
                    instance = new WebhookIntegration(config);
                    break;
                case INTEGRATION_TYPE.SAP:
                case 'sap_successfactors':
                    const SAPIntegration = require('./integrations/sap-successfactors');
                    instance = new SAPIntegration(config);
                    break;
                case INTEGRATION_TYPE.WORKDAY:
                case 'workday':
                    const WorkdayIntegration = require('./integrations/workday');
                    instance = new WorkdayIntegration(config);
                    break;
                case INTEGRATION_TYPE.BAMBOOHR:
                case 'bamboohr':
                    const BambooHRIntegration = require('./integrations/bamboohr');
                    instance = new BambooHRIntegration(config);
                    break;
                case INTEGRATION_TYPE.ZOHO:
                case 'zoho_people':
                    const ZohoPeopleIntegration = require('./integrations/zoho-people');
                    instance = new ZohoPeopleIntegration(config);
                    break;
                default:
                    throw new Error(`Unknown integration type: ${config.type}`);
            }
        } catch (err) {
            log('ERROR', 'Failed to instantiate integration', {
                type: config.type,
                error: err.message,
                stack: err.stack
            });
            throw new Error(`Failed to load integration module for type "${config.type}": ${err.message}`);
        }

        try {
            await instance.loadFieldMappings();
        } catch (err) {
            log('WARN', 'Failed to load field mappings', { error: err.message });
            // Don't fail if field mappings can't be loaded
        }

        return instance;
    } catch (err) {
        log('ERROR', 'getIntegrationInstance failed', {
            integrationId,
            error: err.message,
            stack: err.stack
        });
        throw err;
    }
};

/**
 * Get all active integrations
 */
const getActiveIntegrations = async () => {
    const result = await db.query('SELECT * FROM hrms_integrations WHERE is_active = true');
    return result.rows;
};

/**
 * Run scheduled sync for all active integrations
 */
const runScheduledSync = async (options = {}) => {
    // `force` skips the per-integration interval check. Used only by the
    // startup run: the interval exists to stop a 5-minute timer syncing every
    // minute, not to make a freshly deployed process wait for a clock it has
    // no memory of.
    const { force = false } = options;
    try {
        const integrations = await getActiveIntegrations();

        for (const integration of integrations) {
            // Check if it's time to sync
            const lastSync = integration.last_sync_at;
            const interval = integration.sync_interval_minutes || 30;

            if (lastSync && !force) {
                const minutesSinceSync = (Date.now() - new Date(lastSync).getTime()) / 60000;
                if (minutesSinceSync < interval) {
                    continue;
                }
            }

            log('INFO', 'Running scheduled sync', { integration: integration.name });

            try {
                const instance = await getIntegrationInstance(integration.id);

                // Push attendance if enabled
                if (integration.sync_attendance) {
                    await syncAttendanceToHRMS(instance);
                }

                // Pull employees if enabled
                if (integration.sync_employees) {
                    await syncEmployeesFromHRMS(instance);
                }

            } catch (err) {
                log('ERROR', 'Scheduled sync failed', { integration: integration.name, error: err.message });
            }
        }
    } catch (err) {
        log('ERROR', 'Scheduled sync error', { error: err.message });
    }
};

/**
 * Sync attendance records to HRMS
 */
const syncAttendanceToHRMS = async (integration) => {
    try {
        // Get unsynced attendance records (sync_status is VARCHAR: 'synced',
        // 'pending', 'skipped').
        //
        // 'skipped' is deliberate and must not be retried. It covers people who
        // hold biometric access but are not in the HR system at all — facility
        // and security contractors here. Without the exclusion their punches
        // were pushed, rejected, left as 'pending', and pushed again on the next
        // cycle for as long as they stayed inside the 7-day window.
        const result = await db.query(`
            SELECT 
                al.*,
                e.name as employee_name,
                e.email
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            WHERE (al.sync_status IS NULL OR al.sync_status NOT IN ('synced', 'skipped'))
            AND COALESCE(e.exclude_from_hrms, false) = false
            AND al.punch_time > NOW() - INTERVAL '7 days'
            ORDER BY al.punch_time
            LIMIT 500
        `);

        // Anything belonging to an excluded employee is settled once, so it stops
        // being reconsidered on every cycle.
        await db.query(`
            UPDATE attendance_logs al
            SET sync_status = 'skipped'
            FROM employees e
            WHERE e.employee_code = al.employee_code
              AND e.exclude_from_hrms = true
              AND (al.sync_status IS NULL OR al.sync_status = 'pending')
        `);

        if (result.rows.length === 0) {
            log('INFO', 'No attendance records to sync');
            return;
        }

        log('INFO', 'Syncing attendance to HRMS', { count: result.rows.length, integration: integration.name });

        const stats = await integration.pushAttendance(result.rows);

        const outcome = stats.failed > 0
            ? (stats.success > 0 ? 'partial' : 'failed')
            : 'success';

        await integration.logSync(SYNC_TYPE.ATTENDANCE, SYNC_DIRECTION.PUSH, outcome, stats);

        // This used to report 'success' unconditionally, so a batch where every
        // record was rejected still showed "success — Synced 0 attendance
        // records" on the Integrations page. That is how a two-hour ERPNext
        // outage looked healthy from inside the app, and it also made the
        // sync_failing alert unreachable: it watches for last_sync_status
        // 'failed', a value nothing ever wrote.
        await integration.updateSyncStatus(
            outcome,
            stats.failed > 0
                ? `Synced ${stats.success}, rejected ${stats.failed}`
                : `Synced ${stats.success} attendance records`
        );

        return stats;
    } catch (err) {
        log('ERROR', 'Attendance sync failed', { error: err.message });
        await integration.updateSyncStatus('failed', err.message);
        throw err;
    }
};

/**
 * Sync employees from HRMS
 */
/**
 * Pull shift definitions from the HRMS.
 *
 * Runs immediately before the employee pull, and not on its own schedule,
 * because the two are one operation: an employee's shift arrives as a name,
 * and resolving it to a local id requires the shift to already exist. Pulling
 * them separately would leave a window where every employee's shift silently
 * failed to resolve.
 *
 * Deliberately not behind its own `sync_shifts` toggle. `sync_leaves` is
 * already a column and a switch in the Integrations UI that no code reads —
 * you can turn it on and nothing happens — and adding a second toggle with the
 * same failure mode to save one boolean is not worth it. This runs when
 * employee sync runs.
 */
const syncShiftsFromHRMS = async (integration) => {
    let shifts;
    try {
        shifts = await integration.pullShifts();
    } catch (err) {
        // Logged to the database, not just the container. A failed pull that
        // only writes a console warning is invisible in the place anyone
        // actually looks — the sync log — and reads as "shifts were never
        // attempted" rather than "shifts failed".
        await integration.logSync('shifts', SYNC_DIRECTION.PULL, 'failed',
            { processed: 0, success: 0, failed: 0 }, err.message);
        throw err;
    }

    if (!shifts.length) {
        // Also logged. Returning early without a row made "the HRMS has no
        // shifts configured" indistinguishable from "the shift sync never ran",
        // which is the exact question the log exists to answer.
        await integration.logSync('shifts', SYNC_DIRECTION.PULL, 'success',
            { processed: 0, success: 0, failed: 0 }, 'HRMS returned no shift definitions');
        log('INFO', 'HRMS returned no shifts', { integration: integration.name });
        return { processed: 0, success: 0, failed: 0 };
    }

    const stats = { processed: 0, success: 0, failed: 0 };
    let firstError = null;

    for (const shift of shifts) {
        stats.processed++;
        if (!shift.code || !shift.start_time || !shift.end_time) {
            // A shift without times cannot measure anything. Counted as failed
            // rather than skipped silently, so the sync log shows it.
            stats.failed++;
            firstError = firstError || `Shift "${shift.code || '(unnamed)'}" has no code or times`;
            log('WARN', 'Shift missing code or times', { code: shift.code });
            continue;
        }
        try {
            // A shift ending before it starts runs through midnight. Without
            // this the night shift reads as a negative-length day and everyone
            // on it looks absent.
            const isNight = String(shift.end_time) < String(shift.start_time);

            await db.query(`
                INSERT INTO shifts (code, name, start_time, end_time,
                                    grace_in_minutes, grace_out_minutes,
                                    is_night_shift, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                ON CONFLICT (code) DO UPDATE SET
                    name             = COALESCE(EXCLUDED.name, shifts.name),
                    start_time       = COALESCE(EXCLUDED.start_time, shifts.start_time),
                    end_time         = COALESCE(EXCLUDED.end_time, shifts.end_time),
                    grace_in_minutes = COALESCE(EXCLUDED.grace_in_minutes, shifts.grace_in_minutes),
                    grace_out_minutes= COALESCE(EXCLUDED.grace_out_minutes, shifts.grace_out_minutes),
                    is_night_shift   = EXCLUDED.is_night_shift
            `, [
                shift.code, shift.name || shift.code, shift.start_time, shift.end_time,
                shift.grace_in_minutes ?? 0, shift.grace_out_minutes ?? 0, isNight
            ]);
            stats.success++;
        } catch (err) {
            stats.failed++;
            firstError = firstError || `${shift.code}: ${err.message}`;
            log('WARN', 'Shift upsert failed', { code: shift.code, error: err.message });
        }
    }

    const outcome = stats.failed > 0 ? (stats.success > 0 ? 'partial' : 'failed') : 'success';
    // Carry the first failure into the sync log. Recording only the counts
    // meant "3 processed, 0 succeeded" with no reason anywhere except the
    // container log — a row that says something broke while withholding what.
    await integration.logSync('shifts', SYNC_DIRECTION.PULL, outcome, stats, firstError);
    log('INFO', 'Shifts pulled', stats);
    return stats;
};

const syncEmployeesFromHRMS = async (integration) => {
    try {
        log('INFO', 'Pulling employees from HRMS', { integration: integration.name });

        // Shifts first: an employee's shift arrives as a name, and resolving
        // it needs the shift row to exist. A failure here must not take the
        // employee pull down with it — employees without a shift are still
        // worth having, and the fallback start time keeps working.
        try {
            await syncShiftsFromHRMS(integration);
        } catch (err) {
            log('WARN', 'Shift pull failed; continuing with employees', { error: err.message });
        }

        const employees = await integration.pullEmployees();

        const stats = { processed: 0, success: 0, failed: 0 };
        const deptCache = new Map();

        /**
         * Turn the HRMS department *name* into a local departments.id.
         *
         * Every adapter returns `department_name`; the upsert below read
         * `emp.department_id`, which no adapter has ever set. It was therefore
         * always undefined, so department was NULL on insert — and absent from
         * the update clause, so it could never be filled in later either. The
         * result was every employee unassigned, an empty department filter on
         * the register, and a workforce chart reading "Unassigned" for the
         * whole company.
         *
         * Frappe suffixes department names with the company abbreviation —
         * "Engineering - INN" — so an exact match against a local "Engineering"
         * finds nothing. The suffix is stripped before matching.
         *
         * Case-insensitively: the abbreviation is whatever was typed when the
         * company was created, and a first pass that assumed uppercase let
         * "Accounts - rmss" through into the department list verbatim.
         *
         * The bound is deliberately tight — up to 6 characters, no spaces —
         * because this cannot tell an abbreviation from a real name. A
         * department genuinely called "Sales - North" would be read as "Sales".
         * That is the accepted trade: multi-company Frappe instances suffix
         * every department, and a stray truncation is visible and fixable in
         * the department list, whereas an unstripped suffix silently creates a
         * duplicate department per company.
         *
         * Unknown departments are created rather than dropped: the HRMS is the
         * source of truth for org structure, and silently discarding a
         * department is how this stayed invisible in the first place.
         */
        const resolveDepartment = async (rawName) => {
            if (!rawName || typeof rawName !== 'string') return null;
            const name = rawName.replace(/\s+-\s+[A-Za-z0-9]{1,6}$/, '').trim();
            if (!name) return null;
            if (deptCache.has(name.toLowerCase())) return deptCache.get(name.toLowerCase());

            let id = null;
            const found = await db.query(
                'SELECT id FROM departments WHERE lower(name) = lower($1) LIMIT 1', [name]
            );
            if (found.rows.length) {
                id = found.rows[0].id;
            } else {
                const created = await db.query(
                    'INSERT INTO departments (name) VALUES ($1) RETURNING id', [name]
                );
                id = created.rows[0].id;
                log('INFO', 'Created department from HRMS', { name });
            }
            deptCache.set(name.toLowerCase(), id);
            return id;
        };

        /**
         * The employee's shift arrives as a Shift Type name, matched against
         * shifts.code, which syncShiftsFromHRMS has just populated.
         *
         * An unknown shift resolves to null rather than being invented. A
         * department can be created from a name alone; a shift cannot — it
         * needs a start and end time, and guessing those would silently decide
         * who counts as late.
         */
        const shiftCache = new Map();
        const resolveShift = async (code) => {
            if (!code || typeof code !== 'string') return null;
            const key = code.trim().toLowerCase();
            if (!key) return null;
            if (shiftCache.has(key)) return shiftCache.get(key);

            const found = await db.query(
                'SELECT id FROM shifts WHERE lower(code) = $1 LIMIT 1', [key]
            );
            const id = found.rows.length ? found.rows[0].id : null;
            if (id === null) log('WARN', 'Employee references an unknown shift', { code });
            shiftCache.set(key, id);
            return id;
        };

        for (const emp of employees) {
            stats.processed++;
            try {
                const departmentId = await resolveDepartment(emp.department_name);
                const shiftId = await resolveShift(emp.shift_code);

                // department_id is in the update clause, not just the insert.
                // Everyone these deployments care about already exists, so an
                // insert-only mapping would fix nothing on the next sync.
                // COALESCE keeps a manual assignment when the HRMS has none,
                // rather than wiping it.
                await db.query(`
                    INSERT INTO employees (employee_code, name, email, mobile, department_id,
                                           default_shift_id, designation, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
                    ON CONFLICT (employee_code) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, employees.name),
                        email = COALESCE(EXCLUDED.email, employees.email),
                        mobile = COALESCE(EXCLUDED.mobile, employees.mobile),
                        department_id = COALESCE(EXCLUDED.department_id, employees.department_id),
                        default_shift_id = COALESCE(EXCLUDED.default_shift_id, employees.default_shift_id),
                        designation = COALESCE(EXCLUDED.designation, employees.designation)
                `, [
                    emp.employee_code, emp.name, emp.email, emp.mobile,
                    departmentId, shiftId, emp.designation
                ]);
                stats.success++;
            } catch (err) {
                stats.failed++;
                log('WARN', 'Employee upsert failed', { code: emp.employee_code, error: err.message });
            }
        }

        // Same hardcoded 'success' as the attendance push had, found by the test
        // written for that one. An employee pull where every record failed
        // reported success just as loudly.
        const outcome = stats.failed > 0
            ? (stats.success > 0 ? 'partial' : 'failed')
            : 'success';

        await integration.logSync(SYNC_TYPE.EMPLOYEES, SYNC_DIRECTION.PULL, outcome, stats);

        await integration.updateSyncStatus(
            outcome,
            stats.failed > 0
                ? `Synced ${stats.success} employees, ${stats.failed} failed`
                : `Synced ${stats.success} employees`
        );

        return stats;
    } catch (err) {
        log('ERROR', 'Employee sync failed', { error: err.message });
        await integration.updateSyncStatus('failed', err.message);
        throw err;
    }
};

// Start scheduled sync (every 5 minutes check)
const startScheduledSync = () => {
    setInterval(runScheduledSync, 5 * 60 * 1000);

    // setInterval alone means the first sync after any restart is five minutes
    // away, so every deploy silently pauses integration for that long — and
    // when a deploy is what changed the sync, five minutes of "nothing has
    // happened" looks exactly like the change not working.
    //
    // The 30s delay is for ensureSchema: it adds the columns a sync writes to,
    // and starting before it finishes would fail the first run for a reason
    // that has nothing to do with the HRMS. runScheduledSync still checks each
    // integration's own interval, so this cannot sync more often than
    // configured — it only stops the clock starting from zero on every boot.
    setTimeout(() => {
        // Forced. Without it the startup run still honours the interval, so a
        // deploy that lands within one interval of the last sync does nothing
        // at all — which is exactly what happened: the container came up at
        // 14:41, the previous sync was 14:39, and the startup run skipped
        // every integration. A sync-affecting deploy then looks like no change.
        //
        // Once per process start, so redeploying repeatedly is the only way to
        // sync more often than configured, and that is a deliberate act.
        runScheduledSync({ force: true }).catch(err =>
            log('ERROR', 'Startup sync failed', { error: err.message }));
    }, 30 * 1000);

    log('INFO', 'Scheduled sync started');
};

module.exports = {
    SYNC_DIRECTION,
    SYNC_TYPE,
    INTEGRATION_TYPE,
    BaseIntegration,
    getIntegrationInstance,
    getActiveIntegrations,
    runScheduledSync,
    syncAttendanceToHRMS,
    syncEmployeesFromHRMS,
    startScheduledSync
};
