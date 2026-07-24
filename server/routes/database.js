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

// Create Backup
router.post('/backups', (req, res) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    // Get DB config from env
    const { DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;

    // Construct pg_dump command
    // Note: Assuming pg_dump is in PATH or using standard postgres env vars
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    const cmd = `pg_dump -h ${DB_HOST || 'localhost'} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -F c -f "${filepath}" ${DB_NAME || 'attendance_db'}`;

    exec(cmd, { env }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Backup error: ${error.message}`);
            return res.status(500).json({ error: 'Backup failed', details: error.message });
        }

        const stats = fs.statSync(filepath);
        res.json({
            success: true,
            backup: {
                name: filename,
                size: stats.size,
                created_at: stats.birthtime
            }
        });
    });
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

module.exports = router;
