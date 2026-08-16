-- Timetable and Break Time Schema for EasyTime Pro Feature Parity
-- This adds work hour definitions and break time management

-- Timetables (Work Hour Definitions)
CREATE TABLE IF NOT EXISTS timetables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE,
    check_in TIME NOT NULL,
    check_out TIME NOT NULL,
    late_in TIME,                    -- After this time, considered late
    early_out TIME,                  -- Before this time, considered early leave
    overtime_start TIME,             -- Overtime begins after this time
    min_hours_for_full_day DECIMAL(4,2) DEFAULT 8.0,
    min_hours_for_half_day DECIMAL(4,2) DEFAULT 4.0,
    is_overnight BOOLEAN DEFAULT FALSE,  -- Shift crosses midnight
    is_flexible BOOLEAN DEFAULT FALSE,   -- Flexible timing
    grace_period_minutes INTEGER DEFAULT 15,
    color VARCHAR(7) DEFAULT '#3B82F6', -- For calendar display
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Break Times (Lunch, Tea breaks, etc.)
CREATE TABLE IF NOT EXISTS break_times (
    id SERIAL PRIMARY KEY,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 60
    ) STORED,
    is_paid BOOLEAN DEFAULT TRUE,
    is_deductible BOOLEAN DEFAULT FALSE,  -- Deduct from work hours if not taken
    created_at TIMESTAMP DEFAULT NOW()
);

-- Department Schedules (Assign shifts to departments)
CREATE TABLE IF NOT EXISTS department_schedules (
    id SERIAL PRIMARY KEY,
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE SET NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Employee Schedules (Individual employee shift assignments)
CREATE TABLE IF NOT EXISTS employee_schedules (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE SET NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_temporary BOOLEAN DEFAULT FALSE,  -- One-off override
    reason TEXT,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Attendance Rules (Global and Department-specific)
CREATE TABLE IF NOT EXISTS attendance_rules (
    id SERIAL PRIMARY KEY,
    rule_type VARCHAR(20) NOT NULL DEFAULT 'global',  -- 'global' or 'department'
    department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    
    -- Time thresholds
    late_threshold_minutes INTEGER DEFAULT 15,
    early_leave_threshold_minutes INTEGER DEFAULT 15,
    half_day_threshold_minutes INTEGER DEFAULT 240,  -- 4 hours
    absent_threshold_minutes INTEGER DEFAULT 480,    -- 8 hours late = absent
    
    -- Overtime rules
    overtime_enabled BOOLEAN DEFAULT FALSE,
    overtime_threshold_minutes INTEGER DEFAULT 30,    -- Min OT to count
    overtime_multiplier DECIMAL(3,2) DEFAULT 1.5,
    
    -- Grace period
    grace_period_minutes INTEGER DEFAULT 5,
    grace_late_allowed_per_month INTEGER DEFAULT 3,
    
    -- Week off configuration
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    alternate_saturday BOOLEAN DEFAULT FALSE,
    
    -- Calculation rules
    round_off_minutes INTEGER DEFAULT 15,  -- Round to nearest 15 min
    minimum_punch_gap_minutes INTEGER DEFAULT 30,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(rule_type, department_id)
);

-- Holiday Locations (Region-specific holidays)
CREATE TABLE IF NOT EXISTS holiday_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Link holidays to locations
CREATE TABLE IF NOT EXISTS holiday_location_mapping (
    id SERIAL PRIMARY KEY,
    holiday_id INTEGER REFERENCES holidays(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES holiday_locations(id) ON DELETE CASCADE,
    UNIQUE(holiday_id, location_id)
);

-- System Audit Logs
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_timetables_code ON timetables(code);
CREATE INDEX IF NOT EXISTS idx_break_times_timetable ON break_times(timetable_id);
CREATE INDEX IF NOT EXISTS idx_dept_schedules_dept ON department_schedules(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_schedules_emp ON employee_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_schedules_dates ON employee_schedules(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_attendance_rules_dept ON attendance_rules(department_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- Seed default timetables
INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, description) VALUES
('General Shift', 'GEN', '09:00', '18:00', '09:15', '17:45', 'Standard 9 AM to 6 PM shift'),
('Morning Shift', 'MOR', '06:00', '14:00', '06:15', '13:45', 'Early morning shift'),
('Afternoon Shift', 'AFT', '14:00', '22:00', '14:15', '21:45', 'Afternoon to night shift'),
('Night Shift', 'NIG', '22:00', '06:00', '22:15', '05:45', 'Overnight night shift'),
('Flexible Hours', 'FLX', '08:00', '20:00', '10:00', '18:00', 'Flexible timing with core hours')
ON CONFLICT (code) DO NOTHING;

-- Seed break times for General Shift
INSERT INTO break_times (timetable_id, name, start_time, end_time, is_paid) 
SELECT id, 'Lunch Break', '13:00', '14:00', TRUE FROM timetables WHERE code = 'GEN'
ON CONFLICT DO NOTHING;

INSERT INTO break_times (timetable_id, name, start_time, end_time, is_paid) 
SELECT id, 'Tea Break', '16:00', '16:15', TRUE FROM timetables WHERE code = 'GEN'
ON CONFLICT DO NOTHING;

-- Seed global attendance rule
INSERT INTO attendance_rules (rule_type, name, late_threshold_minutes, grace_period_minutes, week_off_days) VALUES
('global', 'Default Attendance Policy', 15, 5, ARRAY['saturday', 'sunday'])
ON CONFLICT DO NOTHING;

-- Seed holiday locations
INSERT INTO holiday_locations (name, description) VALUES
('Head Office', 'Main headquarters location'),
('Branch Office', 'Regional branch offices'),
('Factory', 'Manufacturing units')
ON CONFLICT DO NOTHING;
