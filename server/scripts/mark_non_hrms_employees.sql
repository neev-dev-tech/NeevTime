-- SUPERSEDED, 2026-08-03. Twelve of these fourteen codes are already flagged in
-- production, so running this now is mostly a no-op — but it is also incomplete
-- and slightly wrong, and should not be treated as the current list:
--
--   * DE006 is missing. It is facility staff like the rest of the DE block.
--     Use server/sql/flag_de006_non_hrms.sql.
--   * OMN004 and OMN006 are here, but they turned out to be test accounts
--     rather than contractors. Use server/sql/remove_test_users_from_devices.sql,
--     which also removes them from the readers — flagging alone leaves them able
--     to punch.
--
-- Kept for the reasoning below, which still explains why the flag exists.
--
-- Mark the biometric-only accounts so their attendance is never pushed to ERPNext.
--
-- These are facility and security contractors. They hold door access but are not
-- employees in the HR system, so every push of their punches is rejected. Before
-- this flag existed the rejected records stayed 'pending' and were retried on
-- every 30-minute cycle for as long as they sat inside the 7-day sync window.
--
-- Nothing is deleted. Attendance for these people is still recorded and still
-- appears in NeevTime's own reports — it is only excluded from the HRMS push.
--
-- Review the list before running. It was derived from the 14 codes that have
-- punches but have never synced to ERPNext; confirm each one really is a
-- contractor and not a staff member who was set up incorrectly.

BEGIN;

UPDATE employees
SET exclude_from_hrms = true
WHERE employee_code IN (
    '1',        -- 219 punches. IN USE DAILY — see the retirement section below
    '1010',     -- 5,435 punches, marked resigned
    '1011',     -- 5,193 punches, 341 in the last week
    '1012',     -- 3,300 punches, 179 in the last week
    '1013',     -- 1,197 punches
    '1014',     -- 1,795 punches
    '1015',     -- 461 punches
    '1016',     -- Rudre Gowda, 82 punches
    'DE001', 'DE002', 'DE004', 'DE005',
    'OMN004',   -- named "test", dormant since 2026-07-23
    'OMN006'    -- mukesh
);

-- ── Retiring an account ────────────────────────────────────────────────────
--
-- These are NOT deleted. attendance_logs has a foreign key to employees with
-- NO ACTION, so Postgres refuses to remove an employee that has punches — the
-- history would have to be destroyed first, and attendance is the one thing
-- here that cannot be reconstructed from anywhere else.
--
-- Marking the account resigned takes it out of the active lists and reports
-- while leaving every punch attributable.
--
-- OMN004 ("test") is dormant — last punch 2026-07-23, nothing since.
UPDATE employees SET status = 'resigned' WHERE employee_code = 'OMN004';

-- Code '1' is deliberately NOT retired here.
--
-- It punched at 16:47 and 16:53 today, and 21:18 the night before, in clean
-- IN/OUT pairs across both readers. Somebody is working with it. Retiring the
-- record does not by itself revoke door access — enrolment lives on the reader —
-- but it does hide a working person from attendance reports.
--
-- Find out who is using it first. If the access really should end, delete the
-- user from the biometric devices, then uncomment:
-- UPDATE employees SET status = 'resigned' WHERE employee_code = '1';

-- Settle their existing backlog so it is not reconsidered on future cycles.
UPDATE attendance_logs al
SET sync_status = 'skipped'
FROM employees e
WHERE e.employee_code = al.employee_code
  AND e.exclude_from_hrms = true
  AND (al.sync_status IS NULL OR al.sync_status = 'pending');

-- Check before committing: every row below should be a contractor.
SELECT employee_code, name, status, exclude_from_hrms
FROM employees
WHERE exclude_from_hrms = true
ORDER BY employee_code;

COMMIT;
