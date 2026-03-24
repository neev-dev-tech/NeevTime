const { Client } = require('pg');
const ERPNextIntegration = require('./services/integrations/erpnext');
async function run() {
    const client = new Client({
        user: 'postgres', password: 'postgres@123',
        host: '192.168.1.237', port: 5432, database: 'attendance_db'
    });
    try {
        await client.connect();
        const intRes = await client.query(`SELECT * FROM hrms_integrations WHERE type = 'erpnext' LIMIT 1`);
        const instance = new ERPNextIntegration(intRes.rows[0]);
        
        console.log("Fetching checkins for INT146...");
        const response = await instance.client.get('/api/resource/Employee Checkin', {
            params: {
                filters: JSON.stringify([
                    ["employee", "in", ["INT146", "INT093", "1010", "INT140", "INT021"]]
                ]),
                fields: JSON.stringify(["name", "employee", "time", "log_type"]),
                limit_page_length: 50,
                order_by: "time desc"
            }
        });
        
        console.log("Frappe returned:", JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Frappe fetch error:", err.response?.data || err.message);
    } finally {
        await client.end();
    }
}
run();
