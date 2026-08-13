-- Why does the absence count look too high?
--
-- Run this against production and read it top to bottom. The absent report
-- counts a person absent on a working day when no punch of theirs exists for
-- that day. With a company of sixty to seventy people that should be a small
-- number; several hundred a month means "expected" is being computed wrongly
-- for a group of people, not that everyone is off.
--
-- Each section names the cause it is testing and what to do about it.
--
--   psql -U postgres -d attendance_db -f diagnose_absent_inflation.sql
--
-- Read-only. Nothing here modifies data.

\echo '=== 1. Headcount the report considers "expected" ==='
-- If this is much larger than the number of people who actually carry a card,
-- the extra rows are the inflation. `attendance_required = false` removes
-- someone from the calculation entirely.
SELECT
    count(*) AS active_employees,
    count(*) FILTER (WHERE attendance_required IS FALSE) AS exempt_already,
    count(*) FILTER (WHERE COALESCE(joining_date, date_of_joining, join_date) IS NULL) AS no_joining_date
FROM employees
WHERE status = 'active';

\echo ''
\echo '=== 2. Staff who have NEVER punched (last 90 days) ==='
-- The most common cause by far. Someone enrolled in the system but not using a
-- reader — management, field staff, a duplicate record — is counted absent
-- every working day, roughly 22 a month each. Ten such people is 220 a month
-- on their own.
--
-- Fix: UPDATE employees SET attendance_required = false WHERE employee_code IN (...)
-- for the ones who genuinely are not expected to punch. Delete or mark
-- 'resigned' the ones that are stale records.
SELECT e.employee_code, e.name, d.name AS department,
       COALESCE(e.joining_date, e.date_of_joining, e.join_date) AS joined
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
WHERE e.status = 'active'
  AND e.attendance_required IS NOT FALSE
  AND NOT EXISTS (
      SELECT 1 FROM attendance_logs al
      WHERE al.employee_code = e.employee_code
        AND al.punch_time >= CURRENT_DATE - INTERVAL '90 days'
  )
ORDER BY d.name, e.name;

\echo ''
\echo '=== 3. Punches whose employee_code matches no employee ==='
-- If a reader reports a code that is not on the employees table, that person's
-- attendance is invisible: they punch every day and are still counted absent
-- every day. This is the same mismatch behind names showing as "Unknown".
SELECT al.employee_code, count(*) AS punches,
       min(al.punch_time)::date AS first_seen,
       max(al.punch_time)::date AS last_seen
FROM attendance_logs al
LEFT JOIN employees e ON e.employee_code = al.employee_code
WHERE e.employee_code IS NULL
  AND al.punch_time >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY al.employee_code
ORDER BY punches DESC;

\echo ''
\echo '=== 4. Working days in the last 90 with no punches at all ==='
-- Days the system was not collecting: before deployment, or the readers were
-- down. These are now skipped by the report rather than counted as everybody
-- being absent. A long run here explains a large historical figure.
SELECT ds.d AS date_with_no_punches, to_char(ds.d, 'Dy') AS weekday
FROM generate_series(CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE, INTERVAL '1 day') ds(d)
WHERE EXTRACT(DOW FROM ds.d) NOT IN (0, 6)
  AND NOT EXISTS (
      SELECT 1 FROM attendance_logs al WHERE DATE(al.punch_time) = ds.d::date
  )
ORDER BY ds.d;

\echo ''
\echo '=== 5. Holidays on record ==='
-- An empty result means every public holiday is being counted as a
-- company-wide absence. Populate Attendance > Holiday to fix it.
SELECT date, name, type FROM holidays
WHERE date >= CURRENT_DATE - INTERVAL '180 days'
ORDER BY date;

\echo ''
\echo '=== 6. Absences per employee, last 30 days ==='
-- The shape of this list is the diagnosis. A handful of people at ~22 means
-- non-punching staff (see section 2). Everyone at 3-4 is a genuine, healthy
-- distribution.
WITH ds AS (
    SELECT generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, INTERVAL '1 day')::date d
)
SELECT e.employee_code, e.name, count(*) AS absent_days
FROM employees e
CROSS JOIN ds
WHERE e.status = 'active'
  AND e.attendance_required IS NOT FALSE
  AND EXTRACT(DOW FROM ds.d) NOT IN (0, 6)
  AND (COALESCE(e.joining_date, e.date_of_joining, e.join_date) IS NULL
       OR ds.d >= COALESCE(e.joining_date, e.date_of_joining, e.join_date))
  AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.date = ds.d)
  AND EXISTS (SELECT 1 FROM attendance_logs al2 WHERE DATE(al2.punch_time) = ds.d)
  AND NOT EXISTS (
      SELECT 1 FROM attendance_logs al
      WHERE al.employee_code = e.employee_code AND DATE(al.punch_time) = ds.d
  )
GROUP BY e.employee_code, e.name
ORDER BY absent_days DESC, e.name;
