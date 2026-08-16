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
const registry = require('./integrations/registry');
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

/**
 * What an integration can actually do.
 *
 * The base class returns [] for every optional pull, which reads as "this HRMS
 * has no shifts" rather than "this adapter cannot fetch shifts". They are not
 * the same thing and the difference is invisible: a deployment on Odoo synced
 * shifts, holidays and leave every 30 minutes, got nothing each time, and
 * logged success. No shifts means everyone is measured against one fallback
 * start time; no holidays and no leave means a phantom absence for every public
 * holiday and every approved day off. That is the bug that produced 409
 * absences in a month here, except nothing in the app would say so.
 *
 * Each adapter now states its own capabilities and the sync skips what is not
 * declared, saying which and why.
 */
const CAPABILITY = {
    EMPLOYEES: 'employees',
    SHIFTS: 'shifts',
    HOLIDAYS: 'holidays',
    LEAVE: 'leave',
    PUSH_ATTENDANCE: 'push_attendance',
    // Computed daily attendance, not raw punches. This is what payroll
    // reads — ERPNext's Salary Slip takes payment days from Attendance
    // records, so pushing them is the difference between an attendance
    // system and one payroll can actually be run from.
    PUSH_DAILY_ATTENDANCE: 'push_daily_attendance',
    PUSH_LEAVE: 'push_leave'
};

// Integration Type
const INTEGRATION_TYPE = {
    ERPNEXT: 'erpnext',
    ODOO: 'odoo',
    HORILLA: 'horilla',
    WEBHOOK: 'webhook',
    CUSTOM_API: 'custom_api'
};

/**
 * Types this build no longer carries an adapter for.
 *
 * SAP SuccessFactors, Workday, BambooHR and Zoho People all gate their APIs
 * behind a partner agreement, a reviewed OAuth application, or a paid tier —
 * none of which a self-hosted attendance system can satisfy on a customer's
 * behalf. The adapters existed and could not have worked. Naming them here
 * means a saved integration of that type gets an explanation instead of
 * "Unsupported integration type".
 *
 * Anything on this list can still be fed through the webhook adapter, which
 * asks nothing of the far end beyond posting JSON.
 */
const RETIRED_TYPES = {
    sap_successfactors: 'SAP SuccessFactors',
    workday: 'Workday',
    bamboohr: 'BambooHR',
    zoho_people: 'Zoho People'
};

/**
 * Base Integration Class
 * All specific integrations extend this
 */
class BaseIntegration {
    /**
     * Declared by each adapter. Empty here on purpose: an adapter that says
     * nothing supports nothing, so a new or half-finished one is inert rather
     * than quietly pretending.
     */
    static capabilities = [];

    /** Does this integration actually implement `capability`? */
    supports(capability) {
        return (this.constructor.capabilities || []).includes(capability);
    }

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
     * Pull holiday lists and their dates. Optional, like pullShifts — an HRMS
     * without the concept returns an empty array.
     */
    async pullHolidayLists() {
        return [];
    }

    /** Pull leave types. Optional. */
    async pullLeaveTypes() {
        return [];
    }

    /** Pull leave applications over a date window. Optional. */
    async pullLeaveApplications() {
        return [];
    }

