/**
 * Read-only attendance export for HRMS vendors that pull.
 *
 * The mirror image of /api/ingest/punch. That endpoint exists for a vendor who
 * sends us punches; this one exists for a vendor who comes and takes them.
 * greytHR is the first: their on-premise agent runs only on Windows, this
 * deployment is Linux under Docker, and so the integration has to be them
 * calling us.
 *
 * Everything here is a GET. There is no path through this router that writes to
 * an attendance table, and there should never be one — an inbound punch has a
 * home already, and keeping the export incapable of modifying anything is what
 * makes it safe to expose through a reverse proxy.
 *
 *   GET /api/export/ping                      confirm key and connectivity
 *   GET /api/export/employees                 the roster, for code mapping
 *   GET /api/export/punches?since_id=0        raw punches, incremental
 *   GET /api/export/attendance?from=&to=      settled daily attendance
 *
 * ── Timestamps ───────────────────────────────────────────────────────────────
 * attendance_logs.punch_time is a naive local wall clock in the configured
 * attendance timezone, which server.js pins the process to. Six of the eight
 * outbound integrations in this codebase got this wrong by calling toISOString()
 * on it, moving every punch by the UTC offset and filing anything before 05:30
 * under the previous day. The export therefore never sends a bare timestamp: it
 * sends the wall clock, the offset-qualified form, and the zone it belongs to,
 * so the receiving system has nothing left to assume.
 *
 * ── Pagination ───────────────────────────────────────────────────────────────
 * Punches are walked by id, not by page number. A poller that pages by offset
 * while rows are arriving sees some records twice and misses others, because
 * the offset it captured has shifted underneath it. `since_id` is a cursor over
 * an immutable, monotonic key: the caller keeps the last id it saw and asks for
 * what came after. Re-asking is idempotent.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const settings = require('../utils/settings');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const {
    decodeDirection,
    formatLocal,
    resolveDeviceDirections
} = require('../services/integrations/punch_format');

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_RANGE_DAYS = 92;

const resolveTimezone = async () =>
    settings.get('timezone', 'system_timezone', 'Asia/Kolkata');

/**
 * The numeric offset of the attendance zone at a given moment, as +HH:MM.
 *
 * Computed per timestamp rather than once per response because India does not
 * observe DST but the deployments this code will be copied into might, and a
 * fixed offset stamped on a six-month range is wrong for half of it.
 */
const offsetAt = (date, timezone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'longOffset'
    }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    return name.replace('GMT', '') || '+00:00';
};

/**
 * The current instant, as a wall clock in the attendance timezone.
 *
 * Not formatLocal(new Date()). formatLocal reads local date components, which
 * is correct for a punch_time — pg builds that Date from a naive timestamp
 * using the process timezone, so the local components give back the wall clock
 * the device reported, whatever the process timezone happens to be. It is
 * wrong for an actual instant: the production container runs UTC, so
 * formatLocal(new Date()) reported 12:19 and labelled it +05:30, five and a
 * half hours behind the clock on the wall next to the reader.
 */
const nowInZone = (timezone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
    // en-CA gives hour '24' at midnight; ISO wants 00.
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
};

const clampLimit = (raw) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
};

/**
 * Reject a range that is missing, malformed, or wide enough to be a mistake.
 * A vendor asking for five years in one call is a vendor who will time out and
 * retry forever; the error tells them to narrow it rather than leaving them to
 * guess why the connection dropped.
 */
const parseRange = (from, to) => {
    if (!from || !to) return { error: 'Both "from" and "to" are required (YYYY-MM-DD)' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { error: 'Dates must be YYYY-MM-DD' };
    }
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { error: 'Dates must be YYYY-MM-DD' };
    }
    if (start > end) return { error: '"from" must not be after "to"' };
    const days = (end - start) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
        return { error: `Range cannot exceed ${MAX_RANGE_DAYS} days; request it in slices` };
    }
    return { from, to };
};

// ─────────────────────────────────── ping ───────────────────────────────────

/**
 * Lets an integrator prove the key, the address allowlist and the route all
 * work before they write any code against the data endpoints.
 */
router.get('/ping', apiKeyAuth(), async (req, res) => {
    const timezone = await resolveTimezone();
    const now = new Date();
    res.json({
        success: true,
        client: req.apiClient.name,
        scopes: req.apiClient.scopes,
        timezone,
        server_time: nowInZone(timezone),
        server_time_offset: offsetAt(now, timezone),
        data: []
    });
});

