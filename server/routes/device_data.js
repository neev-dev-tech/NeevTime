const express = require('express');
const router = express.Router();

// Device Data Routes - Work Code
/**
 * Work codes as reported by the readers.
 *
 * This previously returned two invented rows ("Department Code - Engineering"
 * and similar) behind a "replace with actual database query" comment, so the
 * page showed data that does not exist. Work codes arrive on ATTLOG lines and
 * are stored on the punch, so they are read from there — an empty result now
 * means no device has ever sent one, which is the truth.
 */
router.get('/data/work-code', async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(`
            SELECT work_code AS id,
                   COUNT(*)::int AS punch_count,
                   MIN(punch_time) AS first_seen,
                   MAX(punch_time) AS timestamp,
                   COUNT(DISTINCT employee_code)::int AS employee_count
            FROM attendance_logs
            WHERE work_code IS NOT NULL AND work_code::text <> '' AND work_code::text <> '0'
            GROUP BY work_code
            ORDER BY MAX(punch_time) DESC
            LIMIT 500
        `);

        res.json(result.rows.map(row => ({
            ...row,
            details: `Used on ${row.punch_count} punch${row.punch_count === 1 ? '' : 'es'} by ${row.employee_count} employee${row.employee_count === 1 ? '' : 's'}`
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bio-Template
router.get('/data/bio-template', async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(`
            SELECT 
                bt.id,
                bt.employee_code,
                e.name as employee_name,
                bt.template_type,
                CASE bt.template_type 
                    WHEN 1 THEN 'Fingerprint'
                    WHEN 2 THEN 'Fingerprint (Backup)'
                    WHEN 9 THEN 'Face'
                    ELSE 'Unknown'
                END as type_name,
                bt.template_no,
                bt.valid,
                bt.source_device,
                bt.created_at
            FROM biometric_templates bt
            LEFT JOIN employees e ON bt.employee_code = e.employee_code
            ORDER BY bt.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Bio-Template fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Bio-Photo
router.get('/data/bio-photo', async (req, res) => {
    try {
        const data = [];
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Transaction
router.get('/data/transaction', async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(`
            SELECT 
                al.*, 
                e.name as emp_name,
                d.device_name as device_name
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            LEFT JOIN devices d ON al.device_serial = d.serial_number
            ORDER BY al.punch_time DESC 
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Unregistered Transactions
router.get('/data/unregistered', async (req, res) => {
    try {
        const data = [];
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Operation Log
router.get('/data/operation-log', async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(`
            SELECT 
                dol.*, 
                d.device_name
            FROM device_operation_logs dol
            LEFT JOIN devices d ON dol.device_serial = d.serial_number
            ORDER BY dol.log_time DESC 
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Error Log
router.get('/data/error-log', async (req, res) => {
    try {
        const db = require('../db');
        const result = await db.query(`
            SELECT 
                del.*, 
                d.device_name
            FROM device_error_logs del
            LEFT JOIN devices d ON del.device_serial = d.serial_number
            ORDER BY del.log_time DESC 
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload Log
router.get('/data/upload-log', async (req, res) => {
    try {
        const data = [];
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Device Messages (placeholder - can be extended later)
router.get('/messages', async (req, res) => {
    try {
        const db = require('../db');
        // Check if device_messages table exists
        const tableCheck = await db.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'device_messages'
            )
        `);
        
        if (tableCheck.rows[0].exists) {
            const result = await db.query(`
                SELECT dm.*, d.device_name
                FROM device_messages dm
                LEFT JOIN devices d ON dm.device_serial = d.serial_number
                ORDER BY dm.created_at DESC
                LIMIT 100
            `);
            res.json(result.rows);
        } else {
            // Return empty array if table doesn't exist
            res.json([]);
        }
    } catch (err) {
        console.error('Error fetching device messages:', err);
        // Return empty array on error instead of 500
        res.json([]);
    }
});

router.post('/messages', async (req, res) => {
    try {
        const db = require('../db');
        const { device_serial, message } = req.body;
        
        // Check if table exists
        const tableCheck = await db.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'device_messages'
            )
        `);
        
        if (!tableCheck.rows[0].exists) {
            return res.status(500).json({ error: 'device_messages table does not exist' });
        }
        
        const result = await db.query(`
            INSERT INTO device_messages (device_serial, message)
            VALUES ($1, $2)
            RETURNING *
        `, [device_serial, message]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating device message:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
