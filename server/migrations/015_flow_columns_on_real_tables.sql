-- Approval state on the tables requests actually live in.
--
-- Migration 009 added approved_via and approver_employee_code to `leaves` —
-- a table the portal and the admin screens do not use: both write
-- leave_applications. The approvals service read `leaves` too, so a real
-- portal application never appeared in anyone's Approvals tab; the feature's
-- own test passed because its fixture wrote the dead table directly. The same
-- columns land here on the live table, and the service moves with them.

ALTER TABLE leave_applications
    ADD COLUMN IF NOT EXISTS approved_via VARCHAR(30),
    ADD COLUMN IF NOT EXISTS approver_employee_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS flow_id INTEGER,
    ADD COLUMN IF NOT EXISTS current_step INTEGER;

-- A role is people. The Role page has carried names and descriptions with no
-- way to put anyone IN a role, which is half of why the builder routed
-- nothing.
CREATE TABLE IF NOT EXISTS approval_role_members (
    id           SERIAL PRIMARY KEY,
    role_id      INTEGER NOT NULL REFERENCES approval_roles(id) ON DELETE CASCADE,
    employee_id  INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE (role_id, employee_id)
);
