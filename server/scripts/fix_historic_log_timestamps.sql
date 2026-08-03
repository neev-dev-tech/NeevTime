-- Correct audit-log timestamps written before the container ran in IST.
--
-- Until 2026-07-31 the app process ran in UTC, so system_logs.created_at was
-- stored 5h30m behind the wall clock people actually saw. Entries written since
-- are correct. Reading the System Logs page today therefore shows old events at
-- the wrong time of day — a login at 09:15 appears as 03:45.
--
-- Nothing is deleted; the affected rows are shifted forward by the offset.
--
-- REVIEW THE FIRST QUERY BEFORE RUNNING THE UPDATE. The cutover timestamp below
-- is the deploy that set process.env.TZ. If your deploy happened at a different
-- moment, adjust it — shifting rows that were already correct would put them
-- 5h30m into the future, and there is no marker to tell the two apart
-- afterwards.

-- 1. Look first. How many rows are affected, and what is the boundary?
SELECT
    COUNT(*)                             AS rows_before_cutover,
    MIN(created_at)                      AS oldest,
    MAX(created_at)                      AS newest_affected
FROM system_logs
WHERE created_at < TIMESTAMP '2026-07-31 12:00:00';

-- 2. Sanity-check a sample. Do these times look 5h30m early for the action?
SELECT id, username, action, created_at,
       created_at + INTERVAL '5 hours 30 minutes' AS corrected
FROM system_logs
WHERE created_at < TIMESTAMP '2026-07-31 12:00:00'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Only when the above looks right.
BEGIN;

UPDATE system_logs
SET created_at = created_at + INTERVAL '5 hours 30 minutes'
WHERE created_at < TIMESTAMP '2026-07-31 12:00:00';

-- Confirm the range moved as expected, then COMMIT (or ROLLBACK to abandon).
SELECT COUNT(*) AS rows_updated, MIN(created_at), MAX(created_at)
FROM system_logs;

COMMIT;
