const express = require('express');
const router = express.Router();
const db = require('../db');

// NOTE: /timetables and /break-times are owned by routes/scheduling.js, which
// mounts first. Duplicate handlers lived here and were unreachable, so they
// have been removed rather than left as a trap for the next editor.

// ==================== DEPARTMENT SCHEDULES ====================

// Get department schedules
router.get('/schedules/department', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT ds.*, d.name as department_name, s.name as shift_name, t.name as timetable_name
            FROM department_schedules ds
            LEFT JOIN departments d ON ds.department_id = d.id
            LEFT JOIN shifts s ON ds.shift_id = s.id
            LEFT JOIN timetables t ON ds.timetable_id = t.id
            WHERE ds.is_active = true
            ORDER BY d.name
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create department schedule
router.post('/schedules/department', async (req, res) => {
    try {
        const { department_id, shift_id, timetable_id, effective_from, effective_to, week_off_days } = req.body;
        const result = await db.query(`
            INSERT INTO department_schedules (department_id, shift_id, timetable_id, effective_from, effective_to, week_off_days)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [department_id, shift_id, timetable_id, effective_from, effective_to, week_off_days || ['saturday', 'sunday']]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update department schedule
router.put('/schedules/department/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { department_id, shift_id, timetable_id, effective_from, effective_to, week_off_days, is_active } = req.body;

        const result = await db.query(`
            UPDATE department_schedules SET
                department_id = COALESCE($1, department_id),
                shift_id = COALESCE($2, shift_id),
                timetable_id = COALESCE($3, timetable_id),
                effective_from = COALESCE($4, effective_from),
                effective_to = COALESCE($5, effective_to),
                week_off_days = COALESCE($6, week_off_days),
                is_active = COALESCE($7, is_active),
                updated_at = NOW()
            WHERE id = $8 RETURNING *
        `, [department_id, shift_id, timetable_id, effective_from, effective_to, week_off_days, is_active, id]);

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete department schedule
router.delete('/schedules/department/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE department_schedules SET is_active = false WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== EMPLOYEE SCHEDULES ====================

// Get employee schedules
router.get('/schedules/employee', async (req, res) => {
    try {
        const { employee_id, department_id } = req.query;
        let query = `
            SELECT es.*, e.name as employee_name, e.employee_code, 
                   s.name as shift_name, t.name as timetable_name,
                   d.name as department_name
            FROM employee_schedules es
            LEFT JOIN employees e ON es.employee_id = e.id
            LEFT JOIN shifts s ON es.shift_id = s.id
            LEFT JOIN timetables t ON es.timetable_id = t.id
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (employee_id) {
            params.push(employee_id);
            query += ` AND es.employee_id = $${params.length}`;
        }
        if (department_id) {
            params.push(department_id);
            query += ` AND e.department_id = $${params.length}`;
        }

        query += ' ORDER BY e.name, es.effective_from DESC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create employee schedule
router.post('/schedules/employee', async (req, res) => {
    try {
        const { employee_id, shift_id, timetable_id, effective_from, effective_to,
            is_temporary, reason, week_off_days } = req.body;

        const result = await db.query(`
            INSERT INTO employee_schedules (employee_id, shift_id, timetable_id, effective_from, 
                effective_to, is_temporary, reason, week_off_days)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [employee_id, shift_id, timetable_id, effective_from, effective_to,
            is_temporary || false, reason, week_off_days || ['saturday', 'sunday']]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk assign schedule to employees
router.post('/schedules/employee/bulk', async (req, res) => {
    try {
        const { employee_ids, shift_id, timetable_id, effective_from, effective_to, week_off_days } = req.body;

        if (!employee_ids || !Array.isArray(employee_ids)) {
            return res.status(400).json({ error: 'employee_ids array required' });
        }

        const results = [];
        for (const emp_id of employee_ids) {
            const result = await db.query(`
                INSERT INTO employee_schedules (employee_id, shift_id, timetable_id, effective_from, effective_to, week_off_days)
                VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
            `, [emp_id, shift_id, timetable_id, effective_from, effective_to, week_off_days || ['saturday', 'sunday']]);
            results.push(result.rows[0]);
        }

        res.status(201).json({ success: true, count: results.length, schedules: results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update employee schedule
router.put('/schedules/employee/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, shift_id, timetable_id, effective_from, effective_to,
            is_temporary, reason, week_off_days } = req.body;

        const result = await db.query(`
            UPDATE employee_schedules SET
                employee_id = COALESCE($1, employee_id),
                shift_id = COALESCE($2, shift_id),
                timetable_id = COALESCE($3, timetable_id),
                effective_from = COALESCE($4, effective_from),
                effective_to = COALESCE($5, effective_to),
                is_temporary = COALESCE($6, is_temporary),
                reason = COALESCE($7, reason),
                week_off_days = COALESCE($8, week_off_days),
                updated_at = NOW()
            WHERE id = $9 RETURNING *
        `, [employee_id, shift_id, timetable_id, effective_from, effective_to,
            is_temporary, reason, week_off_days, id]);

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete employee schedule
router.delete('/schedules/employee/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM employee_schedules WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get temporary schedules
router.get('/schedules/temporary', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT es.*, e.name as employee_name, e.employee_code,
                   s.name as shift_name, t.name as timetable_name
            FROM employee_schedules es
            LEFT JOIN employees e ON es.employee_id = e.id
            LEFT JOIN shifts s ON es.shift_id = s.id
            LEFT JOIN timetables t ON es.timetable_id = t.id
            WHERE es.is_temporary = true
            ORDER BY es.effective_from DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ATTENDANCE RULES ====================

// Get global rules
router.get('/rules/global', async (req, res) => {
    try {
        // Check if table exists and has is_active column
        const tableCheck = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'attendance_rules' AND column_name = 'is_active'
        `);
        
        let query = `SELECT * FROM attendance_rules WHERE rule_type = 'global'`;
        if (tableCheck.rows.length > 0) {
            query += ` AND is_active = true`;
        }
        query += ` ORDER BY name`;
        
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching global rules:', err);
        // If table doesn't exist, return empty array
        if (err.message.includes('does not exist') || err.message.includes('relation')) {
            res.json([]);
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Get department rules
router.get('/rules/department', async (req, res) => {
    try {
        // Check if table exists and has is_active column
        const tableCheck = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'attendance_rules' AND column_name = 'is_active'
        `);
        
        let query = `
            SELECT ar.*, d.name as department_name
            FROM attendance_rules ar
            LEFT JOIN departments d ON ar.department_id = d.id
            WHERE ar.rule_type = 'department'
        `;
        if (tableCheck.rows.length > 0) {
            query += ` AND ar.is_active = true`;
        }
        query += ` ORDER BY d.name`;
        
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching department rules:', err);
        // If table doesn't exist, return empty array
        if (err.message.includes('does not exist') || err.message.includes('relation')) {
            res.json([]);
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

// Create attendance rule
router.post('/rules', async (req, res) => {
    try {
        const { rule_type, department_id, name, late_threshold_minutes, early_leave_threshold_minutes,
            half_day_threshold_minutes, absent_threshold_minutes, overtime_enabled,
            overtime_threshold_minutes, overtime_multiplier, grace_period_minutes,
            grace_late_allowed_per_month, week_off_days, alternate_saturday,
            round_off_minutes, minimum_punch_gap_minutes } = req.body;

        const result = await db.query(`
            INSERT INTO attendance_rules (rule_type, department_id, name, late_threshold_minutes,
                early_leave_threshold_minutes, half_day_threshold_minutes, absent_threshold_minutes,
                overtime_enabled, overtime_threshold_minutes, overtime_multiplier, grace_period_minutes,
                grace_late_allowed_per_month, week_off_days, alternate_saturday,
                round_off_minutes, minimum_punch_gap_minutes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
        `, [rule_type || 'global', department_id, name, late_threshold_minutes, early_leave_threshold_minutes,
            half_day_threshold_minutes, absent_threshold_minutes, overtime_enabled,
            overtime_threshold_minutes, overtime_multiplier, grace_period_minutes,
            grace_late_allowed_per_month, week_off_days, alternate_saturday,
            round_off_minutes, minimum_punch_gap_minutes]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update attendance rule
router.put('/rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const fields = req.body;

        // Check if table exists
        const tableExists = await db.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'attendance_rules'
            )
        `);

        if (!tableExists.rows[0].exists) {
            return res.status(500).json({ error: 'attendance_rules table does not exist. Please run the database migration.' });
        }

        // Build dynamic update query — keys come from the request body, so
        // validate them as SQL identifiers before interpolation
        const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const updates = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && key !== 'id') {
                if (!SAFE_IDENTIFIER.test(key)) {
                    return res.status(400).json({ error: `Invalid field name: ${key}` });
                }
                updates.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        // Check if updated_at column exists
        const hasUpdatedAt = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'attendance_rules' AND column_name = 'updated_at'
        `);
        
        if (hasUpdatedAt.rows.length > 0) {
            updates.push('updated_at = NOW()');
        }
        
        values.push(id);

        const result = await db.query(
            `UPDATE attendance_rules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete attendance rule
router.delete('/rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if table exists and has is_active column
        const tableCheck = await db.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'attendance_rules' AND column_name = 'is_active'
        `);
        
        if (tableCheck.rows.length > 0) {
            await db.query('UPDATE attendance_rules SET is_active = false WHERE id = $1', [id]);
        } else {
            // If no is_active column, delete the record
            await db.query('DELETE FROM attendance_rules WHERE id = $1', [id]);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting rule:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==================== HOLIDAY LOCATIONS ====================

router.get('/holiday-locations', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM holiday_locations ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/holiday-locations', async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await db.query(
            'INSERT INTO holiday_locations (name, description) VALUES ($1, $2) RETURNING *',
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/holiday-locations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const result = await db.query(
            'UPDATE holiday_locations SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
            [name, description, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/holiday-locations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM holiday_locations WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// System logs are served by routes/system_logs.js behind requireAdmin.
// A duplicate route here (mounted at /api, registered earlier) would bypass
// that guard — removed.

module.exports = router;
