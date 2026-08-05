-- Close the config-change alerts left permanently open.
--
-- These report an event, not a condition — "someone changed a setting" has
-- nothing to recover from — but the first version left them open, so they would
-- have sat in the open-issues list and every daily digest indefinitely, one row
-- per save. Seven accumulated within an hour of the feature going live.
--
-- The code now closes them as they are sent. This tidies the ones raised
-- before that fix.
--
-- Only config_change rows are touched. Real conditions — dead-letter commands,
-- sync backlogs, offline devices — stay open, because they are still true.
--
--   docker exec -i attendance_db psql -U postgres -d attendance_db \
--     < server/sql/close_config_change_alerts.sql

BEGIN;

UPDATE alert_state
SET resolved_at = COALESCE(notified_at, opened_at)
WHERE alert_key LIKE 'config_change:%'
  AND resolved_at IS NULL;
-- Resolved at the time they were sent rather than now, so the history reads
-- honestly: these were momentary events, not issues that ran for hours.

-- What remains open should be genuine, currently-true conditions.
SELECT alert_key, severity, subject, opened_at, notified_at
FROM alert_state
WHERE resolved_at IS NULL
ORDER BY opened_at;

COMMIT;
-- ROLLBACK;  -- if the remaining list is not what you expect
