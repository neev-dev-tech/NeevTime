const db = require('../db');
async function run() {
    const ids = [20];
    try {
        const emps = await db.query('SELECT employee_code FROM employees WHERE id = ANY($1)', [ids]);
        const employeeCodes = emps.rows.map(e => e.employee_code);
        console.log('Codes:', employeeCodes);

        const client = await db.getClient();
        await client.query('BEGIN');

        console.log('Deleting attendance_logs...');
        await client.query('DELETE FROM attendance_logs WHERE employee_code = ANY($1)', [employeeCodes]);

        console.log('Deleting employees...');
        await client.query('DELETE FROM employees WHERE id = ANY($1)', [ids]);

        console.log('Queueing device commands...');
        const devices = await client.query('SELECT serial_number FROM devices');
        for (const code of employeeCodes) {
            const cmd = `DATA DELETE USERINFO PIN=${code}`;
            for (const dev of devices.rows) {
                await client.query(
                    `INSERT INTO device_commands (device_serial, command, status) VALUES ($1, $2, 'pending')`,
                    [dev.serial_number, cmd]
                );
            }
        }

        await client.query('ROLLBACK');
        console.log('Success (Transactions rolled back)');
        process.exit(0);
    } catch (e) {
        console.error('ERROR:', e);
        process.exit(1);
    }
}
run();
