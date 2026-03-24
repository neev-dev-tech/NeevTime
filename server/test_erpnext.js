const { Client } = require('pg');
const ERPNextIntegration = require('./services/integrations/erpnext');

async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT id, employee_code, punch_time, punch_state, device_serial, sync_status 
            FROM attendance_logs
            WHERE sync_status IS NULL OR sync_status != 'synced'
            ORDER BY punch_time ASC
            LIMIT 1
        `);
        if (res.rows.length === 0) return console.log("No pending records");
        const record = res.rows[0];
        
        console.log("Original Date Object:", record.punch_time);
        const d = new Date(record.punch_time);
        const dateKey = d.getUTCFullYear() + "-" +
            ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" +
            ("0" + d.getUTCDate()).slice(-2);
        const timestamp = dateKey + " " +
            ("0" + d.getUTCHours()).slice(-2) + ":" +
            ("0" + d.getUTCMinutes()).slice(-2) + ":" +
            ("0" + d.getUTCSeconds()).slice(-2);
            
        console.log("Reconstructed Timestamp string for Frappe:", timestamp);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}
run();
