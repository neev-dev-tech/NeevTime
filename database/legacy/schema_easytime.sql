-- EasyTime Pro Enhancement Schema
-- Phase 1: Core tables for Organization, Approval, and Extended Employee fields

-- ============================================
-- ORGANIZATION TABLES
-- ============================================

-- Position table with hierarchy
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  position_code VARCHAR(50) UNIQUE NOT NULL,
  position_name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES positions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Holiday Location table
CREATE TABLE IF NOT EXISTS holiday_locations (
  id SERIAL PRIMARY KEY,
  location_code VARCHAR(50) UNIQUE NOT NULL,
  location_name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES holiday_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- APPROVAL WORKFLOW TABLES
-- ============================================

-- Approval Roles
CREATE TABLE IF NOT EXISTS approval_roles (
  id SERIAL PRIMARY KEY,
  role_code VARCHAR(50) UNIQUE NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Employee-Role mapping
CREATE TABLE IF NOT EXISTS employee_approval_roles (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES approval_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(employee_id, role_id)
);

-- Approval Flows
CREATE TABLE IF NOT EXISTS approval_flows (
  id SERIAL PRIMARY KEY,
  flow_code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  request_type VARCHAR(50) NOT NULL, -- Leave, Overtime, Correction
  requester TEXT,
  position_id INTEGER REFERENCES positions(id) ON DELETE SET NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Approval Nodes
CREATE TABLE IF NOT EXISTS approval_nodes (
  id SERIAL PRIMARY KEY,
  node_code VARCHAR(50) UNIQUE NOT NULL,
  node_name VARCHAR(100) NOT NULL,
  approver_type VARCHAR(50) NOT NULL, -- Person, Role, Position
  approver_id INTEGER, -- References employee, role, or position based on type
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Flow-Node mapping (order matters)
CREATE TABLE IF NOT EXISTS flow_nodes (
  id SERIAL PRIMARY KEY,
  flow_id INTEGER REFERENCES approval_flows(id) ON DELETE CASCADE,
  node_id INTEGER REFERENCES approval_nodes(id) ON DELETE CASCADE,
  node_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(flow_id, node_order)
);

-- ============================================
-- EMPLOYEE EXTENDED FIELDS
-- ============================================

-- Add new columns to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_id INTEGER REFERENCES positions(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS holiday_location_id INTEGER REFERENCES holiday_locations(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS device_privilege VARCHAR(20) DEFAULT 'Employee';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_fingerprint BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_face BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_palm BOOLEAN DEFAULT FALSE;

-- Personal Information fields
ALTER TABLE employees ADD COLUMN IF NOT EXISTS aadhaar_no VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nick_name VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_no VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS motorcycle_license VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contact_no VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS office_tel VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS automobile_license VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS religion VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS permanent_address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_joining DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS outdoor_mng BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Attendance Settings
ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_required BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_allowed BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS default_shift_id INTEGER;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS week_off_days VARCHAR(20) DEFAULT 'Sun,Sat';

-- Mobile/Notification Settings
ALTER TABLE employees ADD COLUMN IF NOT EXISTS geo_fencing BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS selfie_punch BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sms_number VARCHAR(20);

-- ============================================
-- RESIGNATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS resignations (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  resignation_date DATE NOT NULL,
  resignation_type VARCHAR(50) NOT NULL, -- Quit, Dismissed, Resign, Transfer, Retain Job Without Salary
  report_end_date DATE,
  attendance_option VARCHAR(50),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- HELPER VIEWS
-- ============================================

-- Position with employee count
CREATE OR REPLACE VIEW positions_with_counts AS
SELECT 
  p.*,
  (SELECT COUNT(*) FROM employees e WHERE e.position_id = p.id AND e.status != 'resigned') as employee_count
FROM positions p;

-- Holiday Location with employee count
CREATE OR REPLACE VIEW holiday_locations_with_counts AS
SELECT 
  hl.*,
  (SELECT COUNT(*) FROM employees e WHERE e.holiday_location_id = hl.id AND e.status != 'resigned') as employee_count,
  (SELECT COUNT(*) FROM employees e WHERE e.holiday_location_id = hl.id AND e.status = 'resigned') as resigned_count
FROM holiday_locations hl;

-- Approval Role with employee count
CREATE OR REPLACE VIEW approval_roles_with_counts AS
SELECT 
  ar.*,
  (SELECT COUNT(*) FROM employee_approval_roles ear WHERE ear.role_id = ar.id) as employee_count
FROM approval_roles ar;
