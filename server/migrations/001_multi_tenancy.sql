-- Multi-tenancy: one database, one row-level boundary the database enforces.
--
-- The alternative was adding `WHERE company_id = $n` to 614 query sites across
-- 84 files. Every one of those is a chance to leak one customer's staff into
-- another customer's screen, and the failure is silent. Postgres enforces this
-- instead, so a query that forgets simply returns nothing.
--
-- On-premise is not a different build. It is this, with exactly one company.
--
-- Three details carry the design:
--
--   DEFAULT current_setting('app.tenant_id')::int  — existing INSERT statements
--   do not name company_id and do not need to. The value comes from the
--   connection, so 614 call sites stay as they are.
--
--   current_setting('app.tenant_id', true) — the `true` means "missing is not an
--   error". An unset tenant yields NULL, NULL never equals company_id, and the
--   query returns no rows. Forgetting to set the tenant shows you an empty
--   screen; it never shows you someone else's data.
--
--   FORCE ROW LEVEL SECURITY — without it the table owner bypasses its own
--   policies, which for this application means the policies would do nothing at
--   all. Note that a SUPERUSER still bypasses RLS regardless: the application
--   must connect as a non-superuser role or none of this is real.

-- The tenant in scope, or a legible error.
--
-- The first version compared against current_setting(...)::int directly. With no
-- tenant set that casts '' to int and Postgres raises "invalid input syntax for
-- type integer" — correct, but it names neither the cause nor the fix.
--
-- Erroring is deliberate, and the alternative was considered and rejected.
-- Returning NULL would make a tenantless query yield zero rows, which is silent:
-- a scheduled sync would run, find no employees, and log a successful run that
-- did nothing. This codebase has shipped that exact shape of bug twice — a leave
-- sync and a shift sync that both reported success while fetching nothing. Work
-- that has forgotten its tenant should stop, loudly.
--
-- Anything running outside a request must therefore say which tenant it is for,
-- via db.asTenant(id, fn).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS integer AS $fn$
DECLARE
    raw text := current_setting('app.tenant_id', true);
BEGIN
    IF raw IS NULL OR raw = '' THEN
        RAISE EXCEPTION 'no tenant in scope for this query'
            USING HINT = 'Wrap the work in db.asTenant(companyId, fn), or set app.tenant_id on the connection.',
                  ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN raw::integer;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- The tenant every existing row belongs to.
INSERT INTO companies (id, name, code, timezone)
SELECT 1, 'Innopay', 'INNOPAY', 'Asia/Kolkata'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 1);

SELECT setval(pg_get_serial_sequence('companies', 'id'),
              GREATEST((SELECT MAX(id) FROM companies), 1));


