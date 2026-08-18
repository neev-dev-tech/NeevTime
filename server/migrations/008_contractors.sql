-- A contractor is a company you bill against, not a label on a person.
--
-- The pilot site runs staff of a co-located company alongside drivers, security
-- and housekeeping — three or four agencies, each invoicing monthly for hours
-- their people worked. Until now the only way to express that was
-- employment_type = 'Contract', which answers "is this person on contract" and
-- cannot answer "what do I owe agency X for August", which is the question
-- somebody is actually asking at month end.
--
-- Competitors sell this as multi-vendor management. It is one table, one
-- foreign key, and a report.

CREATE TABLE IF NOT EXISTS contractors (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    code            VARCHAR(50),
    contact_person  VARCHAR(150),
    phone           VARCHAR(30),
    email           VARCHAR(150),
    address         TEXT,
    -- India-specific and deliberately here rather than in a notes field: it
    -- goes on the invoice, and an agency without one is a different
    -- conversation with the finance team.
    gst_number      VARCHAR(20),
    -- Nullable. Many agencies bill a fixed monthly amount per head rather than
    -- hourly, and a rate invented to fill the column would end up in a report
    -- somebody trusts.
    hourly_rate     NUMERIC(10, 2),
    is_active       BOOLEAN DEFAULT true,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT now(),
    updated_at      TIMESTAMP DEFAULT now()
);

-- Two agencies with the same name is a data-entry mistake every time, and the
-- one that gets invoiced is then a coin toss. Case-insensitive, because
-- "Sharma Services" and "sharma services" are the same company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_name ON contractors (LOWER(name));

ALTER TABLE employees ADD COLUMN IF NOT EXISTS contractor_id INTEGER;

-- ON DELETE is deliberately absent: the route refuses to delete a contractor
-- that still has people, because the alternative is either orphaning their
-- attendance from the agency that owes for it, or deleting the people.
DO $fk$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_contractor_id_fkey'
    ) THEN
        ALTER TABLE employees
            ADD CONSTRAINT employees_contractor_id_fkey
            FOREIGN KEY (contractor_id) REFERENCES contractors (id);
    END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS idx_employees_contractor ON employees (contractor_id);

-- Audited: who a person is billed under decides who gets paid for their hours,
-- and moving somebody between agencies is exactly the change a dispute turns
-- on. Same reason app_settings is audited.
DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_contractors ON contractors;
        CREATE TRIGGER audit_contractors
            AFTER INSERT OR UPDATE OR DELETE ON contractors
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;
