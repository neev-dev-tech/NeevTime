/**
 * Pull attendance logs directly from biometric devices via ZKTeco TCP
 * and import missing records into attendance_logs table.
 *
 * Targets records from 2026-03-21 and 2026-03-22 (the storage outage window).
 */

const ZKLib = require('node-zklib');
const db = require('../db');

const DEVICES = [
    { serial: 'NYU7254000098', name: '3rd Floor OUT', ip: '10.81.20.172', port: 4370 },
    { serial: 'NYU7254000077', name: '3rd Floor IN',  ip: '10.81.20.173', port: 4370 },
    { serial: 'NYU7254000093', name: '4th Floor OUT', ip: '10.81.20.167', port: 4370 },
    { serial: 'NYU7254300774', name: '4th Floor IN',  ip: '10.81.20.170', port: 4370 },
];

// Pull logs from a single device
async function pullFromDevice(device) {
    console.log(`\n[${device.name}] Connecting to ${device.ip}:${device.port}...`);
    const zk = new ZKLib(device.ip, device.port, 15000, 5000);

    try {
        await zk.createSocket();
        console.log(`[${device.name}] Connected.`);

        const result = await zk.getAttendances();
        const rows = result?.data || [];
        console.log(`[${device.name}] Total records on device: ${rows.length}`);

        await zk.disconnect();
        return rows.map(r => ({ ...r, device_serial: device.serial, device_name: device.name }));
    } catch (err) {
        console.error(`[${device.name}] ERROR: ${err.message}`);
        try { await zk.disconnect(); } catch (_) {}
        return [];
    }
}

// Import missing records into DB
async function importMissing(records) {
    let inserted = 0;
    let skipped = 0;

    for (const r of records) {
        // r.recordTime is a JS Date object from node-zklib
        const punchTime = new Date(r.recordTime);

        // Only import records from the outage window (Mar 21-22)
        const dateStr = punchTime.toISOString().slice(0, 10);
        if (dateStr < '2026-03-21' || dateStr > '2026-03-22') {
            continue;
        }

        const employeeCode = String(r.deviceUserId || r.uid || '').trim();
        if (!employeeCode) continue;

        // Format timestamp as "YYYY-MM-DD HH:MM:SS" in UTC (same as ERPNext sync expects)
        const ts = punchTime.toISOString().replace('T', ' ').slice(0, 19);

        try {
            // Insert — skip if exact duplicate (same device + employee + timestamp)
            const res = await db.query(`
                INSERT INTO attendance_logs
                    (device_serial, employee_code, punch_time, punch_state,
                     verification_mode, sync_status, created_at)
                VALUES ($1, $2, $3::timestamp, $4, $5, 'pending', NOW())
                ON CONFLICT DO NOTHING
            `, [
                r.device_serial,
                employeeCode,
                ts,
                r.inOutStatus ?? 255,
                r.verifyType ?? 1,
            ]);

            if (res.rowCount > 0) {
                inserted++;
            } else {
                skipped++;
            }
        } catch (err) {
            // If no unique constraint, check manually
            const exists = await db.query(
                `SELECT 1 FROM attendance_logs WHERE device_serial=$1 AND employee_code=$2 AND punch_time=$3::timestamp LIMIT 1`,
                [r.device_serial, employeeCode, ts]
            );
            if (exists.rowCount === 0) {
                await db.query(`
                    INSERT INTO attendance_logs
                        (device_serial, employee_code, punch_time, punch_state,
                         verification_mode, sync_status, created_at)
                    VALUES ($1, $2, $3::timestamp, $4, $5, 'pending', NOW())
                `, [r.device_serial, employeeCode, ts, r.inOutStatus ?? 255, r.verifyType ?? 1]);
                inserted++;
            } else {
                skipped++;
            }
        }
    }
    return { inserted, skipped };
}

async function main() {
    console.log('=== Pull Attendance Logs from Devices ===');
    console.log('Target dates: 2026-03-21 to 2026-03-22');
    console.log('Started:', new Date().toISOString());

    let grandInserted = 0;
    let grandSkipped = 0;

    for (const device of DEVICES) {
        const records = await pullFromDevice(device);

        const outageRecords = records.filter(r => {
            const d = new Date(r.recordTime).toISOString().slice(0, 10);
            return d >= '2026-03-21' && d <= '2026-03-22';
        });
        console.log(`[${device.name}] Records in outage window (Mar 21-22): ${outageRecords.length}`);

        const { inserted, skipped } = await importMissing(records);
        console.log(`[${device.name}] Inserted: ${inserted}, Already existed: ${skipped}`);
        grandInserted += inserted;
        grandSkipped += skipped;
    }

    console.log('\n=== Import Complete ===');
    console.log('Finished:', new Date().toISOString());
    console.log(`Total inserted: ${grandInserted}`);
    console.log(`Total skipped (duplicates): ${grandSkipped}`);

    if (grandInserted > 0) {
        console.log('\nNew records are marked as pending — they will sync to ERPNext on the next cycle.');
        console.log('Run the backfill sync script to push immediately if needed.');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
