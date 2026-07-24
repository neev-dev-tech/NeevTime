/**
 * Comprehensive Production Schema Fix
 * 
 * This script ensures all tables and columns exist that are used by the application.
 * Run this BEFORE deploying to production to prevent "column/table does not exist" errors.
 * 
 * Usage: node server/scripts/fix_production_schema.js
 */

const db = require('../db');

async function runQuery(query, description, params = []) {
    try {
        await db.query(query, params);
        console.log(`  ✅ ${description}`);
        return true;
    } catch (err) {
        if (err.code === '42701' || err.message.includes('already exists')) {
            console.log(`  ⏭️  ${description} (already exists)`);
            return true;
        }
        if (err.code === '42P07') {
            console.log(`  ⏭️  ${description} (table already exists)`);
            return true;
        }
        if (err.code === '23505') {
            // Unique violation - setting already exists, that's fine
            console.log(`  ⏭️  ${description} (already exists)`);
            return true;
        }
        console.error(`  ❌ ${description}: ${err.message}`);
        return false;
    }
}

async function fixProductionSchema() {
    console.log('🚀 Starting Comprehensive Production Schema Fix...\n');

    // ==========================================
    // 1. CORE TABLES (must exist first)
    // ==========================================
    console.log('📦 1. Ensuring core tables exist...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS areas (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50),
            parent_area_id INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'areas table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS departments (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(20),
            parent_id INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'departments table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS positions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(20),
            department_id INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'positions table');

    await runQuery(`
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
        )
    `, 'users table');

    // ==========================================
    // 2. EMPLOYEES TABLE WITH ALL COLUMNS
    // ==========================================
    console.log('\n📦 2. Ensuring employees table and columns...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            department_id INTEGER,
            area_id INTEGER,
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
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'employees table');

    const employeeColumns = [
        { name: 'area_id', type: 'INTEGER' },
        { name: 'gender', type: 'VARCHAR(10)' },
        { name: 'dob', type: 'DATE' },
        { name: 'joining_date', type: 'DATE' },
        { name: 'mobile', type: 'VARCHAR(20)' },
        { name: 'email', type: 'VARCHAR(100)' },
        { name: 'address', type: 'TEXT' },
        { name: 'status', type: "VARCHAR(20) DEFAULT 'active'" },
        { name: 'employment_type', type: 'VARCHAR(50)' },
        { name: 'app_access', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'app_login_enabled', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'photo', type: 'TEXT' },
        { name: 'profile_photo', type: 'TEXT' },
        { name: 'has_fingerprint', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'has_face', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'has_palm', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'fingerprint_count', type: 'INTEGER DEFAULT 0' },
        { name: 'face_count', type: 'INTEGER DEFAULT 0' },
        { name: 'position_id', type: 'INTEGER' },
        { name: 'holiday_location_id', type: 'INTEGER' },
        { name: 'device_privilege', type: "VARCHAR(20) DEFAULT 'Employee'" },
        { name: 'branch_id', type: 'INTEGER' },
        { name: 'shift_group_id', type: 'INTEGER' },
        { name: 'join_date', type: 'DATE' }
    ];

    for (const col of employeeColumns) {
        await runQuery(
            `ALTER TABLE employees ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
            `employees.${col.name}`
        );
    }

    // ==========================================
    // 3. DEVICES TABLE WITH ALL COLUMNS
    // ==========================================
    console.log('\n📦 3. Ensuring devices table and columns...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS devices (
            serial_number VARCHAR(100) PRIMARY KEY,
            device_name VARCHAR(100),
            device_model VARCHAR(100),
            ip_address VARCHAR(45),
            port INTEGER DEFAULT 4370,
            status VARCHAR(20) DEFAULT 'offline',
            firmware_version VARCHAR(50),
            last_activity TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'devices table');

    const deviceColumns = [
        { name: 'area_id', type: 'INTEGER' },
        { name: 'transfer_mode', type: "VARCHAR(50) DEFAULT 'realtime'" },
        { name: 'timezone', type: "VARCHAR(50) DEFAULT 'Etc/GMT+5:30'" },
        { name: 'is_registration_device', type: 'BOOLEAN DEFAULT TRUE' },
        { name: 'is_attendance_device', type: 'BOOLEAN DEFAULT TRUE' },
        { name: 'connection_interval', type: 'INTEGER DEFAULT 10' },
        { name: 'device_direction', type: "VARCHAR(20) DEFAULT 'both'" },
        { name: 'enable_access_control', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'device_type', type: "VARCHAR(20) DEFAULT 'IN'" },
        { name: 'communication_type', type: "VARCHAR(20) DEFAULT 'push'" },
        { name: 'last_sync', type: 'TIMESTAMP' },
        { name: 'user_count', type: 'INTEGER DEFAULT 0' },
        { name: 'fingerprint_count', type: 'INTEGER DEFAULT 0' },
        { name: 'face_count', type: 'INTEGER DEFAULT 0' },
        { name: 'transaction_count', type: 'INTEGER DEFAULT 0' }
    ];

    for (const col of deviceColumns) {
        await runQuery(
            `ALTER TABLE devices ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
            `devices.${col.name}`
        );
    }

    // ==========================================
    // 4. DEVICE-RELATED TABLES
    // ==========================================
    console.log('\n📦 4. Ensuring device-related tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS device_commands (
            id SERIAL PRIMARY KEY,
            device_serial VARCHAR(100) NOT NULL,
            command TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            sequence INTEGER DEFAULT 1,
            response TEXT,
            retry_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            executed_at TIMESTAMP
        )
    `, 'device_commands table');

    await runQuery(`ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS sequence INTEGER DEFAULT 1`, 'device_commands.sequence');
    await runQuery(`ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`, 'device_commands.retry_count');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS device_capabilities (
            id SERIAL PRIMARY KEY,
            device_serial VARCHAR(100) NOT NULL,
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
            raw_info TEXT,
            detected_at TIMESTAMP DEFAULT NOW()
        )
    `, 'device_capabilities table');

    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS raw_info TEXT`, 'device_capabilities.raw_info');
    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS user_capacity INTEGER`, 'device_capabilities.user_capacity');
    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS finger_capacity INTEGER`, 'device_capabilities.finger_capacity');
    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS face_capacity INTEGER`, 'device_capabilities.face_capacity');
    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS log_capacity INTEGER`, 'device_capabilities.log_capacity');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS device_messages (
            id SERIAL PRIMARY KEY,
            device_serial VARCHAR(100) NOT NULL,
            message TEXT,
            message_type VARCHAR(20) DEFAULT 'info',
            direction VARCHAR(10) DEFAULT 'in',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'device_messages table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS device_operation_logs (
            id SERIAL PRIMARY KEY,
            device_serial VARCHAR(100) NOT NULL,
            operation_type VARCHAR(50),
            operator VARCHAR(50),
            log_time TIMESTAMP,
            details TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'device_operation_logs table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS device_error_logs (
            id SERIAL PRIMARY KEY,
            device_serial VARCHAR(100) NOT NULL,
            error_code VARCHAR(50),
            log_time TIMESTAMP,
            details TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'device_error_logs table');

    // ==========================================
    // 5. BIOMETRIC TEMPLATES
    // ==========================================
    console.log('\n📦 5. Ensuring biometric_templates table...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS biometric_templates (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50) NOT NULL,
            template_type INTEGER NOT NULL,
            template_no INTEGER DEFAULT 0,
            template_index INTEGER DEFAULT 0,
            template_data TEXT,
            device_serial VARCHAR(100),
            source_device VARCHAR(100),
            valid INTEGER DEFAULT 1,
            duress INTEGER DEFAULT 0,
            major_ver INTEGER DEFAULT 0,
            minor_ver INTEGER DEFAULT 0,
            format INTEGER DEFAULT 0,
            index_no INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(employee_code, template_type, template_no)
        )
    `, 'biometric_templates table');

    const bioColumns = [
        { name: 'template_no', type: 'INTEGER DEFAULT 0' },
        { name: 'source_device', type: 'VARCHAR(100)' },
        { name: 'valid', type: 'INTEGER DEFAULT 1' },
        { name: 'duress', type: 'INTEGER DEFAULT 0' },
        { name: 'major_ver', type: 'INTEGER DEFAULT 0' },
        { name: 'minor_ver', type: 'INTEGER DEFAULT 0' },
        { name: 'format', type: 'INTEGER DEFAULT 0' },
        { name: 'index_no', type: 'INTEGER DEFAULT 0' },
        { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' }
    ];

    for (const col of bioColumns) {
        await runQuery(
            `ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
            `biometric_templates.${col.name}`
        );
    }

    // ==========================================
    // 6. ATTENDANCE LOGS
    // ==========================================
    console.log('\n📦 6. Ensuring attendance tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50) NOT NULL,
            punch_time TIMESTAMP NOT NULL,
            punch_type VARCHAR(10),
            punch_state VARCHAR(10),
            verify_type INTEGER,
            verification_mode INTEGER,
            device_serial VARCHAR(100),
            work_code VARCHAR(20),
            raw_data TEXT,
            source INTEGER DEFAULT 1,
            is_attendance INTEGER DEFAULT 1,
            upload_time TIMESTAMP,
            mask_flag INTEGER DEFAULT 0,
            temperature DECIMAL(4,1) DEFAULT 0,
            sync_status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(employee_code, punch_time, device_serial)
        )
    `, 'attendance_logs table');

    const attLogColumns = [
        { name: 'punch_state', type: 'VARCHAR(10)' },
        { name: 'verification_mode', type: 'INTEGER' },
        { name: 'raw_data', type: 'TEXT' },
        { name: 'source', type: 'INTEGER DEFAULT 1' },
        { name: 'is_attendance', type: 'INTEGER DEFAULT 1' },
        { name: 'upload_time', type: 'TIMESTAMP' },
        { name: 'mask_flag', type: 'INTEGER DEFAULT 0' },
        { name: 'temperature', type: 'DECIMAL(4,1) DEFAULT 0' },
        { name: 'sync_status', type: "VARCHAR(20) DEFAULT 'pending'" }
    ];

    for (const col of attLogColumns) {
        await runQuery(
            `ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`,
            `attendance_logs.${col.name}`
        );
    }

    await runQuery(`
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
            early_minutes INTEGER,
            overtime_minutes INTEGER,
            ot_minutes INTEGER,
            remarks TEXT,
            shift_id INTEGER,
            shift_name VARCHAR(50),
            shift_start TIME,
            shift_end TIME,
            is_finalized BOOLEAN DEFAULT FALSE,
            last_calculated_at TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(employee_code, date)
        )
    `, 'attendance_daily_summary table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS attendance_rules (
            id SERIAL PRIMARY KEY,
            rule_type VARCHAR(20) NOT NULL DEFAULT 'global',
            department_id INTEGER,
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
            week_off_days TEXT[],
            alternate_saturday BOOLEAN DEFAULT FALSE,
            round_off_minutes INTEGER DEFAULT 15,
            minimum_punch_gap_minutes INTEGER DEFAULT 30,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'attendance_rules table');

    // ==========================================
    // 7. LEAVE MANAGEMENT TABLES
    // ==========================================
    console.log('\n📦 7. Ensuring leave management tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS leave_types (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20),
            name VARCHAR(100) NOT NULL,
            annual_quota INTEGER DEFAULT 0,
            carry_forward BOOLEAN DEFAULT FALSE,
            color VARCHAR(20) DEFAULT '#3b82f6',
            requires_approval BOOLEAN DEFAULT TRUE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'leave_types table');

    // Seed standard Indian leave types on fresh installs only (table empty)
    await runQuery(`
        INSERT INTO leave_types (code, name, annual_quota, carry_forward, color)
        SELECT * FROM (VALUES
            ('CL', 'Casual Leave', 12, false, '#3b82f6'),
            ('SL', 'Sick Leave', 12, false, '#f59e0b'),
            ('PL', 'Privilege Leave', 15, true, '#22c55e'),
            ('LWP', 'Leave Without Pay', 0, false, '#94a3b8')
        ) AS seed(code, name, annual_quota, carry_forward, color)
        WHERE NOT EXISTS (SELECT 1 FROM leave_types)
    `, 'default leave types seed');

    await runQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS annual_quota INTEGER DEFAULT 0`, 'leave_types.annual_quota');
    await runQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS carry_forward BOOLEAN DEFAULT FALSE`, 'leave_types.carry_forward');
    await runQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#3b82f6'`, 'leave_types.color');
    await runQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT TRUE`, 'leave_types.requires_approval');
    await runQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`, 'leave_types.is_active');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS leave_balances (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50) NOT NULL,
            leave_type_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            opening_balance DECIMAL(5,1) DEFAULT 0,
            balance DECIMAL(5,1) DEFAULT 0,
            used DECIMAL(5,1) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(employee_code, leave_type_id, year)
        )
    `, 'leave_balances table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS leave_applications (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50) NOT NULL,
            leave_type_id INTEGER NOT NULL,
            from_date DATE NOT NULL,
            to_date DATE NOT NULL,
            is_half_day BOOLEAN DEFAULT FALSE,
            half_day_type VARCHAR(20),
            total_days DECIMAL(4,1),
            reason TEXT,
            status VARCHAR(20) DEFAULT 'Pending',
            rejection_reason TEXT,
            approved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'leave_applications table');

    // ==========================================
    // 8. HRMS INTEGRATION TABLES
    // ==========================================
    console.log('\n📦 8. Ensuring HRMS integration tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS hrms_integrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            type VARCHAR(50) NOT NULL,
            base_url VARCHAR(255),
            api_key VARCHAR(255),
            api_secret VARCHAR(255),
            username VARCHAR(100),
            password VARCHAR(255),
            database_name VARCHAR(100),
            is_active BOOLEAN DEFAULT TRUE,
            sync_employees BOOLEAN DEFAULT TRUE,
            sync_attendance BOOLEAN DEFAULT TRUE,
            sync_leaves BOOLEAN DEFAULT TRUE,
            sync_interval_minutes INTEGER DEFAULT 30,
            last_sync_at TIMESTAMP,
            last_sync_status VARCHAR(20),
            last_sync_message TEXT,
            config JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'hrms_integrations table');

    await runQuery(`ALTER TABLE hrms_integrations ADD COLUMN IF NOT EXISTS last_sync_status VARCHAR(20)`, 'hrms_integrations.last_sync_status');
    await runQuery(`ALTER TABLE hrms_integrations ADD COLUMN IF NOT EXISTS last_sync_message TEXT`, 'hrms_integrations.last_sync_message');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS integration_sync_logs (
            id SERIAL PRIMARY KEY,
            integration_id INTEGER NOT NULL,
            sync_type VARCHAR(50),
            status VARCHAR(20),
            records_processed INTEGER DEFAULT 0,
            records_success INTEGER DEFAULT 0,
            records_failed INTEGER DEFAULT 0,
            error_message TEXT,
            started_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP
        )
    `, 'integration_sync_logs table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS integration_field_mappings (
            id SERIAL PRIMARY KEY,
            integration_id INTEGER NOT NULL,
            entity_type VARCHAR(50),
            local_field VARCHAR(100),
            remote_field VARCHAR(100),
            transform_function TEXT,
            is_required BOOLEAN DEFAULT FALSE,
            default_value TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'integration_field_mappings table');

    // ==========================================
    // 9. EMAIL AND REPORTS TABLES
    // ==========================================
    console.log('\n📦 9. Ensuring email and reports tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS email_settings (
            id SERIAL PRIMARY KEY,
            smtp_host VARCHAR(255),
            smtp_port INTEGER DEFAULT 587,
            smtp_user VARCHAR(255),
            smtp_password VARCHAR(255),
            smtp_from_email VARCHAR(255),
            smtp_from_name VARCHAR(100),
            tls_enabled BOOLEAN DEFAULT TRUE,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'email_settings table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS scheduled_reports (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            report_type VARCHAR(50) NOT NULL,
            schedule_type VARCHAR(20) NOT NULL,
            schedule_time TIME,
            schedule_day INTEGER,
            recipients TEXT[],
            filters JSONB,
            is_active BOOLEAN DEFAULT TRUE,
            last_run_at TIMESTAMP,
            next_run_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'scheduled_reports table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS report_history (
            id SERIAL PRIMARY KEY,
            scheduled_report_id INTEGER,
            report_type VARCHAR(50),
            recipients TEXT,
            status VARCHAR(20),
            error_message TEXT,
            sent_at TIMESTAMP DEFAULT NOW()
        )
    `, 'report_history table');

    // ==========================================
    // 10. APP SETTINGS TABLE
    // ==========================================
    console.log('\n📦 10. Ensuring app_settings table...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS app_settings (
            id SERIAL PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            setting_key VARCHAR(100) NOT NULL,
            setting_value TEXT,
            data_type VARCHAR(20) DEFAULT 'string',
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(category, setting_key)
        )
    `, 'app_settings table');

    // Seed default settings if empty
    console.log('  📝 Seeding default settings...');

    const defaultSettings = [
        // Company Settings
        { category: 'company', key: 'company_name', value: 'Your Company Name', type: 'string', desc: 'Official company name' },
        { category: 'company', key: 'company_address', value: '', type: 'string', desc: 'Company address' },
        { category: 'company', key: 'company_email', value: '', type: 'string', desc: 'Company email address' },
        { category: 'company', key: 'company_phone', value: '', type: 'string', desc: 'Company phone number' },
        { category: 'company', key: 'company_website', value: '', type: 'string', desc: 'Company website URL' },
        { category: 'company', key: 'company_city', value: '', type: 'string', desc: 'City' },
        { category: 'company', key: 'company_state', value: '', type: 'string', desc: 'State/Province' },
        { category: 'company', key: 'company_country', value: 'India', type: 'string', desc: 'Country' },
        { category: 'company', key: 'company_pincode', value: '', type: 'string', desc: 'Postal/ZIP code' },

        // Attendance Rules
        { category: 'attendance', key: 'grace_period_minutes', value: '15', type: 'number', desc: 'Grace period (minutes) before marking as late' },
        { category: 'attendance', key: 'half_day_threshold_hours', value: '4', type: 'number', desc: 'Minimum hours for half-day attendance' },
        { category: 'attendance', key: 'full_day_threshold_hours', value: '8', type: 'number', desc: 'Minimum hours for full-day attendance' },
        { category: 'attendance', key: 'overtime_start_after_hours', value: '9', type: 'number', desc: 'Hours after which overtime starts' },
        { category: 'attendance', key: 'auto_punch_out_enabled', value: 'false', type: 'boolean', desc: 'Automatically punch out at end of day' },
        { category: 'attendance', key: 'auto_punch_out_time', value: '23:59', type: 'string', desc: 'Time for automatic punch out' },
        { category: 'attendance', key: 'minimum_break_minutes', value: '30', type: 'number', desc: 'Minimum break duration in minutes' },
        { category: 'attendance', key: 'allow_multiple_punches', value: 'true', type: 'boolean', desc: 'Allow multiple IN/OUT punches per day' },

        // Weekend Rules
        { category: 'weekend', key: 'weekend_days', value: '["Saturday", "Sunday"]', type: 'json', desc: 'Days considered as weekend' },
        { category: 'weekend', key: 'first_saturday_off', value: 'false', type: 'boolean', desc: 'First Saturday of month is off' },
        { category: 'weekend', key: 'second_saturday_off', value: 'true', type: 'boolean', desc: 'Second Saturday of month is off' },
        { category: 'weekend', key: 'third_saturday_off', value: 'false', type: 'boolean', desc: 'Third Saturday of month is off' },
        { category: 'weekend', key: 'fourth_saturday_off', value: 'true', type: 'boolean', desc: 'Fourth Saturday of month is off' },
        { category: 'weekend', key: 'fifth_saturday_off', value: 'false', type: 'boolean', desc: 'Fifth Saturday of month is off (if exists)' },
        { category: 'weekend', key: 'all_sundays_off', value: 'true', type: 'boolean', desc: 'All Sundays are off' },

        // Email/SMTP Settings
        { category: 'notifications', key: 'smtp_host', value: '', type: 'string', desc: 'SMTP server hostname' },
        { category: 'notifications', key: 'smtp_port', value: '587', type: 'number', desc: 'SMTP server port' },
        { category: 'notifications', key: 'smtp_username', value: '', type: 'string', desc: 'SMTP username' },
        { category: 'notifications', key: 'smtp_password', value: '', type: 'string', desc: 'SMTP password' },
        { category: 'notifications', key: 'smtp_from_email', value: '', type: 'string', desc: 'From email address' },
        { category: 'notifications', key: 'smtp_from_name', value: 'NeevTime', type: 'string', desc: 'From name in emails' },
        { category: 'notifications', key: 'smtp_secure', value: 'true', type: 'boolean', desc: 'Use TLS/SSL for SMTP' },
        { category: 'notifications', key: 'email_notifications_enabled', value: 'true', type: 'boolean', desc: 'Enable email notifications' },

        // Security Settings
        { category: 'security', key: 'session_timeout_minutes', value: '480', type: 'number', desc: 'Session timeout in minutes (default 8 hours)' },
        { category: 'security', key: 'max_login_attempts', value: '5', type: 'number', desc: 'Maximum failed login attempts before lockout' },
        { category: 'security', key: 'lockout_duration_minutes', value: '30', type: 'number', desc: 'Account lockout duration in minutes' },
        { category: 'security', key: 'password_min_length', value: '8', type: 'number', desc: 'Minimum password length' },
        { category: 'security', key: 'require_special_char', value: 'true', type: 'boolean', desc: 'Require special character in password' },
        { category: 'security', key: 'two_factor_enabled', value: 'false', type: 'boolean', desc: 'Enable two-factor authentication' },
        { category: 'security', key: 'force_password_change_days', value: '90', type: 'number', desc: 'Force password change after N days (0 = disabled)' },

        // WhatsApp Settings
        { category: 'whatsapp', key: 'whatsapp_enabled', value: 'false', type: 'boolean', desc: 'Enable WhatsApp notifications' },
        { category: 'whatsapp', key: 'whatsapp_api_url', value: '', type: 'string', desc: 'WhatsApp Business API URL' },
        { category: 'whatsapp', key: 'whatsapp_api_key', value: '', type: 'string', desc: 'WhatsApp API key' },
        { category: 'whatsapp', key: 'whatsapp_sender_number', value: '', type: 'string', desc: 'WhatsApp sender phone number' },
        { category: 'whatsapp', key: 'whatsapp_late_alert', value: 'true', type: 'boolean', desc: 'Send WhatsApp alert for late arrivals' },
        { category: 'whatsapp', key: 'whatsapp_absent_alert', value: 'true', type: 'boolean', desc: 'Send WhatsApp alert for absences' },

        // SMS Settings
        { category: 'sms', key: 'sms_enabled', value: 'false', type: 'boolean', desc: 'Enable SMS notifications' },
        { category: 'sms', key: 'sms_provider', value: 'twilio', type: 'string', desc: 'SMS provider (twilio, msg91, textlocal)' },
        { category: 'sms', key: 'sms_api_key', value: '', type: 'string', desc: 'SMS provider API key' },
        { category: 'sms', key: 'sms_api_secret', value: '', type: 'string', desc: 'SMS provider API secret' },
        { category: 'sms', key: 'sms_sender_id', value: 'NEEVTM', type: 'string', desc: 'SMS sender ID' },
        { category: 'sms', key: 'sms_late_alert', value: 'false', type: 'boolean', desc: 'Send SMS alert for late arrivals' },
        { category: 'sms', key: 'sms_absent_alert', value: 'false', type: 'boolean', desc: 'Send SMS alert for absences' },

        // Auto Reports Settings
        { category: 'reports', key: 'auto_daily_report_enabled', value: 'false', type: 'boolean', desc: 'Send daily attendance report automatically' },
        { category: 'reports', key: 'daily_report_time', value: '18:00', type: 'string', desc: 'Time to send daily report (HH:MM)' },
        { category: 'reports', key: 'daily_report_recipients', value: '', type: 'string', desc: 'Email addresses for daily report (comma-separated)' },
        { category: 'reports', key: 'auto_weekly_report_enabled', value: 'false', type: 'boolean', desc: 'Send weekly attendance report automatically' },
        { category: 'reports', key: 'weekly_report_day', value: 'Monday', type: 'string', desc: 'Day to send weekly report' },
        { category: 'reports', key: 'weekly_report_recipients', value: '', type: 'string', desc: 'Email addresses for weekly report (comma-separated)' },
        { category: 'reports', key: 'auto_monthly_report_enabled', value: 'false', type: 'boolean', desc: 'Send monthly attendance report automatically' },
        { category: 'reports', key: 'monthly_report_recipients', value: '', type: 'string', desc: 'Email addresses for monthly report (comma-separated)' },

        // PDF Settings
        { category: 'pdf', key: 'pdf_header_text', value: 'Attendance Report', type: 'string', desc: 'Header text for PDF reports' },
        { category: 'pdf', key: 'pdf_footer_text', value: 'Generated by NeevTime', type: 'string', desc: 'Footer text for PDF reports' },
        { category: 'pdf', key: 'pdf_show_logo', value: 'true', type: 'boolean', desc: 'Show company logo in PDF' },
        { category: 'pdf', key: 'pdf_orientation', value: 'portrait', type: 'string', desc: 'PDF page orientation (portrait/landscape)' },
        { category: 'pdf', key: 'pdf_page_size', value: 'A4', type: 'string', desc: 'PDF page size (A4, Letter, Legal)' },
        { category: 'pdf', key: 'pdf_include_summary', value: 'true', type: 'boolean', desc: 'Include summary section in PDF' },
        { category: 'pdf', key: 'pdf_include_signature_line', value: 'false', type: 'boolean', desc: 'Include signature line in PDF' },
    ];

    for (const setting of defaultSettings) {
        await runQuery(`
            INSERT INTO app_settings (category, setting_key, setting_value, data_type, description)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (category, setting_key) DO NOTHING
        `, `  ✅ ${setting.category}.${setting.key}`, [setting.category, setting.key, setting.value, setting.type, setting.desc]);
    }

    // ==========================================
    // 11. SCHEDULING TABLES
    // ==========================================
    console.log('\n📦 11. Ensuring scheduling tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS shifts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(20) UNIQUE,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            shift_type VARCHAR(20) DEFAULT 'Fixed',
            grace_in_minutes INTEGER DEFAULT 15,
            grace_out_minutes INTEGER DEFAULT 15,
            late_threshold_minutes INTEGER DEFAULT 15,
            early_exit_threshold_minutes INTEGER DEFAULT 15,
            half_day_threshold_hours DECIMAL(3,1) DEFAULT 4.0,
            break_duration_minutes INTEGER DEFAULT 0,
            min_hours DECIMAL(4,2) DEFAULT 8,
            is_night_shift BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            color VARCHAR(10) DEFAULT '#3B82F6',
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'shifts table');

    await runQuery(`
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
        )
    `, 'timetables table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS break_times (
            id SERIAL PRIMARY KEY,
            timetable_id INTEGER,
            name VARCHAR(100) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            is_paid BOOLEAN DEFAULT TRUE,
            is_deductible BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'break_times table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS holidays (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            date DATE NOT NULL,
            type VARCHAR(20) DEFAULT 'public',
            location_id INTEGER,
            is_optional BOOLEAN DEFAULT FALSE,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'holidays table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS holiday_locations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'holiday_locations table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS weekly_off_rules (
            id SERIAL PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            pattern VARCHAR(20),
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `, 'weekly_off_rules table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS employee_shift_roster (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50),
            shift_id INTEGER,
            effective_from DATE NOT NULL,
            effective_to DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(employee_code, effective_from)
        )
    `, 'employee_shift_roster table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS department_schedules (
            id SERIAL PRIMARY KEY,
            department_id INTEGER,
            shift_id INTEGER,
            timetable_id INTEGER,
            effective_from DATE NOT NULL,
            effective_to DATE,
            week_off_days TEXT[],
            is_active BOOLEAN DEFAULT TRUE,
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'department_schedules table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS employee_schedules (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER,
            shift_id INTEGER,
            timetable_id INTEGER,
            effective_from DATE NOT NULL,
            effective_to DATE,
            is_temporary BOOLEAN DEFAULT FALSE,
            reason TEXT,
            week_off_days TEXT[],
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'employee_schedules table');

    // ==========================================
    // 12. APPROVAL WORKFLOW TABLES
    // ==========================================
    console.log('\n📦 12. Ensuring approval workflow tables...');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS approval_roles (
            id SERIAL PRIMARY KEY,
            role_code VARCHAR(50) UNIQUE NOT NULL,
            role_name VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'approval_roles table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS approval_flows (
            id SERIAL PRIMARY KEY,
            flow_code VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            start_date DATE,
            end_date DATE,
            request_type VARCHAR(50),
            requester TEXT,
            position_id INTEGER,
            department_id INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'approval_flows table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS approval_nodes (
            id SERIAL PRIMARY KEY,
            node_code VARCHAR(50) UNIQUE NOT NULL,
            node_name VARCHAR(100) NOT NULL,
            approver_type VARCHAR(50) NOT NULL,
            approver_id INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'approval_nodes table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS flow_nodes (
            id SERIAL PRIMARY KEY,
            flow_id INTEGER,
            node_id INTEGER,
            node_order INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(flow_id, node_order)
        )
    `, 'flow_nodes table');

    // ==========================================
    // 13. SYSTEM AND AUDIT TABLES
    // ==========================================
    console.log('\n📦 13. Ensuring system and audit tables...');

    await runQuery(`
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
        )
    `, 'system_logs table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS employee_docs (
            id SERIAL PRIMARY KEY,
            employee_code VARCHAR(50),
            doc_name VARCHAR(100) NOT NULL,
            file_path TEXT,
            uploaded_at TIMESTAMP DEFAULT NOW()
        )
    `, 'employee_docs table');

    await runQuery(`
        CREATE TABLE IF NOT EXISTS resignations (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER,
            resignation_date DATE NOT NULL,
            resignation_type VARCHAR(50) NOT NULL,
            report_end_date DATE,
            attendance_option VARCHAR(50),
            reason TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `, 'resignations table');

    // ==========================================
    // 14. AREAS TABLE COLUMNS FIX
    // ==========================================
    console.log('\n📦 14. Fixing areas table columns...');

    await runQuery(`ALTER TABLE areas ADD COLUMN IF NOT EXISTS code VARCHAR(50)`, 'areas.code');
    await runQuery(`ALTER TABLE areas ADD COLUMN IF NOT EXISTS parent_area_id INTEGER`, 'areas.parent_area_id');
    await runQuery(`ALTER TABLE areas ADD COLUMN IF NOT EXISTS description TEXT`, 'areas.description');

    // ==========================================
    // 15. CREATE INDEXES
    // ==========================================
    console.log('\n📦 15. Creating indexes...');

    await runQuery(`CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code)`, 'idx_employees_code');
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id)`, 'idx_employees_dept');
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON attendance_logs(employee_code)`, 'idx_attendance_logs_emp');
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON attendance_logs(punch_time)`, 'idx_attendance_logs_time');
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_device_commands_status ON device_commands(status)`, 'idx_device_commands_status');
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC)`, 'idx_system_logs_created');

    // ==========================================
    // 16. FIX CRITICAL CONSTRAINTS
    // ==========================================
    console.log('\n📦 16. Fixing critical constraints...');

    // Add unique constraint on (employee_code, punch_time) for attendance_logs
    // This is required for the ON CONFLICT clause in adms.js
    await runQuery(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'attendance_logs_emp_time_unique'
            ) THEN
                -- First, remove duplicates if any exist
                DELETE FROM attendance_logs a
                USING attendance_logs b
                WHERE a.id < b.id
                AND a.employee_code = b.employee_code
                AND a.punch_time = b.punch_time;
                
                -- Then create the unique constraint
                ALTER TABLE attendance_logs 
                ADD CONSTRAINT attendance_logs_emp_time_unique 
                UNIQUE (employee_code, punch_time);
            END IF;
        END $$;
    `, 'attendance_logs_emp_time_unique constraint');

    // Add updated_at column to device_capabilities if missing
    await runQuery(`ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`, 'device_capabilities.updated_at');

    console.log('\n✅ Comprehensive Production Schema Fix completed!');
    console.log('\n📋 Summary: All tables and columns have been verified and created if missing.');
    console.log('   You can now safely rebuild Docker and run the application.\n');

    process.exit(0);
}

fixProductionSchema().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
});
