-- The tables the leave accrual engine writes, on databases that predate them —
-- and the unique key its upsert needs. Same lesson as 003 and 010: schema
-- files load only into empty data directories, and the pilot's database has
-- never seen one.

CREATE TABLE IF NOT EXISTS leave_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(140) NOT NULL,
    code VARCHAR(140) UNIQUE,
    is_paid BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now(),
    annual_quota INTEGER DEFAULT 0,
    carry_forward BOOLEAN DEFAULT false,
    max_carry_forward INTEGER DEFAULT 0,
    encashable BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT true,
    color VARCHAR(10) DEFAULT '#3b82f6',
    is_active BOOLEAN DEFAULT true
);

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
    updated_at TIMESTAMP DEFAULT now()
);

-- What expired at year end, kept rather than vanishing. "Where did my twelve
-- days go" is a January question every year, and the answer should be a number
-- on the row, not a shrug.
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS lapsed DECIMAL(5,1) DEFAULT 0;

-- One row per person, type and year — what the accrual upsert keys on. Without
-- it a re-run inserts duplicates and every balance doubles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_balances_unique
    ON leave_balances (employee_code, leave_type_id, year);

-- Balances decide paid days off; hand edits to them are audited like the
-- settings that decide pay globally. The monthly accrual writes are machine
-- work with no actor, which the trail records as such.
DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_leave_balances ON leave_balances;
        CREATE TRIGGER audit_leave_balances
            AFTER INSERT OR UPDATE OR DELETE ON leave_balances
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;