-- alert_state
ALTER TABLE alert_state ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE alert_state SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE alert_state ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE alert_state ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_state_company ON alert_state (company_id);
ALTER TABLE alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON alert_state;
CREATE POLICY tenant_isolation ON alert_state
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- approval_flows
ALTER TABLE approval_flows ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE approval_flows SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE approval_flows ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE approval_flows ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_flows_company ON approval_flows (company_id);
ALTER TABLE approval_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_flows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON approval_flows;
CREATE POLICY tenant_isolation ON approval_flows
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- approval_nodes
ALTER TABLE approval_nodes ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE approval_nodes SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE approval_nodes ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE approval_nodes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_nodes_company ON approval_nodes (company_id);
ALTER TABLE approval_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_nodes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON approval_nodes;
CREATE POLICY tenant_isolation ON approval_nodes
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- approval_roles
ALTER TABLE approval_roles ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE approval_roles SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE approval_roles ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE approval_roles ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_roles_company ON approval_roles (company_id);
ALTER TABLE approval_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON approval_roles;
CREATE POLICY tenant_isolation ON approval_roles
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- areas
ALTER TABLE areas ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE areas SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE areas ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE areas ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_areas_company ON areas (company_id);
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON areas;
CREATE POLICY tenant_isolation ON areas
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- attendance_daily_summary
ALTER TABLE attendance_daily_summary ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE attendance_daily_summary SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE attendance_daily_summary ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE attendance_daily_summary ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_daily_summary_company ON attendance_daily_summary (company_id);
ALTER TABLE attendance_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_daily_summary FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance_daily_summary;
CREATE POLICY tenant_isolation ON attendance_daily_summary
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- attendance_logs
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE attendance_logs SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE attendance_logs ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE attendance_logs ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_logs_company ON attendance_logs (company_id);
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance_logs;
CREATE POLICY tenant_isolation ON attendance_logs
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- attendance_regularizations
ALTER TABLE attendance_regularizations ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE attendance_regularizations SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE attendance_regularizations ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE attendance_regularizations ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_regularizations_company ON attendance_regularizations (company_id);
ALTER TABLE attendance_regularizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_regularizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance_regularizations;
CREATE POLICY tenant_isolation ON attendance_regularizations
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- attendance_rules
ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE attendance_rules SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE attendance_rules ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE attendance_rules ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_rules_company ON attendance_rules (company_id);
ALTER TABLE attendance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON attendance_rules;
CREATE POLICY tenant_isolation ON attendance_rules
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE audit_logs SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE audit_logs ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE audit_logs ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs (company_id);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- biometric_templates
ALTER TABLE biometric_templates ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE biometric_templates SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE biometric_templates ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE biometric_templates ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_biometric_templates_company ON biometric_templates (company_id);
ALTER TABLE biometric_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON biometric_templates;
CREATE POLICY tenant_isolation ON biometric_templates
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE branches SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE branches ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE branches ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_company ON branches (company_id);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON branches;
CREATE POLICY tenant_isolation ON branches
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- break_times
ALTER TABLE break_times ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE break_times SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE break_times ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE break_times ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_break_times_company ON break_times (company_id);
ALTER TABLE break_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_times FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON break_times;
CREATE POLICY tenant_isolation ON break_times
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- departments
ALTER TABLE departments ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE departments SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE departments ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE departments ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_company ON departments (company_id);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON departments;
CREATE POLICY tenant_isolation ON departments
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- device_capabilities
ALTER TABLE device_capabilities ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE device_capabilities SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE device_capabilities ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE device_capabilities ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_capabilities_company ON device_capabilities (company_id);
ALTER TABLE device_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_capabilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON device_capabilities;
CREATE POLICY tenant_isolation ON device_capabilities
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- device_commands
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE device_commands SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE device_commands ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE device_commands ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_commands_company ON device_commands (company_id);
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON device_commands;
CREATE POLICY tenant_isolation ON device_commands
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- device_messages
ALTER TABLE device_messages ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE device_messages SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE device_messages ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE device_messages ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_messages_company ON device_messages (company_id);
ALTER TABLE device_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON device_messages;
CREATE POLICY tenant_isolation ON device_messages
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE devices SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE devices ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE devices ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_company ON devices (company_id);
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON devices;
CREATE POLICY tenant_isolation ON devices
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- employee_approval_roles
ALTER TABLE employee_approval_roles ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE employee_approval_roles SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE employee_approval_roles ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE employee_approval_roles ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_approval_roles_company ON employee_approval_roles (company_id);
ALTER TABLE employee_approval_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_approval_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employee_approval_roles;
CREATE POLICY tenant_isolation ON employee_approval_roles
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- employee_docs
ALTER TABLE employee_docs ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE employee_docs SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE employee_docs ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE employee_docs ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_docs_company ON employee_docs (company_id);
ALTER TABLE employee_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_docs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employee_docs;
CREATE POLICY tenant_isolation ON employee_docs
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- employee_shifts
ALTER TABLE employee_shifts ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE employee_shifts SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE employee_shifts ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE employee_shifts ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_shifts_company ON employee_shifts (company_id);
ALTER TABLE employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employee_shifts;
CREATE POLICY tenant_isolation ON employee_shifts
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE employees SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE employees ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE employees ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees (company_id);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON employees;
CREATE POLICY tenant_isolation ON employees
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- flow_nodes
ALTER TABLE flow_nodes ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE flow_nodes SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE flow_nodes ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE flow_nodes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flow_nodes_company ON flow_nodes (company_id);
ALTER TABLE flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_nodes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON flow_nodes;
CREATE POLICY tenant_isolation ON flow_nodes
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- geofences
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE geofences SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE geofences ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE geofences ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_geofences_company ON geofences (company_id);
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON geofences;
CREATE POLICY tenant_isolation ON geofences
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE groups SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE groups ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE groups ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_company ON groups (company_id);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON groups;
CREATE POLICY tenant_isolation ON groups
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- holiday_locations
ALTER TABLE holiday_locations ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE holiday_locations SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE holiday_locations ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE holiday_locations ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holiday_locations_company ON holiday_locations (company_id);
ALTER TABLE holiday_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON holiday_locations;
CREATE POLICY tenant_isolation ON holiday_locations
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- holidays
ALTER TABLE holidays ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE holidays SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE holidays ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE holidays ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holidays_company ON holidays (company_id);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON holidays;
CREATE POLICY tenant_isolation ON holidays
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- leave_types
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE leave_types SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE leave_types ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE leave_types ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leave_types_company ON leave_types (company_id);
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON leave_types;
CREATE POLICY tenant_isolation ON leave_types
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- leaves
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE leaves SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE leaves ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE leaves ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leaves_company ON leaves (company_id);
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON leaves;
CREATE POLICY tenant_isolation ON leaves
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE positions SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE positions ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE positions ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_positions_company ON positions (company_id);
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON positions;
CREATE POLICY tenant_isolation ON positions
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- resignations
ALTER TABLE resignations ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE resignations SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE resignations ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE resignations ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resignations_company ON resignations (company_id);
ALTER TABLE resignations ENABLE ROW LEVEL SECURITY;
ALTER TABLE resignations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON resignations;
CREATE POLICY tenant_isolation ON resignations
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE settings SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE settings ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE settings ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settings_company ON settings (company_id);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON settings;
CREATE POLICY tenant_isolation ON settings
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE shifts SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE shifts ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE shifts ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_company ON shifts (company_id);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON shifts;
CREATE POLICY tenant_isolation ON shifts
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- system_logs
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE system_logs SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE system_logs ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE system_logs ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_logs_company ON system_logs (company_id);
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON system_logs;
CREATE POLICY tenant_isolation ON system_logs
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- timetables
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE timetables SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE timetables ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE timetables ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_timetables_company ON timetables (company_id);
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON timetables;
CREATE POLICY tenant_isolation ON timetables
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE users SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE users ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE users ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_company ON users (company_id);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- workflow_flows
ALTER TABLE workflow_flows ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE workflow_flows SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE workflow_flows ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE workflow_flows ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_flows_company ON workflow_flows (company_id);
ALTER TABLE workflow_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_flows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflow_flows;
CREATE POLICY tenant_isolation ON workflow_flows
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- workflow_nodes
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE workflow_nodes SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE workflow_nodes ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE workflow_nodes ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_company ON workflow_nodes (company_id);
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_nodes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflow_nodes;
CREATE POLICY tenant_isolation ON workflow_nodes
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());

-- workflow_roles
ALTER TABLE workflow_roles ADD COLUMN IF NOT EXISTS company_id INTEGER;
UPDATE workflow_roles SET company_id = 1 WHERE company_id IS NULL;
ALTER TABLE workflow_roles ALTER COLUMN company_id SET DEFAULT app_current_tenant();
ALTER TABLE workflow_roles ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_roles_company ON workflow_roles (company_id);
ALTER TABLE workflow_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON workflow_roles;
CREATE POLICY tenant_isolation ON workflow_roles
    USING (company_id = app_current_tenant())
    WITH CHECK (company_id = app_current_tenant());
