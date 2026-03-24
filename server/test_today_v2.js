const { Client } = require('pg');

async function run() {
    const client = new Client({
        user: 'postgres',
        password: 'postgres@123',
        host: '192.168.1.237',
        port: 5432,
        database: 'attendance_db'
    });
    try {
        await client.connect();
        
        // Count all records for today
        const countRes = await client.query(`
            SELECT COUNT(*) 
            FROM attendance_logs 
            WHERE punch_time >= '2026-03-23 00:00:00'
        `);
        console.log("Total records for today:", countRes.rows[0].count);

        // Fetch oldest 5 for today
        const res = await client.query(`
            SELECT id, employee_code, punch_time, sync_status 
            FROM attendance_logs 
            WHERE punch_time >= '2026-03-23 00:00:00'
            ORDER BY punch_time ASC
            LIMIT 5
        `);
        console.log("Today's oldest 5 records:", res.rows);

        // Check if there are ANY unsynced records
        const unsyncedRes = await client.query(`
            SELECT COUNT(*) 
            FROM attendance_logs 
            WHERE (sync_status IS NULL OR sync_status != 'synced')
            AND punch_time > NOW() - INTERVAL '7 days'
        `);
        console.log("Total unsynced in last 7 days:", unsyncedRes.rows[0].count);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}
run();
