const { Client } = require('pg');
async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT id, employee_code, punch_time::text as raw_db_time 
            FROM attendance_logs 
            WHERE employee_code = 'INT146' AND punch_time >= '2026-03-23 00:00:00'
            ORDER BY punch_time ASC LIMIT 5
        `);
        console.log("Raw DB Strings for INT146:");
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
