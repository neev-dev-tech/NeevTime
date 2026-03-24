process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const cors = require('cors');
const fs = require('node:fs');
const http = require('node:http');
const { Server } = require("socket.io");
const path = require('node:path');
const bodyParser = require('body-parser');
require('dotenv').config();

const db = require('./db');
const adms = require('./services/adms');

const logger = require('./utils/logger');

// Global Crash Logger
process.on('uncaughtException', (err) => {
    logger.error(`CRASH: ${err.message}\n${err.stack}`);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error(`UNHANDLED REJECTION: ${JSON.stringify(reason)}`);
});

const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'http://localhost:3000'];
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Middleware
// ================= ADMS DIRECT DISPATCHER =================
// Handle ADMS requests directly to avoid middleware conflicts
// const adms = require('./services/adms'); // Already imported
app.use(async (req, res, next) => {
    // Only intercept ADMS paths
    if (req.url.includes('/iclock/')) {
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
        logger.adms(`[ADMS REQ] ${req.method} ${req.url} from ${clientIP}`);

        // 1. Parse Raw Body
        let data = '';
        req.setEncoding('utf8');
        try {
            await new Promise((resolve, reject) => {
                req.on('data', chunk => data += chunk);
                req.on('end', resolve);
                req.on('error', reject);
            });

            req.rawBody = data;
            req.body = data; // Set body for ADMS service

            logger.adms(`[ADMS BODY] Length: ${data.length} | Payload: ${data.substring(0, 200)}...`); // Log snippet only to save space

            // 2. Dispatch to Service
            // Handle both .aspx and non-.aspx endpoints (devices may use either format)
            if (req.url.includes('cdata')) {
                if (req.method === 'GET') {
                    await adms.handleHandshake(req, res, io);
                } else {
                    await adms.handleAttendanceLogs(req, res, io);
                }
            } else if (req.url.includes('getrequest')) {
                // Handle both /iclock/getrequest and /iclock/getrequest.aspx
                await adms.handleGetRequest(req, res, io);
            } else if (req.url.includes('devicecmd')) {
                // Handle both /iclock/devicecmd and /iclock/devicecmd.aspx
                await adms.handleDeviceCmd(req, res);
            } else {
                // Unknown endpoint, but respond with OK to keep device happy
                logger.adms(`[ADMS DISPATCH] Unknown endpoint: ${req.url}, responding with OK`);
                res.send('OK');
            }
            // STOP chain here
            return;
        } catch (e) {
            logger.error(`[ADMS DISPATCH ERROR] ${e.message}`);
            res.status(500).send('ERROR');
            return;
        }
    }
    next();
});

app.use(express.json());

// Attendance Processing API
app.use((req, res, next) => {
    // Skip logging high-volume static assets if any, or health checks usually
    if (!req.url.includes('/iclock/')) {
        logger.info(`[API] ${req.method} ${req.url}`);
    }
    next();
});

const attendanceEngine = require('./services/attendance_engine');

