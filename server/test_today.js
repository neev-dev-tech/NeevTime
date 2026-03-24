const { Client } = require('pg');
require('dotenv').config();
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
        const res = await client.query(`
            SELECT id, employee_code, punch_time, sync_status 
            FROM attendance_logs 
            WHERE punch_time >= '2026-03-23 00:00:00'
            ORDER BY punch_time ASC
            LIMIT 20
        `);
        console.log("Today's morning records:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
