-- Database Schema for Attendance Management System

-- Areas
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(50),
    parent_area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Devices Table: Tracks physical biometric devices
CREATE TABLE IF NOT EXISTS devices (
    serial_number VARCHAR(50) PRIMARY KEY,
    device_name VARCHAR(100),
    ip_address VARCHAR(45),
    port INTEGER DEFAULT 4370,
    status VARCHAR(20) DEFAULT 'offline', -- 'online', 'offline'
    last_activity TIMESTAMP DEFAULT NOW(),
    area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    transfer_mode VARCHAR(50) DEFAULT 'realtime',
    timezone VARCHAR(50) DEFAULT 'Etc/GMT+5:30',
    is_registration_device BOOLEAN DEFAULT TRUE,
    is_attendance_device BOOLEAN DEFAULT TRUE,
    connection_interval INTEGER DEFAULT 10,
    device_direction VARCHAR(20) DEFAULT 'both', -- 'in', 'out', 'both'
    enable_access_control BOOLEAN DEFAULT FALSE,
    firmware_version VARCHAR(50),
    user_count INTEGER DEFAULT 0,
    fingerprint_count INTEGER DEFAULT 0,
    face_count INTEGER DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL, -- The ID used on the device
    name VARCHAR(100) NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    designation VARCHAR(100),
    card_number VARCHAR(50),
    password VARCHAR(50),
    privilege INTEGER DEFAULT 0, -- 0: User, 1: Admin
    profile_photo TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Attendance Logs Table: Raw punches from devices
CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    device_serial VARCHAR(50) REFERENCES devices(serial_number),
    punch_time TIMESTAMP NOT NULL,
    punch_state VARCHAR(10) DEFAULT 'check_in', -- '0': CheckIn, '1': CheckOut, etc. (mapped from device)
    verification_mode INTEGER, -- 1: Finger, 4: Face, 15: Face+Pwd etc.
    work_code INTEGER,
    reserved VARCHAR(50),
    sync_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, punch_time)
);

-- Employee Command Queue: For syncing users to devices
CREATE TABLE IF NOT EXISTS device_commands (
    id SERIAL PRIMARY KEY,
    device_serial VARCHAR(50) REFERENCES devices(serial_number),
    command TEXT NOT NULL, -- e.g., 'DATA UPDATE USERINFO ...'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'success', 'fail'
    created_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP
);

-- Initial Data
INSERT INTO departments (name) VALUES ('Engineering'), ('HR'), ('Sales'), ('Operations') ON CONFLICT DO NOTHING;

-- Mock Devices (optional, for testing if needed, though usually auto-registered)
-- INSERT INTO devices (serial_number, device_name, status) VALUES ('SN001', 'Main Entrance', 'offline');

-- ================= PHASE 2: EASY TIME PRO CLONE =================

-- Users Table (for Web Login)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin', -- 'admin', 'hr', 'user'
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Organization: Positions / Designations
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance: Shifts (Time Table)
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration INTEGER DEFAULT 60, -- minutes
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attendance: Rules
CREATE TABLE IF NOT EXISTS attendance_rules (
    id SERIAL PRIMARY KEY,
    setting_name VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255),
    description TEXT
);

-- Employee Shift Mapping
CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    shift_id INTEGER REFERENCES shifts(id),
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed Default Admin (password: admin123)
-- ================= PHASE 2.1: PERSONNEL EXPANSION =================



-- Holiday Locations
CREATE TABLE IF NOT EXISTS holiday_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Employee Documents
CREATE TABLE IF NOT EXISTS employee_docs (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code) ON DELETE CASCADE,
    doc_name VARCHAR(100) NOT NULL,
    file_path TEXT, -- In real app, this would be a URL or path
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Approval Workflow: Roles
CREATE TABLE IF NOT EXISTS workflow_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Approval Workflow: Flows
CREATE TABLE IF NOT EXISTS workflow_flows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

-- Approval Workflow: Nodes (Steps in a flow)
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id SERIAL PRIMARY KEY,
    flow_id INTEGER REFERENCES workflow_flows(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES workflow_roles(id),
    step_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
