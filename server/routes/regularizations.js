/**
 * Attendance Regularization — admin/HR review
 *
 * Employees raise requests from the portal; approving one upserts the
 * corrected times into attendance_daily_summary (same shape as manual entry).
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// List requests (default pending first)
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const params = [];
        let where = '';
        if (status) {
            params.push(status);
            where = 'WHERE ar.status = $1';
        }
        const result = await db.query(
            `SELECT ar.id, ar.employee_code, e.name AS employee_name, d.name AS department,
                    to_char(ar.date, 'YYYY-MM-DD') AS date,
                    to_char(ar.requested_in_time, 'HH24:MI') AS requested_in_time,
                    to_char(ar.requested_out_time, 'HH24:MI') AS requested_out_time,
                    to_char(ads.in_time, 'HH24:MI') AS current_in_time,
                    to_char(ads.out_time, 'HH24:MI') AS current_out_time,
                    ar.reason, ar.status, ar.reviewed_by, ar.review_comment, ar.created_at
             FROM attendance_regularizations ar
             JOIN employees e ON ar.employee_code = e.employee_code
             LEFT JOIN departments d ON e.department_id = d.id
             LEFT JOIN attendance_daily_summary ads
                    ON ads.employee_code = ar.employee_code AND ads.date = ar.date
             ${where}
             ORDER BY CASE WHEN ar.status = 'pending' THEN 0 ELSE 1 END, ar.created_at DESC
             LIMIT 200`,
            params
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve / reject
router.put('/:id/status', async (req, res) => {
    const client = await db.getClient();
    try {
        const { id } = req.params;
        const { status, comment } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or rejected' });
        }

        await client.query('BEGIN');

        // date as text — a pg DATE comes back as a local-midnight JS Date, and
        // toISOString() would shift it a day back in TZs ahead of UTC
        const reqRes = await client.query(
            `SELECT *, to_char(date, 'YYYY-MM-DD') AS date_str
             FROM attendance_regularizations WHERE id = $1 FOR UPDATE`,
            [id]
        );
        const reg = reqRes.rows[0];
        if (!reg) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Request not found' });
        }
        if (reg.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Request already reviewed' });
        }

        await client.query(
            `UPDATE attendance_regularizations
             SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_comment = $3
             WHERE id = $4`,
            [status, req.user?.username || `user:${req.user?.id}`, comment || null, id]
        );

        if (status === 'approved') {
            // Merge requested times over whatever the summary currently has
            const dateStr = reg.date_str;
            const cur = await client.query(
                'SELECT in_time, out_time FROM attendance_daily_summary WHERE employee_code = $1 AND date = $2',
                [reg.employee_code, dateStr]
            );
            const mkTs = (time) => (time ? `${dateStr}T${time}` : null);
            const inTime = reg.requested_in_time ? mkTs(reg.requested_in_time) : cur.rows[0]?.in_time || null;
            const outTime = reg.requested_out_time ? mkTs(reg.requested_out_time) : cur.rows[0]?.out_time || null;
            const duration = inTime && outTime
                ? Math.round((new Date(outTime) - new Date(inTime)) / 60000)
                : null;

            await client.query(
                `INSERT INTO attendance_daily_summary
                    (employee_code, date, in_time, out_time, duration_minutes, status, remarks)
                 VALUES ($1, $2, $3, $4, $5, 'Present', $6)
                 ON CONFLICT (employee_code, date) DO UPDATE SET
                    in_time = EXCLUDED.in_time,
                    out_time = EXCLUDED.out_time,
                    duration_minutes = EXCLUDED.duration_minutes,
                    status = EXCLUDED.status,
                    remarks = EXCLUDED.remarks`,
                [reg.employee_code, dateStr, inTime, outTime, duration, `Regularized: ${reg.reason}`]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, status });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
