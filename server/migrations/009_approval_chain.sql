-- Who approves whom.
--
-- Every leave request and every regularization currently lands on HR, whoever
-- the person reports to. That works at 82 people and stops working at 300, and
-- it is wrong even now: the person who knows whether somebody was really at the
-- client site on Tuesday is their manager, not HR.
--
-- Companies differ, so both are supported and the order is configurable:
--
--   manager      the employee's own reporting manager
--   department   whoever is named approver for their department
--   hr           any admin or HR user, as today
--
-- The chain is tried in order and the first level that yields somebody wins.
-- 'manager,department,hr' suits a company with real reporting lines;
-- 'department,hr' suits one where approval follows the org chart rather than
-- individuals — which is most factories. HR stays at the end of every chain on
-- purpose: a request that reaches nobody is a request that sits forever, and
-- somebody has to be able to act on it.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER;

DO $fk$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_reporting_manager_fkey') THEN
        -- No ON DELETE CASCADE: removing a manager must never remove their
        -- reports. ON DELETE SET NULL would be silent, so the route refuses
        -- instead and says who is affected.
        ALTER TABLE employees
            ADD CONSTRAINT employees_reporting_manager_fkey
            FOREIGN KEY (reporting_manager_id) REFERENCES employees (id);
    END IF;
END;
$fk$;

CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees (reporting_manager_id);

-- More than one approver per department is normal — two shift supervisors, or a
-- deputy for when somebody is on leave. A department with none falls through to
-- the next level in the chain rather than trapping the request.
CREATE TABLE IF NOT EXISTS department_approvers (
    id             SERIAL PRIMARY KEY,
    department_id  INTEGER NOT NULL REFERENCES departments (id) ON DELETE CASCADE,
    employee_id    INTEGER NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    created_at     TIMESTAMP DEFAULT now(),
    UNIQUE (department_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_department_approvers_employee
    ON department_approvers (employee_id);

-- Recorded on the request itself, not inferred later.
--
-- Approval chains change. If a request is only ever stamped with a user id, a
-- dispute six months on cannot answer "were they even allowed to approve it" —
-- the chain by then is a different chain. So the level that authorised it is
-- written down at the time.
ALTER TABLE leaves
    ADD COLUMN IF NOT EXISTS approved_via VARCHAR(20),
    ADD COLUMN IF NOT EXISTS approver_employee_code VARCHAR(50);

ALTER TABLE attendance_regularizations
    ADD COLUMN IF NOT EXISTS approved_via VARCHAR(20),
    ADD COLUMN IF NOT EXISTS approver_employee_code VARCHAR(50);

DO $attach$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_department_approvers ON department_approvers;
        CREATE TRIGGER audit_department_approvers
            AFTER INSERT OR UPDATE OR DELETE ON department_approvers
            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
    END IF;
END;
$attach$;

INSERT INTO app_settings (category, setting_key, setting_value, data_type, description)
VALUES ('approvals', 'approval_chain', 'manager,department,hr', 'string',
        'Order in which approvers are found: manager, department, hr — comma separated. '
        || 'The first level that yields somebody wins. hr should stay last so a request '
        || 'always reaches someone.')
ON CONFLICT DO NOTHING;
