const { Client } = require('pg');
const ERPNextIntegration = require('./services/integrations/erpnext');
async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        
        // Reset id 42963
        await client.query(`UPDATE attendance_logs SET sync_status = NULL WHERE id = 42963`);
        
        const res = await client.query(`SELECT * FROM attendance_logs WHERE id = 42963`);
        const record = res.rows[0];
        
        const intRes = await client.query(`SELECT * FROM hrms_integrations WHERE type = 'erpnext' LIMIT 1`);
        const instance = new ERPNextIntegration(intRes.rows[0]);
        
        console.log("Pushing record:", record.id, "Time:", record.punch_time);
        
        // Push only one
        const stats = await instance.pushAttendance([record]);
        console.log("Push Result:", JSON.stringify(stats, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
