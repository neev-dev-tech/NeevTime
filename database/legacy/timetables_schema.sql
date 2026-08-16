-- Timetables table for advanced time management
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Break times for timetables
CREATE TABLE IF NOT EXISTS break_times (
    id SERIAL PRIMARY KEY,
    timetable_id INTEGER REFERENCES timetables(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_paid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample timetables
INSERT INTO timetables (name, code, check_in, check_out, late_in, early_out, grace_period_minutes, color, description) 
VALUES 
    ('General Shift', 'GEN', '09:00', '18:00', '09:15', '17:45', 15, '#3B82F6', 'Standard 9-6 shift'),
    ('Morning Shift', 'MORN', '06:00', '14:00', '06:15', '13:45', 10, '#10B981', 'Early morning shift'),
    ('Night Shift', 'NGHT', '22:00', '06:00', '22:15', '05:45', 15, '#6366F1', 'Overnight shift')
ON CONFLICT (code) DO NOTHING;