// ───────────────────────────────── employees ────────────────────────────────

/**
 * The roster, so the vendor can map their own employee numbers onto
 * employee_code before pulling any attendance.
 *
 * Excludes the soft-deleted and anyone flagged out of HRMS traffic — the same
 * two filters services/hrms-integration.js applies on the push side. A facility
 * contractor enrolled for door access only is not payroll's business, and
 * sending them produces rejections that retry forever.
 */
router.get('/employees', apiKeyAuth('employees:read'), async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';

        const result = await db.query(
            `SELECT e.employee_code,
                    e.name,
                    e.designation,
                    e.status,
                    e.employment_type,
                    e.joining_date,
                    e.email,
                    e.mobile,
                    d.name AS department
               FROM employees e
               LEFT JOIN departments d ON e.department_id = d.id
              WHERE e.deleted_at IS NULL
                AND e.exclude_from_hrms IS NOT TRUE
                AND ($1::boolean OR e.status = 'active')
              ORDER BY e.employee_code`,
            [includeInactive]
        );

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows.map((r) => ({
                employee_code: r.employee_code,
                name: r.name,
                department: r.department,
                designation: r.designation,
                employment_type: r.employment_type,
                status: r.status,
                joining_date: r.joining_date ? formatLocal(r.joining_date).date : null,
                email: r.email || null,
                mobile: r.mobile || null
            }))
        });
    } catch (err) {
        req.log?.error?.(err.message);
        res.status(500).json({ error: err.message });
    }
});

// ────────────────────────────────── punches ─────────────────────────────────

/**
 * Raw punches, which is what an HRMS that runs its own attendance rules wants.
 *
 * Two ways to ask, because vendors differ on which they support:
 *   since_id=<n>          everything after that id — the incremental mode, and
 *                         the one to use for a poller
 *   from=&to=             a fixed window, for a backfill or a reconciliation
 *
 * The response always carries next_since_id. A caller that stores it and sends
 * it back cannot skip a punch and cannot re-send one, whatever happens to the
 * clock or to their own retry logic.
 */
