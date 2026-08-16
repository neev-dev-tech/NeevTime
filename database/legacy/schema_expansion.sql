-- Smart Biometric Attendance Schema Expansion

-- 1. Organization Structure
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE,
    timezone VARCHAR(50) DEFAULT 'UTC',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'Branch', -- Branch, Location, Site
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Leave Management
CREATE TABLE IF NOT EXISTS leave_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- Annual, Sick, Casual, etc.
    code VARCHAR(10) UNIQUE, 
    is_paid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaves (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    leave_type_id INTEGER REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by VARCHAR(50), -- User ID or Name
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Attendance Processing (The Result Table)
CREATE TABLE IF NOT EXISTS attendance_daily_summary (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    date DATE NOT NULL,
    
    -- Shift Info (Snapshot at time of processing)
    shift_id INTEGER REFERENCES shifts(id),
    shift_name VARCHAR(50),
    shift_start TIME,
    shift_end TIME,

    -- Punches
    in_time TIMESTAMP,
    out_time TIMESTAMP,
    
    -- Calculations
    duration_minutes INTEGER DEFAULT 0, -- Total logged time
    late_minutes INTEGER DEFAULT 0,
    early_minutes INTEGER DEFAULT 0,
    ot_minutes INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20), -- Present, Absent, Half Day, Weekly Off, Holiday, Leave, Miss Punch
    is_finalized BOOLEAN DEFAULT FALSE, -- Locked for payroll?

    last_calculated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, date)
);

-- 4. Employee Expansion (Alter Table)
-- Note: Running these as separate safe alters
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_group_id INTEGER; -- Placeholder for Shift Group table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS join_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(50) DEFAULT 'Permanent'; -- Permanent, Contract, Intern
ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active'; -- Active, Resigned, Terminated
