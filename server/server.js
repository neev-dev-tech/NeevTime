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
// Cached typed reader for app_settings. Note the distinction from the
// settingsRouter mounted further down: this is the value reader, that is the
// HTTP surface.
const settings = require('./utils/settings');

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
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean) : ['http://localhost:5173', 'http://localhost:3000'];
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

// Role enforcement for every mutating /api call, mounted before any route is
// registered. Central on purpose: a guard that must be remembered on each new
// endpoint eventually is not. Position matters as much as the logic — mounted
// lower down it silently missed the attendance routes declared above it, which
// is exactly the class of bug it exists to prevent. Reads pass through; writes
// are denied unless the role allows them. See utils/rbac.js.
app.use('/api', require('./utils/rbac').enforceRole);

// Attendance Processing API
app.use((req, res, next) => {
    // Skip logging high-volume static assets if any, or health checks usually
    if (!req.url.includes('/iclock/')) {
        logger.info(`[API] ${req.method} ${req.url}`);
    }
    next();
});

// Company name and logo for the sign-in page, which renders before anyone has
// a token. Mounted HERE, above every `app.use('/api', authenticateToken, ...)`
// below — those apply to every /api path whichever router matches, so further
// down this would 401 and the sign-in page would silently fall back to the
// default mark.
//
// Deliberately narrow: two fields that are meant to be looked at. It exposes
// nothing an unauthenticated visitor could not already see by loading the page.
app.get('/api/branding', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT setting_key, setting_value FROM app_settings
             WHERE category = 'company'
               AND setting_key IN ('company_name', 'company_logo', 'theme_preset', 'theme_custom_colors')`
        );
        const cfg = Object.fromEntries(result.rows.map(r => [r.setting_key, r.setting_value]));

        // The colour scheme is served alongside the logo because it is the same
        // kind of thing: how the company's install looks. It used to live only
        // in each browser's localStorage, so uploading a logo changed the app
        // for everyone while changing the palette changed it for one machine —
        // and the same account on a second laptop showed different colours.
        let custom = null;
        if (cfg.theme_custom_colors) {
            // Stored as JSON text. A malformed value must not take branding
            // down with it — falling back to the preset is a fine answer.
            try { custom = JSON.parse(cfg.theme_custom_colors); } catch { custom = null; }
        }

        res.json({
            name: cfg.company_name || 'NeevTime',
            logo: cfg.company_logo || '',
            theme_preset: cfg.theme_preset || null,
            theme_custom_colors: custom
        });
    } catch (err) {
        // Branding must never block sign-in. Defaults are a fine answer.
        res.json({ name: 'NeevTime', logo: '', theme_preset: null, theme_custom_colors: null });
    }
});

const attendanceEngine = require('./services/attendance_engine');
// Auth middleware needed for the early-registered attendance routes below
const { router: authRouter, authenticateToken } = require('./routes/auth');

// Attendance Processing API
app.post('/api/attendance/process', authenticateToken, async (req, res) => {
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
/**
 * Which optional columns and tables this database actually has.
 *
 * The pieces the register needs are spread across six schema files
 * (schema.sql, schema_easytime.sql, schema_leaves.sql, schema_expansion.sql
 * and friends), and a deployment that has not applied all of them is missing
 * some of the columns below. Referencing one that does not exist fails the
 * whole statement, which is how the register query took the dashboard down to
 * zeroes on a database that never ran schema_easytime.sql.
 *
 * Probed once and cached: this cannot change without a restart.
 */
let registerSchemaPromise = null;
const getRegisterSchema = () => {
    if (!registerSchemaPromise) {
        registerSchemaPromise = (async () => {
            const [cols, summaryCols, tables] = await Promise.all([
                db.query(`SELECT column_name FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'employees'`),
                db.query(`SELECT column_name FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'attendance_daily_summary'`),
                db.query(`SELECT table_name FROM information_schema.tables
                          WHERE table_schema = 'public'
                            AND table_name IN ('holidays', 'leave_applications')`)
            ]);
            const has = new Set(cols.rows.map(r => r.column_name));
            const summaryHas = new Set(summaryCols.rows.map(r => r.column_name));
            const tbl = new Set(tables.rows.map(r => r.table_name));
            const joinCols = ['joining_date', 'date_of_joining', 'join_date'].filter(c => has.has(c));
            // The summary table varies between deployments too — one of them
            // has no early_leave_minutes, which failed the register outright.
            // Absent columns are selected as NULL so the shape the client
            // destructures stays the same whatever the database is missing.
            const OPTIONAL_SUMMARY = [
                'id', 'in_time', 'out_time', 'duration_minutes',
                'late_minutes', 'early_leave_minutes', 'overtime_minutes',
                'remarks', 'is_finalized'
            ];
            return {
                attendanceRequired: has.has('attendance_required'),
                joinDateExpr: joinCols.length
                    ? `COALESCE(${joinCols.map(c => `e.${c}`).join(', ')})`
                    : null,
                holidays: tbl.has('holidays'),
                leaves: tbl.has('leave_applications'),
                summarySelect: OPTIONAL_SUMMARY
                    .map(c => (summaryHas.has(c) ? `ads.${c}` : `NULL AS ${c}`))
                    .join(',\n                    ')
            };
        })().catch(() => ({
            // A failed probe must not take the endpoint with it — fall back to
            // the plainest query that works on any schema.
            attendanceRequired: false, joinDateExpr: null, holidays: false, leaves: false,
            summarySelect: 'ads.id'
        }));
    }
    return registerSchemaPromise;
};

app.get('/api/attendance/summary', authenticateToken, async (req, res) => {
    try {
        const { date, employee_code } = req.query;
        const schema = await getRegisterSchema();

        // For a single day, drive the query from the employee list rather than
        // from the summary table.
        //
        // Only people who punched get a summary row, so an absentee had no row
        // at all: the Attendance Register showed "Absent 0" on a day 29 people
        // were missing, and its status filter offered only "Present" because
        // that was the only status any returned row carried. A register that
        // silently omits everyone who did not turn up is the opposite of what
        // it is for.
        //
        // The non-attendance statuses are derived in the same order of
        // precedence the absent report uses, so the two agree: an approved
        // leave is leave, a listed holiday is a holiday, the weekend is a
        // weekly off, and what remains is a genuine absence.
        // Each optional clause is included only where the database has what it
        // needs. A missing leave table means leave is simply not distinguished
        // from absence — a worse answer than the full query gives, but a far
        // better one than a 500.
        if (date && !employee_code) {
            const onLeaveWhen = schema.leaves
                ? `WHEN EXISTS (
                       SELECT 1 FROM leave_applications la
                       WHERE la.employee_code = e.employee_code
                         AND LOWER(la.status) = 'approved'
                         AND $1::date BETWEEN la.from_date AND la.to_date
                   ) THEN 'On Leave'`
                : '';
            const holidayWhen = schema.holidays
                ? `WHEN EXISTS (SELECT 1 FROM holidays h WHERE h.date = $1::date) THEN 'Holiday'`
                : '';
            const requiredClause = schema.attendanceRequired
                ? 'AND e.attendance_required IS NOT FALSE'
                : '';
            const joinedClause = schema.joinDateExpr
                ? `AND (${schema.joinDateExpr} IS NULL OR $1::date >= ${schema.joinDateExpr})`
                : '';

            const result = await db.query(`
                SELECT
                    e.employee_code, $1::date AS date,
                    ${schema.summarySelect},
                    COALESCE(
                        ads.status,
                        CASE
                            ${onLeaveWhen}
                            ${holidayWhen}
                            WHEN EXTRACT(DOW FROM $1::date) IN (0, 6) THEN 'Weekly Off'
                            ELSE 'Absent'
                        END
                    ) AS status,
                    e.name, d.name as department
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN attendance_daily_summary ads
                       ON ads.employee_code = e.employee_code AND ads.date = $1::date
                WHERE e.status = 'active'
                  ${requiredClause}
                  ${joinedClause}
                ORDER BY e.name ASC
            `, [date]);
            return res.json(result.rows);
        }

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
app.get('/api/reports/first-last', authenticateToken, async (req, res) => {
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
app.post('/api/attendance/manual', authenticateToken, async (req, res) => {
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
            INSERT INTO attendance_daily_summary (employee_code, date, in_time, out_time, duration_minutes, status, remarks, is_finalized)
            VALUES ($1, $2, $3, $4, $5, 'Present', $6, true)
            ON CONFLICT (employee_code, date) DO UPDATE SET
                in_time = EXCLUDED.in_time,
                out_time = EXCLUDED.out_time,
                duration_minutes = EXCLUDED.duration_minutes,
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks,
                -- Marks the row as hand-corrected so a later recompute from raw
                -- punches cannot silently overwrite it
                is_finalized = true
            RETURNING *
        `, [employee_code, date, in_time, out_time, durationMinutes, `Manual Entry: ${reason}`]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware
// Same origin policy as Socket.IO: env-driven allowlist. Disallowed origins are
// soft-failed (no CORS headers, browser blocks the response) rather than
// erroring, so same-origin and dev-proxy requests keep working. No-origin
// requests (ADMS devices, curl, mobile apps) are always allowed.
app.use(cors({
    origin: (origin, callback) => {
        const allowed = !origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*');
        callback(null, allowed);
    },
    credentials: true
}));
app.use(bodyParser.json());
// ADMS devices send raw text often
app.use(bodyParser.text({ type: 'text/*' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Auth Routes (authRouter/authenticateToken already required above)
const orgRouter = require('./routes/organization');
const personnelRouter = require('./routes/personnel_expansion');
const schedulingRouter = require('./routes/scheduling');
const leavesRouter = require('./routes/leaves');
const approvalRouter = require('./routes/approval');
const settingsRouter = require('./routes/settings');
const schedulingExtRouter = require('./routes/scheduling_extended');

app.use('/api', authRouter);

// Liveness probe for the container healthcheck and load balancer. Must stay
// above the authenticateToken-wrapped routers below — their middleware runs
// for every /api/* path, which would 401 the probe and mark the app unhealthy.
app.get('/api/health', async (req, res) => {
    try {
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

// Audit trail for every mutating API call. Mounted here so it wraps res.json
// before any router runs; req.user is read at response time, by which point the
// route's own authenticateToken has populated it.
app.use('/api', require('./utils/systemLogger').auditMutations);


// Vendor-neutral punch intake. Authenticated by a per-device token rather than
// a user session, so it is mounted before the authenticateToken routers.
app.set('io', io);
app.use('/api/ingest', require('./routes/vendor_ingest'));

// Employee self-service portal — own auth realm, must mount before the
// authenticateToken-wrapped /api routers below (their middleware runs for
// every /api/* path, which would 401 the public portal login).
const portalRouter = require('./routes/portal');
app.use('/api/portal', portalRouter);
app.use('/api', authenticateToken, orgRouter);
app.use('/api', authenticateToken, personnelRouter);
app.use('/api', authenticateToken, schedulingRouter);
app.use('/api', authenticateToken, leavesRouter);
app.use('/api', authenticateToken, approvalRouter);
// Admin-only guard for system-level routers (user management is guarded inside auth.js)
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

app.use('/api/settings', authenticateToken, requireAdmin, settingsRouter);
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
app.use('/api/database', authenticateToken, requireAdmin, databaseRouter);

// System Logs Routes
const systemLogsRouter = require('./routes/system_logs');
app.use('/api/system-logs', authenticateToken, requireAdmin, systemLogsRouter);

// HRMS Integrations Routes
const integrationsRouter = require('./routes/integrations');
app.use('/api/hrms', authenticateToken, requireAdmin, integrationsRouter);

// Reports Routes
const reportsRouter = require('./routes/reports');
app.use('/api/reports', authenticateToken, reportsRouter);


// Mobile Attendance Routes (Phase 3)
const mobileAttendanceRouter = require('./routes/mobile_attendance');
// Mobile Entry records a punch for an arbitrary employee_id taken from the
// request body, so it can create attendance for anyone. That is the intended
// admin workflow, but it must not be available to ordinary accounts — and the
// /api audit middleware records who did it.
app.use('/api/mobile', authenticateToken, requireAdmin, mobileAttendanceRouter);

// Pending-work summary for the notification bell
app.get('/api/notifications/summary', authenticateToken, async (req, res) => {
    try {
        // A device awaiting approval is not a cosmetic notice. Once
        // require_device_approval is on, its punches are refused and — because
        // the reader is still ACKed so it clears its buffer — they are dropped,
        // not queued. Approving it later does not backfill them. Nothing in the
        // app surfaced this, so an unapproved reader looked exactly like a group
        // of people who simply never punched.
        const [leave, reg, offline, pendingDevices, enforcing, pushOff, alertsBroken] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS n FROM leave_applications WHERE LOWER(status) = 'pending'`),
            db.query(`SELECT COUNT(*)::int AS n FROM attendance_regularizations WHERE status = 'pending'`),
            db.query(`SELECT COUNT(*)::int AS n FROM devices WHERE status = 'offline'`),
            db.query(`SELECT COUNT(*)::int AS n FROM devices
                      WHERE approval_status = 'pending' AND status IS DISTINCT FROM 'retired'`),
            settings.get('security', 'require_device_approval', false),
            // An active HRMS integration with attendance push switched off is
            // silent by nature: punches keep arriving, reports keep working, and
            // nothing reaches payroll. It sat that way from 31 July to 4 August
            // and only surfaced when someone noticed records missing at the far
            // end. Surfacing it is the whole fix.
            // Guarded: hrms_integrations comes from the HRMS setup, not
            // schema.sql, so a deployment with no integration has no table —
            // and one missing optional table would 500 the whole bell,
            // hiding the leave and device counts that did load.
            db.query(`SELECT name FROM hrms_integrations
                      WHERE is_active IS TRUE AND sync_attendance IS NOT TRUE
                      ORDER BY name`)
                .catch(() => ({ rows: [] })),
            // Email is the only alert channel, so a broken SMTP would mean no
            // alerts at all and no sign of it — the exact silent-failure shape
            // alerting exists to prevent. Surface it in the app instead.
            db.query(`SELECT count(*)::int AS n FROM alert_state
                      WHERE resolved_at IS NULL AND last_error IS NOT NULL`)
                .catch(() => ({ rows: [{ n: 0 }] }))
        ]);
        res.json({
            pending_leave: leave.rows[0].n,
            pending_regularizations: reg.rows[0].n,
            devices_offline: offline.rows[0].n,
            devices_pending_approval: pendingDevices.rows[0].n,
            // Names, not just a count — "InnopayHR is not pushing attendance"
            // is actionable in a way that "1 integration" is not.
            attendance_push_disabled: pushOff.rows.map(r => r.name),
            alerts_undeliverable: alertsBroken.rows[0].n,
            // Lets the client say whether those devices are merely waiting or
            // are actively losing punches right now.
            device_approval_enforced: enforcing === true || enforcing === 'true'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Attendance regularization review (admin/HR)
const regularizationsRouter = require('./routes/regularizations');
app.use('/api/regularizations', authenticateToken, regularizationsRouter);

// Admin sets/resets an employee's portal password
const bcryptPortal = require('bcryptjs');
app.put('/api/employees/:id/portal-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const hash = await bcryptPortal.hash(password, 10);
        const result = await db.query(
            'UPDATE employees SET portal_password_hash = $1, app_login_enabled = true WHERE id = $2 RETURNING id, employee_code',
            [hash, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json({ success: true, employee_code: result.rows[0].employee_code });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ADMS Routes =================
// These are called by the biometric devices
// Support both standard and .aspx paths (common in some firmwares)
const admsPaths = ['/iclock/cdata', '/iclock/cdata.aspx'];

app.get(admsPaths, (req, res) => adms.handleHandshake(req, res, io));
app.post(admsPaths, (req, res) => adms.handleAttendanceLogs(req, res, io));
app.get(['/iclock/getrequest', '/iclock/getrequest.aspx'], adms.handleGetRequest);
app.post(['/iclock/devicecmd', '/iclock/devicecmd.aspx'], (req, res) => res.send('OK'));

// ================= API Routes ==================

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
// Bulk App Access — must register before /api/employees/:id or the
// param route swallows it (id="app-access" -> int cast 500)
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

/**
 * Partial employee update. PUT above rewrites the whole row, so bulk toggles
 * (disable attendance, rehire) need a patch that touches only what it is given.
 * Columns are whitelisted — the body must never choose which column to write.
 */
const PATCHABLE_EMPLOYEE_FIELDS = new Set([
    'attendance_required', 'status', 'app_access', 'app_login_enabled',
    'overtime_allowed', 'geo_fencing', 'selfie_punch', 'outdoor_mng',
    'department_id', 'area_id', 'position_id', 'default_shift_id',
    'designation', 'employment_type', 'exclude_from_hrms'
]);

app.patch('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const entries = Object.entries(req.body || {})
            .filter(([key]) => PATCHABLE_EMPLOYEE_FIELDS.has(key));

        if (entries.length === 0) {
            return res.status(400).json({
                error: 'No patchable fields supplied',
                allowed: [...PATCHABLE_EMPLOYEE_FIELDS]
            });
        }

        const sets = entries.map(([key], i) => `${key} = $${i + 1}`);
        const params = entries.map(([, value]) => value === '' ? null : value);
        params.push(id);

        const result = await db.query(
            `UPDATE employees SET ${sets.join(', ')}, updated_at = NOW()
             WHERE id = $${params.length} RETURNING *`,
            params
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('PATCH /api/employees/:id failed:', err.message);
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
                    // The ADMS keyword is USERINFO. This said USER, which every
                    // reader rejects with Return=-1004 — 12 attempts, 0 accepted,
                    // against 9,385 successful DATA DELETE FACE commands. So no
                    // employee deleted through this endpoint was ever removed from
                    // the readers: the record vanished from the app while the
                    // finger kept opening the door.
                    //
                    // Templates go first. Deleting the user record on a device
                    // does not always take its enrolled biometrics with it.
                    const cmds = [
                        `DATA DELETE FINGERTMP PIN=${code}`,
                        `DATA DELETE FACE PIN=${code}`,
                        `DATA DELETE USERINFO PIN=${code}`
                    ];
                    for (const dev of devices.rows) {
                        if (dev.serial_number) {
                            for (const cmd of cmds) {
                                await client.query(
                                    `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                                    [dev.serial_number, cmd]
                                );
                            }
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
            -- Retired devices stay in the table so their attendance history keeps
            -- a valid owner, but they are not part of the active fleet.
            WHERE d.status IS DISTINCT FROM 'retired'
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

        // ip_address originates from unauthenticated ADMS device reports —
        // strict format check before it goes anywhere near a shell
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            return res.status(400).json({ error: 'Device IP address is not a valid IPv4 address' });
        }

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
// Column names come from the request body, so they must be strictly validated
// before being interpolated into SQL.
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const assertSafeColumns = (keys) => {
    for (const key of keys) {
        if (!SAFE_IDENTIFIER.test(key)) {
            const err = new Error(`Invalid column name: ${key}`);
            err.statusCode = 400;
            throw err;
        }
    }
};

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
            assertSafeColumns(keys);
            const values = Object.values(req.body);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
            const result = await db.query(query, values);
            res.json(result.rows[0]);
        } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
    });

    // PUT
    app.put(`/api/${path}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            const keys = Object.keys(req.body).filter(k => k !== 'id'); // Exclude id from body if present
            assertSafeColumns(keys);
            const values = keys.map(k => req.body[k]);
            const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

            if (keys.length === 0) return res.json({ message: 'No changes' });

            const query = `UPDATE ${table} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;
            const result = await db.query(query, [...values, id]);
            res.json(result.rows[0]);
        } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
    });

    // DELETE
    app.delete(`/api/${path}/:id`, async (req, res) => {
        try {
            await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};

// routes/organization.js mounts first and owns /api/departments, /api/areas and
// /api/positions. It has no PUT /departments/:id, so this generic CRUD is kept
// solely to supply that one handler — its GET/POST/DELETE never match.
// 'areas' and 'positions' are omitted: organization.js covers all four verbs for
// both, so registering them here would only create unreachable duplicates.
createCrudRoutes('departments', 'departments');


/**
 * Retire a device.
 *
 * This used to DELETE the device's attendance_logs, which destroyed every punch
 * ever collected through that reader — including punches already used for
 * closed payroll — with no way back. Removing a decommissioned reader must not
 * rewrite attendance history, so the device row is marked retired and its logs
 * are left untouched. Pending commands are cleared, since a retired device will
 * never execute them.
 */
// Devices seen for the first time register as pending. Approving one is what
// makes its punches trusted when require_device_approval is enabled.
app.post('/api/devices/:serial/approve', requireAdmin, async (req, res) => {
    try {
        const { setApproval } = require('./services/device_registry');
        const updated = await setApproval(req.params.serial, req.body?.approved !== false);
        if (!updated) return res.status(404).json({ error: 'Device not found' });
        res.json({ success: true, ...updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Issue (or rotate) the token a non-ADMS device uses to POST punches to
 * /api/ingest/punch. Returned once — it is stored for comparison, and there is
 * no endpoint that reads it back.
 */
app.post('/api/devices/:serial/ingest-token', requireAdmin, async (req, res) => {
    try {
        const token = require('node:crypto').randomBytes(32).toString('hex');
        const result = await db.query(
            'UPDATE devices SET ingest_token = $1 WHERE serial_number = $2 RETURNING serial_number',
            [token, req.params.serial]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

        res.json({
            success: true,
            serial_number: result.rows[0].serial_number,
            ingest_token: token,
            usage: 'Send as "Authorization: Bearer <token>" to POST /api/ingest/punch'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Register a device that does not speak ADMS, so it can be given a token.
 * ADMS devices self-register on first contact and never need this.
 */
app.post('/api/devices/external', requireAdmin, async (req, res) => {
    try {
        const { serial_number, vendor, device_model, area_id } = req.body || {};
        if (!serial_number) return res.status(400).json({ error: 'serial_number is required' });

        const result = await db.query(`
            INSERT INTO devices (serial_number, vendor, device_model, area_id, status, approval_status, first_seen_at, last_activity)
            VALUES ($1, $2, $3, $4, 'offline', 'approved', NOW(), NOW())
            ON CONFLICT (serial_number) DO UPDATE
            SET vendor = EXCLUDED.vendor, device_model = COALESCE(EXCLUDED.device_model, devices.device_model)
            RETURNING serial_number, vendor, approval_status
        `, [serial_number, vendor || 'webhook', device_model || null, area_id || null]);

        res.json({ success: true, device: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/devices/:serial', async (req, res) => {
    const { serial } = req.params;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT serial_number FROM devices WHERE serial_number = $1',
            [serial]
        );
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Device not found' });
        }

        // Queued commands are meaningless once the device is retired
        await client.query('DELETE FROM device_commands WHERE device_serial = $1', [serial]);

        const logCount = await client.query(
            'SELECT COUNT(*)::int AS count FROM attendance_logs WHERE device_serial = $1',
            [serial]
        );

        await client.query(
            `UPDATE devices SET status = 'retired', retired_at = NOW() WHERE serial_number = $1`,
            [serial]
        );

        await client.query('COMMIT');

        res.json({
            message: 'Device retired. Its attendance history has been preserved.',
            preserved_logs: logCount.rows[0].count
        });
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

/**
 * Columns the app needs that predate this deployment's schema. Idempotent, so
 * it is safe to run on every boot and needs no migration tooling.
 */
const ensureSchema = async () => {
    const statements = [
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP`,
        // Not everyone with biometric access belongs in the HR system. Facility
        // and security contractors are enrolled here for door access only, and
        // pushing their punches to ERPNext just produces rejections that retry
        // forever. Defaults to false, so existing staff are unaffected.
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS exclude_from_hrms BOOLEAN DEFAULT false`,
        // The employee's shift, written by the HRMS pull and read by the
        // late/early report. Present on this deployment but created by none of
        // the schema files, so a fresh install would fail the employee upsert.
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS default_shift_id INTEGER`,
        // Populated from the HRMS Shift Type. Same reasoning: the report reads
        // them, so a database without them measures everyone against the
        // caller's fallback instead of their own shift.
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS code VARCHAR(50)`,
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS grace_in_minutes INTEGER DEFAULT 0`,
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS grace_out_minutes INTEGER DEFAULT 0`,
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT false`,
        `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
        // The upsert key. Without it every sync either duplicates every shift
        // or fails outright on ON CONFLICT.
        //
        // Not partial. `WHERE code IS NOT NULL` looks like the careful choice
        // and is the wrong one: Postgres will not match a plain
        // `ON CONFLICT (code)` against a partial index, so every shift upsert
        // failed in production with "there is no unique or exclusion constraint
        // matching the ON CONFLICT specification" while passing here, where the
        // table already carried a full UNIQUE constraint. The predicate buys
        // nothing either — Postgres already permits duplicate NULLs in a unique
        // index, so rows without a code never conflict.
        //
        // Dropped first, because CREATE INDEX IF NOT EXISTS keeps whatever
        // index already holds the name, partial included.
        `DROP INDEX IF EXISTS shifts_code_key`,
        `CREATE UNIQUE INDEX IF NOT EXISTS shifts_code_key ON shifts (code)`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP`,
        // Which family this reader belongs to. Installs that predate this column
        // already label their push-protocol devices 'ZKTeco' — eSSL readers speak
        // the same iclock protocol — so new registrations use that same value
        // rather than introducing a second name for the same thing.
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS vendor VARCHAR(30) DEFAULT 'ZKTeco'`,
        `UPDATE devices SET vendor = 'ZKTeco' WHERE vendor IS NULL`,
        // Devices already in the table were trusted before this existed, so they
        // stay approved; only serials seen for the first time arrive as pending.
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved'`,
        `UPDATE devices SET approval_status = 'approved' WHERE approval_status IS NULL`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP`,
        // Shared secret for webhook-based vendors; NULL for push-protocol devices
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ingest_token VARCHAR(64)`,
        // Marks a summary row as hand-corrected so a recompute leaves it alone
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT false`,
        // Why a row was corrected by hand. Manual Entry requires a reason and
        // regularisation approval carries the employee's, and both write it
        // here — but the column was never created, so every manual correction
        // and every approved regularisation failed with a 500. An attendance
        // override that does not record its justification is worth little at
        // payroll time anyway.
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS remarks TEXT`,
        // Avoids a failed INSERT and a retry on every document upload; the
        // route already falls back when this is absent.
        `ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS file_type VARCHAR(100)`,
        // Open/closed state for outbound alerts. Without somewhere to remember
        // what has already been reported, "one alert per issue" is impossible
        // and a reader that flaps overnight sends hundreds of mails — which is
        // how alerting stops being read at all.
        `CREATE TABLE IF NOT EXISTS alert_state (
            alert_key   VARCHAR(200) PRIMARY KEY,
            severity    VARCHAR(20),
            subject     TEXT,
            opened_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notified_at TIMESTAMP,
            resolved_at TIMESTAMP,
            occurrences INTEGER DEFAULT 1,
            last_error  TEXT
        )`,
        // Mobile punching and the Geofences page are both routed and both have
        // always failed: the geofences table was never created here, and
        // attendance_logs lacks the location columns the punch writes. The
        // migration that would have built them (scripts/migration_phase3_geofence.js)
        // was never run.
        //
        // Deliberately NO seed row. That script also inserts a 200m fence at MG
        // Road, Bangalore, and since no employee has an assigned fence, the punch
        // route falls back to matching *any* active one — so seeding it would let
        // anyone standing near that address mark themselves present. With the
        // table empty, every mobile punch is refused with a 403 until a real
        // location is configured, which is the correct default for this install.
        `CREATE TABLE IF NOT EXISTS geofences (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            latitude DECIMAL(10, 8) NOT NULL,
            longitude DECIMAL(11, 8) NOT NULL,
            radius_meters INTEGER DEFAULT 100,
            address TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS punch_source VARCHAR(50) DEFAULT 'biometric'`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS is_geofence_verified BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL`,
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS assigned_geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL`,
        // Sign-in matches usernames case-insensitively, because an account made
        // as "Mukesh" that cannot be signed into as "mukesh" just looks broken —
        // a missing user and a wrong password return the same message. That
        // lookup is only well defined if no two accounts differ solely by case,
        // which this index guarantees from here on.
        //
        // It will fail loudly on an install that already has such a pair. That
        // is the right outcome: the duplicate has to be renamed by a human who
        // knows which account is the real one. The loop below logs and continues,
        // so a clash cannot stop the server from booting.
        `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq ON users (lower(username))`,
        // The Attendance Rules page has never worked on this install. An early
        // key/value stub (setting_name / setting_value) claimed the
        // attendance_rules name, so the CREATE TABLE IF NOT EXISTS that would
        // have built the real one silently did nothing, and every read failed
        // with `column "rule_type" does not exist`.
        //
        // The stub is empty and nothing reads it — the attendance engine takes
        // its thresholds from app_settings — so the columns are added alongside
        // it rather than dropping and recreating the table. setting_name loses
        // its NOT NULL because new rows have no value for it.
        `ALTER TABLE attendance_rules ALTER COLUMN setting_name DROP NOT NULL`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS rule_type VARCHAR(50) NOT NULL DEFAULT 'global'`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id)`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS name VARCHAR(100)`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS late_threshold_minutes INTEGER DEFAULT 15`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS early_leave_threshold_minutes INTEGER DEFAULT 15`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS half_day_threshold_minutes INTEGER DEFAULT 240`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS absent_threshold_minutes INTEGER DEFAULT 480`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS overtime_enabled BOOLEAN DEFAULT false`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS overtime_threshold_minutes INTEGER DEFAULT 30`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS overtime_multiplier NUMERIC(3,1) DEFAULT 1.5`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 5`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS grace_late_allowed_per_month INTEGER DEFAULT 3`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS week_off_days TEXT[] DEFAULT ARRAY['sunday']`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS alternate_saturday BOOLEAN DEFAULT false`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS round_off_minutes INTEGER DEFAULT 15`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS minimum_punch_gap_minutes INTEGER DEFAULT 30`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    ];
    for (const sql of statements) {
        try {
            await db.query(sql);
        } catch (err) {
            console.error('Schema ensure failed:', sql, '-', err.message);
        }
    }

    // Settings the app reads but that predate this deployment's seed data
    const seeds = [
        ['database', 'backup_enabled', 'false', 'boolean', 'Take unattended backups on a schedule'],
        ['database', 'backup_frequency', 'daily', 'string', 'daily, weekly (Mondays) or monthly (1st)'],
        ['database', 'backup_time', '02:00', 'string', 'Server local time to run the backup'],
        ['database', 'backup_retention_count', '7', 'number', 'How many automatic backups to keep'],
        ['timezone', 'system_timezone', 'Asia/Kolkata', 'string',
            'Zone used to decide which day a punch belongs to and to measure shift start, lateness and overtime'],
        // Off by default so enabling it is a deliberate decision — turning it on
        // without approving your readers first would stop attendance collection.
        // Seeded on, with the address this install asked for. ON CONFLICT DO
        // NOTHING means these apply once, on first boot, and never overwrite a
        // later change made in Settings.
        ['alerts', 'enabled', 'true', 'boolean',
            'Send email when something needs attention. Nothing is sent while recipients is empty.'],
        ['alerts', 'recipients', 'it@innopay.in', 'string',
            'Comma-separated addresses. Alerts are dropped if this is empty.'],
        ['alerts', 'device_offline_minutes', '30', 'number',
            'Raise an alert when a reader has been silent this long'],
        ['alerts', 'digest_enabled', 'true', 'boolean',
            'Send a once-daily summary of collection and sync'],
        ['alerts', 'digest_time', '08:00', 'string',
            'Server local time to send the daily digest'],
        ['alerts', 'notify_config_changes', 'true', 'boolean',
            'Alert when integration or security settings are changed, and by whom'],
        ['security', 'require_device_approval', 'false', 'boolean',
            'Reject punches from devices that have not been approved in the Devices page'],
        // Seeded so the settings PUT has a row to update — that handler only
        // UPDATEs, so an unseeded key is written to silently and never stored.
        ['company', 'theme_preset', 'default', 'string',
            'Colour scheme for the whole company. Set in Settings > Appearance.'],
        ['company', 'theme_custom_colors', '', 'string',
            'JSON overriding the preset colours. Empty means the preset is used as-is.']
    ];
    for (const [category, key, value, type, description] of seeds) {
        try {
            await db.query(
                `INSERT INTO app_settings (category, setting_key, setting_value, data_type, description)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (category, setting_key) DO NOTHING`,
                [category, key, value, type, description]
            );
        } catch (err) {
            console.error('Settings seed failed:', key, '-', err.message);
        }
    }

    // Fill in descriptions on rows that predate them, without touching values
    try {
        await db.query(
            `UPDATE app_settings SET description = $1
             WHERE category = 'timezone' AND setting_key = 'system_timezone'
               AND (description IS NULL OR description = '')`,
            ['Zone used to decide which day a punch belongs to and to measure shift start, lateness and overtime']
        );
    } catch (err) {
        console.error('Settings description backfill failed:', err.message);
    }
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`ADMS Endpoint: http://0.0.0.0:${PORT}/iclock/cdata`);

    await ensureSchema();

    // Start HRMS scheduled sync (pushes attendance to ERPNext every 5 minutes)
    try {
        const hrmsIntegration = require('./services/hrms-integration');
        hrmsIntegration.startScheduledSync();
        console.log('HRMS Scheduled Sync: Started (every 5 minutes)');
    } catch (err) {
        console.log('HRMS Scheduled Sync: Not available -', err.message);
    }

    // Device command queue: retry failed commands + purge old ones
    try {
        const commandQueue = require('./services/command-queue');
        commandQueue.startRetryProcessor();
        commandQueue.startPurgeJob();
        console.log('Command Queue: retry processor + purge job started');
    } catch (err) {
        console.log('Command Queue jobs: Not available -', err.message);
    }

    // Give finished days a final verdict. The engine refuses to score a day
    // that is still running, and nothing ever came back to score it once it
    // ended — so the provisional "Present" became permanent for any day whose
    // last punch landed before midnight.
    try {
        require('./services/attendance_recompute').startRecomputeJob().catch(err =>
            console.log('Recompute job: startup failed -', err.message));
    } catch (err) {
        console.log('Recompute job: not available -', err.message);
    }

    // Outbound alerting. Health information already existed — health-monitor
    // emitted alerts to any dashboard that happened to be open — but nothing
    // ever left the building, which is how attendance sync stayed off for four
    // days in July without anyone knowing. Off until recipients are configured.
    try {
        // async now: it reads the digest time at startup so a restart after
        // the send hour does not fire one immediately. Nothing awaits it.
        require('./services/alert_checks').startAlertChecks().catch(err =>
            console.log('Alert checks: startup check failed -', err.message));
    } catch (err) {
        console.log('Alert checks: not available -', err.message);
    }

    // Device health monitor: pushes alerts to connected dashboards
    try {
        const healthMonitor = require('./services/health-monitor');
        healthMonitor.startHealthMonitor((alerts) => {
            io.emit('device_alerts', alerts);
        });
        console.log('Health Monitor: started (every 5 minutes)');
    } catch (err) {
        console.log('Health Monitor: Not available -', err.message);
    }

    // Scheduled reports: generate + email due reports
    try {
        const scheduledReports = require('./services/scheduled-reports');
        scheduledReports.startScheduler();
        // Pick up any Auto Reports settings saved while the server was down
        scheduledReports.syncFromSettings().catch(err => {
            console.error('Auto report sync failed:', err.message);
        });
        console.log('Scheduled Reports: scheduler started (checks every minute)');
    } catch (err) {
        console.log('Scheduled Reports: Not available -', err.message);
    }

    // Unattended database backups, driven by Settings → Database
    try {
        require('./routes/database').startAutoBackup();
        console.log('Auto Backup: scheduler started (checks every minute)');
    } catch (err) {
        console.log('Auto Backup: Not available -', err.message);
    }
});
