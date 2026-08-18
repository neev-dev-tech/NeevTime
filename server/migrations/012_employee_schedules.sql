-- The assignment table scoring actually reads, for databases that predate it.
--
-- Two parallel assignment tables exist in this schema: employee_shifts, which
-- no screen writes, and employee_schedules, which the Schedule pages write.
-- The engine reads the latter; this creates it on older installs, where its
-- absence is tolerated (global rules apply) but nothing could be assigned.

CREATE TABLE IF NOT EXISTS employee_schedules (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
    timetable_id INTEGER,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_temporary BOOLEAN DEFAULT false,
    reason TEXT,
    week_off_days TEXT[] DEFAULT ARRAY['saturday', 'sunday'],
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_schedules_lookup
    ON employee_schedules (employee_id, effective_from DESC);

-- Assigning a shift changes how lateness and hours are scored — pay-relevant,
-- audited like the global settings that do the same.
DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_employee_schedules ON employee_schedules;
        CREATE TRIGGER audit_employee_schedules
            AFTER INSERT OR UPDATE OR DELETE ON employee_schedules
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;