// Attendance Processing API
app.post('/api/attendance/process', async (req, res) => {
    try {
        const { startDate, endDate, employeeId } = req.body;
        // Default to today if not provided
        const sDate = startDate || new Date().toISOString().split('T')[0];
        const eDate = endDate || sDate;

        const results = await attendanceEngine.processDateRange(sDate, eDate, employeeId);
        res.json({ success: true, processed: results.length, results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Attendance Summary (Processed)
app.get('/api/attendance/summary', async (req, res) => {
    try {
        const { date, employee_code } = req.query;
        let query = `
            SELECT ads.*, e.name, d.name as department
            FROM attendance_daily_summary ads
            JOIN employees e ON ads.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
        `;
        const params = [];
        const conditions = [];

        if (date) {
            conditions.push(`ads.date = $${params.length + 1}`);
            params.push(date);
        }
        if (employee_code) {
            conditions.push(`ads.employee_code = $${params.length + 1}`);
            params.push(employee_code);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY ads.date DESC, e.name ASC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reports - First & Last
app.get('/api/reports/first-last', async (req, res) => {
    try {
        const { startDate, endDate, employeeId, firstName } = req.query;
        let query = `
            SELECT 
                e.employee_code, 
                e.name as first_name, 
                '' as last_name, 
                d.name as department, 
                to_char(ads.date, 'YYYY-MM-DD') as date, 
                to_char(ads.date, 'Day') as weekday, 
                to_char(ads.in_time, 'HH24:MI') as first_punch, 
                to_char(ads.out_time, 'HH24:MI') as last_punch, 
                CASE 
                    WHEN ads.duration_minutes IS NULL THEN '0:00'
                    ELSE CONCAT(FLOOR(ads.duration_minutes / 60), ':', LPAD((ads.duration_minutes % 60)::text, 2, '0'))
                END as total_time
            FROM attendance_daily_summary ads
            JOIN employees e ON ads.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            params.push(startDate);
            query += ` AND ads.date >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND ads.date <= $${params.length}`;
        }
        if (employeeId) {
            params.push(employeeId);
            query += ` AND e.employee_code = $${params.length}`;
        }
        if (firstName) {
            params.push(`%${firstName}%`);
            query += ` AND e.name ILIKE $${params.length}`;
        }

        query += ' ORDER BY ads.date DESC, e.name ASC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Manual Attendance Entry
app.post('/api/attendance/manual', async (req, res) => {
    try {
        const { employee_code, date, in_time, out_time, reason } = req.body;
        if (!employee_code || !date || !in_time || !out_time || !reason) {
            return res.status(400).json({ error: 'All fields required' });
        }

        // Calculate duration
        const inDate = new Date(in_time);
        const outDate = new Date(out_time);
        const durationMinutes = Math.round((outDate - inDate) / 60000);

        // Insert or update attendance_daily_summary
        const result = await db.query(`
            INSERT INTO attendance_daily_summary (employee_code, date, in_time, out_time, duration_minutes, status, remarks)
            VALUES ($1, $2, $3, $4, $5, 'Present', $6)
            ON CONFLICT (employee_code, date) DO UPDATE SET
                in_time = EXCLUDED.in_time,
                out_time = EXCLUDED.out_time,
                duration_minutes = EXCLUDED.duration_minutes,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks
            RETURNING *
        `, [employee_code, date, in_time, out_time, durationMinutes, `Manual Entry: ${reason}`]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
// ADMS devices send raw text often
app.use(bodyParser.text({ type: 'text/*' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Auth Routes
const { router: authRouter, authenticateToken } = require('./routes/auth');
const orgRouter = require('./routes/organization');
const personnelRouter = require('./routes/personnel_expansion');
const schedulingRouter = require('./routes/scheduling');
const leavesRouter = require('./routes/leaves');
const approvalRouter = require('./routes/approval');
const settingsRouter = require('./routes/settings');
const schedulingExtRouter = require('./routes/scheduling_extended');

app.use('/api', authRouter);
app.use('/api', authenticateToken, orgRouter);
app.use('/api', authenticateToken, personnelRouter);
app.use('/api', authenticateToken, schedulingRouter);
app.use('/api', authenticateToken, leavesRouter);
app.use('/api', authenticateToken, approvalRouter);
app.use('/api/settings', authenticateToken, settingsRouter);
app.use('/api', authenticateToken, schedulingExtRouter);
const deviceSyncRouter = require('./routes/device_sync');
const deviceDataRouter = require('./routes/device_data');
app.use('/api/devices', authenticateToken, deviceSyncRouter);
app.use('/api/devices', authenticateToken, deviceDataRouter);

// Device Messages endpoint (alias for compatibility)
app.get('/api/device-messages', authenticateToken, async (req, res) => {
    try {
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

app.post('/api/device-messages', authenticateToken, async (req, res) => {
    try {
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
const databaseRouter = require('./routes/database');
app.use('/api/database', authenticateToken, databaseRouter);

// System Logs Routes
const systemLogsRouter = require('./routes/system_logs');
app.use('/api/system-logs', authenticateToken, systemLogsRouter);

// HRMS Integrations Routes
const integrationsRouter = require('./routes/integrations');
app.use('/api/hrms', authenticateToken, integrationsRouter);

// Reports Routes
const reportsRouter = require('./routes/reports');
app.use('/api/reports', authenticateToken, reportsRouter);


// Mobile Attendance Routes (Phase 3)
const mobileAttendanceRouter = require('./routes/mobile_attendance');
app.use('/api/mobile', authenticateToken, mobileAttendanceRouter);

// ================= ADMS Routes =================
// These are called by the biometric devices
// Support both standard and .aspx paths (common in some firmwares)
const admsPaths = ['/iclock/cdata', '/iclock/cdata.aspx'];

app.get(admsPaths, (req, res) => adms.handleHandshake(req, res, io));
app.post(admsPaths, (req, res) => adms.handleAttendanceLogs(req, res, io));
app.get(['/iclock/getrequest', '/iclock/getrequest.aspx'], adms.handleGetRequest);
app.post(['/iclock/devicecmd', '/iclock/devicecmd.aspx'], (req, res) => res.send('OK'));

// ================= API Routes ==================

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        await db.query('SELECT 1');
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            uptime: process.uptime()
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: err.message
        });
    }
});

// Get Dashboard Stats
app.get('/api/stats', async (req, res) => {
    try {
                const [totalEmp, devicesOnline, recentLogs, todayStats] = await Promise.all([
            db.query('SELECT COUNT(*) FROM employees'),
            db.query("SELECT COUNT(*) FROM devices WHERE status = 'online'"),
            db.query(`
                SELECT al.*, e.name as emp_name, d.name as dept_name 
                FROM attendance_logs al
                LEFT JOIN employees e ON al.employee_code = e.employee_code
                LEFT JOIN departments d ON e.department_id = d.id
                ORDER BY al.punch_time DESC LIMIT 10
            `),
            db.query(`
                SELECT 
                    COUNT(DISTINCT employee_code) as present_count
                FROM attendance_logs 
                WHERE DATE(punch_time) = CURRENT_DATE
            `)
        ]);

        res.json({
            employees: Number.parseInt(totalEmp.rows[0].count),
            devices_online: Number.parseInt(devicesOnline.rows[0].count),
            present_today: Number.parseInt(todayStats.rows[0].present_count),
            recent_logs: recentLogs.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Get Database Stats for Database Tools page
app.get('/api/stats/database', async (req, res) => {
    try {
        const [employees, departments, devices, logs, holidays] = await Promise.all([
            db.query('SELECT COUNT(*) FROM employees'),
            db.query('SELECT COUNT(*) FROM departments'),
            db.query('SELECT COUNT(*) FROM devices'),
            db.query('SELECT COUNT(*) FROM attendance_logs'),
            db.query('SELECT COUNT(*) FROM holidays').catch(() => ({ rows: [{ count: 0 }] }))
        ]);

        res.json({
            total_employees: Number.parseInt(employees.rows[0].count),
            total_departments: Number.parseInt(departments.rows[0].count),
            total_devices: Number.parseInt(devices.rows[0].count),
            total_attendance_logs: Number.parseInt(logs.rows[0].count),
            total_holidays: Number.parseInt(holidays.rows[0].count),
            database_size: 'N/A',
            last_backup: null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Logs
app.get('/api/logs', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const result = await db.query(`
            SELECT al.*, e.name as emp_name 
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            ORDER BY al.punch_time DESC LIMIT $1
        `, [limit]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new employee
app.post('/api/employees', async (req, res) => {
    try {
        const {
            employee_code, name, department_id, designation, card_number, password, area_id,
            gender, dob, joining_date, mobile, email, address, status, employment_type
        } = req.body;

        // Convert empty strings to null for integer and date fields
        const safeInt = (val) => (val === '' || val === null || val === undefined) ? null : parseInt(val);
        const safeDate = (val) => (val === '' || val === null || val === undefined) ? null : val;

        const result = await db.query(`
      INSERT INTO employees 
      (employee_code, name, department_id, designation, card_number, password, area_id, gender, dob, joining_date, mobile, email, address, status, employment_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
            employee_code, name, safeInt(department_id), designation, card_number, password, safeInt(area_id),
            gender, safeDate(dob), safeDate(joining_date), mobile, email, address, status || 'active', employment_type
        ]);

        res.status(201).json(result.rows[0]);

        // Sync to Devices
        try {
            const devices = await db.query('SELECT serial_number FROM devices');
            for (const dev of devices.rows) {
                const cmd = `DATA UPDATE USERINFO PIN=${employee_code}\tName=${name}\tPri=${req.body.privilege || 0}\tPasswd=${password || ''}\tCard=${card_number || ''}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`, [dev.serial_number, cmd]);
            }
        } catch (syncErr) {
            console.error('Auto-sync failed:', syncErr);
            // Don't fail the request, just log it
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Update Employee
app.put('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            employee_code, name, department_id, designation, card_number, password, area_id,
            gender, dob, joining_date, mobile, email, address, status, employment_type
        } = req.body;

        // Convert empty strings to null for integer and date fields
        const safeInt = (val) => (val === '' || val === null || val === undefined) ? null : parseInt(val);
        const safeDate = (val) => (val === '' || val === null || val === undefined) ? null : val;

        const result = await db.query(`
            UPDATE employees SET
            employee_code = $1, name = $2, department_id = $3, designation = $4, card_number = $5, 
            password = $6, area_id = $7, gender = $8, dob = $9, joining_date = $10, 
            mobile = $11, email = $12, address = $13, status = $14, employment_type = $15
            WHERE id = $16
            RETURNING *
        `, [
            employee_code, name, safeInt(department_id), designation, card_number, password, safeInt(area_id),
            gender, safeDate(dob), safeDate(joining_date), mobile, email, address, status, employment_type, id
        ]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json(result.rows[0]);

        // Sync to Devices
        try {
            const devices = await db.query('SELECT serial_number FROM devices');
            for (const dev of devices.rows) {
                const cmd = `DATA UPDATE USERINFO PIN=${employee_code}\tName=${name}\tPri=${req.body.privilege || 0}\tPasswd=${password || ''}\tCard=${card_number || ''}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`, [dev.serial_number, cmd]);
            }
        } catch (syncErr) {
            console.error('Auto-sync failed:', syncErr);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk Import Employees
app.post('/api/employees/import', async (req, res) => {
    const client = await db.getClient();
    try {
        const { employees } = req.body; // Array of objects
        if (!employees || !Array.isArray(employees)) return res.status(400).json({ error: 'Data required' });

        await client.query('BEGIN');

        let count = 0;
        for (const emp of employees) {
            // Simplified import: checks code, if exists updates, else inserts.
            await client.query(`
                INSERT INTO employees (employee_code, name, department_id, designation, card_number, password, privilege, area_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (employee_code) DO NOTHING
            `, [
                emp.employee_code,
                emp.name,
                emp.department_id || null,
                emp.designation || '',
                emp.card_number || '',
                emp.password || '',
                emp.privilege || 0,
                emp.area_id || null
            ]);
            count++;
        }

        await client.query('COMMIT');
        res.json({ success: true, count });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Bulk App Access
app.put('/api/employees/app-access', async (req, res) => {
    try {
        const { ids, enabled } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids required' });

        await db.query(`
            UPDATE employees SET app_login_enabled = $1 WHERE id = ANY($2)
        `, [enabled, ids]);

        res.json({ success: true, count: ids.length, enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete employees (bulk or single)
// Delete employees (bulk or single)
app.delete('/api/employees', async (req, res) => {
    try {
        // Support body { ids: [] } OR query ?ids=1,2,3
        let ids = req.body.ids;
        if (!ids && req.query.ids) {
            ids = req.query.ids.split(',').map(Number);
        }

        if (!ids || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }

        // 1. Get Employee Codes (needed for logs and device commands)
        const emps = await db.query('SELECT employee_code FROM employees WHERE id = ANY($1)', [ids]);
        const employeeCodes = emps.rows.map(e => e.employee_code);

        if (employeeCodes.length === 0) {
            return res.json({ success: true, count: 0, message: 'No employees found to delete' });
        }

        // 2. Perform DB Deletion (Transaction)
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Delete Attendance Logs first (No Cascade)
            try {
                await client.query('DELETE FROM attendance_logs WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Attendance logs deleted');
            } catch (e) {
                console.log('[DELETE] attendance_logs error:', e.message);
            }

            // Delete Attendance Summary (if exists)
            try {
                await client.query('DELETE FROM attendance_daily_summary WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Attendance summary deleted');
            } catch (e) {
                console.log('[DELETE] attendance_daily_summary error:', e.message);
            }

            // Delete Leave Applications (if exists)
            try {
                await client.query('DELETE FROM leave_applications WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Leave applications deleted');
            } catch (e) {
                console.log('[DELETE] leave_applications error:', e.message);
            }

            // Delete Biometric Templates
            try {
                await client.query('DELETE FROM biometric_templates WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Biometric templates deleted');
            } catch (e) {
                console.log('[DELETE] biometric_templates error:', e.message);
            }

            // Delete Leave Balances (if exists)
            try {
                await client.query('DELETE FROM leave_balances WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Leave balances deleted');
            } catch (e) {
                console.log('[DELETE] leave_balances error:', e.message);
            }

            // Delete Employee Docs (if exists)
            try {
                await client.query('DELETE FROM employee_docs WHERE employee_code = ANY($1)', [employeeCodes]);
                console.log('[DELETE] Employee docs deleted');
            } catch (e) {
                console.log('[DELETE] employee_docs error:', e.message);
            }

            // Delete Employees
            await client.query('DELETE FROM employees WHERE id = ANY($1)', [ids]);
            console.log('[DELETE] Employees deleted:', ids);

            // Queue Device Deletion Commands
            try {
                const devices = await client.query('SELECT serial_number FROM devices WHERE serial_number IS NOT NULL AND serial_number != \'\'');
                for (const code of employeeCodes) {
                    const cmd = `DATA DELETE USER PIN=${code}`;
                    for (const dev of devices.rows) {
                        if (dev.serial_number) {
                            await client.query(
                                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                                [dev.serial_number, cmd]
                            );
                        }
                    }
                }
                console.log('[DELETE] Device commands queued');
            } catch (e) {
                console.log('[DELETE] device_commands error:', e.message);
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, count: ids.length, message: 'Deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Mobile App Access Toggle
app.post('/api/mobile-app-access', async (req, res) => {
    try {
        const { employee_ids, access } = req.body;
        if (!employee_ids || !Array.isArray(employee_ids)) {
            return res.status(400).json({ error: 'Invalid employee IDs' });
        }

        await db.query(`
            UPDATE employees 
            SET app_access = $1 
            WHERE id = ANY($2)
        `, [access, employee_ids]);

        res.json({
            success: true,
            message: `App access ${access ? 'enabled' : 'disabled'} for ${employee_ids.length} employees`
        });
    } catch (err) {
        console.error('App Access Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Employees
app.get('/api/employees', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                e.*,
                d.name as department_name,
                a.name as area_name,
                e.designation as position_code -- Using designation as code for now
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN areas a ON e.area_id = a.id
            ORDER BY e.name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('API Employees Error:', err);
        const fs = require('fs');
        fs.appendFileSync('debug_error.log', `[${new Date().toISOString()}] /api/employees Error: ${err.message}\n${err.stack}\n`);
        res.status(500).json({ error: err.message });
    }
});

// Get Single Employee by ID or employee_code
app.get('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Try to find by numeric ID first, then by employee_code
        let result;
        if (!isNaN(id)) {
            result = await db.query(`
                SELECT e.*, d.name as department_name, a.name as area_name
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN areas a ON e.area_id = a.id
                WHERE e.id = $1
            `, [id]);
        }
        if (!result || result.rows.length === 0) {
            result = await db.query(`
                SELECT e.*, d.name as department_name, a.name as area_name
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN areas a ON e.area_id = a.id
                WHERE e.employee_code = $1
            `, [id]);
        }
        if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Devices (with capabilities and counts)
app.get('/api/devices', async (req, res) => {
    try {
        // First get system-wide biometric stats (universal for all devices)
        const bioStatsResult = await db.query(`
            SELECT 
                COUNT(DISTINCT employee_code) as user_count,
                COUNT(CASE WHEN template_type IN (1, 2) THEN 1 END) as fingerprint_count,
                COUNT(CASE WHEN template_type = 9 THEN 1 END) as face_count
            FROM biometric_templates
        `);
        const bioStats = bioStatsResult.rows[0] || { user_count: 0, fingerprint_count: 0, face_count: 0 };

        const result = await db.query(`
            SELECT 
                d.*, 
                a.name as area_name,
                dc.device_model as detected_model,
                dc.firmware_version as detected_firmware,
                dc.face_supported,
                dc.face_major_ver,
                dc.face_minor_ver,
                dc.finger_supported,
                dc.palm_supported,
                dc.card_supported,
                COALESCE(log_stats.transaction_count, 0) as transaction_count
            FROM devices d 
            LEFT JOIN areas a ON d.area_id = a.id 
            LEFT JOIN device_capabilities dc ON d.serial_number = dc.device_serial
            LEFT JOIN (
                SELECT 
                    device_serial,
                    COUNT(*) as transaction_count
                FROM attendance_logs
                GROUP BY device_serial
            ) log_stats ON d.serial_number = log_stats.device_serial
            ORDER BY d.last_activity DESC
        `);

        // Add universal biometric counts to each device and calculate real-time status
        const devicesWithStats = result.rows.map(device => {
            // Calculate online status based on last_activity (offline if > 5 minutes ago)
            const lastActivity = device.last_activity ? new Date(device.last_activity) : null;
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const isOnline = lastActivity && lastActivity > fiveMinutesAgo;

            return {
                ...device,
                status: isOnline ? 'online' : 'offline',
                user_count: parseInt(bioStats.user_count) || 0,
                fingerprint_count: parseInt(bioStats.fingerprint_count) || 0,
                face_count: parseInt(bioStats.face_count) || 0
            };
        });

        res.json(devicesWithStats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Detailed Device Info (all device information including capabilities)
app.get('/api/devices/:serial/info', async (req, res) => {
    try {
        const { serial } = req.params;

        // Get device basic info
        const deviceResult = await db.query(`
            SELECT 
                d.*,
                a.name as area_name
            FROM devices d
            LEFT JOIN areas a ON d.area_id = a.id
            WHERE d.serial_number = $1
        `, [serial]);

        if (deviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        const device = deviceResult.rows[0];

        // Get device capabilities
        const capsResult = await db.query(`
            SELECT * FROM device_capabilities WHERE device_serial = $1
        `, [serial]);

        const capabilities = capsResult.rows.length > 0 ? capsResult.rows[0] : null;

        // Get device counts (users, fingerprints, faces on device)
        const countsResult = await db.query(`
            SELECT 
                COUNT(DISTINCT bt.employee_code) as user_count,
                COUNT(CASE WHEN bt.template_type = 1 OR bt.template_type = 2 THEN 1 END) as fingerprint_count,
                COUNT(CASE WHEN bt.template_type = 9 THEN 1 END) as face_count
            FROM biometric_templates bt
            WHERE bt.source_device = $1
        `, [serial]);

        const counts = countsResult.rows[0];

        // Get pending commands count
        const pendingResult = await db.query(`
            SELECT COUNT(*) as pending_commands FROM device_commands 
            WHERE device_serial = $1 AND status = 'pending'
        `, [serial]);

        // Combine all info
        const deviceInfo = {
            // Basic Info
            serial_number: device.serial_number,
            device_name: device.device_name,
            ip_address: device.ip_address,
            port: device.port,
            status: device.status,
            last_activity: device.last_activity,
            created_at: device.created_at,

            // Model & Firmware (auto-detected or from capabilities)
            device_model: device.device_model || capabilities?.device_model || 'Unknown',
            firmware_version: device.firmware_version || capabilities?.firmware_version || 'Unknown',
            vendor: capabilities?.vendor || 'ZKTeco',
            platform: device.platform || 'ADMS',
            mac_address: device.mac_address || null,

            // Biometric Capabilities
            biometrics: {
                face_supported: capabilities?.face_supported ?? true,
                face_algorithm: capabilities?.face_major_ver ? `v${capabilities.face_major_ver}.${capabilities.face_minor_ver}` : 'Unknown',
                face_major_ver: capabilities?.face_major_ver || 0,
                face_minor_ver: capabilities?.face_minor_ver || 0,
                finger_supported: capabilities?.finger_supported ?? true,
                palm_supported: capabilities?.palm_supported ?? false,
                card_supported: capabilities?.card_supported ?? true
            },

            // Counts
            counts: {
                users: parseInt(counts.user_count) || 0,
                fingerprints: parseInt(counts.fingerprint_count) || 0,
                faces: parseInt(counts.face_count) || 0,
                pending_commands: parseInt(pendingResult.rows[0].pending_commands) || 0
            },

            // Capacities (if known)
            capacities: {
                user_capacity: capabilities?.user_capacity || device.user_capacity || 0,
                fingerprint_capacity: capabilities?.finger_capacity || device.fp_capacity || 0,
                face_capacity: capabilities?.face_capacity || device.face_capacity || 0,
                log_capacity: capabilities?.log_capacity || device.log_capacity || 0
            },

            // Configuration
            configuration: {
                area_id: device.area_id,
                area_name: device.area_name,
                device_direction: device.device_direction,
                transfer_mode: device.transfer_mode,
                timezone: device.timezone,
                connection_interval: device.connection_interval,
                is_registration_device: device.is_registration_device,
                is_attendance_device: device.is_attendance_device,
                enable_access_control: device.enable_access_control
            },

            // Raw capabilities data
            raw_info: capabilities?.raw_info || null,
            capabilities_detected_at: capabilities?.detected_at || null
        };

        res.json(deviceInfo);
    } catch (err) {
        console.error('Get Device Info Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Add Device
app.post('/api/devices', async (req, res) => {
    const {
        serial_number, device_name, ip_address, port, area_id,
        transfer_mode, timezone, is_registration_device, is_attendance_device,
        connection_interval, device_direction, enable_access_control
    } = req.body;
    try {
        // When adding a device, set it to 'online' initially with current timestamp
        // The device will be marked offline by heartbeat checker if it doesn't communicate
        // This gives devices a chance to connect and avoids the "offline with 0m ago" issue
        const result = await db.query(
            `INSERT INTO devices (
                serial_number, device_name, ip_address, port, status, last_activity, area_id,
                transfer_mode, timezone, is_registration_device, is_attendance_device,
                connection_interval, device_direction, enable_access_control
            ) VALUES ($1, $2, $3, $4, 'online', NOW(), $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (serial_number) DO UPDATE SET 
                device_name = COALESCE($2, devices.device_name),
                ip_address = COALESCE($3, devices.ip_address),
                port = COALESCE($4, devices.port),
                area_id = COALESCE($5, devices.area_id),
                transfer_mode = COALESCE($6, devices.transfer_mode),
                timezone = COALESCE($7, devices.timezone),
                is_registration_device = COALESCE($8, devices.is_registration_device),
                is_attendance_device = COALESCE($9, devices.is_attendance_device),
                connection_interval = COALESCE($10, devices.connection_interval),
                device_direction = COALESCE($11, devices.device_direction),
                enable_access_control = COALESCE($12, devices.enable_access_control),
                status = 'online',
                last_activity = NOW()
             RETURNING *`,
            [serial_number, device_name, ip_address, port || 4370, area_id || null,
                transfer_mode || 'realtime', timezone || 'Etc/GMT+5:30',
                is_registration_device ?? true, is_attendance_device ?? true,
                connection_interval || 10, device_direction || 'both', enable_access_control ?? false]
        );

        // Emit socket event to notify frontend that device is online
        io.emit('device_status', { serial: serial_number, status: 'online' });

        // Auto-sync users to newly added device
        try {
            const employees = await db.query("SELECT * FROM employees WHERE status = 'active'");
            let syncCount = 0;
            for (const emp of employees.rows) {
                const pin = emp.employee_code;
                const name = (emp.name || '').replace(/\t/g, ' ');
                const pri = emp.privilege || 0;
                const passwd = emp.password || '';
                const card = emp.card_number || '';

                // Include Face=1 and FPCount=1 to enable biometric recognition
                const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${pri}\tPasswd=${passwd}\tCard=${card}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                await db.query(
                    `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                    [serial_number, cmd]
                );
                syncCount++;
            }
            console.log(`[AUTO-SYNC] Queued ${syncCount} users for newly added device ${serial_number}`);
        } catch (syncErr) {
            console.error('[AUTO-SYNC] Failed to sync users to new device:', syncErr);
            // Don't fail the request, just log it
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Device
app.put('/api/devices/:serial', async (req, res) => {
    const { serial } = req.params;
    const {
        device_name, ip_address, port, area_id,
        transfer_mode, timezone, is_registration_device, is_attendance_device,
        connection_interval, device_direction, enable_access_control
    } = req.body;
    try {
        const result = await db.query(
            `UPDATE devices SET 
                device_name = COALESCE($1, device_name),
                ip_address = COALESCE($2, ip_address),
                port = COALESCE($3, port),
                area_id = $4,
                transfer_mode = COALESCE($5, transfer_mode),
                timezone = COALESCE($6, timezone),
                is_registration_device = COALESCE($7, is_registration_device),
                is_attendance_device = COALESCE($8, is_attendance_device),
                connection_interval = COALESCE($9, connection_interval),
                device_direction = COALESCE($10, device_direction),
                enable_access_control = COALESCE($11, enable_access_control)
             WHERE serial_number = $12 RETURNING *`,
            [device_name, ip_address, port, area_id || null,
                transfer_mode, timezone, is_registration_device, is_attendance_device,
                connection_interval, device_direction, enable_access_control, serial]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Force Device Online (for manual connection)
app.post('/api/devices/:serial/force-online', async (req, res) => {
    const { serial } = req.params;
    try {
        const result = await db.query(
            `UPDATE devices SET status = 'online', last_activity = NOW() WHERE serial_number = $1 RETURNING *`,
            [serial]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        // Emit socket event to notify frontend
        io.emit('device_status', { serial, status: 'online' });

        // Auto-sync users to this device when it comes online
        try {
            const employees = await db.query("SELECT * FROM employees WHERE status = 'active'");
            let syncCount = 0;
            for (const emp of employees.rows) {
                const pin = emp.employee_code;
                const name = (emp.name || '').replace(/\t/g, ' ');
                const pri = emp.privilege || 0;
                const passwd = emp.password || '';
                const card = emp.card_number || '';

                // Use minimal USERINFO format (no Grp/TZ/Verify - these cause failures)
                // Format matches successful commands: PIN Name Pri Passwd Card
                const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${pri}\tPasswd=${passwd}\tCard=${card}`;
                await db.query(
                    `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                    [serial, cmd]
                );
                syncCount++;
            }
            console.log(`[AUTO-SYNC] Queued ${syncCount} users for device ${serial}`);
        } catch (syncErr) {
            console.error('[AUTO-SYNC] Failed to sync users:', syncErr);
            // Don't fail the request, just log it
        }

        res.json({
            success: true,
            message: 'Device marked as online and users queued for sync',
            device: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test Device Connection (Ping)
app.post('/api/devices/:serial/test-connection', async (req, res) => {
    const { serial } = req.params;
    try {
        const result = await db.query('SELECT ip_address FROM devices WHERE serial_number = $1', [serial]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

        const ip = result.rows[0].ip_address;
        if (!ip) return res.status(400).json({ error: 'Device has no IP address' });

        const { exec } = require('child_process');
        // Ping 3 times, 1s timeout
        const command = process.platform === 'win32'
            ? `ping -n 3 -w 1000 ${ip}`
            : `ping -c 3 -t 3 ${ip}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                return res.json({
                    success: false,
                    message: 'Device Unreachable',
                    details: 'Ping failed. Check if device is on the same network and WiFi is connected.',
                    output: stdout || stderr
                });
            }
            res.json({
                success: true,
                message: 'Device Reachable',
                details: 'Network connection is successful.',
                output: stdout
            });
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper for Generic CRUD
const createCrudRoutes = (table, path) => {
    // GET
    app.get(`/api/${path}`, async (req, res) => {
        try {
            const result = await db.query(`SELECT * FROM ${table} ORDER BY id DESC`);
            res.json(result.rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST
    app.post(`/api/${path}`, async (req, res) => {
        try {
            const keys = Object.keys(req.body);
            const values = Object.values(req.body);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
            const result = await db.query(query, values);
            res.json(result.rows[0]);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // PUT
    app.put(`/api/${path}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            const keys = Object.keys(req.body).filter(k => k !== 'id'); // Exclude id from body if present
            const values = keys.map(k => req.body[k]);
            const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

            if (keys.length === 0) return res.json({ message: 'No changes' });

            const query = `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
            const result = await db.query(query, [...values, id]);
            res.json(result.rows[0]);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // DELETE
    app.delete(`/api/${path}/:id`, async (req, res) => {
        try {
            await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};

createCrudRoutes('departments', 'departments');
createCrudRoutes('areas', 'areas');
createCrudRoutes('positions', 'positions'); // Assuming table is positions


// Delete Device
app.delete('/api/devices/:serial', async (req, res) => {
    const { serial } = req.params;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Delete related commands first
        await client.query('DELETE FROM device_commands WHERE device_serial = $1', [serial]);

        // Delete related attendance logs
        await client.query('DELETE FROM attendance_logs WHERE device_serial = $1', [serial]);

        // Delete the device
        const result = await client.query('DELETE FROM devices WHERE serial_number = $1', [serial]);

        await client.query('COMMIT');

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json({ message: 'Device deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete Device Error:', err);
        // Check for specific FK error
        if (err.code === '23503') {
            res.status(400).json({ error: 'Cannot delete device: It has related data (logs/commands) that cannot be automatically removed.' });
        } else {
            res.status(500).json({ error: err.message });
        }
    } finally {
        client.release();
    }
});

// Get Device Commands
app.get('/api/device-commands', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM device_commands ORDER BY created_at DESC LIMIT 100'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Device Command
app.post('/api/device-commands', async (req, res) => {
    const { device_serial, command, status } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO device_commands (device_serial, command, status)
             VALUES ($1, $2, $3) RETURNING *`,
            [device_serial, command, status || 'pending']
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Socket Connection
io.on('connection', (socket) => {
    console.log('Frontend connected');
});

// ================= DEVICE HEARTBEAT CHECKER =================
// Mark devices as offline if no activity for 15 minutes (increased for devices that don't poll frequently)
// Some devices only send POST requests (OPERLOG/ATTLOG) when there's activity, not regular GET heartbeats
// So we use a longer timeout to accommodate devices that communicate less frequently
const DEVICE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const checkDeviceHeartbeats = async () => {
    try {
        // Find devices that haven't communicated in 15 minutes
        // Only mark as offline if they're currently online (don't override force-online immediately)
        const result = await db.query(`
            UPDATE devices 
            SET status = 'offline' 
            WHERE status = 'online' 
            AND last_activity < NOW() - INTERVAL '15 minutes'
            RETURNING serial_number
        `);

        if (result.rows.length > 0) {
            console.log(`[HEARTBEAT] Marked ${result.rows.length} device(s) as offline`);
            // Notify frontend about each device going offline
            result.rows.forEach(device => {
                io.emit('device_status', { serial: device.serial_number, status: 'offline' });
            });
        }
    } catch (err) {
        console.error('[HEARTBEAT] Error checking device status:', err.message);
    }
};

// Run heartbeat check every 30 seconds
setInterval(checkDeviceHeartbeats, 30 * 1000);

// Run once at startup after a short delay
setTimeout(checkDeviceHeartbeats, 5000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`ADMS Endpoint: http://0.0.0.0:${PORT}/iclock/cdata`);

    // Start HRMS scheduled sync (pushes attendance to ERPNext every 5 minutes)
    try {
        const hrmsIntegration = require('./services/hrms-integration');
        hrmsIntegration.startScheduledSync();
        console.log('HRMS Scheduled Sync: Started (every 5 minutes)');
    } catch (err) {
        console.log('HRMS Scheduled Sync: Not available -', err.message);
    }
});
