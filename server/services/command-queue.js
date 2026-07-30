/**
 * Command Queue Manager
 * 
 * Enterprise-grade command queue with:
 * - Automatic retry with exponential backoff
 * - Priority-based command execution
 * - Dead letter queue for permanently failed commands
 * - Health monitoring and alerting
 * - Batch operations
 * 
 * @author DevTeam
 * @version 2.0.0
 */

const db = require('../db');
const fs = require('fs');

// Ensure retry/dead-letter columns exist (schema script covers Docker; this
// covers bare-metal restarts). Queue queries fail hard without them.
(async () => {
    const cols = [
        'max_retries INTEGER DEFAULT 3',
        'next_retry_at TIMESTAMP',
        'last_error TEXT',
        'priority INTEGER DEFAULT 5',
        'command_type VARCHAR(50)',
        'sent_at TIMESTAMP',
        'completed_at TIMESTAMP'
    ];
    for (const col of cols) {
        await db.query(`ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS ${col}`)
            .catch(err => console.error(`device_commands column ensure failed: ${err.message}`));
    }
})();

// Command Priority Levels
const PRIORITY = {
    CRITICAL: 1,    // User deletion, emergency sync
    HIGH: 3,        // Biometric updates
    NORMAL: 5,      // Regular sync
    LOW: 7,         // Bulk operations
    BACKGROUND: 9   // Cleanup, maintenance
};

// Command Types for categorization
const COMMAND_TYPE = {
    USER_INFO: 'USERINFO',
    FACE: 'FACE',
    FINGERPRINT: 'FINGERTMP',
    BIODATA: 'BIODATA',
    DELETE: 'DELETE',
    QUERY: 'QUERY',
    OTHER: 'OTHER'
};

