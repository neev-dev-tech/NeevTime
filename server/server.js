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
    // Reflective on purpose — allowRequest below is the gate.
    //
    // This block used to carry its own allowlist, with none of the same-origin
    // logic allowRequest has. engine.io consults CORS on the HTTP phase of the
    // websocket upgrade BEFORE allowRequest is ever called, so the fix below
    // never ran: the browser's upgrade carries an Origin header, the allowlist
    // refused it, and every upgrade died as a 400 with nothing logged. That is
    // the "websocket falls back to polling" fault that survived five rounds of
    // nginx debugging — it was never nginx, and it was not allowRequest either.
    // Two doors, and only one of them had been unlocked.
    //
    // Reflecting the Origin in CORS headers admits nothing by itself: the
    // handshake is still refused by allowRequest unless the request is
    // same-origin or allowlisted, and without a handshake there is no session
    // id to speak with.
    cors: { origin: true, methods: ["GET", "POST"], credentials: true },
    transports: ['websocket', 'polling'],
    allowEIO3: true,

    // Same origin is always allowed, whatever ALLOWED_ORIGINS says.
    //
    // Without this the application refused its own front end. ALLOWED_ORIGINS
    // is not set by docker-compose.yml, so the list defaulted to two developer
    // URLs — http://localhost:5173 and :3000 — and a deployment served from
    // https://192.168.1.237 matched neither.
    //
    // The symptom was baffling until the access log split it apart:
    //
    //   GET  /socket.io/?...&sid=X   200   (same-origin GET sends no Origin)
    //   POST /socket.io/?...&sid=X   400   (engine.io's POST does send one)
    //   GET  /socket.io/?...websocket 400  (the upgrade sends one too)
    //
    // So handshakes succeeded, reads succeeded, and every write was rejected.
    // socket.io retried forever, the live monitor never worked, and the console
    // filled with failures that looked like a proxy fault. It is not: nginx
    // forwards these correctly and node answers a raw handshake with 101.
    //
    // A page served from this host talking back to this host needs no
    // permission. ALLOWED_ORIGINS remains for genuinely cross-origin clients,
    // such as a separate front end or the vite dev server.
    allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        try {
            // Host, not hostname: a different port is a different origin.
            if (new URL(origin).host === req.headers.host) return callback(null, true);
        } catch { /* an unparseable Origin is not same-origin */ }

        // Refusals name both sides of the comparison. Three separate rounds of
        // debugging this check have started from "the websocket returns 400"
        // with nothing in any log saying why; each round rediscovered the same
        // two headers by instrumenting a production container. The reason is
        // one line when it is written down.
        console.warn(`[socket.io] refused: Origin ${origin} vs Host ${req.headers.host}`
            + ' — not same-origin and not in ALLOWED_ORIGINS');
        return callback('origin not allowed', false);
    }
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

// Attribute everything below to whoever is signed in, so the audit triggers can
// record it.
//
// req.user is not populated this early — each router runs its own
// authenticateToken later. rbac.js hit the same trap and notes that depending on
// req.user there would silently let every write through; here it would silently
// attribute every change to nobody. It reads the payload enforceRole has already
// verified, which is why this is mounted immediately after it.
app.use('/api', (req, res, next) => {
    const actor = req.user?.id ?? req.tokenPayload?.id ?? null;
    require('./db').withActor(actor, () => next());
});

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
                WHERE LOWER(e.status) = 'active'
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
app.use('/api', require('./routes/audit'));

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
// Contractors: the companies whose people work here and who invoice for it.
// Headcount and hours per agency is commercial information, so it sits behind
// the same guard as the rest.
//
// Mounted HERE, with the other authenticated routers, and not beside the audit
// route above. `app.use('/api', authenticateToken, ...)` applies that middleware
// to EVERY /api request that reaches it — not only this router's paths — so
// higher up it made /api/health return 401 and every container healthcheck
// failed. The CI stack job caught it; nothing in the unit tests could.
app.use('/api', authenticateToken, require('./routes/contractors'));
// Department approvers. Mounted here for the same reason as contractors above:
// `app.use('/api', authenticateToken, ...)` guards every /api request that
// reaches it, so anything above /api/health takes the healthcheck down with it.
app.use('/api', authenticateToken, require('./routes/approvers'));
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

/**
 * Issue activation codes so employees can set their own passwords.
 *
 * Two delivery routes, because half a factory has no mailbox:
 *
 *   - an employee with an address gets the code by email, and the code is not
 *     returned to the administrator at all;
 *   - an employee without one has the code returned ONCE, to be handed over on
 *     paper.
 *
 * Only the hash is stored either way. An administrator who issues a code cannot
 * read it back tomorrow, and a stolen database yields no working codes.
 *
 * This does not set a password. That is the difference between this and the
 * route below it: after this, the only person who knows the password is the
 * employee, which is what makes their punches evidence.
 */
