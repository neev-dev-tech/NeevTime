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
        
        console.log("Resetting sync_status for today's records...");
        const res = await client.query(`
            UPDATE attendance_logs 
            SET sync_status = NULL 
            WHERE punch_time >= '2026-03-23 00:00:00'
        `);
        console.log("Records reset:", res.rowCount);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}
run();