// Logger
const log = (level, msg, data = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] [CommandQueue] ${msg} ${JSON.stringify(data)}`;
    console.log(logEntry);
    fs.appendFileSync('command_queue.log', logEntry + '\n');
};

/**
 * Determine command type from command string
 */
const getCommandType = (command) => {
    if (!command) return COMMAND_TYPE.OTHER;
    const upper = command.toUpperCase();
    if (upper.includes('DELETE')) return COMMAND_TYPE.DELETE;
    if (upper.includes('USERINFO')) return COMMAND_TYPE.USER_INFO;
    if (upper.includes('BIODATA')) return COMMAND_TYPE.BIODATA;
    if (upper.includes('FACE')) return COMMAND_TYPE.FACE;
    if (upper.includes('FINGERTMP')) return COMMAND_TYPE.FINGERPRINT;
    if (upper.includes('QUERY')) return COMMAND_TYPE.QUERY;
    return COMMAND_TYPE.OTHER;
};

/**
 * Get priority for command type
 */
const getPriorityForType = (commandType) => {
    switch (commandType) {
        case COMMAND_TYPE.DELETE:
            return PRIORITY.CRITICAL;
        case COMMAND_TYPE.USER_INFO:
            return PRIORITY.HIGH;
        case COMMAND_TYPE.FACE:
        case COMMAND_TYPE.FINGERPRINT:
        case COMMAND_TYPE.BIODATA:
            return PRIORITY.HIGH;
        case COMMAND_TYPE.QUERY:
            return PRIORITY.LOW;
        default:
            return PRIORITY.NORMAL;
    }
};

/**
 * Queue a new command with smart prioritization
 */
const queueCommand = async (deviceSerial, command, options = {}) => {
    try {
        const commandType = getCommandType(command);
        const priority = options.priority || getPriorityForType(commandType);
        const sequence = options.sequence || 0;
        const maxRetries = options.maxRetries || 3;

        const result = await db.query(`
            INSERT INTO device_commands 
            (device_serial, command, status, priority, sequence, max_retries, created_at)
            VALUES ($1, $2, 'pending', $3, $4, $5, NOW())
            RETURNING id
        `, [deviceSerial, command, priority, sequence, maxRetries]);

        log('INFO', 'Command queued', {
            id: result.rows[0].id,
            device: deviceSerial,
            type: commandType,
            priority
        });

        return result.rows[0].id;
    } catch (err) {
        log('ERROR', 'Failed to queue command', { error: err.message, device: deviceSerial });
        throw err;
    }
};

/**
 * Queue multiple commands in batch (transaction)
 */
const queueBatch = async (commands) => {
    const client = await db.getClient();
    const results = [];

    try {
        await client.query('BEGIN');

        for (const cmd of commands) {
            const commandType = getCommandType(cmd.command);
            const priority = cmd.priority || getPriorityForType(commandType);

            const result = await client.query(`
                INSERT INTO device_commands 
                (device_serial, command, status, priority, sequence, max_retries, created_at)
                VALUES ($1, $2, 'pending', $3, $4, $5, NOW())
                RETURNING id
            `, [cmd.deviceSerial, cmd.command, priority, cmd.sequence || 0, cmd.maxRetries || 3]);

            results.push(result.rows[0].id);
        }

        await client.query('COMMIT');
        log('INFO', 'Batch queued', { count: results.length });
        return results;
    } catch (err) {
        await client.query('ROLLBACK');
        log('ERROR', 'Batch queue failed', { error: err.message });
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Get next command for a device (respects priority and sequence)
 */
const getNextCommand = async (deviceSerial) => {
    const result = await db.query(`
        SELECT id, command FROM device_commands 
        WHERE device_serial = $1 
        AND status = 'pending' 
        ORDER BY priority ASC, sequence ASC, created_at ASC 
        LIMIT 1
    `, [deviceSerial]);

    return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Mark command as sent (in progress)
 */
const markSent = async (commandId) => {
    await db.query(`
        UPDATE device_commands 
        SET status = 'sent', retry_count = retry_count 
        WHERE id = $1
    `, [commandId]);
};

/**
 * Mark command as successful
 */
const markSuccess = async (commandId) => {
    await db.query(`
        UPDATE device_commands 
        SET status = 'success', completed_at = NOW() 
        WHERE id = $1
    `, [commandId]);

    log('INFO', 'Command succeeded', { id: commandId });
};

/**
 * Handle command failure with retry logic
 */
const handleFailure = async (commandId, errorCode, errorMessage) => {
    // Get current retry state
    const result = await db.query(`
        SELECT retry_count, max_retries, command, device_serial 
        FROM device_commands WHERE id = $1
    `, [commandId]);

    if (result.rows.length === 0) return;

    const cmd = result.rows[0];
    const newRetryCount = (cmd.retry_count || 0) + 1;

    // Check if we should retry
    if (newRetryCount < cmd.max_retries) {
        // Calculate next retry time with exponential backoff
        // 1st retry: 30s, 2nd: 60s, 3rd: 120s
        const backoffSeconds = 30 * Math.pow(2, newRetryCount - 1);

        await db.query(`
            UPDATE device_commands 
            SET status = 'pending', 
                retry_count = $2,
                last_error = $3,
                next_retry_at = NOW() + INTERVAL '${backoffSeconds} seconds'
            WHERE id = $1
        `, [commandId, newRetryCount, `Return=${errorCode}: ${errorMessage || ''}`]);

        log('WARN', 'Command retry scheduled', {
            id: commandId,
            retry: newRetryCount,
            nextRetryIn: `${backoffSeconds}s`,
            device: cmd.device_serial
        });
    } else {
        // Max retries exceeded - move to dead letter
        await db.query(`
            UPDATE device_commands 
            SET status = 'dead_letter', 
                retry_count = $2,
                last_error = $3,
                completed_at = NOW()
            WHERE id = $1
        `, [commandId, newRetryCount, `Max retries exceeded. Last error: Return=${errorCode}`]);

        log('ERROR', 'Command moved to dead letter', {
            id: commandId,
            device: cmd.device_serial,
            command: cmd.command.substring(0, 50)
        });

        // TODO: Send alert notification
    }
};

/**
 * Process retry queue - find commands ready for retry
 */
const processRetryQueue = async () => {
    try {
        // Find commands that were marked for retry and are now ready
        const result = await db.query(`
            UPDATE device_commands 
            SET next_retry_at = NULL
            WHERE status = 'pending' 
            AND next_retry_at IS NOT NULL 
            AND next_retry_at <= NOW()
            RETURNING id, device_serial
        `);

        if (result.rows.length > 0) {
            log('INFO', 'Retry queue processed', { count: result.rows.length });
        }

        return result.rows;
    } catch (err) {
        log('ERROR', 'Retry queue processing failed', { error: err.message });
        return [];
    }
};

/**
 * Get queue statistics
 */
const getQueueStats = async (deviceSerial = null) => {
    let whereClause = '';
    let params = [];

    if (deviceSerial) {
        whereClause = 'WHERE device_serial = $1';
        params = [deviceSerial];
    }

    const result = await db.query(`
        SELECT 
            status,
            COUNT(*) as count,
            AVG(retry_count) as avg_retries
        FROM device_commands
        ${whereClause}
        GROUP BY status
    `, params);

    const stats = {
        pending: 0,
        sent: 0,
        success: 0,
        failed: 0,
        dead_letter: 0,
        total: 0
    };

    result.rows.forEach(row => {
        stats[row.status] = parseInt(row.count);
        stats.total += parseInt(row.count);
    });

    return stats;
};

/**
 * Get dead letter queue items
 */
const getDeadLetterQueue = async (deviceSerial = null, limit = 50) => {
    let whereClause = "WHERE status = 'dead_letter'";
    let params = [limit];

    if (deviceSerial) {
        whereClause += ' AND device_serial = $2';
        params.push(deviceSerial);
    }

    const result = await db.query(`
        SELECT id, device_serial, command, last_error, retry_count, created_at, completed_at
        FROM device_commands
        ${whereClause}
        ORDER BY completed_at DESC
        LIMIT $1
    `, params);

    return result.rows;
};

/**
 * Retry a dead letter command
 */
const retryDeadLetter = async (commandId) => {
    const result = await db.query(`
        UPDATE device_commands 
        SET status = 'pending', 
            retry_count = 0,
            max_retries = max_retries + 2,
            next_retry_at = NULL,
            completed_at = NULL
        WHERE id = $1 AND status = 'dead_letter'
        RETURNING *
    `, [commandId]);

    if (result.rows.length > 0) {
        log('INFO', 'Dead letter retried', { id: commandId });
        return true;
    }
    return false;
};

/**
 * Purge old completed commands
 */
const purgeOldCommands = async (daysOld = 30) => {
    const result = await db.query(`
        DELETE FROM device_commands 
        WHERE status IN ('success', 'dead_letter')
        AND completed_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
    `);

    if (result.rows.length > 0) {
        log('INFO', 'Purged old commands', { count: result.rows.length, daysOld });
    }

    return result.rows.length;
};

/**
 * Cancel pending commands for a device
 */
const cancelPendingCommands = async (deviceSerial, commandType = null) => {
    let whereClause = "device_serial = $1 AND status = 'pending'";
    let params = [deviceSerial];

    if (commandType) {
        whereClause += ' AND command LIKE $2';
        params.push(`%${commandType}%`);
    }

    const result = await db.query(`
        UPDATE device_commands 
        SET status = 'cancelled', completed_at = NOW()
        WHERE ${whereClause}
        RETURNING id
    `, params);

    log('INFO', 'Commands cancelled', { device: deviceSerial, count: result.rows.length });
    return result.rows.length;
};

/**
 * Get command history for an employee
 */
const getEmployeeCommandHistory = async (employeeCode, limit = 20) => {
    const result = await db.query(`
        SELECT 
            dc.*,
            d.device_name
        FROM device_commands dc
        LEFT JOIN devices d ON dc.device_serial = d.serial_number
        WHERE dc.command LIKE $1
        ORDER BY dc.created_at DESC
        LIMIT $2
    `, [`%PIN=${employeeCode}%`, limit]);

    return result.rows;
};

// Background job: Process retry queue every 30 seconds
const startRetryProcessor = () => {
    setInterval(async () => {
        await processRetryQueue();
    }, 30 * 1000);

    log('INFO', 'Retry processor started');
};

// Background job: Purge old commands daily
const startPurgeJob = () => {
    // Run at 3 AM daily
    const runPurge = async () => {
        const now = new Date();
        if (now.getHours() === 3 && now.getMinutes() < 1) {
            await purgeOldCommands(30);
        }
    };

    setInterval(runPurge, 60 * 1000);
    log('INFO', 'Purge job scheduled');
};

module.exports = {
    PRIORITY,
    COMMAND_TYPE,
    queueCommand,
    queueBatch,
    getNextCommand,
    markSent,
    markSuccess,
    handleFailure,
    processRetryQueue,
    getQueueStats,
    getDeadLetterQueue,
    retryDeadLetter,
    purgeOldCommands,
    cancelPendingCommands,
    getEmployeeCommandHistory,
    startRetryProcessor,
    startPurgeJob
};
