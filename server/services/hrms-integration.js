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
const runScheduledSync = async () => {
    try {
        const integrations = await getActiveIntegrations();

        for (const integration of integrations) {
            // Check if it's time to sync
            const lastSync = integration.last_sync_at;
            const interval = integration.sync_interval_minutes || 30;

            if (lastSync) {
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
const syncEmployeesFromHRMS = async (integration) => {
    try {
        log('INFO', 'Pulling employees from HRMS', { integration: integration.name });

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
         * Unknown departments are created rather than dropped: the HRMS is the
         * source of truth for org structure, and silently discarding a
         * department is how this stayed invisible in the first place.
         */
        const resolveDepartment = async (rawName) => {
            if (!rawName || typeof rawName !== 'string') return null;
            const name = rawName.replace(/\s+-\s+[A-Z0-9]{1,6}$/, '').trim();
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

        for (const emp of employees) {
            stats.processed++;
            try {
                const departmentId = await resolveDepartment(emp.department_name);

                // department_id is in the update clause, not just the insert.
                // Everyone these deployments care about already exists, so an
                // insert-only mapping would fix nothing on the next sync.
                // COALESCE keeps a manual assignment when the HRMS has none,
                // rather than wiping it.
                await db.query(`
                    INSERT INTO employees (employee_code, name, email, mobile, department_id, designation, status)
                    VALUES ($1, $2, $3, $4, $5, $6, 'active')
                    ON CONFLICT (employee_code) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, employees.name),
                        email = COALESCE(EXCLUDED.email, employees.email),
                        mobile = COALESCE(EXCLUDED.mobile, employees.mobile),
                        department_id = COALESCE(EXCLUDED.department_id, employees.department_id),
                        designation = COALESCE(EXCLUDED.designation, employees.designation)
                `, [
                    emp.employee_code, emp.name, emp.email, emp.mobile,
                    departmentId, emp.designation
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
