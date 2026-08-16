const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const fsp = require('fs').promises;
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
/**
 * Copy a finished dump to a second location.
 *
 * A dump beside the database survives a bad migration. It does not survive
 * losing the disk, and until today this deployment had exactly one backup, taken
 * by hand five months earlier, on that disk. Both copies would have gone
 * together.
 *
 * The path is inside the container, so it only reaches other hardware if it is a
 * mounted volume — a NAS, a bind mount, an object-storage FUSE mount. That is
 * the whole point and it is easy to get wrong, so this reports what it did
 * rather than failing quietly, and a copy that fails never fails the backup
 * itself. A dump in one place beats an error and no dump at all.
 */
const copyToExternal = async (filepath, filename) => {
    const settingsStore = require('../utils/settings');
    const dest = String(await settingsStore.get('database', 'backup_external_path', '') || '').trim();
    if (!dest) return { attempted: false };

    try {
        await fsp.mkdir(dest, { recursive: true });
        await fsp.copyFile(filepath, path.join(dest, filename));
        return { attempted: true, ok: true, path: path.join(dest, filename) };
    } catch (err) {
        console.error(`[Backup] external copy to ${dest} failed:`, err.message);
        return { attempted: true, ok: false, error: err.message };
    }
};

const createBackup = (prefix = 'backup') => new Promise((resolve, reject) => {
    // Local time in the filename. The daily check looks for `auto-<local date>`,
    // and a UTC-stamped name would not match it between midnight and 05:30 IST —
    // which includes the default 02:00 schedule.
    const n = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const timestamp = `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}` +
        `T${p2(n.getHours())}-${p2(n.getMinutes())}-${p2(n.getSeconds())}`;
    const filename = `${prefix}-${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const { DB_USER, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    const cmd = `pg_dump -h ${DB_HOST || 'localhost'} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -F c -f "${filepath}" ${DB_NAME || 'attendance_db'}`;

    exec(cmd, { env }, (error) => {
        if (error) return reject(error);
        const stats = fs.statSync(filepath);
        copyToExternal(filepath, filename).then(external => {
            resolve({ name: filename, size: stats.size, created_at: stats.birthtime, external });
        });
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

/**
 * Can we actually write there?
 *
 * The path is inside the container, so a plausible-looking one like
 * /mnt/nas/backups silently writes into the container's own filesystem unless
 * it is a mounted volume — and is then destroyed on the next deploy, which
 * recreates the container. That failure is invisible: backups appear to
 * succeed, and the copies are gone.
 *
 * So this writes a real file, reads it back, removes it, and reports whether
 * the path is a mount point. Better to find out here than during a restore.
 */
router.post('/backup-path/check', async (req, res) => {
    const dest = String(req.body?.path || '').trim();
    if (!dest) return res.status(400).json({ error: 'No path given' });

    const probe = path.join(dest, `.neevtime-write-check-${Date.now()}`);
    try {
        await fsp.mkdir(dest, { recursive: true });
        await fsp.writeFile(probe, 'write check');
        const readBack = await fsp.readFile(probe, 'utf8');
        await fsp.unlink(probe);
        if (readBack !== 'write check') throw new Error('file read back different than written');

        // A path that is not a separate mount is on the container's own disk.
        // It will work, and it will not survive the next deploy.
        let mounted = false;
        try {
            const [here, parent] = await Promise.all([fsp.stat(dest), fsp.stat(path.dirname(dest))]);
            mounted = here.dev !== parent.dev;
        } catch { /* leave mounted false; the warning is advisory */ }

        res.json({
            ok: true,
            path: dest,
            mounted,
            message: mounted
                ? 'Writable, and on a separate mount — copies will survive a redeploy.'
                : 'Writable, but this is inside the container. Copies here are lost when the ' +
                  'container is recreated on the next deploy. Mount a volume at this path in ' +
                  'docker-compose.production.yml.'
        });
    } catch (err) {
        res.status(400).json({
            ok: false,
            error: err.message,
            hint: 'Mount the destination into the app container, then use the path it has inside it.'
        });
    }
});

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

            // Local date, not toISOString(). The schedule is read in local time
            // (getHours), and IST is UTC+5:30, so a 02:00 run stamps itself with
            // the previous UTC day. Mixing the two is how a scheduled job
            // silently skips.
            const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            if (!shouldRunToday(frequency, now)) return;

            // At or after the scheduled time, not exactly on it.
            //
            // This was `current !== time` — an exact HH:MM match on a 60-second
            // timer. setInterval drifts, so a tick can move from 01:59:58 to
            // 02:01:00 and miss 02:00 entirely, skipping that day with nothing
            // logged. A backup schedule that quietly does nothing is the failure
            // this deployment already lived through: one manual dump, 143 days
            // old, because nobody was told.
            const [schedH, schedM] = String(time).slice(0, 5).split(':').map(Number);
            const dueMinutes = (schedH || 0) * 60 + (schedM || 0);
            if (now.getHours() * 60 + now.getMinutes() < dueMinutes) return;

            // Has today's already been taken? Asked of the directory, not of a
            // variable — lastAutoBackupDate lives in memory and resets on every
            // container restart, and this deployment is redeployed several times
            // a day. Without this, each restart after the scheduled time takes
            // another dump, and retention then prunes the older days away.
            const alreadyToday = fs.readdirSync(BACKUP_DIR)
                .some(f => f.startsWith(`auto-${stamp}`));
            if (alreadyToday || lastAutoBackupDate === stamp) return;

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
