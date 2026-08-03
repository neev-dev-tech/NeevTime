-- Remove the OMN test users from the readers, keeping every record.
--
-- Decision (2026-08-03): OMN004 and OMN006 are test accounts and should no
-- longer be able to punch, but their attendance history stays in the database.
-- Nothing here deletes a row. The only DELETE is against device_commands, and
-- it only touches commands that already failed and can never succeed.
--
-- Background: OMN006 punched on 2026-08-03 at 12:51 from reader NYU7254000077.
-- It is still enrolled. The four `DATA DELETE USER PIN=OMN006` commands sent on
-- 2026-07-31 were rejected by every reader with Return=-1004, because USER is
-- not a keyword the ADMS protocol defines — the entity is USERINFO. That bug is
-- fixed in the application; this script re-sends the removal with the correct
-- syntax for the two accounts already affected.
--
-- Run inside a transaction and read the counts before committing.

BEGIN;

-- ── 1. Queue the removal on every live reader ────────────────────────────────
-- Templates first: deleting the user record on a device does not reliably take
-- enrolled biometrics with it, and a stranded template can still be matched.
INSERT INTO device_commands (device_serial, command, status)
SELECT d.serial_number, c.cmd, 'pending'
FROM devices d
CROSS JOIN (VALUES
    ('DATA DELETE FINGERTMP PIN=OMN004'),
    ('DATA DELETE FACE PIN=OMN004'),
    ('DATA DELETE USERINFO PIN=OMN004'),
    ('DATA DELETE FINGERTMP PIN=OMN006'),
    ('DATA DELETE FACE PIN=OMN006'),
    ('DATA DELETE USERINFO PIN=OMN006')
) AS c(cmd)
WHERE d.serial_number IS NOT NULL
  AND d.serial_number <> ''
  AND d.retired_at IS NULL;
-- Expect 24 rows: 6 commands x 4 readers.

-- ── 2. Keep them out of the ERPNext push ─────────────────────────────────────
-- Their history stays queryable here, but test accounts have no business
-- reaching payroll.
UPDATE employees
SET exclude_from_hrms = TRUE
WHERE employee_code IN ('OMN004', 'OMN006');
-- Expect 2 rows.

-- ── 2b. OPTIONAL: the two staff this bug already let through ─────────────────
-- INT110 and INT115 were deleted from the app on 2025-12-30. Their removal
-- commands were rejected the same way, and their employee records are gone, so
-- there is no longer anything in the database that can tell you whether they are
-- still enrolled on the readers. Neither has punched since, which is reassuring
-- but not proof — an enrolled finger that nobody uses looks identical to one
-- that was removed.
--
-- Sending a delete for a PIN a reader does not hold is harmless; it simply has
-- nothing to remove. Uncomment if you want the certainty.
--
-- INSERT INTO device_commands (device_serial, command, status)
-- SELECT d.serial_number, c.cmd, 'pending'
-- FROM devices d
-- CROSS JOIN (VALUES
--     ('DATA DELETE FINGERTMP PIN=INT110'),
--     ('DATA DELETE FACE PIN=INT110'),
--     ('DATA DELETE USERINFO PIN=INT110'),
--     ('DATA DELETE FINGERTMP PIN=INT115'),
--     ('DATA DELETE FACE PIN=INT115'),
--     ('DATA DELETE USERINFO PIN=INT115')
-- ) AS c(cmd)
-- WHERE d.serial_number IS NOT NULL AND d.serial_number <> '' AND d.retired_at IS NULL;

-- ── 3. Clear the commands that can never succeed ─────────────────────────────
-- These are the malformed ones only: `DATA DELETE USER` (12 rows, 0 of which
-- ever succeeded) and `DATA QUERY USERVF` (44 rows, likewise). Both keywords are
-- gone from the application, so nothing will re-create them. Delivered and
-- pending commands are untouched.
DELETE FROM device_commands
WHERE status IN ('failed', 'dead_letter')
  AND (command LIKE 'DATA DELETE USER PIN=%' OR command LIKE 'DATA QUERY USERVF%');
-- Expect 56 rows. Afterwards the dead-letter queue should be empty.

-- ── 4. Read before committing ────────────────────────────────────────────────
SELECT status, count(*) FROM device_commands GROUP BY status ORDER BY 2 DESC;
SELECT employee_code, exclude_from_hrms FROM employees WHERE employee_code LIKE 'OMN%';

COMMIT;
-- ROLLBACK; -- use this instead if the counts above are not what you expect

-- ── 5. After the readers have polled (a minute or two) ───────────────────────
-- Confirm the removal was accepted this time. Every row should read 'success';
-- anything still 'pending' means that reader has not polled yet.
--
--   SELECT device_serial, command, status, last_error
--   FROM device_commands
--   WHERE command LIKE '%OMN00%' AND created_at > now() - interval '1 hour'
--   ORDER BY device_serial, command;
--
-- The real proof is behavioural: OMN006 should stop producing punches. Check
-- again tomorrow.
--
--   SELECT employee_code, max(punch_time) FROM attendance_logs
--   WHERE employee_code LIKE 'OMN%' GROUP BY 1;
