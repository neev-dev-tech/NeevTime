-- Settings Schema for AMS Pro
-- Stores all application configuration in a flexible key-value format

CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    data_type VARCHAR(20) DEFAULT 'string',  -- string, boolean, number, json
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(category, setting_key)
);

-- ============================================
-- SEED DEFAULT SETTINGS
-- ============================================

-- Company Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('company', 'company_name', 'My Company', 'string', 'Company name displayed in reports and headers'),
('company', 'company_address', '', 'string', 'Company address'),
('company', 'company_city', '', 'string', 'City'),
('company', 'company_state', '', 'string', 'State/Province'),
('company', 'company_country', 'India', 'string', 'Country'),
('company', 'company_pincode', '', 'string', 'Postal/ZIP code'),
('company', 'company_phone', '', 'string', 'Contact phone number'),
('company', 'company_email', '', 'string', 'Contact email'),
('company', 'company_website', '', 'string', 'Company website URL'),
('company', 'company_logo', '', 'string', 'Logo URL or base64')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Attendance Rules
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('attendance', 'grace_period_minutes', '15', 'number', 'Grace period for late arrival (minutes)'),
('attendance', 'late_threshold_minutes', '30', 'number', 'Late mark threshold (minutes)'),
('attendance', 'half_day_threshold_hours', '4', 'number', 'Minimum hours for half-day attendance'),
('attendance', 'full_day_threshold_hours', '8', 'number', 'Minimum hours for full-day attendance'),
('attendance', 'overtime_threshold_hours', '9', 'number', 'Hours after which overtime counts'),
('attendance', 'overtime_multiplier', '1.5', 'number', 'Overtime pay multiplier'),
('attendance', 'auto_checkout_enabled', 'false', 'boolean', 'Enable automatic checkout at shift end'),
('attendance', 'auto_checkout_time', '23:59', 'string', 'Default auto-checkout time'),
('attendance', 'min_break_duration_minutes', '30', 'number', 'Minimum lunch break duration'),
('attendance', 'consecutive_punches_gap_minutes', '5', 'number', 'Minimum gap between consecutive punches')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Weekend Rules
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('weekend', 'week_off_days', '["Sunday"]', 'json', 'Default weekly off days'),
('weekend', 'alternate_saturday', 'false', 'boolean', 'Enable alternate Saturday off'),
('weekend', 'alternate_saturday_pattern', 'odd', 'string', 'Alternate Saturday pattern: odd/even'),
('weekend', 'holiday_carry_forward', 'false', 'boolean', 'Carry forward holidays to next working day')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Notification Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('notifications', 'email_enabled', 'false', 'boolean', 'Enable email notifications'),
('notifications', 'smtp_host', '', 'string', 'SMTP server host'),
('notifications', 'smtp_port', '587', 'number', 'SMTP server port'),
('notifications', 'smtp_user', '', 'string', 'SMTP username'),
('notifications', 'smtp_password', '', 'string', 'SMTP password (encrypted)'),
('notifications', 'smtp_from_email', '', 'string', 'From email address'),
('notifications', 'smtp_from_name', 'AMS Pro', 'string', 'From name for emails')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Security Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('security', 'session_timeout_minutes', '30', 'number', 'Session timeout in minutes'),
('security', 'max_login_attempts', '5', 'number', 'Maximum failed login attempts'),
('security', 'lockout_duration_minutes', '15', 'number', 'Account lockout duration'),
('security', 'password_min_length', '8', 'number', 'Minimum password length'),
('security', 'password_require_uppercase', 'true', 'boolean', 'Require uppercase in password'),
('security', 'password_require_number', 'true', 'boolean', 'Require number in password'),
('security', 'two_factor_enabled', 'false', 'boolean', 'Enable two-factor authentication')
ON CONFLICT (category, setting_key) DO NOTHING;

-- WhatsApp Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('whatsapp', 'whatsapp_enabled', 'false', 'boolean', 'Enable WhatsApp notifications'),
('whatsapp', 'whatsapp_api_url', '', 'string', 'WhatsApp API endpoint'),
('whatsapp', 'whatsapp_api_key', '', 'string', 'WhatsApp API key'),
('whatsapp', 'whatsapp_template_checkin', 'Hello {{name}}, your check-in at {{time}} has been recorded.', 'string', 'Check-in message template'),
('whatsapp', 'whatsapp_template_checkout', 'Hello {{name}}, your check-out at {{time}} has been recorded. Total hours: {{hours}}', 'string', 'Check-out message template')
ON CONFLICT (category, setting_key) DO NOTHING;

-- SMS Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('sms', 'sms_enabled', 'false', 'boolean', 'Enable SMS notifications'),
('sms', 'sms_provider', '', 'string', 'SMS provider name'),
('sms', 'sms_api_url', '', 'string', 'SMS API endpoint'),
('sms', 'sms_api_key', '', 'string', 'SMS API key'),
('sms', 'sms_sender_id', '', 'string', 'SMS sender ID')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Auto Reports Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('reports', 'daily_report_enabled', 'false', 'boolean', 'Enable daily attendance report'),
('reports', 'daily_report_time', '09:00', 'string', 'Time to send daily report'),
('reports', 'daily_report_recipients', '[]', 'json', 'Email recipients for daily report'),
('reports', 'weekly_report_enabled', 'false', 'boolean', 'Enable weekly attendance report'),
('reports', 'weekly_report_day', 'Monday', 'string', 'Day to send weekly report'),
('reports', 'monthly_report_enabled', 'false', 'boolean', 'Enable monthly attendance report'),
('reports', 'monthly_report_day', '1', 'number', 'Day of month to send report')
ON CONFLICT (category, setting_key) DO NOTHING;

-- PDF/Export Settings
INSERT INTO app_settings (category, setting_key, setting_value, data_type, description) VALUES
('pdf', 'report_header_text', 'Attendance Report', 'string', 'Default report header'),
('pdf', 'report_footer_text', 'Generated by AMS Pro', 'string', 'Default report footer'),
('pdf', 'include_logo', 'true', 'boolean', 'Include company logo in reports'),
('pdf', 'page_size', 'A4', 'string', 'Default page size: A4, Letter, Legal'),
('pdf', 'page_orientation', 'portrait', 'string', 'Default orientation: portrait, landscape')
ON CONFLICT (category, setting_key) DO NOTHING;

-- Create index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);
