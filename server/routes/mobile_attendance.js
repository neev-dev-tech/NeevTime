const express = require('express');
const router = express.Router();
const db = require('../db');

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
            return res.status(403).json({
                error: 'You are outside the allowed location.',
                details: 'Geofence violation.'
            });
        }

        // 3. Record Punch
        // Check log table structure - ensure column names match logs
        const logTime = punch_time || new Date();

        // We need employee_code for attendance_logs usually? 
        // Let's get code
        const empDetails = await db.query('SELECT employee_code FROM employees WHERE id = $1', [employee_id]);
        const employeeCode = empDetails.rows[0].employee_code;

        const result = await db.query(
            `INSERT INTO attendance_logs 
             (employee_code, punch_time, punch_state, device_serial, verification_mode,
              punch_source, latitude, longitude, is_geofence_verified, geofence_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
             RETURNING *`,
            [
                employeeCode,
                logTime,
                'check_in', // Default to check_in or infer logic later? For now simplistic.
                'MOBILE_APP',
                1, // 1 could mean fingerprint elsewhere, 20 is mobile? Let's use 20.
                'mobile',
                latitude,
                longitude,
                true,
                matchedGeofence.id
            ]
        );

        res.json({
            success: true,
            message: 'Attendance Marked Successfully',
            location: matchedGeofence.name,
            log: result.rows[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