app.post('/api/employees/portal-invite', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { employee_ids, send_email = true } = req.body || {};
        if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
            return res.status(400).json({ error: 'employee_ids is required' });
        }
        const ids = employee_ids.map(Number).filter(Number.isInteger);
        if (ids.length === 0) return res.status(400).json({ error: 'No valid employee ids' });

        const people = await db.query(
            `SELECT id, employee_code, name,
                    COALESCE(NULLIF(directory_email, ''), NULLIF(email, '')) AS address
               FROM employees
              WHERE id = ANY($1::int[]) AND (LOWER(status) IS DISTINCT FROM 'resigned')`,
            [ids]
        );

        const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // no O/0, no I/1
        const emailed = [];
        const handOut = [];
        const failed = [];

        for (const emp of people.rows) {
            const code = Array.from(cryptoNode.randomBytes(8),
                b => ALPHABET[b % ALPHABET.length]).join('');
            const hash = await bcryptPortal.hash(code, 10);
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await db.query(
                `UPDATE employees
                    SET portal_setup_hash = $1, portal_setup_expires = $2, app_login_enabled = true
                  WHERE id = $3`,
                [hash, expires, emp.id]
            );

            if (send_email && emp.address) {
                try {
                    await require('./services/email').sendEmail({
                        to: emp.address,
                        subject: 'NeevTime portal access',
                        html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                                <h2>Set your portal password</h2>
                                <p>Hello ${emp.name || emp.employee_code},</p>
                                <p>Your employee code is <b>${emp.employee_code}</b>. Use this
                                   activation code to choose your own password:</p>
                                <p style="font-size:24px;letter-spacing:4px;font-weight:bold;">${code}</p>
                                <p style="color:#666;font-size:12px;">It expires in 24 hours and can be
                                   used once. Nobody else, including HR, will know the password you set.</p>
                               </div>`,
                        text: `Your NeevTime activation code for ${emp.employee_code} is ${code}. Expires in 24 hours.`,
                    });
                    emailed.push({ employee_code: emp.employee_code, name: emp.name, sent_to: emp.address });
                    continue;
                } catch (err) {
                    // The code is already stored, so it still works — it just
                    // has to be handed over instead. Saying so beats a silent
                    // half-success.
                    failed.push({ employee_code: emp.employee_code, reason: err.message });
                }
            }
            handOut.push({ employee_code: emp.employee_code, name: emp.name, code, expires });
        }

        res.json({
            success: true,
            emailed,
            // Shown once. It is not stored in a readable form and cannot be
            // listed again — reissue instead.
            hand_out: handOut,
            email_failures: failed,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin sets/resets an employee's portal password
const bcryptPortal = require('bcryptjs');
const cryptoNode = require('crypto');
app.put('/api/employees/:id/portal-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const hash = await bcryptPortal.hash(password, 10);
        // Flagged as somebody else's password. It gets the employee to the
        // change screen and no further — a punch made under a credential an
        // administrator typed proves nothing about who made it.
        const result = await db.query(
            `UPDATE employees
                SET portal_password_hash = $1, app_login_enabled = true,
                    portal_must_change = true, portal_password_set_at = NOW()
              WHERE id = $2 RETURNING id, employee_code`,
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
            // Staff, not rows. This counted every employee record — resigned
            // people included, and the drivers, security and housekeeping who
            // are enrolled for door access and are not on the HRMS list.
            db.query(`SELECT COUNT(*) FROM employees
                       WHERE LOWER(status) = 'active'
                         AND attendance_required IS NOT FALSE`),
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

        // Both of these were hardcoded — 'N/A' and null — so the Backup page
        // read "DB SIZE N/A" and "LAST BACKUP Never" with eight backups listed
        // directly beneath it. A panel that always says Never is worse than one
        // that says nothing: it is the same failure as a punch count that was
        // always 100.
        const size = await db.query(
            'SELECT pg_size_pretty(pg_database_size(current_database())) AS size'
        ).catch(() => null);

        let lastBackup = null;
        try {
            const dir = path.join(__dirname, 'backups');
            const newest = fs.readdirSync(dir)
                .filter(f => /\.(sql|dump)$/.test(f))
                .map(f => fs.statSync(path.join(dir, f)).mtime)
                .sort((a, b) => b - a)[0];
            if (newest) lastBackup = newest.toISOString();
        } catch { /* no directory yet on a fresh install */ }

        res.json({
            total_employees: Number.parseInt(employees.rows[0].count),
            total_departments: Number.parseInt(departments.rows[0].count),
            total_devices: Number.parseInt(devices.rows[0].count),
            total_attendance_logs: Number.parseInt(logs.rows[0].count),
            total_holidays: Number.parseInt(holidays.rows[0].count),
            database_size: size?.rows[0]?.size || 'unknown',
            last_backup: lastBackup
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get Logs
/**
 * Punch log, newest first.
 *
 * `date` (or `from`/`to`) filters to a day. Without one this returns the newest
 * rows whatever their age, which is fine for a log viewer and was catastrophic
 * for the dashboard: it drove both the "Punches today" figure and the
 * "Real-Time Monitor", so five-month-old punches rendered as live traffic while
 * attendance collection was completely dead. See /api/logs/count.
 */
app.get('/api/logs', async (req, res) => {
    try {
        const { limit = 50, date, from, to } = req.query;

        const where = [];
        const params = [];
        if (date) {
            params.push(date);
            where.push(`al.punch_time >= $${params.length}::date
                        AND al.punch_time < $${params.length}::date + 1`);
        } else {
            if (from) { params.push(from); where.push(`al.punch_time >= $${params.length}::date`); }
            if (to) { params.push(to); where.push(`al.punch_time < $${params.length}::date + 1`); }
        }

        params.push(Math.min(Number(limit) || 50, 5000));

        const result = await db.query(`
            SELECT al.*, e.name as emp_name
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY al.punch_time DESC LIMIT $${params.length}
        `, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * How many punches were actually recorded on a day.
 *
 * A real COUNT(*), because the dashboard used to report the *length of the
 * fetched array* as "Punches today" — a query with LIMIT 100 and no date
 * filter. It therefore displayed exactly 100 every single day from the moment
 * the database held 100 punches, including the 145 consecutive days on which
 * not one punch was recorded. The number that should have screamed was
 * structurally incapable of changing.
 */
app.get('/api/logs/count', async (req, res) => {
    try {
        const date = req.query.date || null;
        const result = await db.query(`
            SELECT count(*)::int AS count
              FROM attendance_logs
             WHERE ($1::date IS NULL)
                OR (punch_time >= $1::date AND punch_time < $1::date + 1)
        `, [date]);
        res.json({ date, count: result.rows[0].count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add new employee
app.post('/api/employees', async (req, res) => {
    try {
        const {
            employee_code, name, department_id, designation, card_number, password, area_id,
            gender, dob, joining_date, mobile, email, address, status, employment_type,
            // Drivers, security, housekeeping and the co-located company's staff
            // hold biometric access without being on the HRMS list. Settable
            // when the record is made, so nobody has to notice afterwards that
            // a new starter is being counted and marked absent.
            attendance_required, exclude_from_hrms
        } = req.body;

        // Convert empty strings to null for integer and date fields
        const safeInt = (val) => (val === '' || val === null || val === undefined) ? null : parseInt(val);
        const safeDate = (val) => (val === '' || val === null || val === undefined) ? null : val;

        const result = await db.query(`
      INSERT INTO employees 
      (employee_code, name, department_id, designation, card_number, password, area_id, gender, dob, joining_date, mobile, email, address, status, employment_type, attendance_required, exclude_from_hrms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
            employee_code, name, safeInt(department_id), designation, card_number, password, safeInt(area_id),
            gender, safeDate(dob), safeDate(joining_date), mobile, email, address, status || 'active', employment_type,
            attendance_required === undefined ? true : Boolean(attendance_required),
            Boolean(exclude_from_hrms)
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
            gender, dob, joining_date, mobile, email, address, status, employment_type,
            attendance_required, exclude_from_hrms, directory_email, contractor_id,
            reporting_manager_id
        } = req.body;

        // Convert empty strings to null for integer and date fields
        const safeInt = (val) => (val === '' || val === null || val === undefined) ? null : parseInt(val);
        const safeDate = (val) => (val === '' || val === null || val === undefined) ? null : val;

        const result = await db.query(`
            UPDATE employees SET
            employee_code = $1, name = $2, department_id = $3, designation = $4, card_number = $5, 
            password = $6, area_id = $7, gender = $8, dob = $9, joining_date = $10, 
            mobile = $11, email = $12, address = $13, status = $14, employment_type = $15,
            -- COALESCE, not assignment. This route overwrites every field it
            -- names, and not every caller sends these two — without it, saving
            -- an unrelated edit would quietly switch a door-access employee
            -- back into the headcount.
            attendance_required = COALESCE($16, attendance_required),
            exclude_from_hrms = COALESCE($17, exclude_from_hrms),
            -- The address the company directory knows this person by, which is
            -- what single sign-on matches against. Lower-cased on the way in:
            -- directories are not case sensitive about it and a stored
            -- Name@company.com would never match a returned name@company.com.
            directory_email = COALESCE($18, directory_email),
            -- Which agency is billed for this person's hours. COALESCE, like
            -- the two above: this route writes every column it names, and a
            -- caller that does not send it would otherwise unbill somebody by
            -- saving an unrelated edit.
            contractor_id = COALESCE($19, contractor_id),
            -- Who approves this person's leave. COALESCE for the same reason as
            -- the columns above: an unrelated save must not quietly detach
            -- somebody from their manager and reroute their requests.
            reporting_manager_id = COALESCE($20, reporting_manager_id)
            WHERE id = $21
            RETURNING *
        `, [
            employee_code, name, safeInt(department_id), designation, card_number, password, safeInt(area_id),
            gender, safeDate(dob), safeDate(joining_date), mobile, email, address, status, employment_type,
            attendance_required === undefined ? null : Boolean(attendance_required),
            exclude_from_hrms === undefined ? null : Boolean(exclude_from_hrms),
            directory_email === undefined || directory_email === null
                ? null : String(directory_email).trim().toLowerCase() || null,
            contractor_id === undefined || contractor_id === '' ? null : Number(contractor_id) || null,
            reporting_manager_id === undefined || reporting_manager_id === ''
                ? null : Number(reporting_manager_id) || null,
            id
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

        const emps = await db.query('SELECT employee_code FROM employees WHERE id = ANY($1)', [ids]);
        const employeeCodes = emps.rows.map(e => e.employee_code);

        if (employeeCodes.length === 0) {
            return res.json({ success: true, count: 0, message: 'No employees found to delete' });
        }

        // Soft delete.
        //
        // This used to run DELETE against attendance_logs,
        // attendance_daily_summary, leave_applications, biometric_templates,
        // leave_balances, employee_docs and finally employees — every punch a
        // person had ever made, destroyed by one button on the Employees page,
        // with no undo and nothing written down. Attendance records are what
        // payroll is argued from; they are not the app's to throw away.
        //
        // The record moves to the Deleted view and keeps all of it.
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE employees
                    SET status = 'deleted', deleted_at = NOW(), attendance_required = FALSE
                  WHERE id = ANY($1)`,
                [ids]
            );
            // Access is still revoked. A removed employee should not be able to
            // open a door while the record waits in Deleted.
            await queueTemplateRemoval(client, employeeCodes);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        res.json({
            success: true,
            soft: true,
            count: employeeCodes.length,
            message: `${employeeCodes.length} employee(s) moved to Deleted. Attendance history is kept.`
        });
    } catch (err) {
        console.error('Bulk delete failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Put a deleted employee back. Biometrics need re-enrolling on the readers. */
app.post('/api/employees/restore', async (req, res) => {
    try {
        const ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No IDs provided' });
        }
        const result = await db.query(
            `UPDATE employees
                SET status = 'active', deleted_at = NULL
              WHERE id = ANY($1) AND LOWER(status) = 'deleted'
          RETURNING employee_code`,
            [ids]
        );
        res.json({
            success: true,
            count: result.rows.length,
            message: `${result.rows.length} employee(s) restored. Biometrics must be re-enrolled on the readers.`
        });
    } catch (err) {
        console.error('Restore failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Revoke a person's biometric access on every reader.
 *
 * Extracted so the single delete does the same thing the bulk delete does. The
 * keyword is USERINFO — it once said USER, which every reader rejects with
 * Return=-1004, so the record vanished from the app while the finger kept
 * opening the door. Templates go first: deleting a user record on a device does
 * not always take its enrolled biometrics with it.
 */
const queueTemplateRemoval = async (conn, employeeCodes) => {
    if (!employeeCodes || employeeCodes.length === 0) return;
    const devices = await conn.query(
        "SELECT serial_number FROM devices WHERE serial_number IS NOT NULL AND serial_number != ''"
    );
    for (const code of employeeCodes) {
        const cmds = [
            `DATA DELETE FINGERTMP PIN=${code}`,
            `DATA DELETE FACE PIN=${code}`,
            `DATA DELETE USERINFO PIN=${code}`
        ];
        for (const dev of devices.rows) {
            for (const cmd of cmds) {
                await conn.query(
                    `INSERT INTO device_commands (device_serial, command, status, sequence)
                     VALUES ($1, $2, 'pending', 1)`,
                    [dev.serial_number, cmd]
                );
            }
        }
    }
};

app.delete('/api/employees/:id', async (req, res) => {
    try {
        // Soft. The row and every punch, summary, leave application and
        // document belonging to it are kept; the employee moves to the Deleted
        // view and can be restored.
        const result = await db.query(
            `UPDATE employees
                SET status = 'deleted', deleted_at = NOW(), attendance_required = FALSE
              WHERE id = $1
          RETURNING employee_code`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });

        // Door access is still revoked — a removed employee should not open
        // doors while the record waits in Deleted. Re-enrolment is required if
        // they are restored.
        await queueTemplateRemoval(db, result.rows.map(r => r.employee_code));

        res.json({ success: true, soft: true });
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
        // Which population. Default is current staff: this endpoint used to
        // return everyone, so people who had resigned or been removed sat in
        // the Employees list and in every employee dropdown in the app.
        //   active   (default) — everyone except resigned and deleted
        //   resigned          — those who have left
        //   deleted           — removed, retained for restore
        //   all               — no filter, for reports that need history
        const VIEWS = {
            active: `WHERE LOWER(e.status) NOT IN ('resigned', 'deleted', 'terminated')`,
            resigned: `WHERE LOWER(e.status) IN ('resigned', 'terminated')`,
            deleted: `WHERE LOWER(e.status) = 'deleted'`,
            all: ''
        };
        // Falling back to the default on an unknown view is how this bug hides:
        // Resign.jsx asked for ?status=resigned, a parameter the server never
        // read, and silently got current staff instead — so the resigned list
        // was empty and nothing said why. An unrecognised view is an error.
        const requested = String(req.query.view || 'active');
        if (!(requested in VIEWS)) {
            return res.status(400).json({
                error: `Unknown view "${requested}"`,
                allowed: Object.keys(VIEWS)
            });
        }
        const where = VIEWS[requested];

        const result = await db.query(`
            SELECT 
                e.*,
                d.name as department_name,
                a.name as area_name,
                c.name as contractor_name,
                e.designation as position_code -- Using designation as code for now
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN areas a ON e.area_id = a.id
            LEFT JOIN contractors c ON c.id = e.contractor_id
            ${where}
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
                SELECT e.*, d.name as department_name, a.name as area_name,
                       c.name as contractor_name
                FROM employees e
                LEFT JOIN departments d ON e.department_id = d.id
                LEFT JOIN areas a ON e.area_id = a.id
                LEFT JOIN contractors c ON c.id = e.contractor_id
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
            const employees = await db.query("SELECT * FROM employees WHERE LOWER(status) = 'active'");
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
            const employees = await db.query("SELECT * FROM employees WHERE LOWER(status) = 'active'");
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
        // Which holiday list applies to this person. Written by the HRMS pull
        // and read by the absent report; present here but created by none of
        // the schema files, same as default_shift_id.
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_location_id INTEGER`,
        // Only schema_easytime.sql creates this, and the schema files are
        // history rather than a contract — the absent report already guards on
        // whether the column exists. The HRMS pull now writes it when someone
        // is retired, so it has to be guaranteed rather than hoped for.
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_required BOOLEAN DEFAULT TRUE`,
        // Deleting an employee used to destroy the row and every punch, summary,
        // leave application and document belonging to them. This records when
        // someone was removed instead, so the record and its history survive and
        // can be restored.
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`,
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
        // Drop only if it is the partial index this replaces, and only if no
        // constraint owns it. A plain DROP INDEX fails on every boot of a
        // database whose table carries a real UNIQUE constraint — the index
        // cannot be dropped without the constraint, and it does not need to be,
        // because a constraint-owned unique index is already the desired state.
        // That produced a permanent "Schema ensure failed" line on every start,
        // and a boot log with a standing error in it is a boot log nobody reads.
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
               FROM pg_class i
               JOIN pg_index ix ON ix.indexrelid = i.oid
              WHERE i.relname = 'shifts_code_key'
                AND ix.indpred IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
           ) THEN
             EXECUTE 'DROP INDEX shifts_code_key';
           END IF;
         END $$`,
        `CREATE UNIQUE INDEX IF NOT EXISTS shifts_code_key ON shifts (code)`,
        // Holidays belong to a list. ERPNext keeps one per location, and
        // without the link every office's holidays apply to everybody —
        // exempting staff from absence on a day their site was open.
        `ALTER TABLE holidays ADD COLUMN IF NOT EXISTS holiday_location_id INTEGER`,
        // Every column the holiday sync writes, added here rather than assumed.
        //
        // The sync failed on production with `column "type" of relation
        // "holidays" does not exist`, while passing here, because these are
        // created by 00_init_all.sql and that deployment's holidays table came
        // from somewhere else. The schema test cannot catch this: it proves
        // some schema file creates a column, not that this database ran that
        // file. Anything the code writes is added at boot, and the schema files
        // are treated as history rather than as a guarantee.
        `ALTER TABLE holidays ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'public'`,
        `ALTER TABLE holidays ADD COLUMN IF NOT EXISTS description TEXT`,
        `ALTER TABLE holidays ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT false`,
        `ALTER TABLE holiday_locations ADD COLUMN IF NOT EXISTS description TEXT`,
        // Leave. Every column the leave sync writes, added here rather than
        // assumed — the holidays table taught that lesson at the cost of a
        // deploy.
        // Widen anything the HRMS writes into that was sized for hand-entered
        // values. Frappe document names run to 140 characters, and these were
        // built for short local codes: leave_types.code was varchar(10), which
        // "Casual Leave" does not fit in, and shifts.code was varchar(20)
        // against a real shift named "Flexible Shift 1st Aug 2025".
        //
        // ADD COLUMN IF NOT EXISTS does not widen a column that already exists,
        // so this has to be its own statement. Guarded on the current length
        // because ALTER TYPE rewrites the table, and doing that on every boot
        // for no reason is how a restart turns into an outage on a big table.
        `DO $$
         DECLARE r RECORD;
         BEGIN
           FOR r IN
             SELECT table_name, column_name
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND data_type = 'character varying'
               AND character_maximum_length < 140
               AND (table_name, column_name) IN (
                     ('leave_types','code'), ('leave_types','name'),
                     ('shifts','code'), ('shifts','name'),
                     ('holidays','name'), ('holiday_locations','code'),
                     ('holiday_locations','name'), ('leave_applications','external_id'),
                     ('leave_applications','status')
                   )
           LOOP
             -- Each column in its own block. A column a view depends on cannot
             -- be widened without dropping the view first, and in a single
             -- block that one failure aborts every other widening with it —
             -- which is exactly what happened: one view on
             -- holiday_locations.name left leave_types.code at varchar(10),
             -- still too narrow for "Casual Leave".
             BEGIN
               EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE VARCHAR(140)', r.table_name, r.column_name);
             EXCEPTION WHEN OTHERS THEN
               RAISE NOTICE 'Could not widen %.%: %', r.table_name, r.column_name, SQLERRM;
             END;
           END LOOP;
         END $$`,
        `ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS code VARCHAR(140)`,
        `ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT true`,
        `ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
        // The type-level entitlement, pulled from ERPNext's max_leaves_allowed.
        // Without it every quota is zero and "Initialize Year" seeds a grid of
        // noughts.
        `ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS annual_quota NUMERIC DEFAULT 0`,
        // Per-employee entitlement, from ERPNext Leave Allocation.
        `ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS carry_forward_balance NUMERIC DEFAULT 0`,
        `ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS accrued NUMERIC DEFAULT 0`,
        // The upsert key. Allocations are re-read on every sync, and without it
        // each run would insert another row per employee per leave type.
        `CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_emp_type_year_key
             ON leave_balances (employee_code, leave_type_id, year)`,
        // Drop only if it is the partial index this replaces, and only if no
        // constraint owns it. A plain DROP INDEX fails on every boot of a
        // database whose table carries a real UNIQUE constraint — the index
        // cannot be dropped without the constraint, and it does not need to be,
        // because a constraint-owned unique index is already the desired state.
        // That produced a permanent "Schema ensure failed" line on every start,
        // and a boot log with a standing error in it is a boot log nobody reads.
        `DO $$
         BEGIN
           IF EXISTS (
             SELECT 1
               FROM pg_class i
               JOIN pg_index ix ON ix.indexrelid = i.oid
              WHERE i.relname = 'leave_types_code_key'
                AND ix.indpred IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.oid)
           ) THEN
             EXECUTE 'DROP INDEX leave_types_code_key';
           END IF;
         END $$`,
        `CREATE UNIQUE INDEX IF NOT EXISTS leave_types_code_key ON leave_types (code)`,
        // The HRMS's own identifier for the application, and the only stable
        // way to upsert one. Matching on employee and dates instead would
        // duplicate the moment someone edits a leave's dates in ERPNext, and
        // leave the old row behind still exempting them from absence.
        `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS external_id VARCHAR(140)`,
        `ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN DEFAULT false`,
        `DROP INDEX IF EXISTS leave_applications_external_id_key`,
        `CREATE UNIQUE INDEX IF NOT EXISTS leave_applications_external_id_key ON leave_applications (external_id)`,
        `ALTER TABLE holiday_locations ADD COLUMN IF NOT EXISTS code VARCHAR(140)`,
        `DROP INDEX IF EXISTS holiday_locations_code_key`,
        `CREATE UNIQUE INDEX IF NOT EXISTS holiday_locations_code_key ON holiday_locations (code)`,
        // COALESCE, not a plain pair: a holiday with no location has a NULL
        // there, and NULLs never conflict in a unique index, so the same
        // company-wide date would insert again on every sync. Folding NULL to 0
        // gives it a value to collide on.
        `DROP INDEX IF EXISTS holidays_location_date_key`,
        `CREATE UNIQUE INDEX IF NOT EXISTS holidays_location_date_key ON holidays (COALESCE(holiday_location_id, 0), date)`,
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
        // The reader's own configuration, which Add Device and Edit Device both
        // write in full and the Devices page renders. Same duplicate-definition
        // failure as ot_minutes and the attendance_logs columns: schema.sql
        // declared devices with all seven of these and 00_init_all.sql declared
        // it with none, both under CREATE TABLE IF NOT EXISTS, and sorted order
        // ran 00_init_all.sql first — so a fresh install got a devices table
        // that POST and PUT /api/devices cannot write to at all. Adding a reader
        // failed with `column "transfer_mode" of relation "devices" does not
        // exist`, which is the whole Devices page on a new customer's database.
        //
        // device_direction is the one with a quiet failure rather than a loud
        // one: services/integrations/erpnext.js reads it once per record while
        // pushing attendance, inside a per-record catch, so every checkin would
        // count as failed and nothing would reach ERPNext.
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS transfer_mode VARCHAR(50) DEFAULT 'realtime'`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Etc/GMT+5:30'`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_registration_device BOOLEAN DEFAULT TRUE`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_attendance_device BOOLEAN DEFAULT TRUE`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS connection_interval INTEGER DEFAULT 10`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_direction VARCHAR(20) DEFAULT 'both'`,
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS enable_access_control BOOLEAN DEFAULT FALSE`,
        // The parent an area hangs off. routes/organization.js and the Area page
        // both use parent_area_id; 00_init_all.sql called the column parent_id
        // and won the fresh install, so the Areas page returned 500 on every
        // read and could neither create nor re-parent an area. The old column is
        // left where it is — nothing reads it, and dropping a column that might
        // hold history is not a decision for a boot sequence.
        `ALTER TABLE areas ADD COLUMN IF NOT EXISTS parent_area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL`,
        // Marks a summary row as hand-corrected so a recompute leaves it alone
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN DEFAULT false`,
        // Why a row was corrected by hand. Manual Entry requires a reason and
        // regularisation approval carries the employee's, and both write it
        // here — but the column was never created, so every manual correction
        // and every approved regularisation failed with a 500. An attendance
        // override that does not record its justification is worth little at
        // payroll time anyway.
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS remarks TEXT`,
        // The daily summary's own numbers. 00_init_all.sql declares all three,
        // but this deployment's table predates it and has none of them — the
        // attendance page already failed once with "column ads.early_leave_minutes
        // does not exist", and the payroll export failed the same way on
        // overtime_minutes. Schema files record what a fresh install would get;
        // ensureSchema is the only thing that runs against a database that
        // already exists.
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS late_minutes INTEGER`,
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER`,
        // ot_minutes is the one the engine actually writes, and it is missing on
        // a fresh install. Two schema files declare this table with CREATE TABLE
        // IF NOT EXISTS and disagree about the column: 00_init_all.sql says
        // overtime_minutes, schema_expansion.sql says ot_minutes. Whichever runs
        // first wins and the other is a no-op, so a new customer's database gets
        // overtime_minutes and the overtime engine writes into a column that is
        // not there. That is not a hypothetical — reading the wrong one of these
        // two names is exactly how the overtime register reported zero hours for
        // every employee, and a fresh install would reproduce it permanently.
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS ot_minutes INTEGER DEFAULT 0`,
        `ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS early_minutes INTEGER DEFAULT 0`,
        // If the older column exists and holds anything, carry it across once
        // rather than stranding it. Additive and idempotent: it only fills rows
        // where ot_minutes has no value, and never removes the old column —
        // deleting a column that might hold history is not something a boot
        // sequence should decide on its own.
        `DO $$
         BEGIN
           IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'attendance_daily_summary'
                         AND column_name = 'overtime_minutes') THEN
             UPDATE attendance_daily_summary
                SET ot_minutes = overtime_minutes
              WHERE ot_minutes IS NULL AND overtime_minutes IS NOT NULL;
           END IF;
         END $$`,
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
        // The columns the two ingest paths write. Same failure as ot_minutes and
        // worse: 00_init_all.sql and schema.sql both declare attendance_logs
        // with CREATE TABLE IF NOT EXISTS and disagree about nearly every
        // column. Sorted order runs 00_init_all.sql first, so a fresh install
        // gets punch_type/verify_type and none of the below — while adms.js
        // writes punch_state, verification_mode and sync_status, and
        // punch_ingest.js writes raw_data, source, is_attendance and
        // upload_time. On a new customer's database every punch from every
        // device would fail to insert, and the only symptom is an empty
        // attendance page.
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS punch_state VARCHAR(10) DEFAULT 'check_in'`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS verification_mode INTEGER`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20)`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS raw_data TEXT`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS source INTEGER`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS is_attendance INTEGER`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS upload_time TIMESTAMP`,
        // Both inserts use ON CONFLICT (employee_code, punch_time), which needs
        // a unique constraint on exactly those two columns. 00_init_all.sql
        // declares UNIQUE(employee_code, punch_time, device_serial) — three
        // columns, which does not match, so on a fresh install the insert would
        // not merely miss a column but be rejected outright with "no unique or
        // exclusion constraint matching the ON CONFLICT specification".
        //
        // This fails loudly and harmlessly if a database somehow holds two
        // punches with the same code and timestamp; ensureSchema logs and
        // carries on, and nothing is deleted to make it fit.
        // IF NOT EXISTS matches on the index NAME, not its columns, so a plain
        // CREATE UNIQUE INDEX here would build a second, redundant unique index
        // over every punch row on any database that already has this constraint
        // under the name Postgres generated for it — which is this one. Check
        // for a unique index covering exactly these two columns instead.
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1
               FROM pg_index i
               JOIN pg_class t ON t.oid = i.indrelid
              WHERE t.relname = 'attendance_logs'
                AND i.indisunique
                AND i.indnatts = 2
                AND i.indkey::int2[] @> ARRAY[
                      (SELECT attnum FROM pg_attribute
                        WHERE attrelid = t.oid AND attname = 'employee_code'),
                      (SELECT attnum FROM pg_attribute
                        WHERE attrelid = t.oid AND attname = 'punch_time')
                    ]::int2[]
           ) THEN
             CREATE UNIQUE INDEX attendance_logs_emp_time_key
                 ON attendance_logs (employee_code, punch_time);
           END IF;
         END $$`,
        // Scheduled reports. Absent from every schema file — they exist only in
        // scripts/fix_production_schema.js, which no new install runs, so the
        // scheduler logs 'relation "scheduled_reports" does not exist' once a
        // minute on a fresh database.
        `CREATE TABLE IF NOT EXISTS scheduled_reports (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            report_type VARCHAR(50) NOT NULL,
            schedule_type VARCHAR(20) NOT NULL,
            schedule_time TIME,
            schedule_day INTEGER,
            recipients TEXT[],
            filters JSONB,
            format VARCHAR(20) DEFAULT 'pdf',
            is_active BOOLEAN DEFAULT TRUE,
            last_run_at TIMESTAMP,
            next_run_at TIMESTAMP,
            created_by VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS report_history (
            id SERIAL PRIMARY KEY,
            scheduled_report_id INTEGER,
            report_type VARCHAR(50),
            recipients TEXT,
            status VARCHAR(20),
            error_message TEXT,
            sent_at TIMESTAMP DEFAULT NOW()
        )`,
        // The repair script's definition omits both, and the insert writes them,
        // so saving a scheduled report failed even where the table existed.
        `ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS format VARCHAR(20) DEFAULT 'pdf'`,
        `ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS created_by VARCHAR(100)`,
        // Biometric template storage. services/adms.js:323 writes eleven columns
        // and the table has six of them, so every fingerprint and face uploaded
        // by a reader is rejected. The insert also targets
        // ON CONFLICT (employee_code, template_type, template_no) and no such
        // unique index exists, which fails the statement outright rather than
        // merely dropping a value.
        //
        // The consequence is not cosmetic: templates are how an enrolment made
        // on one reader reaches the other three. With this table unwritable,
        // enrolling a finger at the front door never propagates, and the person
        // cannot get in at the back.
        //
        // Note the two pairs of names for the same idea — source_device beside
        // device_serial, index_no beside template_index. Both are kept: existing
        // databases may hold values in either, and dropping a column that might
        // hold enrolment data is not something a boot sequence should decide.
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS template_no INTEGER DEFAULT 0`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS valid INTEGER DEFAULT 1`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS duress INTEGER DEFAULT 0`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS source_device VARCHAR(100)`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS major_ver VARCHAR(20)`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS minor_ver VARCHAR(20)`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS format VARCHAR(20)`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS index_no INTEGER`,
        `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
        // Carry any older values across so the new columns are not empty where
        // the old ones held the same thing.
        //
        // Guarded on the SOURCE column existing. The first version of this
        // assumed both spellings were always present and failed on a database
        // that has template_no and source_device but never had template_index
        // or device_serial — which is the shape this deployment actually has.
        // Referencing a column that is not there fails the whole statement, so
        // the existence check has to be inside the same statement, not implied
        // by the ADD COLUMN above it.
        `DO $$
         BEGIN
           IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'biometric_templates'
                         AND column_name = 'template_index') THEN
             UPDATE biometric_templates SET template_no = template_index
              WHERE template_no IS NULL AND template_index IS NOT NULL;
           END IF;
           IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'biometric_templates'
                         AND column_name = 'device_serial') THEN
             UPDATE biometric_templates SET source_device = device_serial
              WHERE source_device IS NULL AND device_serial IS NOT NULL;
           END IF;
         END $$`,
        // The conflict target. Checked by columns rather than by name, for the
        // same reason as attendance_logs: IF NOT EXISTS matches only the name,
        // so it would happily build a second identical index.
        //
        // If a database already holds two rows for one (code, type, no) this
        // fails, ensureSchema logs it and carries on, and nothing is deleted to
        // force it through — a duplicate template is a question for a person.
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_index i
               JOIN pg_class t ON t.oid = i.indrelid
              WHERE t.relname = 'biometric_templates'
                AND i.indisunique
                AND i.indnatts = 3
           ) THEN
             CREATE UNIQUE INDEX biometric_templates_emp_type_no_key
                 ON biometric_templates (employee_code, template_type, template_no);
           END IF;
         END $$`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS punch_source VARCHAR(50) DEFAULT 'biometric'`,
        // A still captured at the moment of the punch. Filename only — the file
        // lives on the uploads volume, not in the database, because 92,000
        // punches with an image each would make every dump unrestorable.
        //
        // This is the anti-buddy-punching story, and it is deliberately a photo
        // rather than face matching: a reviewable image removes most of the
        // fraud, while matching brings an accuracy claim and a far heavier
        // consent obligation for biometric data under the DPDP Act.
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS photo_path VARCHAR(255)`,
        // Mobile punches record device_serial = 'MOBILE_APP', and that column
        // has a foreign key to devices. Without a matching row every punch from
        // a phone failed with "violates foreign key constraint
        // attendance_logs_device_serial_fkey" — admin and self-service alike.
        //
        // A row rather than a NULL, because the punch did come from somewhere
        // and a report grouped by device should be able to say so. is_virtual
        // keeps it out of the places that count physical readers: it has no
        // heartbeat, so the offline alert would otherwise report the mobile app
        // as a dead reader every five minutes, forever.
        `ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT FALSE`,
        `INSERT INTO devices (serial_number, device_name, status, vendor, approval_status, is_virtual)
         SELECT 'MOBILE_APP', 'Mobile App (self-service)', 'online', 'neevtime', 'approved', TRUE
          WHERE NOT EXISTS (SELECT 1 FROM devices WHERE serial_number = 'MOBILE_APP')`,
        `UPDATE devices SET is_virtual = TRUE WHERE serial_number = 'MOBILE_APP' AND is_virtual IS DISTINCT FROM TRUE`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8)`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8)`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS is_geofence_verified BOOLEAN DEFAULT FALSE`,
        `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL`,
        `ALTER TABLE employees ADD COLUMN IF NOT EXISTS assigned_geofence_id INTEGER REFERENCES geofences(id) ON DELETE SET NULL`,
        // Every sync log insert on this deployment has been failing with
        // 'column "direction" of relation "integration_sync_logs" does not
        // exist'. scripts/fix_production_schema.js creates the table without
        // that column; services/hrms-integration.js writes it. logSync catches
        // and logs, so the sync itself carried on and nothing surfaced — which
        // means the success and failure counts on the Integrations page, and
        // the history at routes/integrations.js:254, have always been empty.
        // A sync that never ran and a sync that failed looked identical.
        `CREATE TABLE IF NOT EXISTS integration_sync_logs (
            id                 SERIAL PRIMARY KEY,
            integration_id     INTEGER NOT NULL,
            sync_type          VARCHAR(50),
            direction          VARCHAR(20),
            status             VARCHAR(20),
            records_processed  INTEGER DEFAULT 0,
            records_success    INTEGER DEFAULT 0,
            records_failed     INTEGER DEFAULT 0,
            error_message      TEXT,
            started_at         TIMESTAMP DEFAULT NOW(),
            completed_at       TIMESTAMP
        )`,
        `ALTER TABLE integration_sync_logs ADD COLUMN IF NOT EXISTS direction VARCHAR(20)`,
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
        `DO $$
         BEGIN
           -- Only if the column is actually there. attendance_rules has two
           -- historical shapes — a key/value stub with setting_name, and the
           -- rule_type shape the code uses — and this statement fails on every
           -- boot of a database with the second one.
           IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'attendance_rules'
                         AND column_name = 'setting_name') THEN
             ALTER TABLE attendance_rules ALTER COLUMN setting_name DROP NOT NULL;
           END IF;
         END $$`,
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
        ['database', 'backup_frequency', 'daily', 'string', 'How often to take one'],
        ['attendance', 'punch_photo_retention_days', '90', 'number',
            'How long a photo taken at the moment of a punch is kept. The attendance record '
            + 'itself is never deleted — only the image, which is personal data and only needs '
            + 'to outlive any dispute about that punch.'],
        ['database', 'backup_day', '', 'string',
            'Which day, for weekly (0 Sunday to 6 Saturday) or monthly (1 to 31). '
            + 'Ignored for daily. A monthly date that does not exist in a short month runs on '
            + 'the last day instead of being skipped.'],
        ['database', 'backup_time', '02:00', 'string', 'Server local time to run the backup'],
        ['database', 'backup_retention_count', '7', 'number', 'How many automatic backups to keep'],
        // Seeded empty so it APPEARS in Settings > Database. The Settings page
        // renders whatever rows exist in a category, and this key was only ever
        // read with a default — so the one control that gets a backup off this
        // machine was invisible on the screen where every other backup setting
        // lives. It was reachable on Database Tools and nowhere a person would
        // think to look.
        //
        // Empty means no second copy. /mnt/backup-external is mounted from the
        // host for exactly this; see BACKUP_EXTERNAL_DIR in docker-compose.yml.
        ['database', 'backup_external_path', '', 'string',
            'Read-only here. Set the second copy under System > Database > Backup, in the '
            + '"Second copy" panel — it can also send to a Windows share, S3, SFTP or '
            + 'SharePoint, and tests the destination before saving.'],
        // ── Employee sign-in ────────────────────────────────────────────
        //
        // Local only, until somebody deliberately turns a directory on. A
        // comma-separated list, so a site can offer single sign-on to office
        // staff and keep employee-code passwords for shop-floor workers who
        // have no mailbox.
        //
        // The client secret and the LDAP bind password are NOT here — they come
        // from OIDC_CLIENT_SECRET and LDAP_BIND_PASSWORD in the environment. A
        // secret in a settings row is a secret in every backup and every
        // screenshot of this page.
        ['auth', 'employee_login_modes', 'local', 'string',
            'How employees sign in: any of local, oidc, ldap — comma separated'],
        ['auth', 'oidc_issuer', '', 'string',
            'Identity provider URL, e.g. https://login.microsoftonline.com/<tenant-id>/v2.0'],
        ['auth', 'oidc_client_id', '', 'string', 'Application (client) ID from the provider'],
        ['auth', 'oidc_redirect_uri', '', 'string',
            'Must match the provider exactly, e.g. https://attendance.example.com/api/portal/auth/oidc/callback'],
        ['auth', 'ldap_url', '', 'string',
            'ldaps://dc.example.local:636 — plain ldap:// is refused unless LDAP_ALLOW_INSECURE is set'],
        ['auth', 'ldap_base_dn', '', 'string', 'Where to search for users, e.g. DC=example,DC=local'],
        ['auth', 'ldap_bind_dn', '', 'string', 'Read-only service account that looks users up'],
        ['auth', 'ldap_user_filter', '(userPrincipalName={login})', 'string',
            'How a typed login becomes a search; {login} is substituted and escaped'],
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
                 -- The VALUE is never overwritten: a setting someone chose must
                 -- survive every deploy. The DESCRIPTION is, because it is help
                 -- text, not data — and stale help is worse than none. "weekly
                 -- (Mondays)" sat on screen after the day became selectable,
                 -- telling the reader something the software had stopped doing.
                 ON CONFLICT (category, setting_key) DO UPDATE
                    SET description = EXCLUDED.description,
                        data_type   = EXCLUDED.data_type`,
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

/**
 * Create the first administrator, once, on an empty install.
 *
 * A fresh install could not be signed into at all. database/000_schema.sql
 * seeded an `admin` row whose bcrypt hash matches no password anyone has —
 * the comment beside it says "password: admin" and that is simply not true.
 * The two scripts that do create a usable account, init_all_schemas.js and
 * reset_admin_password.js, are not part of any install procedure. So the
 * product installed, started, served a login page, and refused every
 * credential.
 *
 * Deliberately NOT a fixed default password. `admin`/`admin` on every
 * deployment is a credential an attacker knows before they arrive, on a system
 * holding biometric identifiers and payroll evidence. Instead:
 *
 *   - ADMIN_PASSWORD set  -> that is used, and nothing is printed.
 *   - not set             -> a random one is generated and printed ONCE to the
 *                            boot log, the way Postgres and Jenkins do it.
 *
 * Runs only when the users table is empty, so it can never touch a deployment
 * that already has accounts.
 */
const ensureFirstAdmin = async () => {
    try {
        const { rows } = await db.query('SELECT count(*)::int AS n FROM users');
        if (rows[0].n > 0) return;
        console.log('No users exist; creating the first administrator.');

        const bcrypt = require('bcryptjs');
        const generated = !process.env.ADMIN_PASSWORD;
        const password = process.env.ADMIN_PASSWORD
            || require('crypto').randomBytes(12).toString('base64url');

        await db.query(
            `INSERT INTO users (username, password_hash, role, email, full_name)
             VALUES ('admin', $1, 'admin', 'admin@localhost', 'System Administrator')`,
            [await bcrypt.hash(password, 10)]
        );

        if (generated) {
            console.log('\n' + '='.repeat(64));
            console.log('  First administrator created.');
            console.log('    username: admin');
            console.log(`    password: ${password}`);
            console.log('  Shown once and not recoverable. Change it after signing in.');
            console.log('  Set ADMIN_PASSWORD before first start to choose your own.');
            console.log('='.repeat(64) + '\n');
        } else {
            console.log('First administrator "admin" created with the password from ADMIN_PASSWORD.');
        }
    } catch (err) {
        // Say which failure this is. When the users table does not exist yet,
        // this means the application started before the database finished
        // initialising — a healthcheck problem, not an account problem — and
        // reporting it as "could not create the administrator" sent me looking
        // in the wrong place.
        console.error(/relation "users" does not exist/.test(err.message)
            ? 'Could not create the first administrator: the users table does not '
              + 'exist yet. The application started before the database finished '
              + 'initialising; check the db healthcheck.'
            : `Could not create the first administrator: ${err.message}`);
    }
};

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`ADMS Endpoint: http://0.0.0.0:${PORT}/iclock/cdata`);

    await ensureSchema();
    await ensureFirstAdmin();

    // Punch photos are personal data; keeping them forever is a liability, not
    // an asset. The attendance record is what must survive for years.
    try {
        require('./routes/mobile_attendance').startPhotoPurge();
        console.log('Punch photo retention: started (daily)');
    } catch (err) {
        console.log('Punch photo retention: not available -', err.message);
    }

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
