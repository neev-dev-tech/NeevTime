-- The tables shift-aware scoring reads, on databases that predate them.
--
-- database/000_schema.sql defines both, and Postgres loads that file only into
-- an empty data directory — the same lesson as 003's audit_logs. The pilot's
-- database has never seen a schema file. The engine tolerates their absence
-- (global rules apply, as before), so this migration is what turns the shift
-- module on for such installs rather than what keeps them running.

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(140) UNIQUE,
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
    is_night_shift BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS employee_shifts (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) REFERENCES employees(employee_code),
    shift_id INTEGER REFERENCES shifts(id),
    effective_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_lookup
    ON employee_shifts (employee_code, effective_date DESC);

-- Assigning somebody a different shift changes how their lateness and hours
-- are scored — a payroll-relevant decision, audited like the settings that do
-- the same globally.
DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_employee_shifts ON employee_shifts;
        CREATE TRIGGER audit_employee_shifts
            AFTER INSERT OR UPDATE OR DELETE ON employee_shifts
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;