    /** Pull per-employee leave allocations over a date window. Optional. */
    async pullLeaveAllocations() {
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

        // One lookup against services/integrations/registry.js, which is the
        // only place a service is declared. The switch this replaces had to be
        // kept in step with the picker route and each adapter's capability
        // list by hand, and drifted: it offered four vendors whose APIs need a
        // partner agreement, and advertised pulls two adapters never
        // implemented.
        const entry = registry.find(config.type);

        if (!entry) {
            if (RETIRED_TYPES[config.type]) {
                throw new Error(
                    `${RETIRED_TYPES[config.type]} is no longer supported. Its API is ` +
                    `available only under a partner agreement or a paid tier, which this ` +
                    `application cannot satisfy on a customer's behalf — so the adapter was ` +
                    `removed rather than left as something that could never connect. Point ` +
                    `that system at the Webhook integration instead.`
                );
            }
            throw new Error(
                `Unsupported integration type "${config.type}". Available: ` +
                registry.list().map(a => a.type).join(', ')
            );
        }

        let instance;
        try {
            const Adapter = entry.load();
            instance = new Adapter(config);
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
 * Push computed daily attendance to the HRMS, for payroll to read.
 *
 * Off unless the integration explicitly turns it on. This writes documents that
 * payroll pays people from, and a feature that starts doing that because it was
 * deployed is a feature that should not have shipped. Set
 * `config.push_daily_attendance` on the integration to enable it.
 *
 * Only days that are settled get sent. Today is excluded — an employee who has
 * punched in and not yet out would go across as a short day, and in ERPNext a
 * submitted Attendance record cannot be edited afterwards.
 */
const syncDailyAttendanceToHRMS = async (integration, options = {}) => {
    const { days = 7 } = options;
    const stats = { processed: 0, success: 0, failed: 0, skipped: 0 };

    try {
        const rows = (await db.query(`
            SELECT ads.employee_code, ads.date, ads.status,
                   ads.duration_minutes, ads.late_minutes, ads.early_leave_minutes
              FROM attendance_daily_summary ads
              JOIN employees e ON e.employee_code = ads.employee_code
             WHERE ads.date >= CURRENT_DATE - $1::int
               AND ads.date < CURRENT_DATE
               AND e.attendance_required IS NOT FALSE
               AND e.exclude_from_hrms IS NOT TRUE
             ORDER BY ads.date, ads.employee_code
        `, [days])).rows;

        if (rows.length === 0) {
            log('INFO', 'No settled attendance to push', { integration: integration.name });
            return stats;
        }

        Object.assign(stats, await integration.pushDailyAttendance(rows));

        log('INFO', 'Daily attendance pushed to HRMS', {
            integration: integration.name,
            ...stats,
            note: stats.skipped ? 'skipped = already present in the HRMS, or a status it has no equivalent for' : undefined
        });
        await integration.logSync(SYNC_TYPE.ATTENDANCE, SYNC_DIRECTION.PUSH,
            stats.failed > 0 ? 'partial' : 'success', stats);
    } catch (err) {
        log('ERROR', 'Daily attendance push failed', { integration: integration.name, error: err.message });
        await integration.logSync(SYNC_TYPE.ATTENDANCE, SYNC_DIRECTION.PUSH, 'failed', stats, err.message);
        throw err;
    }

    return stats;
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

                // Each toggle now needs the adapter to actually implement the
                // thing, not just the operator to have switched it on. A toggle
                // that is on for a capability the adapter lacks is a promise the
                // integration cannot keep, and it used to be kept silently.
                if (integration.sync_attendance) {
                    if (instance.supports(CAPABILITY.PUSH_ATTENDANCE)) {
                        await syncAttendanceToHRMS(instance);
                    } else {
                        log('WARN', 'Attendance push is enabled but this integration cannot push', {
                            integration: integration.name, type: integration.type
                        });
                    }
                }

                // Computed attendance for payroll. Opt-in per integration: it
                // writes the documents payroll pays from.
                if (instance.config?.push_daily_attendance) {
                    if (instance.supports(CAPABILITY.PUSH_DAILY_ATTENDANCE)) {
                        try {
                            await syncDailyAttendanceToHRMS(instance);
                        } catch (err) {
                            log('ERROR', 'Daily attendance push failed', {
                                integration: integration.name, error: err.message
                            });
                        }
                    } else {
                        log('WARN', 'Daily attendance push is on but this integration cannot do it', {
                            integration: integration.name, type: integration.type
                        });
                    }
                }

                if (integration.sync_employees) {
                    if (instance.supports(CAPABILITY.EMPLOYEES)) {
                        await syncEmployeesFromHRMS(instance);
                    } else {
                        log('WARN', 'Employee sync is enabled but this integration cannot pull employees', {
                            integration: integration.name, type: integration.type
                        });
                    }
                }

                // Leave last: leave_applications has a foreign key to
                // employees, so a person hired today must arrive before their
                // leave can be stored.
                if (integration.sync_leaves) {
                    if (instance.supports(CAPABILITY.LEAVE)) {
                        try {
                            await syncLeavesFromHRMS(instance);
                        } catch (err) {
                            log('ERROR', 'Leave sync failed', { integration: integration.name, error: err.message });
                        }
                    } else {
                        log('WARN', 'Leave sync is enabled but this integration cannot pull leave', {
                            integration: integration.name,
                            type: integration.type,
                            consequence: 'approved leave will be counted as absence'
                        });
                    }
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
/**
 * Refuse to run a sync the adapter cannot perform, and say so where it will be
 * read.
 *
 * The alternative is what this codebase did: call an inherited method that
 * returns [], then log "HRMS returned no shift definitions". That sentence sends
 * someone to look in an HRMS they have already configured correctly, for
 * something this app was never able to read. The two facts need different
 * words.
 */
const requireCapability = async (integration, capability, syncType) => {
    if (integration.supports(capability)) return true;
    const message =
        `${integration.type} cannot sync ${capability} — this adapter does not implement it. ` +
        `Nothing was fetched, and nothing in the HRMS needs changing.`;
    await integration.logSync(syncType, SYNC_DIRECTION.PULL, 'skipped',
        { processed: 0, success: 0, failed: 0 }, message);
    log('INFO', 'Sync skipped: capability not implemented', {
        integration: integration.name, type: integration.type, capability
    });
    return false;
};

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
    if (!await requireCapability(integration, CAPABILITY.SHIFTS, 'shifts')) {
        return { processed: 0, success: 0, failed: 0, skipped: true };
    }
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
            // A shift ending before it starts runs through midnight.
            //
            // Compared as minutes, not as strings. ERPNext returns times
            // without a leading zero — "9:00:00" — so a string comparison read
            // "20:00:00" < "9:00:00" as true, character by character, and
            // flagged a 09:00-to-20:00 day shift as a night shift. It only
            // looked right on General (10:00-19:00), where both strings happen
            // to start with the same digit.
            const toMinutes = (t) => {
                const [h, m] = String(t ?? '').split(':').map(Number);
                return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
            };
            const startMin = toMinutes(shift.start_time);
            const endMin = toMinutes(shift.end_time);
            // Unparseable times are not night shifts. Guessing from a value we
            // could not read is how the wrong flag got there in the first place.
            const isNight = startMin !== null && endMin !== null && endMin < startMin;

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


/**
 * Pull holiday lists and the dates in them.
 *
 * The absent report treats any working day with no punch as an absence, so an
 * empty holidays table makes every public holiday read as the entire company
 * being absent. That is a large part of the inflated absence figures.
 *
 * Holidays are stored per list rather than merged into one flat set. ERPNext
 * keeps a Holiday List per location, and flattening them would exempt everyone
 * from absence on a day only one office was closed.
 *
 * Runs inside the employee sync for the same reason shifts do: an employee's
 * holiday list arrives as a name, and resolving it needs the row to exist.
 */
const syncHolidaysFromHRMS = async (integration) => {
    let lists;
    try {
        lists = await integration.pullHolidayLists();
    } catch (err) {
        await integration.logSync('holidays', SYNC_DIRECTION.PULL, 'failed',
            { processed: 0, success: 0, failed: 0 }, err.message);
        throw err;
    }

    if (!lists.length) {
        await integration.logSync('holidays', SYNC_DIRECTION.PULL, 'success',
            { processed: 0, success: 0, failed: 0 }, 'HRMS returned no holiday lists');
        log('INFO', 'HRMS returned no holiday lists', { integration: integration.name });
        return { processed: 0, success: 0, failed: 0 };
    }

    const stats = { processed: 0, success: 0, failed: 0 };
    let firstError = null;

    for (const list of lists) {
        if (!list.code) continue;

        // A list of nothing but weekly offs yields no holidays, and creating a
        // location for it leaves a row that looks configured and exempts
        // nobody — which is what "Innopay Local Weekly Holidays" became on the
        // first run. If real holidays are added to it later, the next sync
        // creates it then.
        const real = list.holidays.filter(h => !h.weekly_off);
        if (!real.length) {
            log('INFO', 'Holiday list has no dated holidays; skipping', { code: list.code });
            continue;
        }

        let locationId;
        try {
            const loc = await db.query(`
                INSERT INTO holiday_locations (code, name)
                VALUES ($1, $2)
                ON CONFLICT (code) DO UPDATE SET name = COALESCE(EXCLUDED.name, holiday_locations.name)
                RETURNING id
            `, [list.code, list.name || list.code]);
            locationId = loc.rows[0].id;
        } catch (err) {
            firstError = firstError || `${list.code}: ${err.message}`;
            log('WARN', 'Holiday list upsert failed', { code: list.code, error: err.message });
            continue;
        }

        for (const h of real) {
            // Weekly offs are every Sunday, already covered by the weekend rule
            // in the absent report. Importing them would add 52 rows a year per
            // list and change nothing.
            if (h.weekly_off) continue;
            stats.processed++;
            try {
                await db.query(`
                    INSERT INTO holidays (holiday_location_id, date, name, type, description)
                    VALUES ($1, $2, $3, 'public', $4)
                    ON CONFLICT (COALESCE(holiday_location_id, 0), date) DO UPDATE SET
                        name        = COALESCE(EXCLUDED.name, holidays.name),
                        description = COALESCE(EXCLUDED.description, holidays.description)
                `, [locationId, h.date, h.description || 'Holiday', h.description]);
                stats.success++;
            } catch (err) {
                stats.failed++;
                firstError = firstError || `${list.code} ${h.date}: ${err.message}`;
                log('WARN', 'Holiday upsert failed', { code: list.code, date: h.date, error: err.message });
            }
        }
    }

    const outcome = stats.failed > 0 ? (stats.success > 0 ? 'partial' : 'failed') : 'success';
    await integration.logSync('holidays', SYNC_DIRECTION.PULL, outcome, stats, firstError);
    log('INFO', 'Holidays pulled', stats);
    return stats;
};


/**
 * Pull leave types and leave applications.
 *
 * This is what `sync_leaves` was supposed to do. The column exists, the switch
 * is in the Integrations screen, and until now no code read it — you could turn
 * it on and nothing would happen, with no error and no log entry.
 *
 * It matters because the absent report already excludes approved leave, and
 * nothing has ever populated the table it checks. Somebody on approved leave
 * has been counted absent for the whole life of the system.
 *
 * The window is bounded to the range the absent report actually looks at, plus
 * future leave. An unbounded pull would fetch a company's entire leave history
 * every five minutes.
 */
const syncLeavesFromHRMS = async (integration) => {
    const stats = { processed: 0, success: 0, failed: 0 };
    let firstError = null;

    // Leave types first: an application references one by name, and resolving
    // it needs the row to exist.
    try {
        const types = await integration.pullLeaveTypes();
        for (const t of types) {
            if (!t.code) continue;
            try {
                await db.query(`
                    INSERT INTO leave_types (code, name, is_paid, is_active, annual_quota)
                    VALUES ($1, $2, $3, TRUE, $4)
                    ON CONFLICT (code) DO UPDATE SET
                        name         = COALESCE(EXCLUDED.name, leave_types.name),
                        is_paid      = COALESCE(EXCLUDED.is_paid, leave_types.is_paid),
                        annual_quota = COALESCE(EXCLUDED.annual_quota, leave_types.annual_quota)
                `, [t.code, t.name || t.code, t.is_paid !== false, t.annual_quota ?? 0]);
            } catch (err) {
                log('WARN', 'Leave type upsert failed', { code: t.code, error: err.message });
            }
        }
    } catch (err) {
        await integration.logSync('leaves', SYNC_DIRECTION.PULL, 'failed', stats, err.message);
        throw err;
    }

    const typeCache = new Map();
    const resolveLeaveType = async (code) => {
        if (!code) return null;
        const key = String(code).trim().toLowerCase();
        if (!key) return null;
        if (typeCache.has(key)) return typeCache.get(key);
        const found = await db.query('SELECT id FROM leave_types WHERE lower(code) = $1 LIMIT 1', [key]);
        const id = found.rows.length ? found.rows[0].id : null;
        typeCache.set(key, id);
        return id;
    };

    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    const to = new Date(today.getFullYear() + 1, today.getMonth(), 1);
    const iso = (d) => d.toISOString().split('T')[0];

    let apps;
    try {
        apps = await integration.pullLeaveApplications(iso(from), iso(to));
    } catch (err) {
        await integration.logSync('leaves', SYNC_DIRECTION.PULL, 'failed', stats, err.message);
        throw err;
    }

    if (!apps.length) {
        await integration.logSync('leaves', SYNC_DIRECTION.PULL, 'success', stats,
            'HRMS returned no leave applications in the window');
        log('INFO', 'No leave applications returned', { integration: integration.name });
        return stats;
    }

    for (const a of apps) {
        stats.processed++;
        try {
            // leave_applications has a foreign key to employees. An application
            // for somebody this system has never seen — a leaver, or a record
            // the employee pull filtered out — would fail the insert, so it is
            // skipped rather than counted as an error.
            const known = await db.query(
                'SELECT 1 FROM employees WHERE employee_code = $1 LIMIT 1', [a.employee_code]
            );
            if (!known.rows.length) continue;

            const typeId = await resolveLeaveType(a.leave_type_code);

            await db.query(`
                INSERT INTO leave_applications
                    (external_id, employee_code, leave_type_id, from_date, to_date,
                     total_days, status, reason, is_half_day)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (external_id) DO UPDATE SET
                    leave_type_id = COALESCE(EXCLUDED.leave_type_id, leave_applications.leave_type_id),
                    from_date     = EXCLUDED.from_date,
                    to_date       = EXCLUDED.to_date,
                    total_days    = EXCLUDED.total_days,
                    status        = EXCLUDED.status,
                    is_half_day   = EXCLUDED.is_half_day
            `, [
                a.external_id, a.employee_code, typeId, a.from_date, a.to_date,
                a.total_days, a.status,
                // reason is NOT NULL on this table, and ERPNext's description
                // is optional.
                a.reason || 'Imported from HRMS', a.is_half_day
            ]);
            stats.success++;
        } catch (err) {
            stats.failed++;
            firstError = firstError || `${a.external_id}: ${err.message}`;
            log('WARN', 'Leave application upsert failed', { id: a.external_id, error: err.message });
        }
    }

    // Per-employee entitlements.
    //
    // The type-level quota is only a default; what an individual is actually
    // entitled to lives in Leave Allocation, which is what ERPNext itself uses
    // to compute a balance. Seeding from the quota alone gives everyone the
    // same entitlement regardless of joining date, grade or carry-forward —
    // and where no quota is configured either, a grid of zeroes.
    try {
        const allocs = await integration.pullLeaveAllocations(iso(from), iso(to));
        for (const a of allocs) {
            const typeId = await resolveLeaveType(a.leave_type_code);
            if (!typeId) continue;
            const known = await db.query(
                'SELECT 1 FROM employees WHERE employee_code = $1 LIMIT 1', [a.employee_code]
            );
            if (!known.rows.length) continue;
            try {
                await db.query(`
                    INSERT INTO leave_balances
                        (employee_code, leave_type_id, year, opening_balance, carry_forward_balance, balance)
                    VALUES ($1, $2, $3, $4, $5, $4)
                    ON CONFLICT (employee_code, leave_type_id, year) DO UPDATE SET
                        opening_balance       = EXCLUDED.opening_balance,
                        carry_forward_balance = EXCLUDED.carry_forward_balance,
                        updated_at            = NOW()
                `, [a.employee_code, typeId, a.year, a.total_allocated, a.carry_forwarded]);
            } catch (err) {
                log('WARN', 'Leave allocation upsert failed',
                    { employee: a.employee_code, error: err.message });
            }
        }
        if (allocs.length) log('INFO', 'Leave allocations pulled', { count: allocs.length });
    } catch (err) {
        // Allocations are an enhancement to a sync that has already stored the
        // applications. Losing them should not fail the whole run.
        log('WARN', 'Leave allocation pull failed', { error: err.message });
    }

    const outcome = stats.failed > 0 ? (stats.success > 0 ? 'partial' : 'failed') : 'success';
    await integration.logSync('leaves', SYNC_DIRECTION.PULL, outcome, stats, firstError);
    log('INFO', 'Leave pulled', stats);
    return stats;
};

const syncEmployeesFromHRMS = async (integration) => {
    // Declared out here so the catch can report it. It used to be created after
    // pullEmployees() returned, which is the one place it was needed least: when
    // the pull throws — a rejected API key, a dead HRMS, a network timeout —
    // there were no stats to log and nothing was written at all.
    const stats = { processed: 0, success: 0, failed: 0 };
    try {
        log('INFO', 'Pulling employees from HRMS', { integration: integration.name });

        // Shifts first: an employee's shift arrives as a name, and resolving
        // it needs the shift row to exist. A failure here must not take the
        // employee pull down with it — employees without a shift are still
        // worth having, and the fallback start time keeps working.
        // Only what this adapter actually implements. Running a pull the
        // adapter does not have used to return [] from the base class and log a
        // clean success — so an Odoo or Horilla deployment reported syncing
        // shifts and holidays every 30 minutes while having neither, and the
        // absence report quietly counted every public holiday against everyone.
        if (integration.supports(CAPABILITY.SHIFTS)) {
            try {
                await syncShiftsFromHRMS(integration);
            } catch (err) {
                log('WARN', 'Shift pull failed; continuing with employees', { error: err.message });
            }
        } else {
            log('INFO', 'Skipping shifts: not supported by this integration', {
                integration: integration.name,
                type: integration.type,
                consequence: 'employees are measured against the fallback start time'
            });
        }

        if (integration.supports(CAPABILITY.HOLIDAYS)) {
            try {
                await syncHolidaysFromHRMS(integration);
            } catch (err) {
                log('WARN', 'Holiday pull failed; continuing with employees', { error: err.message });
            }
        } else {
            log('INFO', 'Skipping holidays: not supported by this integration', {
                integration: integration.name,
                type: integration.type,
                consequence: 'public holidays will be counted as absences'
            });
        }

        const employees = await integration.pullEmployees();

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

        // Same shape as resolveShift: a name from the HRMS matched against a
        // row the holiday pull has just written. Unknown lists resolve to null
        // rather than being created — an empty holiday list would exempt
        // nobody, but it would look like a configured one.
        const holidayCache = new Map();
        const resolveHolidayList = async (code) => {
            if (!code || typeof code !== 'string') return null;
            const key = code.trim().toLowerCase();
            if (!key) return null;
            if (holidayCache.has(key)) return holidayCache.get(key);
            const found = await db.query(
                'SELECT id FROM holiday_locations WHERE lower(code) = $1 LIMIT 1', [key]
            );
            const id = found.rows.length ? found.rows[0].id : null;
            holidayCache.set(key, id);
            return id;
        };

        // The HRMS can retire someone, but it must never un-retire someone.
        //
        // A resignation entered here writes status='resigned' directly. ERPNext
        // often still lists that person as Active for a while, so mapping its
        // status straight across would flip them back to active on the next
        // sync and undo the decision. Deactivation flows in; reactivation does
        // not, and is done here through the rehire endpoint.
        const retirementFor = (hrmsStatus) => {
            switch (String(hrmsStatus || '').trim().toLowerCase()) {
                case 'left': return 'resigned';
                case 'inactive':
                case 'suspended': return 'inactive';
                default: return null;   // Active, or unrecognised: leave alone
            }
        };

        for (const emp of employees) {
            stats.processed++;
            try {
                const retireTo = retirementFor(emp.hrms_status);

                // Someone who left before this system existed should not be
                // created here just to be marked resigned. Only update people
                // who are already known.
                if (retireTo) {
                    const existing = await db.query(
                        'SELECT id, status, name FROM employees WHERE employee_code = $1',
                        [emp.employee_code]
                    );
                    if (!existing.rows.length) { stats.skipped = (stats.skipped || 0) + 1; continue; }

                    if (existing.rows[0].status !== retireTo) {
                        // attendance_required goes false with them. Leaving it
                        // true is what made a departed employee keep generating
                        // an absence for every working day after they left.
                        await db.query(
                            `UPDATE employees
                                SET status = $2, attendance_required = FALSE
                              WHERE employee_code = $1`,
                            [emp.employee_code, retireTo]
                        );
                        log('INFO', 'Employee retired from HRMS status', {
                            employee_code: emp.employee_code,
                            name: existing.rows[0].name,
                            from: existing.rows[0].status,
                            to: retireTo
                        });
                        stats.retired = (stats.retired || 0) + 1;
                    }
                    stats.success++;
                    continue;
                }

                const departmentId = await resolveDepartment(emp.department_name);
                const shiftId = await resolveShift(emp.shift_code);
                const holidayLocationId = await resolveHolidayList(emp.holiday_list_code);

                // department_id is in the update clause, not just the insert.
                // Everyone these deployments care about already exists, so an
                // insert-only mapping would fix nothing on the next sync.
                // COALESCE keeps a manual assignment when the HRMS has none,
                // rather than wiping it.
                await db.query(`
                    INSERT INTO employees (employee_code, name, email, mobile, department_id,
                                           default_shift_id, holiday_location_id, designation, status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
                    ON CONFLICT (employee_code) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, employees.name),
                        email = COALESCE(EXCLUDED.email, employees.email),
                        mobile = COALESCE(EXCLUDED.mobile, employees.mobile),
                        department_id = COALESCE(EXCLUDED.department_id, employees.department_id),
                        default_shift_id = COALESCE(EXCLUDED.default_shift_id, employees.default_shift_id),
                        holiday_location_id = COALESCE(EXCLUDED.holiday_location_id, employees.holiday_location_id),
                        designation = COALESCE(EXCLUDED.designation, employees.designation)
                `, [
                    emp.employee_code, emp.name, emp.email, emp.mobile,
                    departmentId, shiftId, holidayLocationId, emp.designation
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
        // The shifts and holidays pulls both log their failures; this one did
        // not, so the sync that matters most left no trace in the history at
        // exactly the moment somebody would go looking. Production is failing
        // employee pull right now on a rejected API key and the Integrations
        // page shows two failed rows, for shifts and holidays, and nothing for
        // employees — which reads as "employees is fine".
        await integration.logSync(SYNC_TYPE.EMPLOYEES, SYNC_DIRECTION.PULL,
            'failed', stats, err.message);
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
    CAPABILITY,
    syncDailyAttendanceToHRMS,
    SYNC_DIRECTION,
    SYNC_TYPE,
    INTEGRATION_TYPE,
    BaseIntegration,
    getIntegrationInstance,
    getActiveIntegrations,
    runScheduledSync,
    syncAttendanceToHRMS,
    syncEmployeesFromHRMS,
    syncLeavesFromHRMS,
    startScheduledSync
};
