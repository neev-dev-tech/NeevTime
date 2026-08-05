/**
 * System Logger Utility
 * Logs system events to system_logs table for auditing
 */

const db = require('../db');

/**
 * Log a system event
 * @param {Object} logData - Log data
 * @param {number} logData.user_id - User ID (optional)
 * @param {string} logData.username - Username
 * @param {string} logData.action - Action type (LOGIN, LOGOUT, CREATE, UPDATE, DELETE, EXPORT, IMPORT, SYNC)
 * @param {string} logData.entity_type - Entity type (employee, department, device, etc.)
 * @param {number} logData.entity_id - Entity ID (optional)
 * @param {Object} logData.old_values - Old values (optional, for UPDATE)
 * @param {Object} logData.new_values - New values (optional, for CREATE/UPDATE)
 * @param {string} logData.ip_address - IP address (optional)
 * @param {string} logData.user_agent - User agent (optional)
 */
const logEvent = async (logData) => {
    try {
        const {
            user_id,
            username,
            action,
            entity_type,
            entity_id,
            old_values,
            new_values,
            ip_address,
            user_agent
        } = logData;

        // Validate required fields
        if (!username || !action) {
            console.warn('System logger: Missing required fields (username, action)');
            return;
        }

        await db.query(
            `INSERT INTO system_logs 
            (user_id, username, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
                user_id || null,
                username,
                action,
                entity_type || null,
                entity_id || null,
                old_values ? JSON.stringify(old_values) : null,
                new_values ? JSON.stringify(new_values) : null,
                ip_address || null,
                user_agent || null
            ]
        );
    } catch (err) {
        // Don't throw - logging should not break the application
        console.error('Failed to log system event:', err);
    }
};

const METHOD_ACTION = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

// Bodies that must never reach the audit table
const SENSITIVE_KEYS = /password|passwd|token|secret|api_key|apikey|hash/i;

const redact = (body) => {
    if (!body || typeof body !== 'object') return null;
    const out = {};
    for (const [key, value] of Object.entries(body)) {
        if (SENSITIVE_KEYS.test(key)) out[key] = '[redacted]';
        else if (typeof value === 'object' && value !== null) out[key] = '[object]';
        else out[key] = value;
    }
    return out;
};

/**
 * Records every successful mutating API call in system_logs.
 *
 * Mounted once on /api rather than wired into each route: a per-route call is a
 * line every future handler has to remember, and the ones that forget are
 * invisible. res.json is wrapped up front but read at send time, so req.user is
 * already populated by whichever authenticateToken guard ran in between.
 */
/**
 * A short, readable description of what a request changed — the alert body is
 * read on a phone, not parsed. Only the fields worth waking someone for, and
 * never anything credential-shaped.
 */
const NOTABLE = [
    'sync_attendance', 'sync_employees', 'sync_leaves', 'sync_interval_minutes',
    'is_active', 'enabled', 'require_device_approval', 'max_login_attempts',
    'session_timeout_minutes', 'recipients', 'base_url', 'name'
];

const summarise = (body) => {
    if (!body || typeof body !== 'object') return '';
    return NOTABLE
        .filter(k => body[k] !== undefined)
        .map(k => `  ${k}: ${JSON.stringify(body[k])}`)
        .join('\n');
};

const auditMutations = (req, res, next) => {
    const action = METHOD_ACTION[req.method];
    if (!action) return next();

    const originalJson = res.json.bind(res);
    res.json = function (data) {
        if (res.statusCode < 400 && req.user) {
            const segments = req.path.split('/').filter(Boolean);
            const entityType = segments[0] || 'unknown';
            const idSegment = segments.find(s => /^\d+$/.test(s));

            logEvent({
                user_id: req.user.id,
                username: req.user.username || String(req.user.id),
                action,
                entity_type: entityType,
                entity_id: idSegment ? parseInt(idSegment) : null,
                new_values: action === 'DELETE' ? null : redact(req.body),
                old_values: null,
                ip_address: req.ip || req.connection?.remoteAddress,
                user_agent: req.get('user-agent')
            }).catch(err => console.error('Audit logging failed:', err.message));

            // Changes to integrations or security settings get mailed as well as
            // logged. The audit row that recorded attendance sync being switched
            // off on 31 July was correct and complete — nobody read it for four
            // days. A log nobody opens is not a control.
            if (/^(hrms|settings|integrations)$/i.test(entityType)) {
                try {
                    require('../services/alert_checks').notifyConfigChange({
                        username: req.user.username || String(req.user.id),
                        entity: entityType,
                        action,
                        summary: summarise(req.body)
                    }).catch(() => {});
                } catch { /* alerting must never break the request it observes */ }
            }
        }
        return originalJson(data);
    };

    next();
};

/**
 * Log login event
 */
const logLogin = async (username, ipAddress, userAgent, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'LOGIN',
        entity_type: 'user',
        ip_address: ipAddress,
        user_agent: userAgent
    });
};

/**
 * Log logout event
 */
const logLogout = async (username, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'LOGOUT',
        entity_type: 'user',
        ip_address: ipAddress
    });
};

/**
 * Log create event
 */
const logCreate = async (username, entityType, entityId, newValues, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'CREATE',
        entity_type: entityType,
        entity_id: entityId,
        new_values: newValues,
        ip_address: ipAddress
    });
};

/**
 * Log update event
 */
const logUpdate = async (username, entityType, entityId, oldValues, newValues, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'UPDATE',
        entity_type: entityType,
        entity_id: entityId,
        old_values: oldValues,
        new_values: newValues,
        ip_address: ipAddress
    });
};

/**
 * Log delete event
 */
const logDelete = async (username, entityType, entityId, oldValues, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'DELETE',
        entity_type: entityType,
        entity_id: entityId,
        old_values: oldValues,
        ip_address: ipAddress
    });
};

/**
 * Log export event
 */
const logExport = async (username, entityType, format, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'EXPORT',
        entity_type: entityType,
        new_values: { format },
        ip_address: ipAddress
    });
};

/**
 * Log import event
 */
const logImport = async (username, entityType, recordCount, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'IMPORT',
        entity_type: entityType,
        new_values: { record_count: recordCount },
        ip_address: ipAddress
    });
};

/**
 * Log sync event
 */
const logSync = async (username, entityType, syncType, ipAddress, userId = null) => {
    await logEvent({
        user_id: userId,
        username,
        action: 'SYNC',
        entity_type: entityType,
        new_values: { sync_type: syncType },
        ip_address: ipAddress
    });
};

module.exports = {
    logEvent,
    auditMutations,
    logLogin,
    logLogout,
    logCreate,
    logUpdate,
    logDelete,
    logExport,
    logImport,
    logSync
};

