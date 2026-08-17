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
        
        // Security: no path separators, and the name must end .sql or .dump.
        // Both are accepted because pg_dump's custom format is what this
        // writes; requiring .sql alone rejected every dump the system had
        // actually produced, so they could not be downloaded or restored
        // through the application at all.
        if (!/^[a-zA-Z0-9._-]+\.(sql|dump)$/.test(decodedFilename)) {
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
/**
 * Read the configured destination, decrypting whatever secrets it holds.
 *
 * backup_external_path predates this and still works on its own: an install
 * that only ever set a path keeps behaving exactly as before, with no
 * migration and nothing to re-enter.
 */
const loadDestination = async () => {
    const settingsStore = require('../utils/settings');
    const secrets = require('../utils/secrets');

    const key = String(await settingsStore.get('database', 'backup_destination', '') || '').trim();
    const legacyPath = String(await settingsStore.get('database', 'backup_external_path', '') || '').trim();

    if (!key || key === 'filesystem') {
        let config = {};
        try { config = JSON.parse(await settingsStore.get('database', 'backup_destination_config', '{}') || '{}'); }
        catch { config = {}; }
        const dest = String(config.path || legacyPath || '').trim();
        return dest ? { key: 'filesystem', config: { path: dest } } : null;
    }

    let stored = {};
    try { stored = JSON.parse(await settingsStore.get('database', 'backup_destination_config', '{}') || '{}'); }
    catch { return null; }

    const config = {};
    for (const [k, v] of Object.entries(stored)) config[k] = secrets.decrypt(v);
    return { key, config };
};

/**
 * The second copy.
 *
 * Failure here never fails the backup. The local dump is already written and is
 * worth keeping even when the copy cannot be made — losing both because the NAS
 * was unplugged would be the wrong trade. The outcome is returned so it can be
 * shown and, when it keeps failing, alerted on.
 */
const copyToExternal = async (filepath, filename) => {
    const destinations = require('../services/backup_destinations');

    const chosen = await loadDestination();
    if (!chosen) return { attempted: false };

    const impl = destinations.get(chosen.key);
    if (!impl) {
        return { attempted: true, ok: false, error: `Unknown backup destination "${chosen.key}"` };
    }

    try {
        const where = await impl.send(chosen.config, filepath, filename);
        return { attempted: true, ok: true, destination: chosen.key, path: where };
    } catch (err) {
        console.error(`[Backup] copy to ${chosen.key} failed:`, err.message);
        return { attempted: true, ok: false, destination: chosen.key, error: err.message };
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
    // .dump, not .sql. These are pg_dump's custom format (-F c) — a binary
    // archive that only pg_restore can read. Naming it .sql invites someone
    // recovering under pressure to try `psql < file`, which fails with a parse
    // error on the archive header and looks like a corrupt backup rather than
    // the wrong tool. The daily check matches on the `auto-<date>` prefix, so
    // the extension is free to be accurate.
    const filename = `${prefix}-${timestamp}.dump`;
    const filepath = path.join(BACKUP_DIR, filename);

    // DB_HOST *or* DB_SERVER, matching db/index.js. docker-compose.yml sets only
    // DB_SERVER, so this fell through to 'localhost' — and there is no Postgres
    // inside the server container, so this would have failed even once pg_dump
    // and pg_restore existed in the image.
    const { DB_USER, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;
    const DB_HOST = process.env.DB_HOST || process.env.DB_SERVER || 'db';
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    const cmd = `pg_dump -h ${DB_HOST} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -F c -f "${filepath}" ${DB_NAME || 'attendance_db'}`;

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
/**
 * The destinations this build supports, and the one currently configured.
 *
 * Secrets are returned as a mask, never as the value. A settings form that
 * renders a real credential leaks it to anyone who can open the page or read
 * the response in a browser's network tab.
 */
router.get('/destinations', async (req, res) => {
    try {
        const destinations = require('../services/backup_destinations');
        const settingsStore = require('../utils/settings');
        const secrets = require('../utils/secrets');

        const key = String(await settingsStore.get('database', 'backup_destination', '') || '')
            || (String(await settingsStore.get('database', 'backup_external_path', '') || '') ? 'filesystem' : '');

        let stored = {};
        try { stored = JSON.parse(await settingsStore.get('database', 'backup_destination_config', '{}') || '{}'); }
        catch { stored = {}; }

        // Carry the old single-path setting into the form so an existing
        // install sees what it already has rather than an empty field.
        if (key === 'filesystem' && !stored.path) {
            stored.path = String(await settingsStore.get('database', 'backup_external_path', '') || '');
        }

        const masked = {};
        const secretKeys = new Set(destinations.secretFields(key));
        for (const [k, v] of Object.entries(stored)) {
            masked[k] = secretKeys.has(k) ? secrets.mask(v) : v;
        }

        res.json({ available: destinations.describe(), selected: key || null, config: masked });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Try the destination before trusting it.
 *
 * Every implementation writes, reads back and deletes a probe. Listing a
 * folder or a bucket proves far less — read permission without write
 * permission passes a list check and fails every backup afterwards, silently,
 * which is the failure this whole feature exists to prevent.
 */
router.post('/destinations/test', async (req, res) => {
    const destinations = require('../services/backup_destinations');
    const secrets = require('../utils/secrets');
    const settingsStore = require('../utils/settings');

    const key = String(req.body?.destination || '').trim();
    const impl = destinations.get(key);
    if (!impl) {
        return res.status(400).json({ ok: false, error: `Unknown destination "${key}"` });
    }

    try {
        // A masked field means "keep what is stored" — the browser was never
        // given the real value, so it cannot send it back.
        const submitted = req.body?.config || {};
        let stored = {};
        try { stored = JSON.parse(await settingsStore.get('database', 'backup_destination_config', '{}') || '{}'); }
        catch { stored = {}; }

        const config = {};
        for (const [k, v] of Object.entries(submitted)) {
            config[k] = secrets.isMask(v) ? secrets.decrypt(stored[k]) : v;
        }

        const result = await impl.test(config);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

/** Save the destination. Secrets are encrypted before they touch the database. */
router.put('/destinations', async (req, res) => {
    const destinations = require('../services/backup_destinations');
    const secrets = require('../utils/secrets');
    const settingsStore = require('../utils/settings');

    const key = String(req.body?.destination || '').trim();
    if (key && !destinations.get(key)) {
        return res.status(400).json({ error: `Unknown destination "${key}"` });
    }

    try {
        const submitted = req.body?.config || {};
        let stored = {};
        try { stored = JSON.parse(await settingsStore.get('database', 'backup_destination_config', '{}') || '{}'); }
        catch { stored = {}; }

        const secretKeys = new Set(destinations.secretFields(key));
        const toStore = {};
        for (const [k, v] of Object.entries(submitted)) {
            if (!secretKeys.has(k)) { toStore[k] = v; continue; }
            // Unchanged mask keeps the existing ciphertext; anything else is a
            // new secret and gets encrypted now.
            toStore[k] = secrets.isMask(v) ? (stored[k] || '') : secrets.encrypt(v);
        }

        await settingsStore.set('database', 'backup_destination', key, 'string');
        await settingsStore.set('database', 'backup_destination_config', JSON.stringify(toStore), 'string');

        // Keep the legacy field in step so nothing that still reads it diverges.
        if (key === 'filesystem') {
            await settingsStore.set('database', 'backup_external_path', String(toStore.path || ''), 'string');
        }

        res.json({ ok: true, destination: key || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
        
        // Security: no path separators, and the name must end .sql or .dump.
        // Both are accepted because pg_dump's custom format is what this
        // writes; requiring .sql alone rejected every dump the system had
        // actually produced, so they could not be downloaded or restored
        // through the application at all.
        if (!/^[a-zA-Z0-9._-]+\.(sql|dump)$/.test(filename)) {
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
    if (!filename || !/^[a-zA-Z0-9._-]+\.(sql|dump)$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filepath = path.join(BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Backup not found' });
    }

    // DB_HOST *or* DB_SERVER, matching db/index.js. docker-compose.yml sets only
    // DB_SERVER, so this fell through to 'localhost' — and there is no Postgres
    // inside the server container, so this would have failed even once pg_dump
    // and pg_restore existed in the image.
    const { DB_USER, DB_NAME, DB_PASSWORD, DB_PORT } = process.env;
    const DB_HOST = process.env.DB_HOST || process.env.DB_SERVER || 'db';
    const env = { ...process.env, PGPASSWORD: DB_PASSWORD };
    // Backups are pg_dump custom format (-F c); --clean drops objects before
    // recreating them, --if-exists keeps that quiet on fresh databases.
    const cmd = `pg_restore --clean --if-exists -h ${DB_HOST} -U ${DB_USER || 'postgres'} -p ${DB_PORT || 5432} -d ${DB_NAME || 'attendance_db'} "${filepath}"`;

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

const shouldRunToday = (frequency, now, day = null) => {
    if (frequency === 'daily') return true;

    // Which day was hardcoded — Mondays, and the 1st. Neither suits a business
    // whose quiet day is a Sunday or whose month closes on the 25th, and the
    // help text said "weekly (Mondays)" as though it were a law rather than an
    // unasked assumption.
    if (frequency === 'weekly') {
        const target = day === null || day === '' ? 1 : Number(day);
        return now.getDay() === (Number.isFinite(target) ? target : 1);
    }
    if (frequency === 'monthly') {
        const target = day === null || day === '' ? 1 : Number(day);
        // 29th to 31st do not exist in every month. Run on the last day
        // instead of skipping February entirely — a backup that silently does
        // not happen for a month is the failure this whole area keeps having.
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return now.getDate() === Math.min(Number.isFinite(target) ? target : 1, lastDay);
    }
    return false;
};

const startAutoBackup = () => {
    const settingsStore = require('../utils/settings');

    setInterval(async () => {
        try {
            const enabled = await settingsStore.get('database', 'backup_enabled', false);
            if (!enabled) return;

            const frequency = await settingsStore.get('database', 'backup_frequency', 'daily');
            const day = await settingsStore.get('database', 'backup_day', '');
            const time = await settingsStore.get('database', 'backup_time', '02:00');
            const retention = await settingsStore.get('database', 'backup_retention_count', 7);

            const now = new Date();

            // Local date, not toISOString(). The schedule is read in local time
            // (getHours), and IST is UTC+5:30, so a 02:00 run stamps itself with
            // the previous UTC day. Mixing the two is how a scheduled job
            // silently skips.
            const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            if (!shouldRunToday(frequency, now, day)) return;

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
