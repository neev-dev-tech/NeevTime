-- Leave Management Schema

-- Leave Types Master - Add missing columns if table exists
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='code') THEN
        ALTER TABLE leave_types ADD COLUMN code VARCHAR(10) UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='annual_quota') THEN
        ALTER TABLE leave_types ADD COLUMN annual_quota INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='carry_forward') THEN
        ALTER TABLE leave_types ADD COLUMN carry_forward BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='max_carry_forward') THEN
        ALTER TABLE leave_types ADD COLUMN max_carry_forward INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='encashable') THEN
        ALTER TABLE leave_types ADD COLUMN encashable BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='requires_approval') THEN
        ALTER TABLE leave_types ADD COLUMN requires_approval BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='color') THEN
        ALTER TABLE leave_types ADD COLUMN color VARCHAR(10) DEFAULT '#3b82f6';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leave_types' AND column_name='is_active') THEN
        ALTER TABLE leave_types ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Leave Balances (Per Employee Per Year)
CREATE TABLE IF NOT EXISTS leave_balances (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    leave_type_id INTEGER REFERENCES leave_types(id),
    year INTEGER NOT NULL,
    opening_balance DECIMAL(5,1) DEFAULT 0,
    accrued DECIMAL(5,1) DEFAULT 0,
    used DECIMAL(5,1) DEFAULT 0,
    balance DECIMAL(5,1) DEFAULT 0,
    carry_forward_balance DECIMAL(5,1) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_code, leave_type_id, year)
);

-- Leave Applications
CREATE TABLE IF NOT EXISTS leave_applications (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    leave_type_id INTEGER REFERENCES leave_types(id),
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    is_half_day BOOLEAN DEFAULT FALSE,
    half_day_type VARCHAR(10),
    total_days DECIMAL(5,1) NOT NULL,
    reason TEXT NOT NULL,
    contact_during_leave VARCHAR(20),
    handover_to VARCHAR(50),
    attachment_path VARCHAR(255),
    status VARCHAR(20) DEFAULT 'Pending',
    approved_by INTEGER,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Update existing leave types with codes
UPDATE leave_types SET code = 'CL' WHERE name = 'Casual Leave' AND code IS NULL;
UPDATE leave_types SET code = 'SL' WHERE name = 'Sick Leave' AND code IS NULL;
UPDATE leave_types SET code = 'AL' WHERE name = 'Annual Leave' AND code IS NULL;
