-- Phase 3: Shift & Schedule Management Schema

-- Enhanced Shifts Table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) DEFAULT 'Fixed'; -- Fixed, Rotational, Night, Split, General
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS grace_in_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS grace_out_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS late_threshold_minutes INTEGER DEFAULT 15;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS early_exit_threshold_minutes INTEGER DEFAULT 15;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS half_day_threshold_hours DECIMAL(3,1) DEFAULT 4.0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS break_duration_minutes INTEGER DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_night_shift BOOLEAN DEFAULT FALSE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Roster / Employee Shift Assignment
CREATE TABLE IF NOT EXISTS employee_shift_roster (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    shift_id INTEGER REFERENCES shifts(id),
    effective_from DATE NOT NULL,
    effective_to DATE, -- NULL means ongoing
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, effective_from) -- Only one shift assignment per date
);

-- Weekly Off Rules
CREATE TABLE IF NOT EXISTS weekly_off_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- "Sunday Off", "Alt Saturday", "Fixed Sat-Sun"
    pattern VARCHAR(20), -- e.g., "0000001" (Sun off), "0100001" (Sat+Sun off)
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Employee Weekly Off Assignment
CREATE TABLE IF NOT EXISTS employee_weekly_off (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    weekly_off_rule_id INTEGER REFERENCES weekly_off_rules(id),
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Holidays Master
CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    location_id INTEGER, -- NULL for all locations
    is_optional BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(date, location_id)
);
