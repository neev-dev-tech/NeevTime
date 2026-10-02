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
//
// Documents are contracts and ID proofs, stored base64 in employee_docs.file_path.
// The lists used to return that content for every document to any signed-in
// role, viewer included — one request fetched every ID proof on file. Lists
// now return metadata only; the file comes from /employee-docs/file/:id, one
// at a time, for admin and HR.
const { requireRole } = require('../utils/rbac');

const DOC_LIST_COLUMNS = `ed.id, ed.employee_code, ed.doc_name, ed.uploaded_at,
    COALESCE(ed.file_type, 'application/pdf') AS file_type,
    (ed.file_path IS NOT NULL AND ed.file_path <> '') AS has_file,
    e.name AS employee_name`;

// What may be uploaded, and how big. The page already checks both; the server
// did not, so anything of any size could be stored.
const DOC_TYPES = new Set([
    'application/pdf', 'image/jpeg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const DOC_MAX_BYTES = 10 * 1024 * 1024;

// Two pages upload differently: one sends raw base64, the other a data: URL.
// Stored either way over the years, so both are read back.
const splitDataUrl = (value) => {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(value || ''));
    return m ? { type: m[1] || null, data: m[3] } : { type: null, data: String(value || '') };
};

router.get('/employee-docs', async (req, res) => {
    try {
        const { employee_code } = req.query;
        let query = `SELECT ${DOC_LIST_COLUMNS} FROM employee_docs ed JOIN employees e ON ed.employee_code = e.employee_code`;
        const params = [];
        if (employee_code) {
            query += ' WHERE ed.employee_code = $1';
            params.push(employee_code);
        }
        query += ' ORDER BY ed.uploaded_at DESC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/employee-docs/file/:id', requireRole('admin', 'hr'), async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, doc_name, file_path, file_type FROM employee_docs WHERE id = $1',
            [req.params.id]
        );
        const doc = result.rows[0];
        if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document not found' });
        const { type, data } = splitDataUrl(doc.file_path);
        res.json({ id: doc.id, doc_name: doc.doc_name, file_type: doc.file_type || type || 'application/pdf', data });
    } catch (err) {
        console.error('Error fetching document file:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/employee-docs/:code', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT ${DOC_LIST_COLUMNS} FROM employee_docs ed JOIN employees e ON ed.employee_code = e.employee_code
              WHERE ed.employee_code = $1 ORDER BY ed.uploaded_at DESC`,
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

    const parsed = splitDataUrl(file_data);
    const type = file_type || parsed.type || 'application/pdf';
    if (!DOC_TYPES.has(type)) {
        return res.status(400).json({ error: 'Upload a PDF, Word document, JPG or PNG.' });
    }
    const base64 = parsed.data.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        return res.status(400).json({ error: 'The file could not be read. Choose it again.' });
    }
    if (Math.floor(base64.length * 3 / 4) > DOC_MAX_BYTES) {
        return res.status(413).json({ error: 'Documents can be at most 10 MB.' });
    }

    try {
        // Stored as plain base64 whichever way the page sent it.
        const result = await db.query(
            `INSERT INTO employee_docs (employee_code, doc_name, file_path, file_type) VALUES ($1, $2, $3, $4)
             RETURNING id, employee_code, doc_name, file_type, uploaded_at`,
            [employee_code, doc_name, base64, type]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error uploading document:', err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/employee-docs/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM employee_docs WHERE id = $1 RETURNING id, employee_code, doc_name', [req.params.id]);
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

