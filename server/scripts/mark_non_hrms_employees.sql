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
    '1',        -- 219 punches, still active — looks like a device admin enrolment
    '1010',     -- 5,435 punches, marked resigned
    '1011',     -- 5,193 punches, 341 in the last week
    '1012',     -- 3,300 punches, 179 in the last week
    '1013',     -- 1,197 punches
    '1014',     -- 1,795 punches
    '1015',     -- 461 punches
    '1016',     -- Rudre Gowda, 82 punches
    'DE001', 'DE002', 'DE004', 'DE005',
    'OMN004',   -- named "test" — confirm this is a real person before keeping it
    'OMN006'    -- mukesh
);

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
