const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

// Download Backup - Must be defined BEFORE /backups to avoid route matching conflicts
router.get('/backups/download', (req, res) => {
    try {
        const filename = req.query.filename;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename parameter required' });
        }
        
        // Decode the filename
        const decodedFilename = decodeURIComponent(filename);
        
        // Security: Only allow alphanumeric, dash, underscore, dot, and ensure it's a .sql file
        if (!/^[a-zA-Z0-9._-]+\.sql$/.test(decodedFilename)) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        const filepath = path.join(BACKUP_DIR, path.basename(decodedFilename));

        if (!fs.existsSync(filepath)) {
            console.error(`Backup file not found: ${filepath}`);
            return res.status(404).json({ error: 'Backup not found' });
        }

        // Set headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
        
        // Stream the file
        const fileStream = fs.createReadStream(filepath);
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error reading file' });
            }
        });
        fileStream.pipe(res);
    } catch (err) {
        console.error('Download backup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all backups (must come after /backups/download)
router.get('/backups', (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const backups = files.map(file => {
            const stats = fs.statSync(path.join(BACKUP_DIR, file));
            return {
                name: file,
                size: stats.size,
                created_at: stats.birthtime
            };
        }).sort((a, b) => b.created_at - a.created_at);

        res.json(backups);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Run pg_dump into BACKUP_DIR. Shared by the manual endpoint and the scheduler
 * so both produce identical artefacts.
 */
const createBackup = (prefix = 'backup') => new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}-${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const { DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    const cmd = `pg_dump -h ${DB_HOST || 'localhost'} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -F c -f "${filepath}" ${DB_NAME || 'attendance_db'}`;

    exec(cmd, { env }, (error) => {
        if (error) return reject(error);
        const stats = fs.statSync(filepath);
        resolve({ name: filename, size: stats.size, created_at: stats.birthtime });
    });
});

/** Keep only the newest `keep` auto-* backups. */
const pruneAutoBackups = (keep) => {
    if (!keep || keep < 1) return;
    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('auto-'))
        .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).birthtime }))
        .sort((a, b) => b.t - a.t);

    for (const stale of files.slice(keep)) {
        try {
            fs.unlinkSync(path.join(BACKUP_DIR, stale.f));
        } catch (err) {
            console.error('Failed to prune backup', stale.f, err.message);
        }
    }
};

// Create Backup
router.post('/backups', async (req, res) => {
    try {
        const backup = await createBackup('backup');
        res.json({ success: true, backup });
    } catch (error) {
        console.error(`Backup error: ${error.message}`);
        res.status(500).json({ error: 'Backup failed', details: error.message });
    }
});

// Delete Backup
router.delete('/backups/:filename(*)', (req, res) => {
    try {
        // Decode the filename parameter to handle special characters
        let filename = decodeURIComponent(req.params.filename);
        
        // Security: Only allow alphanumeric, dash, underscore, dot, and ensure it's a .sql file
        if (!/^[a-zA-Z0-9._-]+\.sql$/.test(filename)) {
            return res.status(400).json({ error: 'Invalid filename' });
        }
        
        const filepath = path.join(BACKUP_DIR, path.basename(filename));

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Backup not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Restore Backup — DESTRUCTIVE: replaces current data with the backup.
// Requires explicit confirm phrase in the body.
router.post('/restore', (req, res) => {
    const { filename, confirm } = req.body || {};

    if (confirm !== 'RESTORE') {
        return res.status(400).json({ error: 'Confirmation required: pass confirm="RESTORE"' });
    }
    if (!filename || !/^[a-zA-Z0-9._-]+\.sql$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filepath = path.join(BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Backup not found' });
    }

    const { DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    // Backups are pg_dump custom format (-F c); --clean drops objects before
    // recreating them, --if-exists keeps that quiet on fresh databases.
    const cmd = `pg_restore --clean --if-exists -h ${DB_HOST || 'localhost'} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -d ${DB_NAME || 'attendance_db'} "${filepath}"`;

    console.warn(`DATABASE RESTORE started from ${filename} by user ${req.user?.username || req.user?.id}`);
    exec(cmd, { env, timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Restore error: ${error.message}`);
            return res.status(500).json({ error: 'Restore failed', details: stderr?.slice(0, 500) || error.message });
        }
        console.warn(`DATABASE RESTORE completed from ${filename}`);
        res.json({ success: true, message: `Database restored from ${filename}. Restart the server to refresh all connections.` });
    });
});

/**
 * Unattended backups, driven by Settings → Database (backup_frequency,
 * backup_time, backup_retention_count). Checks once a minute and fires when the
 * local clock reaches the configured time on a matching day, tracking the last
 * run so a restart inside the same minute cannot double-fire.
 */
let lastAutoBackupDate = null;

const shouldRunToday = (frequency, now) => {
    if (frequency === 'daily') return true;
    if (frequency === 'weekly') return now.getDay() === 1; // Monday
    if (frequency === 'monthly') return now.getDate() === 1;
    return false;
};

const startAutoBackup = () => {
    const settingsStore = require('../utils/settings');

    setInterval(async () => {
        try {
            const enabled = await settingsStore.get('database', 'backup_enabled', false);
            if (!enabled) return;

            const frequency = await settingsStore.get('database', 'backup_frequency', 'daily');
            const time = await settingsStore.get('database', 'backup_time', '02:00');
            const retention = await settingsStore.get('database', 'backup_retention_count', 7);

            const now = new Date();
            const stamp = now.toISOString().slice(0, 10);
            const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            if (lastAutoBackupDate === stamp) return;
            if (current !== String(time).slice(0, 5)) return;
            if (!shouldRunToday(frequency, now)) return;

            lastAutoBackupDate = stamp;
            const backup = await createBackup('auto');
            pruneAutoBackups(Number(retention));
            console.log(`[AutoBackup] Created ${backup.name}`);
        } catch (err) {
            console.error('[AutoBackup] failed:', err.message);
        }
    }, 60 * 1000);
};

module.exports = router;
module.exports.startAutoBackup = startAutoBackup;
