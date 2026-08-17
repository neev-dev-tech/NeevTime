const express = require('express');
const router = express.Router();
const db = require('../db');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// On the uploads volume, not in the database. 92,000 punches carrying an image
// each would make every dump too large to restore quickly, and a backup nobody
// can restore in an emergency is not a backup.
const PHOTO_DIR = path.join(__dirname, '../uploads/punch-photos');

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/**
 * Save a punch photo and return the filename to store against the record.
 *
 * The browser sends a data URL. Only JPEG and PNG are accepted, and the type is
 * taken from the decoded bytes rather than the client's own claim — a caller
 * can label anything image/jpeg, and this file is later served back to a
 * browser.
 *
 * Returns null when there is no photo. A punch without one still succeeds:
 * attendance is the thing that must not be lost, and a camera that failed is
 * not a reason to refuse someone's clock-in.
 */
const savePunchPhoto = async (dataUrl, employeeCode) => {
    if (!dataUrl || typeof dataUrl !== 'string') return null;

    const match = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!match) throw new Error('Photo must be a JPEG or PNG data URL');

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_PHOTO_BYTES) {
        throw new Error(`Photo is ${Math.round(buffer.length / 1024)} KB; the limit is 2 MB`);
    }

    // Magic bytes, not the declared type. JPEG starts FF D8 FF, PNG 89 50 4E 47.
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
        && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (!isJpeg && !isPng) throw new Error('That file is not a JPEG or PNG');

    await fsp.mkdir(PHOTO_DIR, { recursive: true });

    // The employee code is in the name for a human reading the directory, but
    // the random suffix is what makes the name unguessable — these are pictures
    // of people, and a predictable filename is an enumeration hole.
    const safeCode = String(employeeCode).replace(/[^A-Za-z0-9_-]/g, '');
    const name = `${safeCode}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
        + (isJpeg ? '.jpg' : '.png');

    await fsp.writeFile(path.join(PHOTO_DIR, name), buffer);
    return name;
};

/**
 * Delete photos older than the retention period.
 *
 * A photograph of an employee is personal data under the DPDP Act, and keeping
 * it forever is a liability rather than an asset — the attendance record is the
 * evidence that must be retained for years; the image only needs to outlive any
 * dispute about that punch.
 *
 * Runs daily. Failure is logged and never interrupts anything.
 */
const purgePunchPhotos = async () => {
    const settings = require('../utils/settings');
    const days = Number(await settings.get('attendance', 'punch_photo_retention_days', 90)) || 90;
    const cutoff = Date.now() - days * 86400000;

    let removed = 0;
    try {
        for (const file of await fsp.readdir(PHOTO_DIR)) {
            const full = path.join(PHOTO_DIR, file);
            const stat = await fsp.stat(full);
            if (stat.mtimeMs < cutoff) {
                await fsp.unlink(full);
                // The record keeps its own history; only the image goes.
                await db.query(
                    'UPDATE attendance_logs SET photo_path = NULL WHERE photo_path = $1', [file]
                ).catch(() => {});
                removed += 1;
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('[PunchPhoto] purge failed:', err.message);
        return;
    }
    if (removed) console.log(`[PunchPhoto] removed ${removed} photo(s) older than ${days} days`);
};

/** Once a day, and once shortly after boot so a long-running container catches up. */
const startPhotoPurge = () => {
    setTimeout(() => purgePunchPhotos(), 60_000);
    setInterval(() => purgePunchPhotos(), 24 * 60 * 60 * 1000);
};

// Haversine Formula for Geodesic Distance
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius of earth in meters
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Decide whether a position is inside an allowed location.
 *
 * Shared, so the admin punch and the employee's own punch cannot drift apart.
 * Two copies of a geofence rule is two places for someone to be marked present
 * from the wrong side of town.
 *
 * An employee with an assigned fence is checked only against that one. Without
 * one, any active fence counts — which is why no fence is ever seeded: an empty
 * table refuses every punch, and a seeded one would let anyone near that
 * address clock in.
 */
const findMatchingGeofence = async (employeeCode, latitude, longitude) => {
    const assigned = await db.query(
        `SELECT g.* FROM geofences g
           JOIN employees e ON e.assigned_geofence_id = g.id
          WHERE e.employee_code = $1 AND g.is_active IS TRUE`,
        [employeeCode]
    );

    const candidates = assigned.rows.length
        ? assigned.rows
        : (await db.query('SELECT * FROM geofences WHERE is_active IS TRUE')).rows;

    for (const fence of candidates) {
        const distance = getDistanceFromLatLonInMeters(
            parseFloat(latitude), parseFloat(longitude),
            parseFloat(fence.latitude), parseFloat(fence.longitude)
        );
        if (distance <= fence.radius_meters) return { fence, distance };
    }
    return null;
};

// ================= GEOFENCE MANAGEMENT =================

// Get all geofences
router.get('/geofences', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM geofences ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create geofence
router.post('/geofences', async (req, res) => {
    const { name, latitude, longitude, radius_meters, address } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO geofences (name, latitude, longitude, radius_meters, address) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, latitude, longitude, radius_meters || 100, address]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update geofence
router.put('/geofences/:id', async (req, res) => {
    const { name, latitude, longitude, radius_meters, address, is_active } = req.body;
    try {
        const result = await db.query(
            `UPDATE geofences 
             SET name = $1, latitude = $2, longitude = $3, radius_meters = $4, address = $5, is_active = $6
             WHERE id = $7 RETURNING *`,
            [name, latitude, longitude, radius_meters, address, is_active, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete geofence
router.delete('/geofences/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM geofences WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= MOBILE ATTENDANCE PUNCH =================

// Mark Mobile Attendance
router.post('/punch', async (req, res) => {
    const { employee_id, latitude, longitude, punch_time } = req.body;

    if (!employee_id || !latitude || !longitude) {
        return res.status(400).json({ error: 'Missing required fields: employee_id, latitude, longitude' });
    }

    try {
        // 1. Get Employee's Assigned Geofence (or Global Default if none assigned)
        const empResult = await db.query(
            'SELECT assigned_geofence_id FROM employees WHERE id = $1',
            [employee_id]
        );

        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        let geofenceQuery = 'SELECT * FROM geofences WHERE is_active = TRUE';
        const assignedId = empResult.rows[0].assigned_geofence_id;

        // If assigned explicitly, verify ONLY against that. Else verify against ALL active geofences ?
        // Policy: If assigned, check that. If not, check any.
        let allowedGeofences = [];

        if (assignedId) {
            const geoRes = await db.query('SELECT * FROM geofences WHERE id = $1', [assignedId]);
            allowedGeofences = geoRes.rows;
        } else {
            // Check all active geofences
            const geoRes = await db.query('SELECT * FROM geofences WHERE is_active = TRUE');
            allowedGeofences = geoRes.rows;
        }

        // 2. Calculate Distance
        let insideGeofence = false;
        let matchedGeofence = null;
        let minDistance = Infinity;

        for (const fence of allowedGeofences) {
            const distance = getDistanceFromLatLonInMeters(
                parseFloat(latitude),
                parseFloat(longitude),
                parseFloat(fence.latitude),
                parseFloat(fence.longitude)
            );

            if (distance <= fence.radius_meters) {
                insideGeofence = true;
                matchedGeofence = fence;
                minDistance = distance;
                break; // Found one, that's enough
            }
        }

        if (!insideGeofence) {
            // "You are outside the allowed location" is wrong when there is no
            // location at all — it sends someone walking around the car park
            // looking for a signal, when the fix is an administrator adding a
            // site. The owner hit exactly this: zero geofences, and a message
            // about being in the wrong place.
            const configured = await db.query(
                'SELECT count(*)::int AS n FROM geofences WHERE is_active IS TRUE'
            );
            if (configured.rows[0].n === 0) {
                return res.status(409).json({
                    error: 'No work location has been set up yet.',
                    details: 'An administrator needs to add one under Attendance > Rule > '
                        + 'Geofences before anyone can punch from a phone.'
                });
            }

            return res.status(403).json({
                error: 'You are outside the allowed location.',
                details: 'You are not within range of any approved site.'
            });
        }

        // 3. Record Punch
        // Check log table structure - ensure column names match logs
        const logTime = punch_time || new Date();

        // We need employee_code for attendance_logs usually? 
        // Let's get code
        const empDetails = await db.query('SELECT employee_code FROM employees WHERE id = $1', [employee_id]);
        const employeeCode = empDetails.rows[0].employee_code;

        // A failed photo must not cost someone their punch. Attendance is the
        // record that matters and it is being made right now, in front of a
        // person who is standing there; a camera that misbehaved is a reason to
        // note the absence of an image, not to refuse the clock-in.
        let photoName = null;
        let photoWarning = null;
        try {
            photoName = await savePunchPhoto(req.body.photo, employeeCode);
        } catch (err) {
            photoWarning = err.message;
            console.error('[PunchPhoto] not saved:', err.message);
        }

        // Through the shared ingest, exactly as a reader's punch is. Inserting
        // directly recorded the row and skipped everything that turns a punch
        // into attendance: the daily summary, the live feed and the push to the
        // HR system.
        const ingest = require('../services/punch_ingest');
        let stored;
        try {
            stored = await ingest.recordPunch({
                employeeCode,
                deviceSerial: 'MOBILE_APP',
                timestamp: logTime,
                state: 'check_in',
                verifyMode: 'mobile',
                punchSource: 'mobile',
                photoPath: photoName,
                location: {
                    latitude, longitude, geofenceId: matchedGeofence.id,
                },
            }, { io: req.app.get('io') || null });
        } catch (err) {
            await module.exports.discardPhoto(photoName);
            throw err;
        }

        if (!stored.stored) {
            await module.exports.discardPhoto(photoName);
            return res.status(400).json({ error: stored.reason || 'The punch could not be recorded' });
        }

        res.json({
            success: true,
            message: 'Attendance Marked Successfully',
            location: matchedGeofence.name,
            photo_saved: Boolean(photoName),
            // Surfaced rather than swallowed: a punch that recorded no image is
            // still a punch, and whoever reviews it later should know why there
            // is nothing to look at.
            photo_warning: photoWarning,
            punch_time: stored.punchDate,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Serve one punch photo.
 *
 * Authenticated — the router is mounted behind authenticateToken and requireAdmin
 * in server.js. These are photographs of employees; an unauthenticated URL would
 * be a privacy incident regardless of how unguessable the name is.
 *
 * The name is matched against a strict pattern rather than joined blindly. A
 * filename is attacker-influenced input, and `path.join` with '../../' walks
 * straight out of the directory.
 */
router.get('/punch-photo/:name', async (req, res) => {
    const name = String(req.params.name || '');
    if (!/^[A-Za-z0-9_-]+\.(jpg|png)$/.test(name)) {
        return res.status(400).json({ error: 'Bad photo name' });
    }

    const file = path.join(PHOTO_DIR, name);
    if (!fs.existsSync(file)) {
        // Expected once retention has run, so it is a plain 404 rather than an
        // error: the record outlives the image by design.
        return res.status(404).json({ error: 'Photo not found or past its retention period' });
    }

    res.type(name.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(file).pipe(res);
});

module.exports = router;
module.exports.startPhotoPurge = startPhotoPurge;
// Exported for tests. The validation here decides what is written to disk and
// later served back to a browser, so it is worth exercising directly.
module.exports.savePunchPhoto = savePunchPhoto;
module.exports.PHOTO_DIR = PHOTO_DIR;
module.exports.findMatchingGeofence = findMatchingGeofence;

/**
 * Remove a photo whose punch was never recorded.
 *
 * The image is written before the INSERT, so a rejected punch leaves it on
 * disk with nothing pointing at it. That happened here: INT089's failed
 * attempts left a 33 KB photograph of a person that no record refers to, which
 * retention would not clear for ninety days.
 *
 * An orphan is not a small tidiness problem. It is a photograph of an employee
 * kept for no reason, which is exactly what the DPDP Act asks about.
 */
module.exports.discardPhoto = async (name) => {
    if (!name) return;
    try {
        await fsp.unlink(path.join(PHOTO_DIR, name));
    } catch { /* already gone */ }
};
module.exports.purgePunchPhotos = purgePunchPhotos;