router.get('/punches', apiKeyAuth('attendance:read'), async (req, res) => {
    try {
        const limit = clampLimit(req.query.limit);
        const timezone = await resolveTimezone();

        const where = [];
        const params = [];

        if (req.query.since_id !== undefined) {
            const sinceId = Number.parseInt(req.query.since_id, 10);
            if (!Number.isInteger(sinceId) || sinceId < 0) {
                return res.status(400).json({ error: '"since_id" must be a non-negative integer' });
            }
            params.push(sinceId);
            where.push(`al.id > $${params.length}`);
        } else {
            const range = parseRange(req.query.from, req.query.to);
            if (range.error) {
                return res.status(400).json({
                    error: `${range.error}. Send either "since_id" for incremental pulls, or "from" and "to" for a window.`
                });
            }
            params.push(range.from);
            where.push(`al.punch_time >= $${params.length}::date`);
            params.push(range.to);
            // Inclusive of the whole closing day: a punch at 18:40 on the "to"
            // date is inside the range the caller asked for.
            where.push(`al.punch_time < ($${params.length}::date + INTERVAL '1 day')`);
        }

        if (req.query.employee_code) {
            params.push(String(req.query.employee_code).trim());
            where.push(`al.employee_code = $${params.length}`);
        }

        params.push(limit);

        const result = await db.query(
            `SELECT al.id,
                    al.employee_code,
                    al.punch_time,
                    al.punch_state,
                    al.device_serial,
                    al.verification_mode,
                    e.name AS employee_name
               FROM attendance_logs al
               LEFT JOIN employees e ON e.employee_code = al.employee_code
              WHERE ${where.join(' AND ')}
                AND (e.employee_code IS NULL OR (e.deleted_at IS NULL AND e.exclude_from_hrms IS NOT TRUE))
              ORDER BY al.id
              LIMIT $${params.length}`,
            params
        );

        // One query for every reader in the batch rather than one per row.
        // States 0 and 255 carry no direction of their own and are the whole of
        // the ambiguous traffic on eSSL hardware; the reader's own setting is
        // the only thing that resolves them.
        const directions = await resolveDeviceDirections(result.rows);

        const data = result.rows.map((row) => {
            const local = formatLocal(row.punch_time);
            const deviceDirection = directions[row.device_serial] || 'in';
            return {
                id: row.id,
                employee_code: row.employee_code,
                employee_name: row.employee_name || null,
                punch_time: local.datetime,
                punch_time_iso: `${local.iso}${offsetAt(row.punch_time, timezone)}`,
                direction: decodeDirection(row.punch_state, deviceDirection),
                punch_state: row.punch_state,
                device_serial: row.device_serial,
                verify_mode: row.verification_mode
            };
        });

        res.json({
            success: true,
            count: data.length,
            timezone,
            // Absent when the page came back empty, so a caller that blindly
            // assigns it does not reset its cursor to null and replay history.
            next_since_id: data.length ? data[data.length - 1].id : (req.query.since_id ?? null),
            has_more: data.length === limit,
            data
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ───────────────────────────────── attendance ───────────────────────────────

/**
 * Settled per-day attendance, for an HRMS that would rather consume a result
 * than compute one. in_time and out_time are wall clocks in the attendance
 * timezone, same contract as the punches.
 *
 * is_finalized is passed through untouched. A day that is still open can change
 * — a late punch, a regularisation — and a vendor that treats an unfinalised
 * row as settled will hold a figure this system no longer agrees with.
 *
 * shift_name comes from the employee's assigned shift, not from
 * attendance_daily_summary.shift_name. That column exists on this deployment —
 * scripts/fix_production_schema.js created it — and is NULL on all 3813 rows,
 * because nothing has ever written to it. Selecting it would have exported a
 * permanently empty field, and would have thrown "column does not exist" on any
 * database that never ran that script, which is every fresh install.
 */
router.get('/attendance', apiKeyAuth('attendance:read'), async (req, res) => {
    try {
        const range = parseRange(req.query.from, req.query.to);
        if (range.error) return res.status(400).json({ error: range.error });

        const limit = clampLimit(req.query.limit);
        const params = [range.from, range.to];
        let employeeFilter = '';

        if (req.query.employee_code) {
            params.push(String(req.query.employee_code).trim());
            employeeFilter = `AND ads.employee_code = $${params.length}`;
        }

        const finalizedOnly = req.query.finalized_only === 'true';
        const finalizedFilter = finalizedOnly ? 'AND ads.is_finalized = true' : '';

        params.push(limit);
        const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
        params.push(offset);

        const result = await db.query(
            `SELECT ads.employee_code,
                    ads.date,
                    ads.in_time,
                    ads.out_time,
                    ads.duration_minutes,
                    ads.status,
                    ads.late_minutes,
                    ads.early_leave_minutes,
                    ads.overtime_minutes,
                    ads.is_finalized,
                    e.name AS employee_name,
                    sh.name AS shift_name
               FROM attendance_daily_summary ads
               JOIN employees e ON e.employee_code = ads.employee_code
               LEFT JOIN shifts sh ON sh.id = e.default_shift_id
              WHERE ads.date >= $1::date
                AND ads.date <= $2::date
                AND e.deleted_at IS NULL
                AND e.attendance_required IS NOT FALSE
                AND e.exclude_from_hrms IS NOT TRUE
                ${employeeFilter}
                ${finalizedFilter}
              ORDER BY ads.date, ads.employee_code
              LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const timezone = await resolveTimezone();

        res.json({
            success: true,
            count: result.rows.length,
            timezone,
            from: range.from,
            to: range.to,
            has_more: result.rows.length === limit,
            next_offset: offset + result.rows.length,
            data: result.rows.map((r) => ({
                employee_code: r.employee_code,
                employee_name: r.employee_name || null,
                date: formatLocal(r.date).date,
                in_time: r.in_time ? formatLocal(r.in_time).time : null,
                out_time: r.out_time ? formatLocal(r.out_time).time : null,
                duration_minutes: r.duration_minutes,
                status: r.status,
                late_minutes: r.late_minutes,
                early_leave_minutes: r.early_leave_minutes,
                overtime_minutes: r.overtime_minutes,
                shift_name: r.shift_name,
                is_finalized: r.is_finalized
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

// Exposed for tests. The range and offset rules are the part of this file most
// likely to be got wrong quietly — an off-by-one on the closing day, or a fixed
// offset stamped on a range that spans a DST change — and neither shows up as a
// failure, only as attendance that disagrees with the other system by a day.
module.exports.internals = { parseRange, offsetAt, clampLimit, nowInZone, MAX_RANGE_DAYS, MAX_LIMIT, DEFAULT_LIMIT };
