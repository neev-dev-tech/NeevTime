const { Client } = require('pg');
async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT COUNT(*)
            FROM attendance_logs al
            LEFT JOIN employees e ON al.employee_code = e.employee_code
            WHERE (al.sync_status IS NULL OR al.sync_status != 'synced')
            AND al.punch_time > NOW() - INTERVAL '7 days'
        `);
        console.log("Records matched by sync query:", res.rows[0].count);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
