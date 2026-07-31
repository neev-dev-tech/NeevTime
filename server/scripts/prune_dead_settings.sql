-- Remove settings rows that nothing reads.
--
-- Every key below was surfaced in Settings, saved successfully, and then
-- ignored by the whole codebase. They are deleted rather than left in place so
-- the Settings page only ever shows switches that actually do something.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- No SMS or WhatsApp provider integration exists on the server at all.
DELETE FROM app_settings WHERE category IN ('sms', 'whatsapp');

-- Duplicate keys. The survivor in each pair is the one the code reads.
DELETE FROM app_settings WHERE category = 'notifications' AND setting_key IN (
    'smtp_user',                   -- the mailer reads smtp_username
    'email_notifications_enabled'  -- email_enabled is the real gate
);
DELETE FROM app_settings WHERE category = 'attendance' AND setting_key
    = 'overtime_start_after_hours';  -- duplicate of overtime_threshold_hours

-- Break length is configured per rule in the attendance_rules table, which is
-- what the engine consults. These two global copies were duplicates of each
-- other and read by nothing.
DELETE FROM app_settings WHERE category = 'attendance' AND setting_key IN (
    'min_break_duration_minutes', 'minimum_break_minutes'
);
DELETE FROM app_settings WHERE category = 'weekend' AND setting_key = 'weekend_days';
DELETE FROM app_settings WHERE category = 'timezone' AND setting_key = 'display_timezone';
DELETE FROM app_settings WHERE category = 'pdf' AND setting_key IN (
    'page_orientation', 'page_size', 'include_logo',
    'report_header_text', 'report_footer_text'
);

-- Features with no implementation behind them.
DELETE FROM app_settings WHERE category = 'security' AND setting_key IN (
    'two_factor_enabled',          -- no second-factor flow exists
    'force_password_change_days'   -- no password-age check exists
);
DELETE FROM app_settings WHERE category = 'attendance' AND setting_key IN (
    'auto_checkout_enabled', 'auto_checkout_time',
    'auto_punch_out_enabled', 'auto_punch_out_time',
    'allow_multiple_punches', 'consecutive_punches_gap_minutes'
);
DELETE FROM app_settings WHERE category = 'reports' AND setting_key IN (
    'auto_daily_report_enabled',   -- duplicates daily_report_enabled
    'auto_weekly_report_enabled',
    'auto_monthly_report_enabled'
);
DELETE FROM app_settings WHERE category = 'timezone' AND setting_key IN (
    'auto_dst', 'week_start', 'time_format', 'date_format'
);
DELETE FROM app_settings WHERE category = 'weekend' AND setting_key IN (
    'alternate_saturday', 'alternate_saturday_pattern', 'holiday_carry_forward'
);

COMMIT;
