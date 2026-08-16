-- =====================================================
-- VayuTime Attendance Management - Complete Schema
-- Run this file to initialize all database tables
-- =====================================================

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    parent_id INTEGER REFERENCES departments(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Areas/Locations
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    parent_id INTEGER REFERENCES areas(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Positions
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    department_id INTEGER REFERENCES departments(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    area_id INTEGER REFERENCES areas(id),
    designation VARCHAR(100),
    card_number VARCHAR(50),
    password VARCHAR(50),
    privilege INTEGER DEFAULT 0,
    gender VARCHAR(10),
    dob DATE,
    joining_date DATE,
    mobile VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    status VARCHAR(20) DEFAULT 'active',
    employment_type VARCHAR(50),
    app_access BOOLEAN DEFAULT FALSE,
    app_login_enabled BOOLEAN DEFAULT FALSE,
    photo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices (Biometric machines)
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    device_model VARCHAR(100),
    ip_address VARCHAR(45),
    port INTEGER DEFAULT 4370,
    area_id INTEGER REFERENCES areas(id),
    device_type VARCHAR(20) DEFAULT 'IN',
    communication_type VARCHAR(20) DEFAULT 'push',
    status VARCHAR(20) DEFAULT 'offline',
    firmware_version VARCHAR(50),
    last_activity TIMESTAMP,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Device Capabilities
CREATE TABLE IF NOT EXISTS device_capabilities (
    id SERIAL PRIMARY KEY,
    device_serial VARCHAR(100) REFERENCES devices(serial_number) ON DELETE CASCADE,
    device_model VARCHAR(100),
    firmware_version VARCHAR(50),
    face_supported BOOLEAN DEFAULT FALSE,
    face_major_ver VARCHAR(20),
    face_minor_ver VARCHAR(20),
    finger_supported BOOLEAN DEFAULT TRUE,
    palm_supported BOOLEAN DEFAULT FALSE,
    card_supported BOOLEAN DEFAULT TRUE,
    max_users INTEGER,
    max_fingers INTEGER,
    max_faces INTEGER,
    detected_at TIMESTAMP DEFAULT NOW()
);

-- Device Commands Queue
CREATE TABLE IF NOT EXISTS device_commands (
    id SERIAL PRIMARY KEY,
    device_serial VARCHAR(100) NOT NULL,
    command TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    sequence INTEGER DEFAULT 1,
    response TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

-- Biometric Templates
CREATE TABLE IF NOT EXISTS biometric_templates (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    template_type INTEGER NOT NULL,
    template_index INTEGER DEFAULT 0,
    template_data TEXT,
    device_serial VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance Logs (raw punches from devices)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    punch_time TIMESTAMP NOT NULL,
    punch_type VARCHAR(10),
    verify_type INTEGER,
    device_serial VARCHAR(100),
    work_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, punch_time, device_serial)
);

-- Attendance Daily Summary (processed records)
CREATE TABLE IF NOT EXISTS attendance_daily_summary (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    in_time TIMESTAMP,
    out_time TIMESTAMP,
    duration_minutes INTEGER,
    status VARCHAR(20),
    late_minutes INTEGER,
    early_leave_minutes INTEGER,
    overtime_minutes INTEGER,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, date)
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_in_minutes INTEGER DEFAULT 15,
    grace_out_minutes INTEGER DEFAULT 15,
    min_hours DECIMAL(4,2) DEFAULT 8,
    is_active BOOLEAN DEFAULT TRUE,
    color VARCHAR(10) DEFAULT '#3B82F6',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Timetables
CREATE TABLE IF NOT EXISTS timetables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE,
    check_in TIME NOT NULL,
    check_out TIME NOT NULL,
    late_in TIME,
    early_out TIME,
    overtime_start TIME,
    min_hours_for_full_day DECIMAL(4,2) DEFAULT 8,
    min_hours_for_half_day DECIMAL(4,2) DEFAULT 4,
    is_overnight BOOLEAN DEFAULT FALSE,
    is_flexible BOOLEAN DEFAULT FALSE,
    grace_period_minutes INTEGER DEFAULT 15,
    color VARCHAR(10) DEFAULT '#3B82F6',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Break Times
CREATE TABLE IF NOT EXISTS break_times (
    id SERIAL PRIMARY KEY,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_paid BOOLEAN DEFAULT TRUE,
    is_deductible BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Holidays
CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    type VARCHAR(20) DEFAULT 'public',
    is_optional BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Holiday Locations
CREATE TABLE IF NOT EXISTS holiday_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Leaves
CREATE TABLE IF NOT EXISTS leaves (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(4,1),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by INTEGER,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance Rules
CREATE TABLE IF NOT EXISTS attendance_rules (
    id SERIAL PRIMARY KEY,
    rule_type VARCHAR(20) NOT NULL DEFAULT 'global',
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    late_threshold_minutes INTEGER DEFAULT 15,
    early_leave_threshold_minutes INTEGER DEFAULT 15,
    half_day_threshold_minutes INTEGER DEFAULT 240,
    absent_threshold_minutes INTEGER DEFAULT 480,
    overtime_enabled BOOLEAN DEFAULT FALSE,
    overtime_threshold_minutes INTEGER DEFAULT 30,
    overtime_multiplier DECIMAL(3,2) DEFAULT 1.5,
    grace_period_minutes INTEGER DEFAULT 5,
    grace_late_allowed_per_month INTEGER DEFAULT 3,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    alternate_saturday BOOLEAN DEFAULT FALSE,
    round_off_minutes INTEGER DEFAULT 15,
    minimum_punch_gap_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(category, key)
);

-- System Logs
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Device Messages
CREATE TABLE IF NOT EXISTS device_messages (
    id SERIAL PRIMARY KEY,
    device_serial VARCHAR(100) NOT NULL,
    message TEXT,
    message_type VARCHAR(20) DEFAULT 'info',
    direction VARCHAR(10) DEFAULT 'in',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    record_id INTEGER,
    action VARCHAR(20),
    old_data JSONB,
    new_data JSONB,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Groups (for access control)
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- Create Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON attendance_logs(employee_code);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON attendance_logs(punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_device ON attendance_logs(device_serial);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_emp ON attendance_daily_summary(employee_code);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_date ON attendance_daily_summary(date);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status);
CREATE INDEX IF NOT EXISTS idx_leaves_emp ON leaves(employee_code);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- =====================================================
-- Seed Default Data
-- =====================================================

-- Default Admin User (password: admin)
INSERT INTO users (username, password_hash, email, role, full_name) VALUES
('admin', '$2a$10$rK7PbXVXKH3NQyRJ8TJFxuQYJQXRGWE6EJGf7qF6LqGZWx4dRyT1e', 'admin@vayutime.com', 'admin', 'System Administrator')
ON CONFLICT (username) DO NOTHING;

-- Default Departments
INSERT INTO departments (name, code) VALUES
('Head Office', 'HO'),
('Human Resources', 'HR'),
('Information Technology', 'IT'),
('Finance', 'FIN'),
('Operations', 'OPS')
ON CONFLICT DO NOTHING;

-- Default Areas
INSERT INTO areas (name, code) VALUES
('Main Building', 'MAIN'),
('Warehouse', 'WH'),
('Branch Office', 'BR')
ON CONFLICT DO NOTHING;

-- Default Shifts
INSERT INTO shifts (name, code, start_time, end_time, grace_in_minutes) VALUES
('General Shift', 'GEN', '09:00', '18:00', 15),
('Morning Shift', 'MOR', '06:00', '14:00', 10),
('Night Shift', 'NIG', '22:00', '06:00', 15)
ON CONFLICT (code) DO NOTHING;

-- Default Timetables
INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, description) VALUES
('General Shift', 'GEN', '09:00', '18:00', '09:15', '17:45', 'Standard 9 AM to 6 PM shift'),
('Morning Shift', 'MOR', '06:00', '14:00', '06:15', '13:45', 'Early morning shift'),
('Afternoon Shift', 'AFT', '14:00', '22:00', '14:15', '21:45', 'Afternoon to night shift'),
('Night Shift', 'NIG', '22:00', '06:00', '22:15', '05:45', 'Overnight night shift'),
('Flexible Hours', 'FLX', '08:00', '20:00', '10:00', '18:00', 'Flexible timing with core hours')
ON CONFLICT (code) DO NOTHING;

-- Default Attendance Rule
INSERT INTO attendance_rules (rule_type, name, late_threshold_minutes, grace_period_minutes) VALUES
('global', 'Default Attendance Policy', 15, 5)
ON CONFLICT DO NOTHING;

-- Default Settings
INSERT INTO settings (category, key, value, description) VALUES
('company', 'name', 'VayuTime', 'Company Name'),
('company', 'timezone', 'Asia/Kolkata', 'Default Timezone'),
('attendance', 'auto_process', 'true', 'Auto process attendance daily'),
('attendance', 'process_time', '23:30', 'Time to process attendance')
ON CONFLICT (category, key) DO NOTHING;

-- Holiday Locations
INSERT INTO holiday_locations (name, description) VALUES
('Head Office', 'Main headquarters location'),
('Branch Office', 'Regional branch offices'),
('Factory', 'Manufacturing units')
ON CONFLICT DO NOTHING;

SELECT 'Database initialization complete!' as status;
