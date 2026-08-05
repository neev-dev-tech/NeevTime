-- Point alerting at it@innopay.in.
--
-- Only needed if the alerting commit has already been deployed once. The seed
-- in ensureSchema uses ON CONFLICT DO NOTHING, so it sets these on the first
-- boot after deploy and never touches them again — deliberately, so a later
-- change made in Settings is not reverted by the next restart.
--
-- Safe to run either way: it updates the two rows if they exist and inserts
-- them if they do not.
--
--   docker exec -i attendance_db psql -U postgres -d attendance_db \
--     < server/sql/set_alert_recipients.sql

BEGIN;

INSERT INTO app_settings (category, setting_key, setting_value, data_type, description)
VALUES
    ('alerts', 'recipients', 'it@innopay.in', 'string',
     'Comma-separated addresses. Alerts are dropped if this is empty.'),
    ('alerts', 'enabled', 'true', 'boolean',
     'Send email when something needs attention. Nothing is sent while recipients is empty.')
ON CONFLICT (category, setting_key)
DO UPDATE SET setting_value = EXCLUDED.setting_value;

-- Read before committing. `enabled` on with an empty `recipients` is the one
-- combination to avoid: it looks switched on and sends nothing.
SELECT setting_key, setting_value
FROM app_settings
WHERE category = 'alerts'
ORDER BY setting_key;

COMMIT;
-- ROLLBACK;  -- if the values above are not what you expect

-- ── Check it actually works ──────────────────────────────────────────────────
-- Alerting is email-only, so it inherits whatever state SMTP is in. Send a test
-- from Settings → Email/SMTP first; if that does not arrive, no alert will
-- either.
--
-- Anything that could not be delivered is recorded rather than lost:
--
--   SELECT alert_key, subject, opened_at, notified_at, last_error
--   FROM alert_state ORDER BY opened_at DESC LIMIT 20;
--
-- notified_at set with last_error null means the mail went out. last_error
-- populated means alerting itself is broken — that count is also shown in the
-- notification bell, so it will not sit unnoticed.
