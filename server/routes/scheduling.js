const express = require('express');
const router = express.Router();
const db = require('../db');

// ========== SHIFTS ==========
router.get('/shifts', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM shifts ORDER BY name');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/shifts', async (req, res) => {
    try {
        const { name, start_time, end_time, shift_type, grace_in_minutes, late_threshold_minutes, break_duration_minutes, is_night_shift } = req.body;
        const result = await db.query(`
            INSERT INTO shifts (name, start_time, end_time, shift_type, grace_in_minutes, late_threshold_minutes, break_duration_minutes, is_night_shift)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [name, start_time, end_time, shift_type || 'Fixed', grace_in_minutes || 0, late_threshold_minutes || 15, break_duration_minutes || 0, is_night_shift || false]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/shifts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, start_time, end_time, shift_type, grace_in_minutes, late_threshold_minutes, break_duration_minutes, is_night_shift, is_active } = req.body;
        const result = await db.query(`
            UPDATE shifts SET name=$1, start_time=$2, end_time=$3, shift_type=$4, grace_in_minutes=$5, late_threshold_minutes=$6, break_duration_minutes=$7, is_night_shift=$8, is_active=$9
            WHERE id=$10 RETURNING *
        `, [name, start_time, end_time, shift_type, grace_in_minutes, late_threshold_minutes, break_duration_minutes, is_night_shift, is_active, id]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/shifts/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM shifts WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ROSTER ==========
router.get('/roster', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT r.*, e.name as employee_name, s.name as shift_name 
            FROM employee_shift_roster r
            JOIN employees e ON r.employee_code = e.employee_code
            JOIN shifts s ON r.shift_id = s.id
            ORDER BY r.effective_from DESC
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/roster', async (req, res) => {
    try {
        const { employee_code, shift_id, effective_from, effective_to } = req.body;
        const result = await db.query(`
            INSERT INTO employee_shift_roster (employee_code, shift_id, effective_from, effective_to)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (employee_code, effective_from) DO UPDATE SET shift_id = EXCLUDED.shift_id, effective_to = EXCLUDED.effective_to
            RETURNING *
        `, [employee_code, shift_id, effective_from, effective_to || null]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== WEEKLY OFF RULES ==========
router.get('/weekly-off-rules', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM weekly_off_rules ORDER BY name');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/weekly-off-rules', async (req, res) => {
    try {
        const { name, pattern, description } = req.body;
        const result = await db.query(`INSERT INTO weekly_off_rules (name, pattern, description) VALUES ($1, $2, $3) RETURNING *`, [name, pattern, description]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== HOLIDAYS ==========
router.get('/holidays', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM holidays ORDER BY date');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/holidays', async (req, res) => {
    try {
        // holiday_location_id, not location_id. Two columns, and the rest of the
        // system uses the other one: the HRMS sync writes holiday_location_id,
        // the unique index is on (COALESCE(holiday_location_id, 0), date), and
        // the muster roll matches an employee's holidays through it. A holiday
        // added here therefore applied to nobody — everyone was marked absent on
        // a day the office was shut.
        //
        // The ON CONFLICT target must repeat the index expression exactly.
        // `ON CONFLICT (date, location_id)` matched no unique index at all, so
        // this statement did not merely write the wrong column, it failed
        // outright with "no unique or exclusion constraint matching the ON
        // CONFLICT specification".
        const { name, date, location_id, holiday_location_id, is_optional } = req.body;
        const locationId = holiday_location_id ?? location_id ?? null;
        const result = await db.query(`
            INSERT INTO holidays (name, date, holiday_location_id, is_optional)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (COALESCE(holiday_location_id, 0), date)
            DO UPDATE SET name = EXCLUDED.name, is_optional = EXCLUDED.is_optional
            RETURNING *
        `, [name, date, locationId, is_optional || false]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/holidays/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM holidays WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Holiday Update (PUT)
router.put('/holidays/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, date, location_id, holiday_location_id, is_optional } = req.body;
        const locationId = holiday_location_id ?? location_id ?? null;
        const result = await db.query(`
            UPDATE holidays SET name=$1, date=$2, holiday_location_id=$3, is_optional=$4
            WHERE id=$5 RETURNING *
        `, [name, date, locationId, is_optional || false, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Holiday not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== TIMETABLES ==========
router.get('/timetables', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.*, 
                   (SELECT COUNT(*) FROM break_times bt WHERE bt.timetable_id = t.id) as break_count
            FROM timetables t 
            ORDER BY t.name
        `);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/timetables/:id', async (req, res) => {
    try {
        const timetable = await db.query('SELECT * FROM timetables WHERE id=$1', [req.params.id]);
        if (timetable.rows.length === 0) return res.status(404).json({ error: 'Timetable not found' });

        const breaks = await db.query('SELECT * FROM break_times WHERE timetable_id=$1 ORDER BY start_time', [req.params.id]);
        res.json({ ...timetable.rows[0], breaks: breaks.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/timetables', async (req, res) => {
    try {
        const {
            name, code, check_in, check_out, late_in, early_out, overtime_start,
            min_hours_for_full_day, min_hours_for_half_day, is_overnight, is_flexible,
            grace_period_minutes, color, description
        } = req.body;

        const result = await db.query(`
            INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, overtime_start,
                min_hours_for_full_day, min_hours_for_half_day, is_overnight, is_flexible, 
                grace_period_minutes, color, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [name, code, check_in, check_out, late_in || null, early_out || null, overtime_start || null,
            min_hours_for_full_day || 8, min_hours_for_half_day || 4, is_overnight || false,
            is_flexible || false, grace_period_minutes || 15, color || '#3B82F6', description || '']);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/timetables/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, code, check_in, check_out, late_in, early_out, overtime_start,
            min_hours_for_full_day, min_hours_for_half_day, is_overnight, is_flexible,
            grace_period_minutes, color, description
        } = req.body;

        const result = await db.query(`
            UPDATE timetables SET name=$1, code=$2, check_in=$3, check_out=$4, late_in=$5, 
                early_out=$6, overtime_start=$7, min_hours_for_full_day=$8, min_hours_for_half_day=$9,
                is_overnight=$10, is_flexible=$11, grace_period_minutes=$12, color=$13, description=$14
            WHERE id=$15 RETURNING *
        `, [name, code, check_in, check_out, late_in, early_out, overtime_start,
            min_hours_for_full_day, min_hours_for_half_day, is_overnight, is_flexible,
            grace_period_minutes, color, description, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Timetable not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/timetables/:id', async (req, res) => {
    try {
        // Delete associated breaks first
        await db.query('DELETE FROM break_times WHERE timetable_id=$1', [req.params.id]);
        await db.query('DELETE FROM timetables WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== BREAK TIMES ==========
router.get('/break-times', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM break_times ORDER BY timetable_id, start_time');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/break-times', async (req, res) => {
    try {
        const { timetable_id, name, start_time, end_time, is_paid } = req.body;
        const result = await db.query(`
            INSERT INTO break_times (timetable_id, name, start_time, end_time, is_paid)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [timetable_id, name, start_time, end_time, is_paid ?? true]);
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/break-times/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM break_times WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== BULK IMPORT ====================
//
// The Import Wizard offered Shift Assignment and Holidays, but the endpoints
// behind them were never built, so both flows 404'd on submit. Each row is
// validated and applied independently: one bad row is reported and skipped
// rather than failing the whole file, since a partially-correct spreadsheet is
// the normal case.

const asRows = (body) => {
    const rows = body?.data || body?.employees || body?.rows;
    return Array.isArray(rows) ? rows : null;
};

// Shift assignment: employee_code, shift_id, effective_from
router.post('/roster/import', async (req, res) => {
    const rows = asRows(req.body);
    if (!rows) return res.status(400).json({ error: 'Expected an array of rows in "data"' });

    const errors = [];
    let imported = 0;
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        for (const [index, row] of rows.entries()) {
            const line = index + 2; // +1 for zero-index, +1 for the header row
            const code = String(row.employee_code ?? '').trim();
            const shiftId = parseInt(row.shift_id);
            const from = String(row.effective_from ?? '').trim();

            if (!code || !Number.isInteger(shiftId) || !from) {
                errors.push(`Row ${line}: employee_code, shift_id and effective_from are all required`);
                continue;
            }

            const emp = await client.query('SELECT id FROM employees WHERE employee_code = $1', [code]);
            if (emp.rows.length === 0) {
                errors.push(`Row ${line}: no employee with code ${code}`);
                continue;
            }

            const shift = await client.query('SELECT id FROM shifts WHERE id = $1', [shiftId]);
            if (shift.rows.length === 0) {
                errors.push(`Row ${line}: no shift with id ${shiftId}`);
                continue;
            }

            await client.query(
                `INSERT INTO employee_schedules (employee_id, shift_id, effective_from, effective_to, reason)
                 VALUES ($1, $2, $3, $4, $5)`,
                [emp.rows[0].id, shiftId, from, row.effective_to || null, 'Bulk import']
            );
            imported += 1;
        }

        await client.query('COMMIT');
        res.json({ success: true, imported, skipped: errors.length, errors: errors.slice(0, 50) });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Holidays: name, date, is_optional
router.post('/holidays/import', async (req, res) => {
    const rows = asRows(req.body);
    if (!rows) return res.status(400).json({ error: 'Expected an array of rows in "data"' });

    const errors = [];
    let imported = 0;
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        for (const [index, row] of rows.entries()) {
            const line = index + 2;
            const name = String(row.name ?? '').trim();
            const date = String(row.date ?? '').trim();

            if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                errors.push(`Row ${line}: name is required and date must be YYYY-MM-DD`);
                continue;
            }

            const isOptional = row.is_optional === true
                || String(row.is_optional ?? '').toLowerCase() === 'true'
                || String(row.is_optional ?? '') === '1';

            const locationId = row.holiday_location_id ?? row.location_id
                ? parseInt(row.holiday_location_id ?? row.location_id) : null;

            // Explicit find-then-write rather than ON CONFLICT: NULL never
            // equals NULL in SQL, so a national holiday (no location) would
            // never match a plain conflict target and would duplicate on every
            // re-import. The index handles this with COALESCE(..., 0); this
            // path handles it with IS NOT DISTINCT FROM.
            const existing = await client.query(
                `SELECT id FROM holidays
                 WHERE date = $1 AND holiday_location_id IS NOT DISTINCT FROM $2`,
                [date, locationId]
            );

            if (existing.rows.length > 0) {
                await client.query(
                    'UPDATE holidays SET name = $1, is_optional = $2 WHERE id = $3',
                    [name, isOptional, existing.rows[0].id]
                );
            } else {
                await client.query(
                    'INSERT INTO holidays (name, date, holiday_location_id, is_optional) VALUES ($1, $2, $3, $4)',
                    [name, date, locationId, isOptional]
                );
            }
            imported += 1;
        }

        await client.query('COMMIT');
        res.json({ success: true, imported, skipped: errors.length, errors: errors.slice(0, 50) });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;

