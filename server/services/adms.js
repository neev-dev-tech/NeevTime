const db = require('../db');
const attendanceEngine = require('./attendance_engine');
const fs = require('node:fs');
const deviceCapabilities = require('./device-capabilities');
const moment = require('moment-timezone');

/**
 * ADMS Protocol Handler
 * 
 * Endpoints:
 * - GET /iclock/cdata: Initialization / Handshake
 * - POST /iclock/cdata: Receive Log Data
 * - GET /iclock/getrequest: Device asks for commands
 * - POST /iclock/devicecmd: Device responds to command result
 */

// Format timestamp for DB
const formatTime = (ts) => {
    // If ts is not provided or invalid, return now
    if (!ts) return new Date();
    return ts;
};

// Restore Logging Helpers
const logOperation = async (SN, time, opType, opWho, details) => {
    try {
        await db.query(`
            INSERT INTO device_operation_logs (device_serial, operation_type, operator, log_time, details, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [SN, opType, opWho, formatTime(time), details]);
    } catch (e) { console.error('logOperation error:', e); }
};

const logError = async (SN, time, errCode, errWho, details) => {
    try {
        await db.query(`
            INSERT INTO device_error_logs (device_serial, error_code, log_time, details, created_at)
            VALUES ($1, $2, $3, $4, NOW())
        `, [SN, errCode, formatTime(time), details]);
    } catch (e) { console.error('logError error:', e); }
};

const logAttendanceLogs = async (SN, pin, time, status, verify, workcode) => {
    try {
        await db.query(`
            INSERT INTO attendance_logs (device_serial, employee_code, punch_time, punch_state, verification_mode, work_code, created_at, sync_status)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'synced')
            ON CONFLICT (employee_code, punch_time) DO NOTHING
        `, [SN, pin, formatTime(time), status, verify, workcode]);
    } catch (e) { console.error('logAttendanceLogs error:', e); }
};

/**
 * Syncs a biometric template to all other registered devices
 */
const syncTemplateToOtherDevices = async (SN, PIN, templateType, templateNo, Temp, Valid, isNewTemplate, templateChanged, shouldForceSync) => {
    // CRITICAL: Always sync when templates are received from devices to ensure all devices have latest data
    const shouldAutoSync = isNewTemplate || templateChanged || shouldForceSync || true; 

    if (!shouldAutoSync) return;

    try {
        const otherDevices = await db.query(
            'SELECT serial_number FROM devices WHERE serial_number != $1',
            [SN]
        );

        if (otherDevices.rows.length === 0) return;

        const empResult = await db.query(
            'SELECT name, privilege, password, card_number FROM employees WHERE employee_code = $1',
            [PIN]
        );
        const emp = empResult.rows[0];
        const empName = (emp?.name || 'Unknown').replaceAll('\t', ' ');
        const empPri = emp?.privilege || 0;
        const empPasswd = emp?.password || '';
        const empCard = emp?.card_number || '';
        const validFlag = Number.parseInt(Valid || 1);

        for (const dev of otherDevices.rows) {
            const recentUserInfo = await db.query(`
                SELECT id FROM device_commands 
                WHERE device_serial = $1 AND command LIKE $2 
                AND status IN ('pending', 'sent')
                AND created_at > NOW() - INTERVAL '2 minutes'
                LIMIT 1
            `, [dev.serial_number, `DATA UPDATE USERINFO PIN=${PIN}%`]);

            if (recentUserInfo.rows.length === 0) {
                const cmdUser = `DATA UPDATE USERINFO PIN=${PIN}\tName=${empName}\tPri=${empPri}\tPasswd=${empPasswd}\tCard=${empCard}\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1`;
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 1)`,
                    [dev.serial_number, cmdUser]);
            }

            if (templateType === 9) {
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 2)`,
                    [dev.serial_number, `DATA DELETE FACE PIN=${PIN}`]);
            }

            const freshTemplate = await db.query(`
                SELECT template_data, template_type, template_no, major_ver, minor_ver, format, index_no, valid, duress
                FROM biometric_templates 
                WHERE employee_code = $1 AND template_type = $2 AND template_no = $3
                ORDER BY updated_at DESC LIMIT 1
            `, [PIN, templateType, Number.parseInt(templateNo)]);

            if (freshTemplate.rows.length === 0) continue;

            const tmplRow = freshTemplate.rows[0];
            const freshTemplateData = tmplRow.template_data;
            if (!freshTemplateData || freshTemplateData.length < 100) continue;

            const normalizedFreshTemp = freshTemplateData.trim().replaceAll(/[\r\n]/g, '');
            const freshPadding = (normalizedFreshTemp.match(/=/g) || []).length;
            const freshSize = Math.floor((normalizedFreshTemp.length * 3) / 4) - freshPadding;

            if (templateType === 9) {
                const targetCaps = await deviceCapabilities.getCapabilities(dev.serial_number);
                const majorVer = targetCaps?.face_major_ver || tmplRow.major_ver || 40;
                const minorVer = targetCaps?.face_minor_ver || tmplRow.minor_ver || 1;
                const biodataCmd = `DATA UPDATE BIODATA Pin=${PIN}\tNo=${templateNo || '0'}\tIndex=${tmplRow.index_no || 0}\tValid=${tmplRow.valid || 1}\tDuress=${tmplRow.duress || 0}\tType=9\tMajorVer=${majorVer}\tMinorVer=${minorVer}\tFormat=${tmplRow.format || 0}\tTmp=${normalizedFreshTemp}`;
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 3)`,
                    [dev.serial_number, biodataCmd]);
            } else {
                const fingerFID = templateNo || '0';
                await db.query(`INSERT INTO device_commands (device_serial, command, status, sequence) VALUES ($1, $2, 'pending', 3)`,
                    [dev.serial_number, `DATA UPDATE FINGERTMP PIN=${PIN}\tFID=${fingerFID}\tSize=${freshSize}\tValid=${validFlag}\tTMP=${normalizedFreshTemp}`]);
            }
        }
    } catch (error) {
        console.error(`[ADMS] Auto-sync error for PIN=${PIN}:`, error);
        fs.appendFileSync('adms_debug.log', `[ADMS AUTO-SYNC ERROR] PIN=${PIN}: ${error.message}\n`);
    }
};

