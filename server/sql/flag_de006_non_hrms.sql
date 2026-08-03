-- DE006 was missed when the facility/security accounts were flagged.
--
-- Confirmed 2026-08-03: the 1010–1016 block and DE001–DE006 are all facility
-- and security staff. They need biometric door access but are not on the ERPNext
-- payroll, so they must be excluded from the HRMS push. Every one of them is
-- already flagged except DE006, which has 28 punches and would otherwise be
-- pushed to ERPNext and fail there as an unknown employee.
--
-- Nothing is deleted. One boolean changes.

BEGIN;

UPDATE employees
SET exclude_from_hrms = TRUE
WHERE employee_code = 'DE006'
  AND exclude_from_hrms IS DISTINCT FROM TRUE;
-- Expect 1 row.

-- Confirm the full non-HRMS set is now what you described: 1, 1010–1016,
-- DE001–DE006, plus the two OMN test accounts if you ran the other script.
SELECT employee_code, name, status, exclude_from_hrms
FROM employees
WHERE exclude_from_hrms IS TRUE
ORDER BY employee_code;

COMMIT;
-- ROLLBACK; -- if the list above is not what you expect
