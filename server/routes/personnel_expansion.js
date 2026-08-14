const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper for simple CRUD
const createCrud = (table, fields) => {
    const fieldNames = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');

    // GET
    router.get(`/${table}`, async (req, res) => {
        try {
            const result = await db.query(`SELECT * FROM ${table} ORDER BY id DESC`);
            res.json(result.rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // POST
    router.post(`/${table}`, async (req, res) => {
        try {
            const values = fields.map(f => req.body[f]);
            const result = await db.query(
                `INSERT INTO ${table} (${fieldNames}) VALUES (${placeholders}) RETURNING *`,
                values
            );
            res.json(result.rows[0]);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // DELETE
    router.delete(`/${table}/:id`, async (req, res) => {
        try {
            await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
            res.json({ message: 'Deleted' });
        } catch (err) {
            console.error(`Error in DELETE /${table}:`, err);
            res.status(500).json({ error: err.message });
        }
    });
};

// NOTE: /areas is owned by routes/organization.js, which mounts first. The
// duplicate handlers that lived here were unreachable and have been removed.

// Generate CRUDs for others
createCrud('holiday_locations', ['name', 'description']);
createCrud('workflow_roles', ['name', 'description']);
createCrud('workflow_flows', ['name', 'active']);

// Special Case: Employee Resignation (Update Status)
router.post('/employees/resign', async (req, res) => {
    const {
        employee_code,
        resignation_date,
        resignation_type,
        report_end_date,
        attendance_enabled,
        reason_enabled,
        reason
    } = req.body;

    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        // 1. Get Employee ID from Code
        const empRes = await client.query('SELECT id FROM employees WHERE employee_code = $1', [employee_code]);
        if (empRes.rows.length === 0) {
            throw new Error(`Employee ${employee_code} not found`);
        }
        const employee_id = empRes.rows[0].id;

        // 2. Insert into resignations table
        // Map boolean attendance to string option if needed, or store as is if schema allows
        // Schema has attendance_option (varchar)
        const attendance_option = attendance_enabled ? 'Enable' : 'Disable';

        await client.query(
            `INSERT INTO resignations 
            (employee_id, resignation_date, resignation_type, report_end_date, attendance_option, reason) 
            VALUES ($1, $2, $3, $4, $5, $6)`,
            [employee_id, resignation_date, resignation_type, report_end_date, attendance_option, reason]
        );

        // 3. Update employees status
        //
        // attendance_required follows the choice made in the dialog. It was
        // recorded on the resignation row and then never applied, so a resigned
        // employee kept being expected at work and generated an absence for
        // every working day after they left.
        const updateResult = await client.query(
            `UPDATE employees
                SET status = 'resigned',
                    department_id = NULL,
                    attendance_required = $2
              WHERE id = $1
          RETURNING *`,
            [employee_id, Boolean(attendance_enabled)]
        );

        await client.query('COMMIT');
        res.json(updateResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Resignation transaction failed:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Employee Documents Management
router.get('/employee-docs', async (req, res) => {
    try {
        const { employee_code } = req.query;
        let query = 'SELECT ed.*, e.name as employee_name, e.employee_code FROM employee_docs ed JOIN employees e ON ed.employee_code = e.employee_code';
        let params = [];
        
        if (employee_code) {
            query += ' WHERE ed.employee_code = $1';
            params.push(employee_code);
        }
        query += ' ORDER BY ed.uploaded_at DESC';
        
        const result = await db.query(query, params);
        // Ensure file_type exists in response (default to application/pdf if not in DB)
        const docs = result.rows.map(doc => ({
            ...doc,
            file_type: doc.file_type || 'application/pdf'
        }));
        res.json(docs);
    } catch (err) { 
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: err.message }); 
    }
});

router.get('/employee-docs/:code', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT ed.*, e.name as employee_name FROM employee_docs ed JOIN employees e ON ed.employee_code = e.employee_code WHERE ed.employee_code = $1 ORDER BY ed.uploaded_at DESC',
            [req.params.code]
        );
        res.json(result.rows);
    } catch (err) { 
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: err.message }); 
    }
});

router.post('/employee-docs', async (req, res) => {
    const { employee_code, doc_name, file_data, file_type } = req.body;
    
    if (!employee_code || !doc_name || !file_data) {
        return res.status(400).json({ error: 'employee_code, doc_name, and file_data are required' });
    }
    
    try {
        // Check if file_type column exists, if not, just use file_path
        // Store file_data (base64) directly in file_path for now
        // In production, you'd save to disk/S3 and store the path
        let result;
        try {
            // Try with file_type column first
            result = await db.query(
                'INSERT INTO employee_docs (employee_code, doc_name, file_path, file_type) VALUES ($1, $2, $3, $4) RETURNING *',
                [employee_code, doc_name, file_data, file_type || 'application/pdf']
            );
        } catch (colErr) {
            // If file_type column doesn't exist, insert without it
            if (colErr.message.includes('column') && colErr.message.includes('file_type')) {
                result = await db.query(
                    'INSERT INTO employee_docs (employee_code, doc_name, file_path) VALUES ($1, $2, $3) RETURNING *',
                    [employee_code, doc_name, file_data]
                );
                // Add file_type to response manually
                result.rows[0].file_type = file_type || 'application/pdf';
            } else {
                throw colErr;
            }
        }
        res.json(result.rows[0]);
    } catch (err) { 
        console.error('Error uploading document:', err);
        res.status(500).json({ error: err.message }); 
    }
});

router.delete('/employee-docs/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM employee_docs WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        res.json({ message: 'Document deleted successfully', document: result.rows[0] });
    } catch (err) { 
        console.error('Error deleting document:', err);
        res.status(500).json({ error: err.message }); 
    }
});

// Personnel Transfer - Move employees with Device Sync
router.post('/personnel-transfer', async (req, res) => {
    // 1. Bulk Area Transfer Mode
    if (req.body.mode === 'bulk_area') {
        const { from_area_id, target_area_id } = req.body;
        if (!from_area_id || !target_area_id) return res.status(400).json({ error: 'Source and Target Area IDs required' });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE employees SET area_id = $1 WHERE area_id = $2 RETURNING employee_code, name, privilege, password, card_number`,
                [target_area_id, from_area_id]
            );

            // Sync
            const devices = await client.query('SELECT serial_number FROM devices');
            for (const emp of result.rows) {
                const cmd = `DATA UPDATE USERINFO PIN=${emp.employee_code}\tName=${emp.name}\tPri=${emp.privilege || 0}\tPasswd=${emp.password || ''}\tCard=${emp.card_number || ''}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                for (const dev of devices.rows) {
                    await client.query(
                        `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                        [dev.serial_number, cmd]
                    );
                }
            }
            await client.query('COMMIT');
            return res.json({ message: `Transferred ${result.rowCount} employees successfully`, transferred: result.rowCount });
        } catch (err) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: err.message });
        } finally { client.release(); }
    }

    // 2. Standard Transfer (Array of IDs)
    const { ids, type, targetId } = req.body; // ids: [1, 2], type: 'Department'|'Area'|'Position', targetId: int|string

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No employees selected' });
    }
    if (!type || !targetId) {
        return res.status(400).json({ error: 'Transfer type and target are required' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        let updateQuery = '';
        let params = [targetId, ids];

        if (type === 'Department') {
            updateQuery = 'UPDATE employees SET department_id = $1 WHERE id = ANY($2) RETURNING employee_code, name, privilege, password, card_number';
        } else if (type === 'Area') {
            updateQuery = 'UPDATE employees SET area_id = $1 WHERE id = ANY($2) RETURNING employee_code, name, privilege, password, card_number';
        } else if (type === 'Position') {
            // Mapping 'Position' to 'designation' field
            updateQuery = 'UPDATE employees SET designation = $1 WHERE id = ANY($2) RETURNING employee_code, name, privilege, password, card_number';
        } else {
            throw new Error('Invalid transfer type');
        }

        const result = await client.query(updateQuery, params);

        // SYNC TO DEVICES
        // 1. Get all online/active devices (or all devices if we want to queue for offline ones too)
        const devices = await client.query('SELECT serial_number FROM devices');

        for (const emp of result.rows) {
            // Construct ADMS User Command
            const cmd = `DATA UPDATE USERINFO PIN=${emp.employee_code}\tName=${emp.name}\tPri=${emp.privilege || 0}\tPasswd=${emp.password || ''}\tCard=${emp.card_number || ''}\tGrp=1\tTZ=1\tVerify=0`;

            for (const dev of devices.rows) {
                await client.query(
                    `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                    [dev.serial_number, cmd]
                );
            }
        }

        await client.query('COMMIT');

        res.json({
            message: `Transferred ${result.rowCount} employees successfully. Sync commands queued for ${devices.rowCount} devices.`,
            transferred: result.rowCount
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Transfer Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Rehire Employee (Restore to Active & Sync)
router.post('/employees/rehire', async (req, res) => {
    const { employee_id } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'Employee ID required' });

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // 1. Update status to active
        const updateRes = await client.query(
            "UPDATE employees SET status = 'active' WHERE id = $1 RETURNING *",
            [employee_id]
        );

        if (updateRes.rowCount === 0) {
            throw new Error('Employee not found');
        }
        const emp = updateRes.rows[0];

        // 2. Sync to Devices (Re-enable access/upload user)
        const devices = await client.query('SELECT serial_number FROM devices');
        const cmd = `DATA UPDATE USERINFO PIN=${emp.employee_code}\tName=${emp.name}\tPri=${emp.privilege || 0}\tPasswd=${emp.password || ''}\tCard=${emp.card_number || ''}\tGrp=1\tTZ=1\tVerify=0`;

        for (const dev of devices.rows) {
            await client.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [dev.serial_number, cmd]
            );
        }

        await client.query('COMMIT');
        res.json({ message: 'Employee rehired and synced to devices', employee: emp });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Rehire Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;

