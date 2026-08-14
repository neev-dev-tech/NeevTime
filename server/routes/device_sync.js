const express = require('express');
const fs = require('fs');
const router = express.Router();
const db = require('../db');
const deviceCapabilities = require('../services/device-capabilities');

// ==========================================
// SYNC ALL DEVICES - Bi-directional Sync
// ==========================================

// Helper: Get all device serial numbers
const getAllDeviceSerials = async () => {
    const result = await db.query('SELECT serial_number FROM devices');
    return result.rows.map(d => d.serial_number);
};

// Sync All: Upload ALL Users to ALL Devices
router.post('/sync/all/upload-users', async (req, res) => {
    try {
        const device_serials = await getAllDeviceSerials();
        if (device_serials.length === 0) {
            return res.status(400).json({ error: 'No devices registered' });
        }

        const employees = await db.query("SELECT * FROM employees WHERE LOWER(status) = 'active'");
        if (employees.rows.length === 0) {
            return res.status(400).json({ error: 'No active employees to sync' });
        }

        let commandCount = 0;
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            for (const serial of device_serials) {
                for (const emp of employees.rows) {
                    const pin = emp.employee_code;
                    const name = (emp.name || '').replace(/\t/g, ' ');
                    const pri = emp.privilege || 0;
                    const passwd = emp.password || '';
                    const card = emp.card_number || '';

                    const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${pri}\tPasswd=${passwd}\tCard=${card}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;

                    await client.query(
                        `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                        [serial, cmd]
                    );
                    commandCount++;
                }
            }

            await client.query('COMMIT');
            res.json({
                success: true,
                message: `Synced ${employees.rows.length} employees to ${device_serials.length} devices (${commandCount} commands queued).`,
                employeeCount: employees.rows.length,
                deviceCount: device_serials.length,
                commandCount
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Sync All Upload Users Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync All: Download Users from ALL Devices
router.post('/sync/all/download-users', async (req, res) => {
    try {
        const device_serials = await getAllDeviceSerials();
        if (device_serials.length === 0) {
            return res.status(400).json({ error: 'No devices registered' });
        }

        let commandCount = 0;
        for (const serial of device_serials) {
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [serial, 'DATA QUERY USERINFO']
            );
            commandCount++;
        }

        res.json({ success: true, message: `Queued user download from ${commandCount} devices.`, deviceCount: commandCount });
    } catch (err) {
        console.error('Sync All Download Users Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync All: Download Logs from ALL Devices
router.post('/sync/all/download-logs', async (req, res) => {
    try {
        const device_serials = await getAllDeviceSerials();
        if (device_serials.length === 0) {
            return res.status(400).json({ error: 'No devices registered' });
        }

        let commandCount = 0;
        for (const serial of device_serials) {
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [serial, 'INFO ATTLOG']
            );
            commandCount++;
        }

        res.json({ success: true, message: `Queued log download from ${commandCount} devices.`, deviceCount: commandCount });
    } catch (err) {
        console.error('Sync All Download Logs Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Sync Status - Shows pending commands per device
router.get('/sync/status', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                dc.device_serial,
                d.device_name,
                COUNT(*) FILTER (WHERE dc.status = 'pending') as pending_count,
                COUNT(*) FILTER (WHERE dc.status = 'sent') as sent_count,
                MAX(dc.created_at) as last_command_at
            FROM device_commands dc
            LEFT JOIN devices d ON dc.device_serial = d.serial_number
            GROUP BY dc.device_serial, d.device_name
            ORDER BY pending_count DESC
        `);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SELECTIVE SYNC - Per-device selection
// ==========================================

// Sync: Upload Users to Selected Devices (supports all: true flag)
router.post('/sync/upload-users', async (req, res) => {
    let { device_serials, all } = req.body;

    // Support "all" flag for convenience
    if (all === true) {
        device_serials = await getAllDeviceSerials();
    }

    if (!device_serials || !Array.isArray(device_serials) || device_serials.length === 0) {
        return res.status(400).json({ error: 'No devices selected' });
    }

    try {
        const employees = await db.query("SELECT * FROM employees WHERE LOWER(status) = 'active'");

        let commandCount = 0;
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            for (const serial of device_serials) {
                for (const emp of employees.rows) {
                    const pin = emp.employee_code;
                    const name = emp.name.replace(/\t/g, ' ');
                    const pri = emp.privilege || 0;
                    const passwd = emp.password || '';
                    const card = emp.card_number || '';

                    const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=${pri}\tPasswd=${passwd}\tCard=${card}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;

                    await client.query(
                        `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                        [serial, cmd]
                    );
                    commandCount++;
                }
            }

            await client.query('COMMIT');
            res.json({ success: true, message: `Generated ${commandCount} upload commands for ${device_serials.length} devices.` });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Upload Users Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync: Download Users from Device (Upload User Data from device)
router.post('/sync/download-users', async (req, res) => {
    let { device_serials, all } = req.body;

    if (all === true) {
        device_serials = await getAllDeviceSerials();
    }

    if (!device_serials || !Array.isArray(device_serials) || device_serials.length === 0) {
        return res.status(400).json({ error: 'No devices selected' });
    }

    try {
        let commandCount = 0;
        for (const serial of device_serials) {
            const cmd = `DATA QUERY USERINFO`;

            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [serial, cmd]
            );
            commandCount++;
        }
        res.json({ success: true, message: `Queued user download for ${commandCount} devices.` });
    } catch (err) {
        console.error('Download Users Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync: Download Logs from Device
router.post('/sync/download-logs', async (req, res) => {
    let { device_serials, startDate, endDate, all } = req.body;

    if (all === true) {
        device_serials = await getAllDeviceSerials();
    }

    if (!device_serials || !Array.isArray(device_serials) || device_serials.length === 0) {
        return res.status(400).json({ error: 'No devices selected' });
    }

    try {
        let commandCount = 0;

        for (const serial of device_serials) {
            const cmd = `INFO ATTLOG`;

            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [serial, cmd]
            );
            commandCount++;
        }
        res.json({ success: true, message: `Queued log download for ${commandCount} devices. Logs will sync automatically.` });
    } catch (err) {
        console.error('Download Logs Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Sync: Reboot Device
router.post('/sync/reboot', async (req, res) => {
    let { device_serials, all } = req.body;

    if (all === true) {
        device_serials = await getAllDeviceSerials();
    }

    if (!device_serials || !Array.isArray(device_serials) || device_serials.length === 0) {
        return res.status(400).json({ error: 'No devices selected' });
    }

    try {
        let commandCount = 0;
        for (const serial of device_serials) {
            const cmd = 'REBOOT';
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [serial, cmd]
            );
            commandCount++;
        }
        res.json({ success: true, message: `Queued reboot command for ${commandCount} devices.` });
    } catch (err) {
        console.error('Reboot Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// ==========================================
// Employee-Specific Device Actions
// ==========================================

// 1. Resynchronize to Device (Push selected employees to all devices)
router.post('/employee-actions/push', async (req, res) => {
    const { employee_ids } = req.body;
    if (!employee_ids || employee_ids.length === 0) return res.status(400).json({ error: 'No employees selected' });

    try {
        const client = await db.getClient();
        try {
            // Get employee details
            const employees = await client.query('SELECT * FROM employees WHERE id = ANY($1)', [employee_ids]);

            // Get all active devices
            const devices = await client.query('SELECT serial_number FROM devices');

            if (devices.rowCount === 0) return res.status(400).json({ error: 'No verified devices found to sync with.' });

            let count = 0;
            await client.query('BEGIN');

            // Fetch templates for these employees
            const templates = await client.query(`SELECT * FROM biometric_templates WHERE employee_code = ANY($1)`, [employees.rows.map(e => e.employee_code)]);

            for (const emp of employees.rows) {
                // 1. Send USERINFO - Include biometric flags to activate recognition engine
                // Sequence=1 ensures USERINFO is always sent first
                const cmdUser = `DATA UPDATE USERINFO PIN=${emp.employee_code}\tName=${emp.name}\tPri=${emp.privilege || 0}\tPasswd=${emp.password || ''}\tCard=${emp.card_number || ''}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;

                for (const dev of devices.rows) {
                    await client.query(
                        `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                        [dev.serial_number, cmdUser]
                    );
                    count++;
                }
            }

            // 2. Send Biometrics (Finger/Face)
            // IMPORTANT: Get fresh template data from database to ensure we're using latest data
            for (const tmpl of templates.rows) {
                // Re-fetch template from database to get absolute latest data including version fields
                const freshTemplate = await client.query(`
                    SELECT template_data, template_type, template_no, employee_code, 
                           major_ver, minor_ver, format, index_no, valid, duress
                    FROM biometric_templates 
                    WHERE id = $1
                `, [tmpl.id]);

                if (freshTemplate.rows.length === 0) {
                    console.log(`[SYNC] Template ${tmpl.id} not found in database, skipping`);
                    continue;
                }

                const freshTmpl = freshTemplate.rows[0];

                // Calculate Size
                let b64 = freshTmpl.template_data || '';
                let padding = (b64.match(/=/g) || []).length;
                let size = Math.floor((b64.length * 3) / 4) - padding;

                let cmds = [];
                // Skip invalid/blank templates
                if (!freshTmpl.template_data || freshTmpl.template_data.startsWith('AAAA') || freshTmpl.template_data.length < 100) {
                    console.log(`[SYNC] Skipping blank/invalid template for PIN=${freshTmpl.employee_code} No=${freshTmpl.template_no}`);
                    continue;
                }

                // Correct byte size calculation from base64
                b64 = freshTmpl.template_data.trim().replace(/[\r\n]/g, '');
                padding = (b64.match(/=/g) || []).length;
                size = Math.floor((b64.length * 3) / 4) - padding;

                if (Number(freshTmpl.template_type) === 9) {
                    // FACE - Use BIODATA format with version fields for cross-device compatibility
                    // CRITICAL: The device uses BIODATA format internally for face templates
                    const majorVer = freshTmpl.major_ver || 40;
                    const minorVer = freshTmpl.minor_ver || 1;
                    const formatVal = freshTmpl.format || 0;
                    const indexNo = freshTmpl.index_no || 0;
                    const validVal = freshTmpl.valid || 1;
                    const duressVal = freshTmpl.duress || 0;
                    const faceNo = freshTmpl.template_no != null ? freshTmpl.template_no : 0;

                    for (const dev of devices.rows) {
                        if (dev.serial_number === tmpl.source_device) continue;
                        // Delete existing face AFTER USERINFO (user must exist first)
                        // Sequence=2 ensures DELETE comes after USERINFO
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 2)`,
                            [dev.serial_number, `DATA DELETE FACE PIN=${freshTmpl.employee_code}`]
                        );
                        count++;
                        // Then add new face using BIODATA format
                        // Sequence=3 ensures UPDATE comes after DELETE
                        const biodataCmd = `DATA UPDATE BIODATA Pin=${freshTmpl.employee_code}\tNo=${faceNo}\tIndex=${indexNo}\tValid=${validVal}\tDuress=${duressVal}\tType=9\tMajorVer=${majorVer}\tMinorVer=${minorVer}\tFormat=${formatVal}\tTmp=${b64}`;
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 3)`,
                            [dev.serial_number, biodataCmd]
                        );
                        count++;
                        console.log(`[SYNC] Queued BIODATA face for PIN=${freshTmpl.employee_code} to ${dev.serial_number} (MajorVer=${majorVer}, MinorVer=${minorVer})`);
                    }
                } else {
                    // FINGERPRINT - Use FINGERTMP (confirmed working from device history)
                    // Device rejects BIODATA and templatev10, so only send FINGERTMP
                    // Sequence=3 (same as face UPDATE, but fingerprints don't need DELETE)
                    const fingerFID = freshTmpl.template_no != null ? freshTmpl.template_no : 0;
                    for (const dev of devices.rows) {
                        if (dev.serial_number === tmpl.source_device) continue;
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 3)`,
                            [dev.serial_number, `DATA UPDATE FINGERTMP PIN=${freshTmpl.employee_code}\tFID=${fingerFID}\tSize=${size}\tValid=1\tTMP=${b64}`]
                        );
                        count++;
                    }
                }
            }

            await client.query('COMMIT');
            res.json({ message: `Queued sync for ${employees.rowCount} employees to ${devices.rowCount} devices.` });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Push Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Re-upload from Device (Pull selected employees from all devices)
router.post('/employee-actions/pull', async (req, res) => {
    const { employee_ids } = req.body;
    if (!employee_ids || employee_ids.length === 0) return res.status(400).json({ error: 'No employees selected' });

    try {
        const client = await db.getClient();
        try {
            const employees = await client.query('SELECT employee_code FROM employees WHERE id = ANY($1)', [employee_ids]);
            const devices = await client.query('SELECT serial_number FROM devices');

            let count = 0;
            await client.query('BEGIN');

            for (const emp of employees.rows) {
                const cmdUser = `DATA QUERY USERINFO PIN=${emp.employee_code}`;
                const cmdFinger = `DATA QUERY FINGERTMP PIN=${emp.employee_code}`;
                // facev7 / templatev10 were tried here and are not keywords these
                // readers accept — every one was rejected. FACE and BIODATA fetch
                // the same templates and are accepted.
                const cmdFace = `DATA QUERY FACE PIN=${emp.employee_code}`;
                const cmdBio = `DATA QUERY BIODATA PIN=${emp.employee_code}`;
                const cmdAttLog = `DATA QUERY ATTLOG PIN=${emp.employee_code}`; // Control to verify query works

                for (const dev of devices.rows) {
                    const cmds = [cmdUser, cmdFinger, cmdFace, cmdBio, cmdAttLog];
                    for (const c of cmds) {
                        await client.query(`INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`, [dev.serial_number, c]);
                    }
                    count += cmds.length;
                }
            }
            await client.query('COMMIT');
            res.json({ message: `Queued data fetch for ${employees.rowCount} employees from ${devices.rowCount} devices.` });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Delete Biometric Template
router.post('/employee-actions/delete-template', async (req, res) => {
    const { employee_ids } = req.body;
    if (!employee_ids || employee_ids.length === 0) return res.status(400).json({ error: 'No employees selected' });

    try {
        const client = await db.getClient();
        try {
            const employees = await client.query('SELECT employee_code FROM employees WHERE id = ANY($1)', [employee_ids]);
            const devices = await client.query('SELECT serial_number FROM devices');

            let count = 0;
            await client.query('BEGIN');

            for (const emp of employees.rows) {
                const cmdFinger = `DATA DELETE FINGERTMP PIN=${emp.employee_code}`;
                const cmdFace = `DATA DELETE FACE PIN=${emp.employee_code}`;

                for (const dev of devices.rows) {
                    await client.query(`INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`, [dev.serial_number, cmdFinger]);
                    await client.query(`INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`, [dev.serial_number, cmdFace]);
                    count++;
                }
            }

            await client.query('COMMIT');
            res.json({ message: `Queued biometric deletion for ${employees.rowCount} employees on ${devices.rowCount} devices.` });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// BIOMETRIC TEMPLATE SYNC
// ==========================================

// Sync All: Upload Biometric Templates to All Devices
// This pushes stored fingerprint/face templates from database to all devices
router.post('/sync/all/upload-biometrics', async (req, res) => {
    fs.appendFileSync('sync_debug.log', `[API] /sync/all/upload-biometrics called at ${new Date().toISOString()}\n`);
    try {
        const devices = await db.query('SELECT serial_number FROM devices');
        if (devices.rowCount === 0) {
            fs.appendFileSync('sync_debug.log', '[API] No devices found\n');
            return res.status(400).json({ error: 'No devices registered' });
        }

        // Get all biometric templates from database
        const templates = await db.query(`
                SELECT bt.*, e.name 
                FROM biometric_templates bt
                JOIN employees e ON bt.employee_code = e.employee_code
                WHERE LOWER(e.status) = 'active'
            `);
        fs.appendFileSync('sync_debug.log', `[API] Found ${templates.rowCount} templates to sync\n`);

        if (templates.rowCount === 0) {
            return res.json({ success: true, message: 'No biometric templates to sync' });
        }

        const client = await db.getClient();
        let commandCount = 0;

        try {
            await client.query('BEGIN');

            for (const dev of devices.rows) {
                const sentUsers = new Set();

                for (const tmpl of templates.rows) {
                    // Send USERINFO first (once per user per device)
                    // Sequence=1 ensures USERINFO is always sent first
                    if (!sentUsers.has(tmpl.employee_code)) {
                        const safeName = (tmpl.name || 'Unknown').replace(/\t/g, ' ');
                        const cmdUser = `DATA UPDATE USERINFO PIN=${tmpl.employee_code}\tName=${safeName}\tPri=${tmpl.privilege || 0}\tPasswd=${tmpl.password || ''}\tCard=${tmpl.card_number || ''}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                            [dev.serial_number, cmdUser]
                        );
                        commandCount++;
                        sentUsers.add(tmpl.employee_code);
                    }

                    // Calculate Size from Base64 (Rough Estimate or Exact)
                    let b64 = tmpl.template_data || '';
                    let padding = (b64.match(/=/g) || []).length;
                    let size = Math.floor((b64.length * 3) / 4) - padding;

                    let cmds = [];
                    // Skip invalid/blank templates
                    if (!tmpl.template_data || tmpl.template_data.startsWith('AAAA') || tmpl.template_data.length < 100) {
                        console.log(`[SYNC] Skipping blank/invalid template for PIN=${tmpl.employee_code} Type=${tmpl.template_type} No=${tmpl.template_no}`);
                        continue;
                    }

                    b64 = tmpl.template_data.trim().replace(/[\r\n]/g, '');
                    padding = (b64.match(/=/g) || []).length;
                    size = Math.floor((b64.length * 3) / 4) - padding;

                    if (Number(tmpl.template_type) === 9) {
                        // FACE - Use BIODATA format with version fields for cross-device compatibility
                        // CRITICAL: The device uses BIODATA format internally for face templates
                        const majorVer = tmpl.major_ver || 40;
                        const minorVer = tmpl.minor_ver || 1;
                        const formatVal = tmpl.format || 0;
                        const indexNo = tmpl.index_no || 0;
                        const validVal = tmpl.valid || 1;
                        const duressVal = tmpl.duress || 0;
                        const faceNo = tmpl.template_no != null ? tmpl.template_no : 0;

                        // Delete existing face AFTER USERINFO (user must exist first)
                        // Sequence=2 ensures DELETE comes after USERINFO
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 2)`,
                            [dev.serial_number, `DATA DELETE FACE PIN=${tmpl.employee_code}`]
                        );
                        commandCount++;
                        // Then add new face using BIODATA format
                        // Sequence=3 ensures UPDATE comes after DELETE
                        const biodataCmd = `DATA UPDATE BIODATA Pin=${tmpl.employee_code}\tNo=${faceNo}\tIndex=${indexNo}\tValid=${validVal}\tDuress=${duressVal}\tType=9\tMajorVer=${majorVer}\tMinorVer=${minorVer}\tFormat=${formatVal}\tTmp=${b64}`;
                        cmds.push({ cmd: biodataCmd, seq: 3 });
                        console.log(`[SYNC] Queued BIODATA face for PIN=${tmpl.employee_code} (MajorVer=${majorVer}, MinorVer=${minorVer})`);
                    } else {
                        // FINGERPRINT - Use FINGERTMP (confirmed working from device history)
                        // Device rejects BIODATA and templatev10, so only send FINGERTMP
                        // Sequence=3 (same as face UPDATE, but fingerprints don't need DELETE)
                        const fingerFID = tmpl.template_no != null ? tmpl.template_no : 0;
                        cmds.push({ cmd: `DATA UPDATE FINGERTMP PIN=${tmpl.employee_code}\tFID=${fingerFID}\tSize=${size}\tValid=1\tTMP=${b64}`, seq: 3 });
                    }

                    for (const cmdObj of cmds) {
                        await client.query(
                            `INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', $3)`,
                            [dev.serial_number, cmdObj.cmd, cmdObj.seq]
                        );
                        commandCount++;
                    }
                }
            }

            await client.query('COMMIT');
            res.json({
                success: true,
                message: `Queued ${commandCount} biometric template uploads (${templates.rowCount} templates to ${devices.rowCount} devices).`
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('Upload Biometrics Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Download Biometric Templates from All Devices
// This tells devices to send their biometric data to the server
router.post('/sync/all/download-biometrics', async (req, res) => {
    try {
        const devices = await db.query('SELECT serial_number FROM devices');
        if (devices.rowCount === 0) {
            return res.status(400).json({ error: 'No devices registered' });
        }

        let commandCount = 0;
        for (const dev of devices.rows) {
            // Query fingerprint templates
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [dev.serial_number, 'DATA QUERY FINGERTMP']
            );
            // Query face templates
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [dev.serial_number, 'DATA QUERY FACE']
            );
            // USERVF used to be queried here on the theory that it carried face
            // and palm data. These readers do not know the keyword: 44 attempts,
            // 0 accepted, and it produced 20 of the queue's 28 dead-lettered
            // commands. FACE and BIODATA below return the same templates and are
            // accepted every time, so nothing is lost by dropping it.

            // BIODATA matters on newer firmware, which stores templates there
            await db.query(
                `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                [dev.serial_number, 'DATA QUERY BIODATA']
            );
            commandCount += 3;
        }

        res.json({
            success: true,
            message: `Queued biometric download for ${commandCount} devices. Templates will be stored when devices respond.`
        });

    } catch (err) {
        console.error('Download Biometrics Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get stored biometric templates summary
router.get('/biometrics/summary', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                e.employee_code,
                e.name,
                COUNT(*) FILTER (WHERE bt.template_type IN (1, 2)) as fingerprint_count,
                COUNT(*) FILTER (WHERE bt.template_type = 9) as face_count,
                MAX(bt.updated_at) as last_updated,
                string_agg(DISTINCT bt.source_device, ', ') as source_devices
            FROM employees e
            LEFT JOIN biometric_templates bt ON e.employee_code = bt.employee_code
            WHERE bt.id IS NOT NULL
            GROUP BY e.employee_code, e.name
            ORDER BY e.name
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==========================================
// TCP-BASED BIOMETRIC SYNC (ZKTeco Binary Protocol)
// ==========================================

const zktecoTcp = require('../services/zkteco-tcp');

// Get device info via TCP
router.get('/tcp/device-info/:ip', async (req, res) => {
    const { ip } = req.params;
    try {
        const result = await zktecoTcp.getDeviceInfo(ip);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get users from device via TCP
router.get('/tcp/users/:ip', async (req, res) => {
    const { ip } = req.params;
    try {
        const result = await zktecoTcp.getUsers(ip);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Push biometrics to device via TCP
router.post('/tcp/push-biometrics', async (req, res) => {
    const { target_device_serial, employee_codes } = req.body;

    if (!target_device_serial || !employee_codes || employee_codes.length === 0) {
        return res.status(400).json({ error: 'Missing target_device_serial or employee_codes' });
    }

    try {
        const result = await zktecoTcp.syncBiometricsToDevice(target_device_serial, employee_codes);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create user on device via TCP
router.post('/tcp/set-user', async (req, res) => {
    const { ip, user_id, name } = req.body;

    if (!ip || !user_id || !name) {
        return res.status(400).json({ error: 'Missing ip, user_id, or name' });
    }

    try {
        const result = await zktecoTcp.setUser(ip, user_id, name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DEVICE CAPABILITIES API
// Auto-detected device model, firmware, and biometric algorithm versions
// ==========================================

// Get all device capabilities
router.get('/device-capabilities', async (req, res) => {
    try {
        const capabilities = await deviceCapabilities.getAllCapabilities();
        res.json(capabilities);
    } catch (err) {
        console.error('Get Device Capabilities Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get specific device capabilities
router.get('/device-capabilities/:serial', async (req, res) => {
    try {
        const caps = await deviceCapabilities.getCapabilities(req.params.serial);
        if (!caps) {
            return res.status(404).json({ error: 'Device capabilities not found' });
        }
        res.json(caps);
    } catch (err) {
        console.error('Get Device Capabilities Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Probe device for capabilities (send query commands to detect)
router.post('/device-capabilities/probe/:serial', async (req, res) => {
    try {
        const result = await deviceCapabilities.probeDeviceCapabilities(req.params.serial);
        res.json({
            success: result,
            message: result ? 'Capability probe commands queued' : 'Failed to queue probe commands'
        });
    } catch (err) {
        console.error('Probe Device Capabilities Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// HEALTH MONITORING API
// Real-time device health and system status
// ==========================================

const healthMonitor = require('../services/health-monitor');
const commandQueue = require('../services/command-queue');

// Get system-wide health summary
router.get('/health/summary', async (req, res) => {
    try {
        const summary = await healthMonitor.getSystemHealthSummary();
        res.json(summary);
    } catch (err) {
        console.error('Health Summary Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all devices health status
router.get('/health/devices', async (req, res) => {
    try {
        const health = await healthMonitor.getAllDevicesHealth();
        res.json(health);
    } catch (err) {
        console.error('Devices Health Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get specific device health
router.get('/health/devices/:serial', async (req, res) => {
    try {
        const health = await healthMonitor.calculateHealthScore(req.params.serial);
        const uptime = await healthMonitor.getUptimeStats(req.params.serial, 7);
        res.json({ health, uptime });
    } catch (err) {
        console.error('Device Health Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get active alerts
router.get('/health/alerts', async (req, res) => {
    try {
        const alerts = await healthMonitor.checkAndGenerateAlerts();
        res.json(alerts);
    } catch (err) {
        console.error('Alerts Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// COMMAND QUEUE MANAGEMENT API
// Advanced queue operations
// ==========================================

// Get queue statistics
router.get('/queue/stats', async (req, res) => {
    try {
        const { device } = req.query;
        const stats = await commandQueue.getQueueStats(device);
        res.json(stats);
    } catch (err) {
        console.error('Queue Stats Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get dead letter queue
router.get('/queue/dead-letter', async (req, res) => {
    try {
        const { device, limit } = req.query;
        const items = await commandQueue.getDeadLetterQueue(device, parseInt(limit) || 50);
        res.json(items);
    } catch (err) {
        console.error('Dead Letter Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Retry a dead letter command
router.post('/queue/dead-letter/:id/retry', async (req, res) => {
    try {
        const success = await commandQueue.retryDeadLetter(parseInt(req.params.id));
        res.json({ success, message: success ? 'Command queued for retry' : 'Command not found or not in dead letter state' });
    } catch (err) {
        console.error('Retry Dead Letter Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Cancel pending commands for a device
router.post('/queue/cancel/:serial', async (req, res) => {
    try {
        const { commandType } = req.body;
        const count = await commandQueue.cancelPendingCommands(req.params.serial, commandType);
        res.json({ success: true, cancelled: count });
    } catch (err) {
        console.error('Cancel Commands Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get command history for an employee
router.get('/queue/employee/:code', async (req, res) => {
    try {
        const { limit } = req.query;
        const history = await commandQueue.getEmployeeCommandHistory(req.params.code, parseInt(limit) || 20);
        res.json(history);
    } catch (err) {
        console.error('Employee Command History Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Purge old commands (admin only)
router.post('/queue/purge', async (req, res) => {
    try {
        const { days } = req.body;
        const count = await commandQueue.purgeOldCommands(parseInt(days) || 30);
        res.json({ success: true, purged: count });
    } catch (err) {
        console.error('Purge Commands Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
