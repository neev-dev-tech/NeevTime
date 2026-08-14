const db = require('../db');

/**
 * Comprehensive Test Data Seed Script
 * Seeds realistic data for testing all modules
 */

// Helper to format date as YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

// Helper to format time as HH:MM:SS
const formatTime = (hours, minutes = 0) => {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

async function seedTestData() {
    const client = await db.getClient();

    try {
        console.log('🌱 Starting test data seeding...\n');
        await client.query('BEGIN');

        // ============================================
        // 1. DEPARTMENTS
        // ============================================
        console.log('📁 Seeding Departments...');
        const departments = [
            'Engineering', 'Human Resources', 'Finance', 'Sales',
            'Marketing', 'Operations', 'IT Support', 'Administration'
        ];

        for (const dept of departments) {
            await client.query(
                'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [dept]
            );
        }
        console.log(`   ✓ ${departments.length} departments`);

        // ============================================
        // 2. AREAS
        // ============================================
        console.log('📍 Seeding Areas...');
        const areas = [
            { name: 'Head Office', code: 'HO' },
            { name: 'Branch - Mumbai', code: 'BOM' },
            { name: 'Branch - Delhi', code: 'DEL' },
            { name: 'Branch - Bangalore', code: 'BLR' },
            { name: 'Factory - Pune', code: 'PUN' }
        ];

        for (const area of areas) {
            await client.query(
                'INSERT INTO areas (name, code) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
                [area.name, area.code]
            );
        }
        console.log(`   ✓ ${areas.length} areas`);

        // ============================================
        // 3. POSITIONS (using name, code columns)
        // ============================================
        console.log('👔 Seeding Positions...');
        const positions = [
            { code: 'CEO', name: 'Chief Executive Officer' },
            { code: 'CTO', name: 'Chief Technology Officer' },
            { code: 'CFO', name: 'Chief Financial Officer' },
            { code: 'MGR', name: 'Manager' },
            { code: 'TL', name: 'Team Lead' },
            { code: 'SR-ENG', name: 'Senior Engineer' },
            { code: 'JR-ENG', name: 'Junior Engineer' },
            { code: 'HR-EXEC', name: 'HR Executive' },
            { code: 'ACCT', name: 'Accountant' },
            { code: 'SALES-REP', name: 'Sales Representative' }
        ];

        for (const pos of positions) {
            await client.query(
                `INSERT INTO positions (code, name) 
                 VALUES ($1, $2) 
                 ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code`,
                [pos.code, pos.name]
            );
        }
        console.log(`   ✓ ${positions.length} positions`);

        // ============================================
        // 4. SHIFTS
        // ============================================
        console.log('⏰ Seeding Shifts...');
        const shifts = [
            { name: 'General Shift', start: '09:00', end: '18:00', break: 60 },
            { name: 'Morning Shift', start: '06:00', end: '14:00', break: 30 },
            { name: 'Evening Shift', start: '14:00', end: '22:00', break: 30 },
            { name: 'Night Shift', start: '22:00', end: '06:00', break: 30 },
            { name: 'Flexible', start: '10:00', end: '19:00', break: 60 }
        ];

        for (const shift of shifts) {
            await client.query(
                `INSERT INTO shifts (name, start_time, end_time, break_duration) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT DO NOTHING`,
                [shift.name, shift.start, shift.end, shift.break]
            );
        }
        console.log(`   ✓ ${shifts.length} shifts`);

        // Get department and area IDs for employee creation
        const deptResult = await client.query('SELECT id, name FROM departments');
        const areaResult = await client.query('SELECT id, name FROM areas');

        const deptMap = {};
        deptResult.rows.forEach(r => deptMap[r.name] = r.id);

        const areaMap = {};
        areaResult.rows.forEach(r => areaMap[r.name] = r.id);

        // ============================================
        // 5. EMPLOYEES (15 employees)
        // ============================================
        console.log('👥 Seeding Employees...');
        const employees = [
            { code: 'EMP001', name: 'Rajesh Kumar', dept: 'Engineering', area: 'Head Office', designation: 'Team Lead', gender: 'Male', doj: '2020-01-15' },
            { code: 'EMP002', name: 'Priya Sharma', dept: 'Human Resources', area: 'Head Office', designation: 'HR Executive', gender: 'Female', doj: '2019-06-01' },
            { code: 'EMP003', name: 'Amit Patel', dept: 'Finance', area: 'Head Office', designation: 'Accountant', gender: 'Male', doj: '2021-03-20' },
            { code: 'EMP004', name: 'Sneha Reddy', dept: 'Engineering', area: 'Branch - Bangalore', designation: 'Senior Engineer', gender: 'Female', doj: '2020-08-10' },
            { code: 'EMP005', name: 'Vikram Singh', dept: 'Sales', area: 'Branch - Delhi', designation: 'Sales Representative', gender: 'Male', doj: '2022-01-05' },
            { code: 'EMP006', name: 'Meera Nair', dept: 'Marketing', area: 'Branch - Mumbai', designation: 'Manager', gender: 'Female', doj: '2018-11-15' },
            { code: 'EMP007', name: 'Arjun Mehta', dept: 'IT Support', area: 'Head Office', designation: 'Junior Engineer', gender: 'Male', doj: '2023-02-01' },
            { code: 'EMP008', name: 'Kavita Gupta', dept: 'Operations', area: 'Factory - Pune', designation: 'Team Lead', gender: 'Female', doj: '2019-09-12' },
            { code: 'EMP009', name: 'Suresh Iyer', dept: 'Engineering', area: 'Branch - Bangalore', designation: 'Junior Engineer', gender: 'Male', doj: '2023-06-15' },
            { code: 'EMP010', name: 'Ananya Das', dept: 'Administration', area: 'Head Office', designation: 'HR Executive', gender: 'Female', doj: '2021-07-20' },
            { code: 'EMP011', name: 'Rohan Desai', dept: 'Engineering', area: 'Head Office', designation: 'Senior Engineer', gender: 'Male', doj: '2020-04-01' },
            { code: 'EMP012', name: 'Pooja Verma', dept: 'Finance', area: 'Branch - Mumbai', designation: 'Accountant', gender: 'Female', doj: '2022-08-10' },
            { code: 'EMP013', name: 'Karthik Rao', dept: 'Sales', area: 'Branch - Delhi', designation: 'Manager', gender: 'Male', doj: '2017-05-25' },
            { code: 'EMP014', name: 'Divya Pillai', dept: 'Marketing', area: 'Head Office', designation: 'Team Lead', gender: 'Female', doj: '2019-12-01' },
            { code: 'EMP015', name: 'Aakash Joshi', dept: 'Operations', area: 'Factory - Pune', designation: 'Junior Engineer', gender: 'Male', doj: '2024-01-10' }
        ];

        for (const emp of employees) {
            await client.query(`
                INSERT INTO employees (
                    employee_code, name, department_id, area_id, 
                    designation, join_date, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'Active')
                ON CONFLICT (company_id, employee_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    department_id = EXCLUDED.department_id,
                    area_id = EXCLUDED.area_id,
                    designation = EXCLUDED.designation,
                    join_date = EXCLUDED.join_date
            `, [
                emp.code, emp.name,
                deptMap[emp.dept] || null,
                areaMap[emp.area] || null,
                emp.designation,
                emp.doj
            ]);
        }
        console.log(`   ✓ ${employees.length} employees`);

        // ============================================
        // 6. HOLIDAYS (2025)
        // ============================================
        console.log('🎉 Seeding Holidays...');
        const holidays = [
            { name: 'New Year', date: '2025-01-01' },
            { name: 'Republic Day', date: '2025-01-26' },
            { name: 'Holi', date: '2025-03-14' },
            { name: 'Good Friday', date: '2025-04-18' },
            { name: 'Labour Day', date: '2025-05-01' },
            { name: 'Independence Day', date: '2025-08-15' },
            { name: 'Gandhi Jayanti', date: '2025-10-02' },
            { name: 'Diwali', date: '2025-10-20' },
            { name: 'Christmas', date: '2025-12-25' }
        ];

        for (const holiday of holidays) {
            await client.query(
                `INSERT INTO holidays (name, date) VALUES ($1, $2) 
                 ON CONFLICT (date, location_id) DO NOTHING`,
                [holiday.name, holiday.date]
            );
        }
        console.log(`   ✓ ${holidays.length} holidays`);

        // ============================================
        // 7. LEAVE TYPES
        // ============================================
        console.log('🏖️ Seeding Leave Types...');
        const leaveTypes = [
            { code: 'CL', name: 'Casual Leave', quota: 12, color: '#3b82f6' },
            { code: 'SL', name: 'Sick Leave', quota: 10, color: '#ef4444' },
            { code: 'AL', name: 'Annual Leave', quota: 15, color: '#22c55e' },
            { code: 'ML', name: 'Maternity Leave', quota: 180, color: '#ec4899' },
            { code: 'PL', name: 'Paternity Leave', quota: 15, color: '#8b5cf6' },
            { code: 'LWP', name: 'Leave Without Pay', quota: 0, color: '#6b7280' }
        ];

        for (const lt of leaveTypes) {
            await client.query(`
                INSERT INTO leave_types (code, name, annual_quota, color) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    annual_quota = EXCLUDED.annual_quota,
                    color = EXCLUDED.color
            `, [lt.code, lt.name, lt.quota, lt.color]);
        }
        console.log(`   ✓ ${leaveTypes.length} leave types`);

        // ============================================
        // 8. ATTENDANCE LOGS (Last 30 days)         
        // ============================================
        console.log('📊 Seeding Attendance Logs (30 days)...');

        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        let logCount = 0;

        // Get or create a mock device
        await client.query(`
            INSERT INTO devices (serial_number, device_name, status)
            VALUES ('MOCK-001', 'Main Entrance', 'online')
            ON CONFLICT (serial_number) DO UPDATE SET status = 'online'
        `);

        for (const emp of employees) {
            // Loop through last 30 days
            for (let d = 0; d < 30; d++) {
                const date = new Date(thirtyDaysAgo);
                date.setDate(thirtyDaysAgo.getDate() + d);

                // Skip weekends (Saturday=6, Sunday=0)
                if (date.getDay() === 0 || date.getDay() === 6) continue;

                // Random attendance patterns
                const random = Math.random();

                // 85% present normally, 10% late, 5% absent
                if (random < 0.85) {
                    // Normal attendance (8:55 - 9:10 in, 17:50 - 18:15 out)
                    const inHour = 8 + Math.floor(Math.random() * 2);
                    const inMin = Math.floor(Math.random() * 30) + 45;
                    const outHour = 17 + Math.floor(Math.random() * 2);
                    const outMin = Math.floor(Math.random() * 30) + 45;

                    const inTime = `${formatDate(date)} ${formatTime(inHour, inMin % 60)}`;
                    const outTime = `${formatDate(date)} ${formatTime(outHour, outMin % 60)}`;

                    // Insert check-in
                    await client.query(`
                        INSERT INTO attendance_logs (employee_code, device_serial, punch_time, punch_state)
                        VALUES ($1, 'MOCK-001', $2, '0')
                        ON CONFLICT (employee_code, punch_time) DO NOTHING
                    `, [emp.code, inTime]);

                    // Insert check-out
                    await client.query(`
                        INSERT INTO attendance_logs (employee_code, device_serial, punch_time, punch_state)
                        VALUES ($1, 'MOCK-001', $2, '1')
                        ON CONFLICT (employee_code, punch_time) DO NOTHING
                    `, [emp.code, outTime]);

                    logCount += 2;
                } else if (random < 0.95) {
                    // Late arrival (9:30 - 10:30)
                    const inHour = 9 + Math.floor(Math.random() * 2);
                    const inMin = 30 + Math.floor(Math.random() * 30);
                    const outHour = 18 + Math.floor(Math.random() * 2);
                    const outMin = Math.floor(Math.random() * 30);

                    const inTime = `${formatDate(date)} ${formatTime(inHour, inMin)}`;
                    const outTime = `${formatDate(date)} ${formatTime(outHour, outMin)}`;

                    await client.query(`
                        INSERT INTO attendance_logs (employee_code, device_serial, punch_time, punch_state)
                        VALUES ($1, 'MOCK-001', $2, '0')
                        ON CONFLICT (employee_code, punch_time) DO NOTHING
                    `, [emp.code, inTime]);

                    await client.query(`
                        INSERT INTO attendance_logs (employee_code, device_serial, punch_time, punch_state)
                        VALUES ($1, 'MOCK-001', $2, '1')
                        ON CONFLICT (employee_code, punch_time) DO NOTHING
                    `, [emp.code, outTime]);

                    logCount += 2;
                }
                // 5% absent - no logs
            }
        }
        console.log(`   ✓ ~${logCount} attendance logs`);

        // ============================================
        // 9. APPROVAL ROLES (Skipped - table doesn't exist)
        // ============================================
        // console.log('🔐 Seeding Approval Roles...');
        // Note: approval_roles table is from schema_easytime.sql which may not be applied
        console.log('⏭️  Skipping Approval Roles (table pending schema migration)');

        // ============================================
        // 10. SAMPLE LEAVE APPLICATIONS
        // ============================================
        console.log('📝 Seeding Leave Applications...');
        const leaveTypeResult = await client.query('SELECT id, code FROM leave_types');
        const leaveTypeMap = {};
        leaveTypeResult.rows.forEach(r => leaveTypeMap[r.code] = r.id);

        const leaveApplications = [
            { emp: 'EMP001', type: 'CL', from: '2025-01-02', to: '2025-01-03', days: 2, reason: 'Personal work', status: 'Approved' },
            { emp: 'EMP002', type: 'SL', from: '2025-01-10', to: '2025-01-10', days: 1, reason: 'Not feeling well', status: 'Approved' },
            { emp: 'EMP004', type: 'AL', from: '2025-02-01', to: '2025-02-05', days: 5, reason: 'Family vacation', status: 'Pending' },
            { emp: 'EMP006', type: 'CL', from: '2025-01-20', to: '2025-01-20', days: 1, reason: 'Doctor appointment', status: 'Approved' },
            { emp: 'EMP008', type: 'SL', from: '2025-01-15', to: '2025-01-17', days: 3, reason: 'Fever', status: 'Approved' }
        ];

        for (const leave of leaveApplications) {
            await client.query(`
                INSERT INTO leave_applications (
                    employee_code, leave_type_id, from_date, to_date, 
                    total_days, reason, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT DO NOTHING
            `, [
                leave.emp,
                leaveTypeMap[leave.type],
                leave.from,
                leave.to,
                leave.days,
                leave.reason,
                leave.status
            ]);
        }
        console.log(`   ✓ ${leaveApplications.length} leave applications`);

        await client.query('COMMIT');

        console.log('\n✅ Test data seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   - ${departments.length} departments`);
        console.log(`   - ${areas.length} areas`);
        console.log(`   - ${positions.length} positions`);
        console.log(`   - ${shifts.length} shifts`);
        console.log(`   - ${employees.length} employees`);
        console.log(`   - ${holidays.length} holidays`);
        console.log(`   - ${leaveTypes.length} leave types`);
        console.log(`   - ~${logCount} attendance logs`);
        console.log(`   - ${approvalRoles.length} approval roles`);
        console.log(`   - ${leaveApplications.length} leave applications`);

        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error seeding data:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
    }
}

seedTestData();
