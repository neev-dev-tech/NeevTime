const { Client } = require('pg');
async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT COUNT(*) FROM attendance_logs 
            WHERE (sync_status IS NULL OR sync_status != 'synced')
        `);
        console.log("Total unsynced overall:", res.rows[0].count);
        
        const res2 = await client.query(`
            SELECT COUNT(*) FROM attendance_logs 
            WHERE punch_time >= '2026-03-23 00:00:00'
        `);
        console.log("Total today records:", res2.rows[0].count);
        
        const res3 = await client.query(`
            SELECT COUNT(*) FROM attendance_logs 
            WHERE (sync_status IS NULL OR sync_status != 'synced')
            AND punch_time >= '2026-03-23 00:00:00'
        `);
        console.log("Total unsynced today:", res3.rows[0].count);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
