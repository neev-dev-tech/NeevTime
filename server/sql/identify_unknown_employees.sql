-- Who are the "Unknown" employees?
--
-- Fifteen employee records carry the placeholder name "Unknown", nine of them
-- with thousands of punches. They appear that way on every report exported from
-- this system. Renaming them means working out who they are, which is the slow
-- part — so this pulls what the punch history already knows about each one:
-- which floor they use, which door, what hours they keep, whether they are still
-- coming in.
--
-- Read-only. Nothing here writes, and the UPDATE at the bottom is commented out.
--
--   docker exec -i attendance_db psql -U postgres -d attendance_db \
--     < server/sql/identify_unknown_employees.sql

\pset format aligned
\pset border 2

-- ── 1. Profile: where and when each unknown person appears ───────────────────
-- Usually enough on its own. "3rd Floor IN, arrives 09:12, still punching
-- today" is a question the 3rd-floor supervisor can answer in a sentence.
SELECT
    e.employee_code                                            AS code,
    e.status,
    COUNT(l.*)                                                 AS punches,
    MIN(l.punch_time)::date                                    AS first_seen,
    MAX(l.punch_time)::date                                    AS last_seen,
    CASE
        WHEN MAX(l.punch_time) > now() - interval '7 days'  THEN 'active this week'
        WHEN MAX(l.punch_time) > now() - interval '30 days' THEN 'active this month'
        WHEN MAX(l.punch_time) IS NULL                      THEN 'never punched'
        ELSE 'gone quiet'
    END                                                        AS recency,
    -- Typical arrival and departure, which distinguishes a shift worker from
    -- office staff more reliably than anything else here.
    to_char(MIN(l.punch_time::time), 'HH24:MI')                AS earliest_punch,
    -- AVG is not defined for `time`, so average the seconds-since-midnight and
    -- turn the result back into an interval, which to_char does accept.
    to_char((AVG(EXTRACT(EPOCH FROM l.punch_time::time)) * INTERVAL '1 second'), 'HH24:MI')
                                                               AS average_punch,
    to_char(MAX(l.punch_time::time), 'HH24:MI')                AS latest_punch,
    COUNT(DISTINCT l.punch_time::date)                         AS days_present,
    d.name                                                     AS department
FROM employees e
LEFT JOIN attendance_logs l ON l.employee_code = e.employee_code
LEFT JOIN departments d     ON d.id = e.department_id
WHERE e.name ILIKE 'unknown%'
GROUP BY e.employee_code, e.status, d.name
ORDER BY COUNT(l.*) DESC;

-- ── 2. Which readers each one uses ───────────────────────────────────────────
-- The strongest signal for locating someone: a person who only ever appears on
-- "3rd Floor IN" works on the 3rd floor. Ask there first.
SELECT
    l.employee_code    AS code,
    dev.device_name    AS reader,
    dev.device_direction AS direction,
    COUNT(*)           AS punches,
    MAX(l.punch_time)::date AS last_used
FROM attendance_logs l
JOIN employees e   ON e.employee_code = l.employee_code AND e.name ILIKE 'unknown%'
LEFT JOIN devices dev ON dev.serial_number = l.device_serial
GROUP BY l.employee_code, dev.device_name, dev.device_direction
ORDER BY l.employee_code, COUNT(*) DESC;

-- ── 3. Anything else on the record worth using ───────────────────────────────
-- A card number, mobile or joining date is often enough to match against an
-- HR list even when the name was never filled in.
SELECT
    employee_code AS code,
    card_number, mobile, email, designation,
    date_of_joining, employment_type, device_privilege
FROM employees
WHERE name ILIKE 'unknown%'
ORDER BY employee_code;

-- ── 4. Renaming, once you know ───────────────────────────────────────────────
-- Fill in and run only the rows you are sure about. Deliberately one code per
-- line rather than a bulk update: a wrong name on an attendance record is worse
-- than a missing one, because it looks correct.
--
-- UPDATE employees SET name = 'Real Name Here' WHERE employee_code = 'INT123';
--
-- Codes already accounted for, so you can ignore them here:
--   1, 1010-1016  facility team          (already excluded from the ERPNext push)
--   DE001-DE006   facility and security  (same)
--   OMN004/OMN006 test accounts          (see remove_test_users_from_devices.sql)
