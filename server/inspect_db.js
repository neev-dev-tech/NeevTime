const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    password: 'postgres@123',
    host: '192.168.1.237',
    port: 5432,
    database: 'attendance_db'
});

async function run() {
    try {
        await client.connect();
        
        // Fetch the oldest pending attendance logs that are likely failing
        const res = await client.query(`
            SELECT id, employee_code, punch_time, punch_state, device_serial, sync_status 
            FROM attendance_logs 
            WHERE sync_status IS NULL OR sync_status != 'synced'
            ORDER BY punch_time ASC
            LIMIT 10
        `);
        
        console.log("Failing Records Format (Oldest 10):", JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        await client.end();
    }
}

run();