/**
 * Processes a single attendance log line
 */
const processAttendanceLogLine = async (line, SN, deviceDirection, io) => {
    let parts = line.split('\t');
    if (parts.length < 2) {
        const match = line.match(/^(\S+)\s+([\d-]+\s[\d:]+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (match) {
            parts = [match[1], match[2], match[3], match[4], match[5]];
        } else {
            parts = line.split(/\s+/);
            if (parts.length >= 6) {
                parts = [parts[0], parts[1] + ' ' + parts[2], parts[3], parts[4], parts[5]];
            }
        }
    }

    if (parts.length < 2) return false;

    const [userId, timestamp, state, verifyMode] = parts;
    let finalState = state;
    if (deviceDirection === 'in') finalState = '0';
    else if (deviceDirection === 'out') finalState = '1';

    try {
        await db.query(`INSERT INTO employees (employee_code, name) VALUES ($1, 'Unknown') ON CONFLICT DO NOTHING`, [userId]);
        const istTimestamp = moment.tz(timestamp, 'Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');

        await db.query(`
            INSERT INTO attendance_logs 
            (employee_code, device_serial, punch_time, punch_state, verification_mode, raw_data, source, is_attendance, upload_time)
            VALUES ($1, $2, $3, $4, $5, $6, 1, 1, NOW())
            ON CONFLICT (employee_code, punch_time) DO UPDATE 
            SET upload_time = NOW(), punch_state = EXCLUDED.punch_state
        `, [userId, SN, istTimestamp, finalState, Number.parseInt(verifyMode || 0), line]);

        io.emit('new_punch', { employee_code: userId, device_serial: SN, timestamp: istTimestamp, state: finalState });
        await attendanceEngine.processDailyAttendance(userId, istTimestamp.substring(0, 10));

        // Background HRMS Sync
        (async () => {
            try {
                const hrmsIntegration = require('./hrms-integration');
                const integrations = await hrmsIntegration.getActiveIntegrations();
                for (const integration of integrations) {
                    if (integration.sync_attendance) {
                        const instance = await hrmsIntegration.getIntegrationInstance(integration.id);
                        await instance.pushAttendance([{ employee_code: userId, punch_time: timestamp, punch_state: finalState, device_serial: SN }]);
                    }
                }
            } catch (err) { console.log(`[ADMS] ERPNext push skipped: ${err.message}`); }
        })();

        return true;
    } catch (e) {
        console.error('Log Insert Error:', e.message);
        return false;
    }
};

// Helper to process Key=Value lines (BIODATA/FP/FACE)
const processBiodataLine = async (line, SN, table) => {
    try {
        const fields = {};
        // CRITICAL: For tab-separated format (BIODATA), split ONLY by tabs to preserve long base64 template data
        // For space-separated format, split by spaces
        // Check if line contains tabs (BIODATA format) or spaces (other formats)
        const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+/);

        parts.forEach(part => {
            if (part.includes('=')) {
                // Handle case where first part contains table prefix like "BIODATA Pin=OMN005"
                // Extract the actual key=value pairs, skipping table prefixes
                let keyValuePart = part;
                if (part.startsWith('BIODATA ') || part.startsWith('FACE ') || part.startsWith('FP ') || part.startsWith('USER ')) {
                    // Remove table prefix: "BIODATA Pin=OMN005" -> "Pin=OMN005"
                    keyValuePart = part.replace(/^(BIODATA|FACE|FP|USER)\s+/, '');
                }

                const eqIdx = keyValuePart.indexOf('=');
                if (eqIdx !== -1) {
                    const key = keyValuePart.substring(0, eqIdx).trim();
                    // For template data (Tmp/Temp), get everything after '=' including any remaining parts
                    // This handles cases where base64 data might be split across multiple parts
                    let value = keyValuePart.substring(eqIdx + 1).trim();

                    // If this is template data field and value seems incomplete, try to get more
                    if ((key === 'Tmp' || key === 'Temp' || key === 'TMP') && value.length < 200) {
                        // Template data should be long - if it's short, might be truncated
                        // But don't try to reconstruct as it's risky - just log it
                        if (value.length > 0 && value.length < 100) {
                            fs.appendFileSync('adms_debug.log', `[ADMS WARNING] Template data for ${key} seems short (${value.length} chars) - might be truncated\n`);
                        }
                    }

                    if (key) fields[key] = value;
                }
            }
        });

        // Handle case-insensitive PIN field (devices may send Pin= or PIN=)
        const PIN = fields['PIN'] || fields['Pin'] || fields[Object.keys(fields).find(k => k.toLowerCase() === 'pin')];
        if (!PIN) {
            fs.appendFileSync('adms_debug.log', `[ADMS WARNING] No PIN found in line: ${line.substring(0, 100)}\n`);
            return;
        }

        if (line.startsWith('USER PIN=')) {
            // This is a USERINFO line, we'll process it for name/card update
            // but it won't have a template (Temp)
        }

        const No = fields['No'] || fields['FID'] || fields['Index'] || fields['FaceID'] || '0';
        let Type = fields['Type'];

        if (!Type) {
            if (line.startsWith('FACE')) Type = '9';
            else if (line.startsWith('FP')) Type = '1';
            else if (table === 'FACE' || table === 'facev7') Type = '9';
            else if (table === 'FINGERTMP' || table === 'templatev10') Type = '1';
            else if (table === 'USERVF') Type = '9';
        }

        const Temp = fields['Temp'] || fields['TMP'] || fields['Tmp'] || fields['v'] || fields['Data'];

        // If it's a USER record without a template, update employee then finish
        if (line.startsWith('USER') && !Temp) {
            const name = fields['Name'] || fields['NAME'];
            const card = fields['Card'] || fields['CARD'];
            const password = fields['Passwd'] || fields['PASSWORD'];

            if (name) {
                await db.query(`UPDATE employees SET name = $1 WHERE employee_code = $2`, [name, PIN]);
            }
            if (card) {
                await db.query(`UPDATE employees SET card_number = $1 WHERE employee_code = $2`, [card, PIN]);
            }
            if (password) {
                await db.query(`UPDATE employees SET password = $1 WHERE employee_code = $2`, [password, PIN]);
            }
            return;
        }

        const Valid = fields['Valid'] || fields['VALID'] || '1';
        const Duress = fields['Duress'] || '0';

        // CRITICAL: Parse BIODATA version fields for cross-device face sync compatibility
        // These fields are essential for face templates to work across devices
        const MajorVer = Number.parseInt(fields['MajorVer'] || fields['MAJORVER'] || '0');
        const MinorVer = Number.parseInt(fields['MinorVer'] || fields['MINORVER'] || '0');
        const Format = Number.parseInt(fields['Format'] || fields['FORMAT'] || '0');
        const IndexNo = Number.parseInt(fields['Index'] || fields['INDEX'] || '0');

        if (!Type || !Temp || Temp.startsWith('AAAAA') || Temp.length < 100) return;

        const templateNo = No || '0';
        const templateType = Number.parseInt(Type || '1');

        // Log version info for debugging face sync issues
        const versionInfo = templateType === 9 ? ` MajorVer=${MajorVer} MinorVer=${MinorVer} Format=${Format}` : '';
        fs.appendFileSync('adms_debug.log', `[ADMS DEBUG] Parsed: PIN=${PIN} Type=${templateType} No=${templateNo} Valid=${Valid} TempLen=${Temp.length}${versionInfo}\n`);

        // AUTO-UPDATE DEVICE CAPABILITIES when we receive biometric data with version info
        // This ensures we always have the latest algorithm versions for each device
        if (templateType === 9 && MajorVer > 0) {
            try {
                await deviceCapabilities.updateFaceVersion(SN, MajorVer, MinorVer, Format);
            } catch (err) {
                console.error(`[ADMS] Error updating device capabilities: ${err.message}`);
            }
        }

        await db.query(`
            INSERT INTO employees (employee_code, name, department_id, status)
            VALUES ($1, 'Unknown', NULL, 'Active')
            ON CONFLICT (employee_code) DO NOTHING
        `, [PIN]);

        // Check if this is a new template or update
        const existingTemplate = await db.query(`
            SELECT template_data, updated_at FROM biometric_templates 
            WHERE employee_code = $1 AND template_type = $2 AND template_no = $3
        `, [PIN, templateType, Number.parseInt(templateNo)]);

        const isNewTemplate = existingTemplate.rows.length === 0;
        // Improved change detection: compare normalized template data and check updated_at
        const existingData = existingTemplate.rows.length > 0 ? existingTemplate.rows[0].template_data : null;
        // Normalize both strings (trim whitespace) for comparison
        const normalizedExisting = existingData ? existingData.trim().replaceAll(/[\r\n]/g, '') : '';
        const normalizedNew = Temp ? Temp.trim().replaceAll(/[\r\n]/g, '') : '';
        const templateChanged = !isNewTemplate && normalizedExisting !== normalizedNew;

        // For face templates (type 9), always force sync to ensure latest data is pushed
        // Face templates are critical and should always sync when received
        const isFaceTemplate = templateType === 9;
        const shouldForceSync = isFaceTemplate; // Always force sync for face templates

        // Store template with version fields (critical for face sync)
        await db.query(`
            INSERT INTO biometric_templates 
            (employee_code, template_type, template_no, valid, duress, template_data, source_device, major_ver, minor_ver, format, index_no)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (employee_code, template_type, template_no) 
            DO UPDATE SET 
                template_data = EXCLUDED.template_data,
                valid = EXCLUDED.valid,
                duress = EXCLUDED.duress,
                source_device = EXCLUDED.source_device,
                major_ver = EXCLUDED.major_ver,
                minor_ver = EXCLUDED.minor_ver,
                format = EXCLUDED.format,
                index_no = EXCLUDED.index_no,
                updated_at = NOW()
        `, [PIN, templateType, Number.parseInt(templateNo), Number.parseInt(Valid || 1), Number.parseInt(Duress || 0), Temp, SN, MajorVer, MinorVer, Format, IndexNo]);

        console.log(`[ADMS] Saved template for PIN=${PIN} Type=${templateType} No=${templateNo} from ${SN} (New: ${isNewTemplate}, Changed: ${templateChanged}, ForceSync: ${shouldForceSync})`);
        logger.adms(`[ADMS] Saved template for PIN=${PIN} Type=${templateType} No=${templateNo} from ${SN}`);

        if (templateType === 1 || templateType === 2) {
            await db.query('UPDATE employees SET has_fingerprint = true WHERE employee_code = $1', [PIN]);
        } else if (templateType === 9) {
            await db.query('UPDATE employees SET has_face = true WHERE employee_code = $1', [PIN]);
        }

        await syncTemplateToOtherDevices(SN, PIN, templateType, templateNo, Temp, Valid, isNewTemplate, templateChanged, shouldForceSync);
    } catch (e) {
        fs.appendFileSync('adms_debug.log', `[ADMS ERROR] ${e.message}\n`);
    }
};

// 1. Handshake
const handleHandshake = async (req, res, io) => {
    const { SN } = req.query;

    // Handle case when no SN is provided (browser access or invalid request)
    if (!SN) {
        res.set('Content-Type', 'text/plain');
        return res.send('ADMS Server Ready\nThis endpoint is for biometric device communication.\nProvide SN (serial number) parameter.');
    }

    console.log(`[ADMS] Handshake from ${SN}`);

    try {
        // Register/Update Device
        await db.query(`
            INSERT INTO devices (serial_number, status, last_activity)
            VALUES ($1, 'online', NOW())
            ON CONFLICT (serial_number) 
            DO UPDATE SET status = 'online', last_activity = NOW()
        `, [SN]);

        // Notify Frontend
        io.emit('device_status', { serial: SN, status: 'online' });

        // Standard ADMS Response
        // Stamp: Sync interval (server time check)
        // Delay: Heartbeat interval
        // TransTimes: Scheduled transmission times (00:00;14:05)
        // TransInterval: How often to send logs (in minutes) if TransTimes not met
        // Realtime: 1 = Send logs properly immediately
        // Stamp=0 forces device to re-sync all logs
        const config = [
            'GET OPTION FROM:attlog',
            'Stamp=0',
            'OpStamp=0',
            'ErrorDelay=60',
            'Delay=30',
            'TransTimes=00:00;14:05',
            'TransInterval=1',
            'TransFlag=1111000000',
            'Realtime=1',
            'Encrypt=0'
        ].join('\n');

        res.set('Content-Type', 'text/plain');
        res.send(config);

    } catch (err) {
        console.error('Handshake Error:', err);
        res.status(500).send('ERROR');
    }
};

// 2. Receive Logs
const handleAttendanceLogs = async (req, res, io) => {
    const { SN } = req.query;
    let { table } = req.query;
    if (table) table = table.trim();
    console.log(`[ADMS DEBUG] Received POST for ${SN} table=${table}`);
    console.log(`[ADMS DEBUG] Query:`, req.query);
    console.log(`[ADMS DEBUG] Body Type:`, typeof req.body);
    console.log(`[ADMS DEBUG] Body Length:`, req.body ? req.body.length : 0);

    fs.appendFileSync('adms_debug.log', `[${new Date().toISOString()}] POST ${SN} Table=${table} Len=${req.body ? req.body.length : 0}\n`);

    if (table !== 'OPERLOG' && table !== 'ATTLOG') {
        fs.appendFileSync('adms_debug.log', `[ADMS UNKNOWN TABLE] ${table} Body=${req.body}\n`);
    }

    let deviceDirection = 'both';

    // Always mark device as online if we receive ANY data from it
    if (SN) {
        try {
            const deviceRes = await db.query(`
                INSERT INTO devices (serial_number, status, last_activity)
                VALUES ($1, 'online', NOW())
                ON CONFLICT (serial_number) 
                DO UPDATE SET status = 'online', last_activity = NOW()
                RETURNING device_direction
            `, [SN]);

            if (deviceRes.rows.length > 0 && deviceRes.rows[0].device_direction) {
                deviceDirection = deviceRes.rows[0].device_direction;
            }

            // Notify Frontend

            // Notify Frontend
            io.emit('device_status', { serial: SN, status: 'online' });
        } catch (e) {
            console.error('Error updating device status:', e);
        }
    }

    // Handle Operational Logs (device sending status/oplogs)
    // Handle Operational Logs
    if (table === 'OPERLOG' || table === 'ERRORLOG') {
        const isError = table === 'ERRORLOG';
        console.log(`[ADMS] ${table} from ${SN} - Device is actively communicating`);

        // Ensure device is marked online when sending OPERLOG (this is a form of heartbeat)
        if (SN) {
            try {
                await db.query(`
                    UPDATE devices 
                    SET status = 'online', last_activity = NOW() 
                    WHERE serial_number = $1
                `, [SN]);
                // Emit socket event to update frontend
                if (io) {
                    io.emit('device_status', { serial: SN, status: 'online' });
                }
            } catch (e) {
                console.error('Error updating device status from OPERLOG:', e);
            }
        }

        const rawData = req.body;
        if (!rawData) return res.send('OK');

        const lines = rawData.toString().split('\n').filter(l => l.trim().length > 0);

        for (const line of lines) {
            try {
                // Check for Real-time Biometric Data in OPERLOG
                if (line.startsWith('FP') || line.startsWith('FACE') || line.startsWith('USER')) {
                    await processBiodataLine(line, SN, table);
                    continue;
                }

                // OPERLOG Format: OPLOG <OpType> <OpWho> <Time> <V1> <V2> <V3> <V4>
                // ERRORLOG Format: OP_ERR_LOG <ErrCode> <ErrWho> <Time> <V1> <V2> <V3> <V4>
                const parts = line.split(/\s+/);
                // First part is tag (OPLOG or OP_ERR_LOG)

                if (isError) {
                    const errCode = parts[1];
                    // parts[2] is opWho - unused here
                    const timeStr = `${parts[3]} ${parts[4]}`;
                    const details = parts.slice(5).join(' ');

                    await db.query(`
                        INSERT INTO device_error_logs (device_serial, error_code, log_time, details, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [SN, errCode, formatTime(new Date(timeStr)), details]);
                } else {
                    const opType = parts[1];
                    const opWho = parts[2];
                    const timeStr = `${parts[3]} ${parts[4]}`;
                    const details = parts.slice(5).join(' ');

                    await db.query(`
                        INSERT INTO device_operation_logs (device_serial, operation_type, operator, log_time, details, created_at)
                        VALUES ($1, $2, $3, $4, $5, NOW())
                    `, [SN, opType, opWho, formatTime(new Date(timeStr)), details]);
                }
            } catch (err) {
                console.error(`Error saving ${table} line: ${line}`, err);
            }
        }
        res.set('Content-Type', 'text/plain');
        return res.send('OK');
    }

    // Handle BIODATA - Biometric Templates (Fingerprint, Face)
    if (table === 'BIODATA' || table === 'FINGERTMP' || table === 'FACE' || table === 'USERVF' || table === 'USERPIC' || table === 'facev7' || table === 'templatev10' || table === 'USERINFO') {
        console.log(`[ADMS] ${table} from ${SN}`);
        fs.appendFileSync('adms_debug.log', `[ADMS DEBUG] Entered BIODATA block for ${table} from ${SN}\n`);
        let rawData = req.body;
        console.log(`[ADMS DEBUG] RawData Type: ${typeof rawData}, Length: ${rawData ? rawData.length : 0}`);
        fs.appendFileSync('adms_debug.log', `[ADMS DEBUG] RawData Preview: ${rawData ? rawData.toString().substring(0, 200) : 'NULL'}\n`);

        if (typeof rawData === 'object' && rawData !== null) {
            const keys = Object.keys(rawData);
            if (keys.length > 0) {
                rawData = keys.join('\n');
            }
        }

        if (!rawData || rawData.length === 0) {
            console.log(`[ADMS] Empty ${table}`);
            return res.send('OK');
        }

        const lines = rawData.toString().split('\n').filter(l => l.trim().length > 0);
        let savedCount = 0;

        for (const line of lines) {
            await processBiodataLine(line, SN, table);
            savedCount++;
        }

        console.log(`[ADMS] Saved ${savedCount} biometric templates from ${SN}`);
        res.set('Content-Type', 'text/plain');
        return res.send('OK');
    }

    if (table === 'ATTLOG' || !table) {
        console.log(`[ADMS DEBUG] Processing ATTLOG for ${SN}`);

        let rawData = req.body;
        // If body-parser parsed it as JSON/Object (sometimes devices send weird headers)
        if (typeof rawData === 'object' && rawData !== null) {
            // Sometimes keys are the lines, or it's keys/values. 
            // Need to check structure. For now, try to find a string representation 
            // or if there's no suitable structure, log it.
            console.log('[ADMS] Parsed Body:', JSON.stringify(rawData).substring(0, 200));

            // If empty object, maybe it's in keys? ADMS sometimes sends data as keys with empty values
            const keys = Object.keys(rawData);
            if (keys.length > 0) {
                // Reconstruct potential raw data from keys if they look like log lines
                rawData = keys.join('\n');
            }
        }

        if (!rawData) {
            console.log('[ADMS DEBUG] Empty Body');
            return res.send('OK');
        }

        const debugLog = (msg) => fs.appendFile('adms_debug.log', `${new Date().toISOString()} ${msg}\n`, () => { });

        debugLog(`Processing logs from ${SN}. Body length: ${rawData.length}`);

        const lines = rawData.toString().split('\n').filter(l => l.trim().length > 0);
        let insertedCount = 0;

        for (const line of lines) {
            if (await processAttendanceLogLine(line, SN, deviceDirection, io)) {
                insertedCount++;
            }
        }

        console.log(`[ADMS] Processed ${insertedCount} logs from ${SN}`);
        logger.adms(`[ADMS] Processed ${insertedCount} logs from ${SN}`);
        debugLog(`Processed ${insertedCount} lines`);
    }

    // Always acknowledge
    res.set('Content-Type', 'text/plain');
    res.send('OK');
};

// 3. Device asks for commands
const handleGetRequest = async (req, res, io) => {
    const { SN, INFO } = req.query;
    console.log(`[ADMS] Heartbeat/Command Request from ${SN}`);

    // Parse INFO for device details
    let deviceModel = null;
    let firmwareVersion = null;
    let deviceIP = null;

    if (INFO) {
        try {
            const parts = INFO.split(',');
            if (parts.length > 0) {
                // Extract model and firmware from first part: ZAM70-NF24HA-Ver3.3.12
                const modelPart = parts[0];
                const verMatch = modelPart.match(/-[Vv]er([\d.]+)/);
                if (verMatch) {
                    firmwareVersion = verMatch[1];
                }
                const verIndex = modelPart.search(/-ver/i);
                if (verIndex > 0) {
                    deviceModel = modelPart.substring(0, verIndex);
                }
            }
            // [4] = Device IP
            if (parts.length > 4) {
                deviceIP = parts[4];
            }
        } catch (err) {
            console.error(`[ADMS] Error parsing INFO for ${SN}:`, err.message);
        }
    }

    // Auto-register device if not exists, otherwise update last seen
    // Also update model, firmware, and IP if available from INFO
    const deviceResult = await db.query(`
        INSERT INTO devices (serial_number, status, last_activity, device_model, firmware_version, ip_address)
        VALUES ($1, 'online', NOW(), $2, $3, $4)
        ON CONFLICT (serial_number) 
        DO UPDATE SET 
            status = 'online', 
            last_activity = NOW(),
            device_model = COALESCE(NULLIF($2, ''), devices.device_model),
            firmware_version = COALESCE(NULLIF($3, ''), devices.firmware_version),
            ip_address = COALESCE(NULLIF($4, ''), devices.ip_address)
        RETURNING status
    `, [SN, deviceModel, firmwareVersion, deviceIP]);

    // AUTO-DETECT DEVICE CAPABILITIES from INFO parameter
    // INFO contains device model, firmware, and capability flags
    // Example: ZAM70-NF24HA-Ver3.3.12,1,1,0,10.81.20.170,10,40,12,1,11010,0,0,0
    if (INFO) {
        try {
            await deviceCapabilities.detectFromHandshake(SN, INFO);
        } catch (err) {
            console.error(`[ADMS] Error detecting capabilities for ${SN}:`, err.message);
        }
    }

    // Notify frontend that device is online (heartbeat received)
    if (io && deviceResult.rows.length > 0) {
        io.emit('device_status', { serial: SN, status: 'online' });
    }

    // Check DB for pending commands
    try {
        const result = await db.query(`
            SELECT id, command FROM device_commands 
            WHERE device_serial = $1 AND status = 'pending' 
            ORDER BY COALESCE(sequence, 999) ASC, created_at ASC LIMIT 1
        `, [SN]);

        const pendingCount = await db.query(`
            SELECT COUNT(*) as count FROM device_commands 
            WHERE device_serial = $1 AND status = 'pending'
        `, [SN]);

        console.log(`[ADMS CMD] Device ${SN}: Found ${result.rows.length} command(s) to send (${pendingCount.rows[0].count} total pending)`);

        if (result.rows.length > 0) {
            const cmd = result.rows[0];
            // Mark as sent
            await db.query('UPDATE device_commands SET status = $1 WHERE id = $2', ['sent', cmd.id]);

            console.log(`[ADMS CMD] Sending command ${cmd.id} to ${SN}: ${cmd.command.substring(0, 80)}...`);

            // Format: C:ID:COMMAND
            res.set('Content-Type', 'text/plain');
            res.send(`C:${cmd.id}:${cmd.command}`);
        } else {
            res.send('OK');
        }
    } catch (err) {
        console.error('GetRequest Error:', err);
        res.send('OK');
    }
};

// 4. Handle Device Command Response
const handleDeviceCmd = async (req, res) => {
    // Format: POST /iclock/devicecmd?SN=...&ID=...&Return=...
    const { SN } = req.query;
    const body = req.body; // usually contains ID=123&Return=0&CMD=...

    console.log(`[ADMS CMD RESULT] From ${SN}. Body:`, body);
    fs.appendFileSync('adms_debug.log', `[ADMS CMD RESULT] From ${SN} Body=${JSON.stringify(body)}\n`);

    // Parse body parameters
    // Usually body is just `ID=1&Return=0&CMD=...` text
    // We can rely on req.body if it was parsed as text, or parse it manually
    let id, ret;

    if (body) {
        // ADMS sends: ID=1&Return=0&CMD=DATA QUERY...
        // Sometimes separated by & or newline
        const params = new URLSearchParams(body.replaceAll('\n', '&'));
        id = params.get('ID');
        ret = params.get('Return');
    }

    if (id && ret !== undefined) {
        const returnCode = Number.parseInt(ret);
        const status = (returnCode >= 0) ? 'success' : 'failed';

        try {
            // Get command details to check if it's USERINFO
            const cmdResult = await db.query(
                `SELECT command, device_serial FROM device_commands WHERE id = $1`,
                [id]
            );

            if (cmdResult.rows.length > 0) {
                const cmd = cmdResult.rows[0];
                const isUserInfo = cmd.command && cmd.command.includes('DATA UPDATE USERINFO');

                // Update command status
                if (status === 'success') {
                    // Import command queue for retry handling
                    const commandQueue = require('./command-queue');
                    await commandQueue.markSuccess(Number.parseInt(id));
                } else {
                    // Use retry mechanism for failed commands
                    const commandQueue = require('./command-queue');
                    await commandQueue.handleFailure(Number.parseInt(id), returnCode, cmd.command.substring(0, 50));
                }

                // If USERINFO succeeded, we can now send biometric commands for that user
                if (isUserInfo && status === 'success') {
                    // Extract PIN from USERINFO command: DATA UPDATE USERINFO PIN=INT001\tName=...
                    const pinMatch = cmd.command?.match(/PIN=([^\t]+)/);
                    if (pinMatch) {
                        const employeeCode = pinMatch[1];

                        // Find pending biometric commands for this user on this device that were waiting
                        // We'll mark them as ready to send (they'll be sent in order)
                        fs.appendFileSync('adms_debug.log', `[ADMS] USERINFO success for PIN=${employeeCode}, biometric commands can now be processed\n`);
                    }
                }

                // Log error codes for debugging
                if (status === 'failed') {
                    fs.appendFileSync('adms_debug.log', `[ADMS CMD RESULT] Command ${id} failed with Return=${ret}. Command: ${cmd.command.substring(0, 100)}\n`);

                    // Return=-1004 often means user doesn't exist or template format issue
                    if (returnCode === -1004 && cmd.command.includes('BIODATA')) {
                        fs.appendFileSync('adms_debug.log', `[ADMS WARNING] BIODATA failed (Return=-1004) - User may not exist or format incompatible\n`);
                    }
                } else {
                    fs.appendFileSync('adms_debug.log', `[ADMS CMD RESULT] Updated Command ${id} to ${status} (Return=${ret})\n`);
                }
            }
        } catch (e) {
            fs.appendFileSync('adms_debug.log', `[ADMS CMD ERROR] ${e.message}\n`);
        }
    }

    res.set('Content-Type', 'text/plain');
    res.send('OK');
};

module.exports = {
    handleHandshake,
    handleAttendanceLogs,
    logOperation,
    logError,
    logAttendanceLogs,
    handleGetRequest,
    handleDeviceCmd
};
