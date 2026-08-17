-- =====================================================
-- NeevTime — the schema a fresh install gets.
--
-- This is the only file the installer runs. It exists because the nine files
-- that preceded it defined seventeen tables more than once, every one of them
-- with CREATE TABLE IF NOT EXISTS: the first definition loaded won and the rest
-- became silent no-ops, so which shape a new customer's database ended up with
-- depended on filename sort order rather than on anything anyone decided. Three
-- of those tables ended up in a shape the application cannot write to, and the
-- symptom in each case was a page that returned 500 or a sync that failed into
-- a log nobody reads.
--
-- The old files are kept, unchanged, in database/legacy/. They are history, not
-- a contract, and nothing loads them.
--
-- WHERE THE DEFINITIONS DISAGREED, THE SHAPE THE CODE USES WON:
--
--   areas            parent_area_id, not parent_id. routes/organization.js and
--                    client/src/pages/Area.jsx both use parent_area_id; 00_init_all.sql's
--                    parent_id is kept alongside it because existing databases
--                    have it, but nothing reads it.
--   devices          the full reader configuration from schema.sql — transfer_mode,
--                    timezone, is_registration_device, is_attendance_device,
--                    connection_interval, device_direction, enable_access_control.
--                    Adding or editing a device writes all seven; a database
--                    built from 00_init_all.sql alone has none of them.
--   attendance_logs  punch_state / verification_mode / sync_status, and the unique
--                    key on (employee_code, punch_time) that both ingest paths
--                    name in ON CONFLICT. 00_init_all.sql's punch_type /
--                    verify_type are kept because existing databases have them.
--                    Its three-column unique is not carried forward: the
--                    two-column one is strictly stronger and is the one the
--                    inserts target.
--   attendance_daily_summary
--                    ot_minutes, which the engine writes. overtime_minutes is
--                    kept because existing databases hold values in it.
--   positions        name / code, not schema_easytime.sql's NOT NULL
--                    position_code / position_name — the create-position route
--                    sends neither.
--   attendance_rules the rule_type shape, not schema.sql's setting_name /
--                    setting_value key-value stub.
--   shifts           break_duration_minutes, not schema.sql's break_duration.
--
-- Columns that only ever existed in a losing definition and that nothing reads
-- are not carried forward: employees.profile_photo, break_times.duration_minutes,
-- shifts.break_duration, holiday_locations.location_code / location_name,
-- positions.position_code / position_name, leaves.leave_type_id. No existing
-- database loses anything — nothing here drops a column, and ensureSchema in
-- server/server.js remains the only thing that runs against a database that
-- already exists.
--
-- STILL OPEN, deliberately not papered over here:
--   holidays has holiday_location_id, which the HRMS sync writes and the unique
--   index covers. routes/scheduling.js writes location_id instead — a different
--   column, which a fresh install does not have at all. Adding a second column
--   would give the Holidays page and the holiday sync one field each and let
--   them disagree silently, so the route is the thing that should change.
-- =====================================================

CREATE TABLE IF NOT EXISTS alert_state (
    alert_key VARCHAR(200) NOT NULL,
    severity VARCHAR(20),
    subject TEXT,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified_at TIMESTAMP,
    resolved_at TIMESTAMP,
    occurrences INTEGER DEFAULT 1,
    last_error TEXT,
    PRIMARY KEY (alert_key)
);

CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL,
    category VARCHAR(50) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    data_type VARCHAR(20) DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (category, setting_key)
);

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    parent_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS positions (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    department_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS approval_flows (
    id SERIAL,
    flow_code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    requester TEXT,
    position_id INTEGER,
    department_id INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
    PRIMARY KEY (id),
    UNIQUE (flow_code)
);

CREATE TABLE IF NOT EXISTS approval_nodes (
    id SERIAL,
    node_code VARCHAR(50) NOT NULL,
    node_name VARCHAR(100) NOT NULL,
    approver_type VARCHAR(50) NOT NULL,
    approver_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (node_code)
);

CREATE TABLE IF NOT EXISTS approval_roles (
    id SERIAL,
    role_code VARCHAR(50) NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (role_code)
);

CREATE TABLE IF NOT EXISTS areas (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    parent_id INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    parent_area_id INTEGER,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attendance_daily_summary (
    id SERIAL,
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
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    is_finalized BOOLEAN DEFAULT false,
    ot_minutes INTEGER DEFAULT 0,
    early_minutes INTEGER DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE (employee_code, date)
);

CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    radius_meters INTEGER DEFAULT 100,
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL,
    employee_code VARCHAR(50) NOT NULL,
    punch_time TIMESTAMP NOT NULL,
    punch_type VARCHAR(10),
    verify_type INTEGER,
    device_serial VARCHAR(100),
    work_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT now(),
    punch_state VARCHAR(10) DEFAULT 'check_in',
    verification_mode INTEGER,
    sync_status VARCHAR(20),
    raw_data TEXT,
    source INTEGER,
    is_attendance INTEGER,
    upload_time TIMESTAMP,
    punch_source VARCHAR(50) DEFAULT 'biometric',
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    is_geofence_verified BOOLEAN DEFAULT false,
    geofence_id INTEGER,
    -- Production enforces this and the schema did not declare it, so a fresh
    -- install had no constraint while the live database rejected the insert.
    -- Mobile punching failed on the deployment and would have looked perfectly
    -- healthy in CI — the same drift that has produced most of this week's
    -- surprises, in the other direction.
    --
    -- ON DELETE SET NULL, not CASCADE: retiring a reader must never delete the
    -- attendance recorded through it. Those punches are payroll evidence with a
    -- multi-year retention obligation, and the device is only how they arrived.
    FOREIGN KEY (device_serial) REFERENCES devices(serial_number) ON DELETE SET NULL,
    FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attendance_regularizations (
    id SERIAL,
    employee_code VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    requested_in_time TIME WITHOUT TIME ZONE,
    requested_out_time TIME WITHOUT TIME ZONE,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attendance_rules (
    id SERIAL,
    rule_type VARCHAR(20) DEFAULT 'global' NOT NULL,
    department_id INTEGER,
    name VARCHAR(100) NOT NULL,
    late_threshold_minutes INTEGER DEFAULT 15,
    early_leave_threshold_minutes INTEGER DEFAULT 15,
    half_day_threshold_minutes INTEGER DEFAULT 240,
    absent_threshold_minutes INTEGER DEFAULT 480,
    overtime_enabled BOOLEAN DEFAULT false,
    overtime_threshold_minutes INTEGER DEFAULT 30,
    overtime_multiplier DECIMAL(3,2) DEFAULT 1.5,
    grace_period_minutes INTEGER DEFAULT 5,
    grace_late_allowed_per_month INTEGER DEFAULT 3,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    alternate_saturday BOOLEAN DEFAULT false,
    round_off_minutes INTEGER DEFAULT 15,
    minimum_punch_gap_minutes INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL,
    table_name VARCHAR(100),
    record_id INTEGER,
    action VARCHAR(20),
    old_data JSONB,
    new_data JSONB,
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- The shape services/adms.js:323 actually writes. The previous definition had
-- six of its eleven columns and no unique index, so the ON CONFLICT target did
-- not resolve and every fingerprint and face uploaded by a reader was rejected
-- outright. Enrolments made on one reader therefore never reached the others.
--
-- source_device/device_serial and index_no/template_index are two names for the
-- same two ideas. Both are kept: existing databases hold values in either.
-- Scheduled reports and their delivery history.
--
-- Neither table appeared in ANY of the nine schema files. They exist only in
-- scripts/fix_production_schema.js, a repair script nobody runs on a new
-- install, so a fresh database has neither and the scheduler logs
-- 'relation "scheduled_reports" does not exist' once a minute forever.
--
-- format and created_by are here because services/scheduled-reports.js:96
-- writes them and the repair script's definition omits both — so even where the
-- table had been created, saving a scheduled report failed.
CREATE TABLE IF NOT EXISTS scheduled_reports (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    schedule_type VARCHAR(20) NOT NULL,
    schedule_time TIME,
    schedule_day INTEGER,
    recipients TEXT[],
    filters JSONB,
    format VARCHAR(20) DEFAULT 'pdf',
    is_active BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_history (
    id SERIAL PRIMARY KEY,
    scheduled_report_id INTEGER,
    report_type VARCHAR(50),
    recipients TEXT,
    status VARCHAR(20),
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS biometric_templates (
    id SERIAL,
    employee_code VARCHAR(50) NOT NULL,
    template_type INTEGER NOT NULL,
    template_no INTEGER DEFAULT 0,
    template_index INTEGER DEFAULT 0,
    template_data TEXT,
    valid INTEGER DEFAULT 1,
    duress INTEGER DEFAULT 0,
    source_device VARCHAR(100),
    device_serial VARCHAR(100),
    major_ver VARCHAR(20),
    minor_ver VARCHAR(20),
    format VARCHAR(20),
    index_no INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

-- The conflict target the device upload names.
CREATE UNIQUE INDEX IF NOT EXISTS biometric_templates_emp_type_no_key
    ON biometric_templates (employee_code, template_type, template_no);

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL,
    company_id INTEGER,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'Branch',
    address TEXT,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS timetables (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20),
    check_in TIME WITHOUT TIME ZONE NOT NULL,
    check_out TIME WITHOUT TIME ZONE NOT NULL,
    late_in TIME WITHOUT TIME ZONE,
    early_out TIME WITHOUT TIME ZONE,
    overtime_start TIME WITHOUT TIME ZONE,
    min_hours_for_full_day DECIMAL(4,2) DEFAULT 8,
    min_hours_for_half_day DECIMAL(4,2) DEFAULT 4,
    is_overnight BOOLEAN DEFAULT false,
    is_flexible BOOLEAN DEFAULT false,
    grace_period_minutes INTEGER DEFAULT 15,
    color VARCHAR(10) DEFAULT '#3B82F6',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS break_times (
    id SERIAL,
    timetable_id INTEGER,
    name VARCHAR(100) NOT NULL,
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    is_paid BOOLEAN DEFAULT true,
    is_deductible BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(140),
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    grace_in_minutes INTEGER DEFAULT 15,
    grace_out_minutes INTEGER DEFAULT 15,
    min_hours DECIMAL(4,2) DEFAULT 8,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(10) DEFAULT '#3B82F6',
    created_at TIMESTAMP DEFAULT now(),
    shift_type VARCHAR(20) DEFAULT 'Fixed',
    late_threshold_minutes INTEGER DEFAULT 15,
    early_exit_threshold_minutes INTEGER DEFAULT 15,
    half_day_threshold_hours DECIMAL(3,1) DEFAULT 4.0,
    break_duration_minutes INTEGER DEFAULT 0,
    is_night_shift BOOLEAN DEFAULT false,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS department_schedules (
    id SERIAL,
    department_id INTEGER,
    shift_id INTEGER,
    timetable_id INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
    FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE SET NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL,
    serial_number VARCHAR(100) NOT NULL,
    device_name VARCHAR(100),
    device_model VARCHAR(100),
    ip_address VARCHAR(45),
    port INTEGER DEFAULT 4370,
    area_id INTEGER,
    device_type VARCHAR(20) DEFAULT 'IN',
    communication_type VARCHAR(20) DEFAULT 'push',
    status VARCHAR(20) DEFAULT 'offline',
    firmware_version VARCHAR(50),
    last_activity TIMESTAMP,
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    retired_at TIMESTAMP,
    vendor VARCHAR(30) DEFAULT 'ZKTeco',
    approval_status VARCHAR(20) DEFAULT 'approved',
    first_seen_at TIMESTAMP,
    ingest_token VARCHAR(64),
    transfer_mode VARCHAR(50) DEFAULT 'realtime',
    timezone VARCHAR(50) DEFAULT 'Etc/GMT+5:30',
    is_registration_device BOOLEAN DEFAULT true,
    is_attendance_device BOOLEAN DEFAULT true,
    connection_interval INTEGER DEFAULT 10,
    device_direction VARCHAR(20) DEFAULT 'both',
    enable_access_control BOOLEAN DEFAULT false,
    FOREIGN KEY (area_id) REFERENCES areas(id),
    PRIMARY KEY (id),
    UNIQUE (serial_number)
);

CREATE TABLE IF NOT EXISTS device_capabilities (
    id SERIAL,
    device_serial VARCHAR(100),
    device_model VARCHAR(100),
    firmware_version VARCHAR(50),
    face_supported BOOLEAN DEFAULT false,
    face_major_ver VARCHAR(20),
    face_minor_ver VARCHAR(20),
    finger_supported BOOLEAN DEFAULT true,
    palm_supported BOOLEAN DEFAULT false,
    card_supported BOOLEAN DEFAULT true,
    max_users INTEGER,
    max_fingers INTEGER,
    max_faces INTEGER,
    detected_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (device_serial) REFERENCES devices(serial_number) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS device_commands (
    id SERIAL,
    device_serial VARCHAR(100) NOT NULL,
    command TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    sequence INTEGER DEFAULT 1,
    response TEXT,
    created_at TIMESTAMP DEFAULT now(),
    executed_at TIMESTAMP,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    last_error TEXT,
    priority INTEGER DEFAULT 5,
    command_type VARCHAR(50),
    sent_at TIMESTAMP,
    completed_at TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS device_messages (
    id SERIAL,
    device_serial VARCHAR(100) NOT NULL,
    message TEXT,
    message_type VARCHAR(20) DEFAULT 'info',
    direction VARCHAR(10) DEFAULT 'in',
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS holiday_locations (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    code VARCHAR(140),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL,
    employee_code VARCHAR(50) NOT NULL,
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
    app_access BOOLEAN DEFAULT false,
    app_login_enabled BOOLEAN DEFAULT false,
    photo TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    position_id INTEGER,
    holiday_location_id INTEGER,
    device_privilege VARCHAR(20) DEFAULT 'Employee',
    has_fingerprint BOOLEAN DEFAULT false,
    has_face BOOLEAN DEFAULT false,
    has_palm BOOLEAN DEFAULT false,
    aadhaar_no VARCHAR(20),
    nick_name VARCHAR(50),
    passport_no VARCHAR(20),
    motorcycle_license VARCHAR(30),
    contact_no VARCHAR(20),
    office_tel VARCHAR(20),
    automobile_license VARCHAR(30),
    religion VARCHAR(30),
    city VARCHAR(50),
    permanent_address TEXT,
    pincode VARCHAR(10),
    birthday DATE,
    nationality VARCHAR(50),
    date_of_joining DATE,
    outdoor_mng BOOLEAN DEFAULT false,
    photo_url TEXT,
    attendance_required BOOLEAN DEFAULT true,
    overtime_allowed BOOLEAN DEFAULT false,
    default_shift_id INTEGER,
    week_off_days VARCHAR(20) DEFAULT 'Sun,Sat',
    geo_fencing BOOLEAN DEFAULT false,
    selfie_punch BOOLEAN DEFAULT false,
    whatsapp_enabled BOOLEAN DEFAULT false,
    whatsapp_number VARCHAR(20),
    sms_enabled BOOLEAN DEFAULT false,
    sms_number VARCHAR(20),
    branch_id INTEGER,
    shift_group_id INTEGER,
    join_date DATE,
    portal_password_hash TEXT,
    exclude_from_hrms BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    assigned_geofence_id INTEGER,
    FOREIGN KEY (area_id) REFERENCES areas(id),
    FOREIGN KEY (assigned_geofence_id) REFERENCES geofences(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (holiday_location_id) REFERENCES holiday_locations(id) ON DELETE SET NULL,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
    PRIMARY KEY (id),
    UNIQUE (employee_code)
);

CREATE TABLE IF NOT EXISTS employee_approval_roles (
    id SERIAL,
    employee_id INTEGER,
    role_id INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES approval_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (id),
    UNIQUE (employee_id, role_id)
);

CREATE TABLE IF NOT EXISTS employee_docs (
    id SERIAL,
    employee_code VARCHAR(50),
    doc_name VARCHAR(100) NOT NULL,
    file_path TEXT,
    uploaded_at TIMESTAMP DEFAULT now(),
    file_type VARCHAR(100),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS employee_schedules (
    id SERIAL,
    employee_id INTEGER,
    shift_id INTEGER,
    timetable_id INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_temporary BOOLEAN DEFAULT false,
    reason TEXT,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
    FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE SET NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS employee_shift_roster (
    id SERIAL,
    employee_code VARCHAR(50),
    shift_id INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code),
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    PRIMARY KEY (id),
    UNIQUE (employee_code, effective_from)
);

CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL,
    employee_code VARCHAR(50),
    shift_id INTEGER,
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code),
    FOREIGN KEY (shift_id) REFERENCES shifts(id),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS weekly_off_rules (
    id SERIAL,
    name VARCHAR(50) NOT NULL,
    pattern VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS employee_weekly_off (
    id SERIAL,
    employee_code VARCHAR(50),
    weekly_off_rule_id INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code),
    FOREIGN KEY (weekly_off_rule_id) REFERENCES weekly_off_rules(id),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS flow_nodes (
    id SERIAL,
    flow_id INTEGER,
    node_id INTEGER,
    node_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (flow_id) REFERENCES approval_flows(id) ON DELETE CASCADE,
    FOREIGN KEY (node_id) REFERENCES approval_nodes(id) ON DELETE CASCADE,
    PRIMARY KEY (id),
    UNIQUE (flow_id, node_order)
);

CREATE TABLE IF NOT EXISTS groups (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL,
    name VARCHAR(140) NOT NULL,
    date DATE NOT NULL,
    type VARCHAR(20) DEFAULT 'public',
    is_optional BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    holiday_location_id INTEGER,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS holiday_location_mapping (
    id SERIAL,
    holiday_id INTEGER,
    location_id INTEGER,
    FOREIGN KEY (holiday_id) REFERENCES holidays(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES holiday_locations(id) ON DELETE CASCADE,
    PRIMARY KEY (id),
    UNIQUE (holiday_id, location_id)
);

CREATE TABLE IF NOT EXISTS integration_sync_logs (
    id SERIAL,
    integration_id INTEGER NOT NULL,
    sync_type VARCHAR(50),
    direction VARCHAR(20),
    status VARCHAR(20),
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT now(),
    completed_at TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS leave_types (
    id SERIAL,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(140),
    is_paid BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    annual_quota INTEGER DEFAULT 0,
    carry_forward BOOLEAN DEFAULT false,
    max_carry_forward INTEGER DEFAULT 0,
    encashable BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT true,
    color VARCHAR(10) DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT true,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS leave_applications (
    id SERIAL,
    employee_code VARCHAR(50),
    leave_type_id INTEGER,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    is_half_day BOOLEAN DEFAULT false,
    half_day_type VARCHAR(10),
    total_days DECIMAL(5,1) NOT NULL,
    reason TEXT NOT NULL,
    contact_during_leave VARCHAR(20),
    handover_to VARCHAR(50),
    attachment_path VARCHAR(255),
    status VARCHAR(140) DEFAULT 'Pending',
    approved_by INTEGER,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    external_id VARCHAR(140),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code),
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id SERIAL,
    employee_code VARCHAR(50),
    leave_type_id INTEGER,
    year INTEGER NOT NULL,
    opening_balance DECIMAL(5,1) DEFAULT 0,
    accrued DECIMAL(5,1) DEFAULT 0,
    used DECIMAL(5,1) DEFAULT 0,
    balance DECIMAL(5,1) DEFAULT 0,
    carry_forward_balance DECIMAL(5,1) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_code) REFERENCES employees(employee_code),
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id),
    PRIMARY KEY (id),
    UNIQUE (employee_code, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS leaves (
    id SERIAL,
    employee_code VARCHAR(50) NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(4,1),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by INTEGER,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS resignations (
    id SERIAL,
    employee_id INTEGER,
    resignation_date DATE NOT NULL,
    resignation_type VARCHAR(50) NOT NULL,
    report_end_date DATE,
    attendance_option VARCHAR(50),
    reason TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL,
    category VARCHAR(50) NOT NULL,
    key VARCHAR(100) NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (category, key)
);

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL,
    user_id INTEGER,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS workflow_flows (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT true,
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS workflow_roles (
    id SERIAL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
    id SERIAL,
    flow_id INTEGER,
    role_id INTEGER,
    step_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    FOREIGN KEY (flow_id) REFERENCES workflow_flows(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES workflow_roles(id),
    PRIMARY KEY (id)
);

-- Self-referencing foreign keys, added after the table exists. ADD CONSTRAINT
-- has no IF NOT EXISTS, and this file is loaded more than once.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_parent_id_fkey') THEN
        ALTER TABLE departments ADD CONSTRAINT departments_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES departments(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_parent_area_id_fkey') THEN
        ALTER TABLE areas ADD CONSTRAINT areas_parent_area_id_fkey
            FOREIGN KEY (parent_area_id) REFERENCES areas(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'areas_parent_id_fkey') THEN
        ALTER TABLE areas ADD CONSTRAINT areas_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES areas(id);
    END IF;
END $$;

-- indexes
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON public.app_settings USING btree (category);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_date ON public.attendance_daily_summary USING btree (date);
CREATE INDEX IF NOT EXISTS idx_attendance_summary_emp ON public.attendance_daily_summary USING btree (employee_code);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_emp_time_key ON public.attendance_logs USING btree (employee_code, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_device ON public.attendance_logs USING btree (device_serial);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON public.attendance_logs USING btree (employee_code);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON public.attendance_logs USING btree (punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_rules_dept ON public.attendance_rules USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_break_times_timetable ON public.break_times USING btree (timetable_id);
CREATE INDEX IF NOT EXISTS idx_dept_schedules_dept ON public.department_schedules USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_device_commands_status ON public.device_commands USING btree (status);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON public.devices USING btree (serial_number);
CREATE INDEX IF NOT EXISTS idx_emp_schedules_dates ON public.employee_schedules USING btree (effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_emp_schedules_emp ON public.employee_schedules USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_code ON public.employees USING btree (employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON public.employees USING btree (department_id);
CREATE UNIQUE INDEX IF NOT EXISTS holiday_locations_code_key ON public.holiday_locations USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS holidays_location_date_key ON public.holidays USING btree (COALESCE(holiday_location_id, 0), date);
CREATE UNIQUE INDEX IF NOT EXISTS leave_applications_external_id_key ON public.leave_applications USING btree (external_id);
CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_emp_type_year_key ON public.leave_balances USING btree (employee_code, leave_type_id, year);
CREATE INDEX IF NOT EXISTS idx_leaves_emp ON public.leaves USING btree (employee_code);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON public.system_logs USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_timetables_code ON public.timetables USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq ON public.users USING btree (lower((username)));

-- views
CREATE OR REPLACE VIEW approval_roles_with_counts AS
 SELECT ar.id,
    ar.role_code,
    ar.role_name,
    ar.description,
    ar.created_at,
    ar.updated_at,
    ( SELECT count(*) AS count
           FROM employee_approval_roles ear
          WHERE ear.role_id = ar.id) AS employee_count
   FROM approval_roles ar;

CREATE OR REPLACE VIEW holiday_locations_with_counts AS
 SELECT hl.id,
    hl.name,
    hl.description,
    hl.created_at,
    ( SELECT count(*) AS count
           FROM employees e
          WHERE e.holiday_location_id = hl.id AND e.status <> 'resigned') AS employee_count,
    ( SELECT count(*) AS count
           FROM employees e
          WHERE e.holiday_location_id = hl.id AND e.status = 'resigned') AS resigned_count
   FROM holiday_locations hl;

CREATE OR REPLACE VIEW positions_with_counts AS
 SELECT p.id,
    p.name,
    p.code,
    p.department_id,
    p.description,
    p.created_at,
    ( SELECT count(*) AS count
           FROM employees e
          WHERE e.position_id = p.id AND e.status <> 'resigned') AS employee_count
   FROM positions p;

-- =====================================================
-- Seed data
--
-- Every insert is guarded on absence rather than on ON CONFLICT DO NOTHING.
-- The old files relied on the latter against tables with no matching unique
-- constraint, where it is legal and does nothing — so loading them twice, which
-- the CI job does on purpose, inserted a second copy of every default
-- department, area and holiday location.
-- =====================================================

-- No administrator is seeded here, deliberately.
--
-- This file used to insert one with a hash annotated "password: admin". That
-- annotation was false — the hash matches no password anyone has — so a fresh
-- install started, served a login page, and refused every credential.
--
-- The account is now created on first boot by ensureFirstAdmin() in server.js,
-- which runs only when the users table is empty and either takes ADMIN_PASSWORD
-- or generates a random password and prints it once. A fixed default credential
-- on a system holding biometric identifiers is not worth the convenience.

INSERT INTO departments (name, code)
SELECT v.name, v.code FROM (VALUES
    ('Head Office', 'HO'), ('Human Resources', 'HR'), ('Information Technology', 'IT'),
    ('Finance', 'FIN'), ('Operations', 'OPS')
) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = v.name);

INSERT INTO areas (name, code)
SELECT v.name, v.code FROM (VALUES
    ('Main Building', 'MAIN'), ('Warehouse', 'WH'), ('Branch Office', 'BR')
) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM areas a WHERE a.name = v.name);

INSERT INTO shifts (name, code, start_time, end_time, grace_in_minutes)
SELECT v.name, v.code, v.start_time::time, v.end_time::time, v.grace FROM (VALUES
    ('General Shift', 'GEN', '09:00', '18:00', 15),
    ('Morning Shift', 'MOR', '06:00', '14:00', 10),
    ('Night Shift',   'NIG', '22:00', '06:00', 15)
) AS v(name, code, start_time, end_time, grace)
WHERE NOT EXISTS (SELECT 1 FROM shifts s WHERE s.code = v.code);

INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, description)
SELECT v.name, v.code, v.check_in::time, v.check_out::time, v.late_in::time, v.early_out::time, v.description
FROM (VALUES
    ('General Shift',   'GEN', '09:00', '18:00', '09:15', '17:45', 'Standard 9 AM to 6 PM shift'),
    ('Morning Shift',   'MOR', '06:00', '14:00', '06:15', '13:45', 'Early morning shift'),
    ('Afternoon Shift', 'AFT', '14:00', '22:00', '14:15', '21:45', 'Afternoon to night shift'),
    ('Night Shift',     'NIG', '22:00', '06:00', '22:15', '05:45', 'Overnight night shift'),
    ('Flexible Hours',  'FLX', '08:00', '20:00', '10:00', '18:00', 'Flexible timing with core hours')
) AS v(name, code, check_in, check_out, late_in, early_out, description)
WHERE NOT EXISTS (SELECT 1 FROM timetables t WHERE t.code = v.code);

INSERT INTO break_times (timetable_id, name, start_time, end_time, is_paid)
SELECT t.id, v.name, v.start_time::time, v.end_time::time, TRUE
FROM timetables t
CROSS JOIN (VALUES ('Lunch Break', '13:00', '14:00'), ('Tea Break', '16:00', '16:15')) AS v(name, start_time, end_time)
WHERE t.code = 'GEN'
  AND NOT EXISTS (SELECT 1 FROM break_times b WHERE b.timetable_id = t.id AND b.name = v.name);

INSERT INTO attendance_rules (rule_type, name, late_threshold_minutes, grace_period_minutes, week_off_days)
SELECT 'global', 'Default Attendance Policy', 15, 5, ARRAY['saturday', 'sunday']
WHERE NOT EXISTS (SELECT 1 FROM attendance_rules WHERE rule_type = 'global' AND department_id IS NULL);

INSERT INTO holiday_locations (name, description)
SELECT v.name, v.description FROM (VALUES
    ('Head Office',   'Main headquarters location'),
    ('Branch Office', 'Regional branch offices'),
    ('Factory',       'Manufacturing units')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM holiday_locations hl WHERE hl.name = v.name);

INSERT INTO settings (category, key, value, description)
SELECT v.category, v.key, v.value, v.description FROM (VALUES
    ('company',    'name',         'VayuTime',     'Company Name'),
    ('company',    'timezone',     'Asia/Kolkata', 'Default Timezone'),
    ('attendance', 'auto_process', 'true',         'Auto process attendance daily'),
    ('attendance', 'process_time', '23:30',        'Time to process attendance')
) AS v(category, key, value, description)
ON CONFLICT (category, key) DO NOTHING;
-- ============================================
-- SEED DEFAULT SETTINGS
-- ============================================

-- Company Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('company', 'company_name', 'My Company', 'string', 'Company name displayed in reports and headers'),
('company', 'company_address', '', 'string', 'Company address'),
('company', 'company_city', '', 'string', 'City'),
('company', 'company_state', '', 'string', 'State/Province'),
('company', 'company_country', 'India', 'string', 'Country'),
('company', 'company_pincode', '', 'string', 'Postal/ZIP code'),
('company', 'company_phone', '', 'string', 'Contact phone number'),
('company', 'company_email', '', 'string', 'Contact email'),
('company', 'company_website', '', 'string', 'Company website URL'),
('company', 'company_logo', '', 'string', 'Logo URL or base64')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Attendance Rules
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('attendance', 'grace_period_minutes', '15', 'number', 'Grace period for late arrival (minutes)'),
('attendance', 'late_threshold_minutes', '30', 'number', 'Late mark threshold (minutes)'),
('attendance', 'half_day_threshold_hours', '4', 'number', 'Minimum hours for half-day attendance'),
('attendance', 'full_day_threshold_hours', '8', 'number', 'Minimum hours for full-day attendance'),
('attendance', 'overtime_threshold_hours', '9', 'number', 'Hours after which overtime counts'),
('attendance', 'overtime_multiplier', '1.5', 'number', 'Overtime pay multiplier'),
('attendance', 'auto_checkout_enabled', 'false', 'boolean', 'Enable automatic checkout at shift end'),
('attendance', 'auto_checkout_time', '23:59', 'string', 'Default auto-checkout time'),
('attendance', 'min_break_duration_minutes', '30', 'number', 'Minimum lunch break duration'),
('attendance', 'consecutive_punches_gap_minutes', '5', 'number', 'Minimum gap between consecutive punches')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Weekend Rules
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('weekend', 'week_off_days', '["Sunday"]', 'json', 'Default weekly off days'),
('weekend', 'alternate_saturday', 'false', 'boolean', 'Enable alternate Saturday off'),
('weekend', 'alternate_saturday_pattern', 'odd', 'string', 'Alternate Saturday pattern: odd/even'),
('weekend', 'holiday_carry_forward', 'false', 'boolean', 'Carry forward holidays to next working day')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Notification Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('notifications', 'email_enabled', 'false', 'boolean', 'Enable email notifications'),
('notifications', 'smtp_host', '', 'string', 'SMTP server host'),
('notifications', 'smtp_port', '587', 'number', 'SMTP server port'),
('notifications', 'smtp_user', '', 'string', 'SMTP username'),
('notifications', 'smtp_password', '', 'string', 'SMTP password (encrypted)'),
('notifications', 'smtp_from_email', '', 'string', 'From email address'),
('notifications', 'smtp_from_name', 'AMS Pro', 'string', 'From name for emails')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Security Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('security', 'session_timeout_minutes', '30', 'number', 'Session timeout in minutes'),
('security', 'max_login_attempts', '5', 'number', 'Maximum failed login attempts'),
('security', 'lockout_duration_minutes', '15', 'number', 'Account lockout duration'),
('security', 'password_min_length', '8', 'number', 'Minimum password length'),
('security', 'password_require_uppercase', 'true', 'boolean', 'Require uppercase in password'),
('security', 'password_require_number', 'true', 'boolean', 'Require number in password'),
('security', 'two_factor_enabled', 'false', 'boolean', 'Enable two-factor authentication')
ON CONFLICT (category, setting_key) DO NOTHING;

-- WhatsApp Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('whatsapp', 'whatsapp_enabled', 'false', 'boolean', 'Enable WhatsApp notifications'),
('whatsapp', 'whatsapp_api_url', '', 'string', 'WhatsApp API endpoint'),
('whatsapp', 'whatsapp_api_key', '', 'string', 'WhatsApp API key'),
('whatsapp', 'whatsapp_template_checkin', 'Hello {{name}}, your check-in at {{time}} has been recorded.', 'string', 'Check-in message template'),
('whatsapp', 'whatsapp_template_checkout', 'Hello {{name}}, your check-out at {{time}} has been recorded. Total hours: {{hours}}', 'string', 'Check-out message template')
ON CONFLICT (category, setting_key) DO NOTHING;

-- SMS Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('sms', 'sms_enabled', 'false', 'boolean', 'Enable SMS notifications'),
('sms', 'sms_provider', '', 'string', 'SMS provider name'),
('sms', 'sms_api_url', '', 'string', 'SMS API endpoint'),
('sms', 'sms_api_key', '', 'string', 'SMS API key'),
('sms', 'sms_sender_id', '', 'string', 'SMS sender ID')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Auto Reports Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('reports', 'daily_report_enabled', 'false', 'boolean', 'Enable daily attendance report'),
('reports', 'daily_report_time', '09:00', 'string', 'Time to send daily report'),
('reports', 'daily_report_recipients', '[]', 'json', 'Email recipients for daily report'),
('reports', 'weekly_report_enabled', 'false', 'boolean', 'Enable weekly attendance report'),
('reports', 'weekly_report_day', 'Monday', 'string', 'Day to send weekly report'),
('reports', 'monthly_report_enabled', 'false', 'boolean', 'Enable monthly attendance report'),
('reports', 'monthly_report_day', '1', 'number', 'Day of month to send report')
ON CONFLICT (category, setting_key) DO NOTHING;

-- PDF/Export Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('pdf', 'report_header_text', 'Attendance Report', 'string', 'Default report header'),
('pdf', 'report_footer_text', 'Generated by AMS Pro', 'string', 'Default report footer'),
('pdf', 'include_logo', 'true', 'boolean', 'Include company logo in reports'),
('pdf', 'page_size', 'A4', 'string', 'Default page size: A4, Letter, Legal'),
('pdf', 'page_orientation', 'portrait', 'string', 'Default orientation: portrait, landscape')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Create index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
