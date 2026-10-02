import {
    Building, Timer, CalendarDays, Mail, ShieldCheck, BarChart3, FileCheck,
    Database as DatabaseIcon, Globe, BellRing, Palette, KeyRound, Workflow
} from 'lucide-react';

/**
 * How each settings section is presented.
 *
 * The API returns flat key/value rows per category; this turns them into
 * pages people can read: grouped fields with plain labels, the right control
 * for each value, and a one-line status for the settings home. Keys that are
 * not listed in any group still appear, under "Other", so a new server-side
 * setting is never silently hidden.
 *
 * `hidden` keys are duplicates nothing reads (the live one is shown instead)
 * or values managed on another screen. `inert` keys are saved but not yet
 * used by the server; they are labelled so, rather than implying they work.
 */

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const csv = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const on = (v) => v === true || v === 'true';
// 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st.
const ordinal = (n) => {
    const v = n % 100;
    const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return `${n}${suffix}`;
};

export const SETTINGS_SECTIONS = [
    {
        id: 'company', label: 'Company', icon: Building, area: 'Organisation',
        description: 'Name, logo and contact details shown on reports and in the app.',
        hidden: ['theme_custom_colors', 'theme_preset'],
        groups: [
            { title: 'Identity & contact', hint: 'The name is shown in the header, on reports and on the login page.', keys: ['company_name', 'company_email', 'company_phone', 'company_website'] },
            { title: 'Logo', keys: ['company_logo'] },
            { title: 'Address', keys: ['company_address', 'company_city', 'company_state', 'company_pincode', 'company_country'] }
        ],
        fields: {
            company_name: { label: 'Company name' },
            company_email: { label: 'Email', inputType: 'email', placeholder: 'hr@company.com' },
            company_phone: { label: 'Phone', inputType: 'tel' },
            company_website: { label: 'Website', inputType: 'url', placeholder: 'https://' },
            company_address: { label: 'Street address' },
            company_city: { label: 'City' },
            company_state: { label: 'State' },
            company_pincode: { label: 'PIN code' },
            company_country: { label: 'Country' }
        },
        status: (v) => v.company_name && v.company_name !== 'My Company' ? v.company_name : { warn: 'Company name not set' }
    },
    {
        id: 'privacy', label: 'Privacy contact', icon: ShieldCheck, area: 'Organisation',
        description: 'Who employees contact about their data. Shown in the privacy notice on the sign-in pages.',
        groups: [
            { title: 'Responsible organisation', hint: 'Usually the employer. Blank uses the company name.', keys: ['privacy_operator_name', 'privacy_notice_updated'] },
            { title: 'Privacy contact', hint: 'The person who answers access, correction and erasure requests and grievances. Required for the notice to be complete.', keys: ['privacy_contact_name', 'privacy_contact_email', 'privacy_contact_phone', 'privacy_contact_address'] },
            { title: 'Retention', hint: 'Stated in the notice exactly as written here. Confirm it against your policy and the law.', keys: ['attendance_record_retention'] }
        ],
        fields: {
            privacy_operator_name: { label: 'Organisation name' },
            privacy_notice_updated: { label: 'Notice last reviewed', inputType: 'date' },
            privacy_contact_name: { label: 'Name or role', placeholder: 'e.g. HR Manager' },
            privacy_contact_email: { label: 'Email', inputType: 'email' },
            privacy_contact_phone: { label: 'Phone', inputType: 'tel' },
            privacy_contact_address: { label: 'Postal address', type: 'textarea' },
            attendance_record_retention: { label: 'Attendance records are kept for', wide: true, placeholder: 'e.g. 8 years after the end of employment' }
        },
        status: (v) => v.privacy_contact_name && (v.privacy_contact_email || v.privacy_contact_phone)
            ? v.privacy_contact_name
            : { warn: 'No privacy contact — notice incomplete' }
    },
    {
        id: 'timezone', label: 'Timezone', icon: Globe, area: 'Organisation',
        description: 'Decides which day a punch belongs to and when shifts start.',
        groups: [{ title: 'Time zone', hint: 'Changing it moves the day boundary for every punch from now on.', keys: ['system_timezone'] }],
        fields: { system_timezone: { label: 'Time zone' } },
        status: (v) => v.system_timezone || 'Asia/Kolkata'
    },
    {
        id: 'appearance', label: 'Appearance', icon: Palette, area: 'Organisation',
        description: 'Colour theme and light/dark mode.', custom: true,
        status: () => 'Theme and colours'
    },
    {
        id: 'attendance', label: 'Attendance defaults', icon: Timer, area: 'Attendance',
        description: 'Fallback thresholds when an employee has no shift with its own values.',
        inert: ['auto_checkout_enabled', 'auto_checkout_time', 'consecutive_punches_gap_minutes', 'min_break_duration_minutes'],
        groups: [
            { title: 'Lateness & day length', hint: 'A shift’s own values override these.', keys: ['grace_period_minutes', 'late_threshold_minutes', 'full_day_threshold_hours', 'half_day_threshold_hours'] },
            { title: 'Overtime & breaks', keys: ['overtime_threshold_hours', 'overtime_multiplier', 'min_break_duration_minutes', 'consecutive_punches_gap_minutes'] },
            { title: 'Automatic check-out', hint: 'Closes a day that has an IN but no OUT.', toggle: 'auto_checkout_enabled', keys: ['auto_checkout_enabled', 'auto_checkout_time'] },
            { title: 'Punch photos', keys: ['punch_photo_retention_days'] }
        ],
        fields: {
            grace_period_minutes: { label: 'Grace period', suffix: 'minutes' },
            late_threshold_minutes: { label: 'Late mark after', suffix: 'minutes' },
            full_day_threshold_hours: { label: 'Full day from', suffix: 'hours' },
            half_day_threshold_hours: { label: 'Half day from', suffix: 'hours' },
            overtime_threshold_hours: { label: 'Overtime after', suffix: 'hours' },
            overtime_multiplier: { label: 'Overtime pay rate', suffix: '× hourly' },
            consecutive_punches_gap_minutes: { label: 'Ignore repeat punches within', suffix: 'minutes' },
            min_break_duration_minutes: { label: 'Minimum break', suffix: 'minutes' },
            auto_checkout_enabled: { label: 'Automatic check-out' },
            auto_checkout_time: { label: 'Automatic check-out at' },
            punch_photo_retention_days: { label: 'Keep punch photos for', suffix: 'days', help: 'Only the photo is deleted; the punch itself is kept.' }
        },
        status: (v) => `Grace ${v.grace_period_minutes ?? '—'} min · full day ${v.full_day_threshold_hours ?? '—'} h`
    },
    {
        id: 'weekend', label: 'Weekend rules', icon: CalendarDays, area: 'Attendance',
        description: 'Which days are weekly offs, including Saturday patterns.',
        inert: ['alternate_saturday_pattern', 'holiday_carry_forward'],
        groups: [
            { title: 'Weekly off', keys: ['week_off_days', 'all_sundays_off', 'holiday_carry_forward'] },
            { title: 'Saturdays off', hint: 'Turn on each Saturday of the month that is a holiday.', keys: ['first_saturday_off', 'second_saturday_off', 'third_saturday_off', 'fourth_saturday_off', 'fifth_saturday_off', 'alternate_saturday', 'alternate_saturday_pattern'] }
        ],
        fields: {
            week_off_days: { label: 'Weekly off days', type: 'days', span: 2, help: 'Used when a shift or employee has no weekly off of its own.' },
            alternate_saturday: { label: 'Alternate Saturdays off' },
            all_sundays_off: { label: 'Every Sunday is off' },
            first_saturday_off: { label: '1st Saturday' }, second_saturday_off: { label: '2nd Saturday' },
            third_saturday_off: { label: '3rd Saturday' }, fourth_saturday_off: { label: '4th Saturday' },
            fifth_saturday_off: { label: '5th Saturday' },
            alternate_saturday_pattern: { label: 'Alternate Saturday pattern', type: 'select', options: [['odd', 'Odd Saturdays'], ['even', 'Even Saturdays']] },
            holiday_carry_forward: { label: 'Move off-day holidays forward', help: 'A holiday on a weekly off shifts to the next working day.' }
        },
        status: (v) => {
            const sats = ['first', 'second', 'third', 'fourth', 'fifth'].filter(n => on(v[`${n}_saturday_off`])).map((n) => ['1st', '2nd', '3rd', '4th', '5th'][['first', 'second', 'third', 'fourth', 'fifth'].indexOf(n)]);
            return [on(v.all_sundays_off) ? 'Sundays' : null, sats.length ? `${sats.join(', ')} Saturday` : null].filter(Boolean).join(' · ') || 'No weekly off';
        }
    },
    {
        id: 'approvals', label: 'Approval chain', icon: Workflow, area: 'Attendance',
        description: 'Who approves leave and attendance corrections, and in what order.',
        groups: [{ title: 'Order', hint: 'The first approver found in this order handles the request.', keys: ['approval_chain'] }],
        fields: {
            approval_chain: { label: 'Approver order', help: 'Keep HR last so every request reaches someone.', type: 'order', options: [['manager', 'Reporting manager'], ['department', 'Department approvers'], ['hr', 'HR']] }
        },
        status: (v) => csv(v.approval_chain).map(x => ({ manager: 'Manager', department: 'Department', hr: 'HR' }[x] || x)).join(' → ') || 'Not set'
    },
    {
        id: 'notifications', label: 'Email / SMTP', icon: Mail, area: 'Notifications',
        description: 'The mail server used for alerts, reports and password resets.',
        hidden: ['smtp_user'],
        groups: [
            { title: 'Sending', hint: 'Alerts, reports and password resets go out from this address.', toggle: 'email_enabled', keys: ['email_enabled', 'smtp_from_name', 'smtp_from_email'] },
            { title: 'Mail server', hint: 'From your email provider. Port 587 with TLS is the usual choice.', keys: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_username', 'smtp_password'] }
        ],
        fields: {
            email_enabled: { label: 'Send email' },
            smtp_from_name: { label: 'Sender name' },
            smtp_from_email: { label: 'Sender address', inputType: 'email', placeholder: 'attendance@company.com' },
            smtp_host: { label: 'Server', span: 2, placeholder: 'smtp.office365.com' }, smtp_port: { label: 'Port' }, smtp_secure: { label: 'Use TLS/SSL', help: 'On for port 465 and 587.' },
            smtp_username: { label: 'Username', span: 2 }, smtp_password: { label: 'Password', span: 2, help: 'Stored encrypted.' }
        },
        status: (v) => !v.smtp_host ? { warn: 'Not configured' } : on(v.email_enabled) ? `On · ${v.smtp_host}` : { warn: `Off · ${v.smtp_host}` },
        test: 'email'
    },
    {
        id: 'alerts', label: 'Alerts', icon: BellRing, area: 'Notifications',
        description: 'Emails when a device goes quiet, sync fails or settings change.',
        groups: [
            { title: 'Alerts', hint: 'Nothing is sent while “Send to” is empty.', toggle: 'enabled', keys: ['enabled', 'recipients', 'device_offline_minutes', 'notify_config_changes'] },
            { title: 'Daily digest', hint: 'A once-a-day summary of collection and sync.', toggle: 'digest_enabled', keys: ['digest_enabled', 'digest_time'] }
        ],
        fields: {
            enabled: { label: 'Send alerts' },
            recipients: { label: 'Send to', span: 2, placeholder: 'it@example.com, hr@example.com', help: 'Separate addresses with commas.' },
            device_offline_minutes: { label: 'Device offline after', suffix: 'minutes' },
            notify_config_changes: { label: 'Security & integration changes', help: 'Says what changed and who changed it.' },
            digest_enabled: { label: 'Send a daily digest' }, digest_time: { label: 'Digest time', help: 'Server time.' }
        },
        status: (v) => !on(v.enabled) ? { warn: 'Off' } : !v.recipients ? { warn: 'On, but no recipients' } : `On · ${csv(v.recipients).length} recipient${csv(v.recipients).length === 1 ? '' : 's'}`,
        test: 'alerts'
    },
    {
        id: 'reports', label: 'Auto reports', icon: BarChart3, area: 'Notifications',
        description: 'Attendance reports emailed as CSV on a schedule. Needs Email / SMTP to be set up.',
        groups: [
            { title: 'Send time', hint: 'Daily, weekly and monthly reports all go out at this time (server time).', keys: ['daily_report_time'] },
            { title: 'Daily attendance', hint: 'Every day.', toggle: 'daily_report_enabled', cadence: 'daily', recipients: 'daily_report_recipients', keys: ['daily_report_enabled', 'daily_report_recipients'] },
            { title: 'Weekly attendance', hint: 'Once a week.', toggle: 'weekly_report_enabled', cadence: 'weekly', recipients: 'weekly_report_recipients', keys: ['weekly_report_enabled', 'weekly_report_day', 'weekly_report_recipients'] },
            { title: 'Monthly summary', hint: 'Once a month.', toggle: 'monthly_report_enabled', cadence: 'monthly', recipients: 'monthly_report_recipients', keys: ['monthly_report_enabled', 'monthly_report_day', 'monthly_report_recipients'] }
        ],
        fields: {
            daily_report_time: { label: 'Send at' },
            daily_report_enabled: { label: 'Daily attendance report' },
            daily_report_recipients: { label: 'Send to', span: 2, placeholder: 'Addresses, separated by commas' },
            weekly_report_enabled: { label: 'Weekly attendance report' },
            weekly_report_day: { label: 'Send on', type: 'select', options: days.map(d => [d, d]) },
            weekly_report_recipients: { label: 'Send to', span: 2, placeholder: 'Addresses, separated by commas' },
            monthly_report_enabled: { label: 'Monthly summary report' },
            monthly_report_day: { label: 'Day of month', type: 'select', numeric: true, options: Array.from({ length: 28 }, (_, i) => [i + 1, ordinal(i + 1)]) },
            monthly_report_recipients: { label: 'Send to', span: 2, placeholder: 'Addresses, separated by commas' }
        },
        status: (v) => {
            const list = (x) => (Array.isArray(x) ? x : csv(x)).length;
            const reports = [['Daily', 'daily'], ['Weekly', 'weekly'], ['Monthly', 'monthly']]
                .filter(([, k]) => on(v[`${k}_report_enabled`]));
            // The scheduler skips a report with nobody to send to.
            const empty = reports.filter(([, k]) => !list(v[`${k}_report_recipients`]));
            if (empty.length) return { warn: `${empty.map(([l]) => l).join(', ')} on, but no recipients` };
            return reports.length ? `${reports.map(([l]) => l).join(', ')} at ${v.daily_report_time || '—'}` : 'None scheduled';
        }
    },
    {
        id: 'pdf', label: 'PDF & print', icon: FileCheck, area: 'Notifications',
        description: 'Page size, header, footer and what printed reports include.',
        hidden: ['include_logo', 'page_orientation', 'page_size', 'report_header_text', 'report_footer_text'],
        groups: [
            { title: 'Page', keys: ['pdf_page_size', 'pdf_orientation', 'pdf_header_text', 'pdf_footer_text'] },
            { title: 'Include', keys: ['pdf_show_logo', 'pdf_include_summary', 'pdf_include_signature_line'] }
        ],
        fields: {
            pdf_page_size: { label: 'Page size', type: 'select', options: [['A4', 'A4'], ['Letter', 'Letter'], ['Legal', 'Legal']] },
            pdf_orientation: { label: 'Orientation', type: 'select', options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] },
            pdf_header_text: { label: 'Header text' }, pdf_footer_text: { label: 'Footer text' },

            pdf_show_logo: { label: 'Show company logo' }, pdf_include_summary: { label: 'Include summary section' },
            pdf_include_signature_line: { label: 'Include signature line' }
        },
        status: (v) => `${v.pdf_page_size || 'A4'} · ${v.pdf_orientation || 'portrait'}`
    },
    {
        id: 'security', label: 'Security', icon: ShieldCheck, area: 'Access & security',
        description: 'Passwords, sign-in lockout, sessions and device approval.',
        inert: ['two_factor_enabled'],
        groups: [
            { title: 'Passwords', keys: ['password_min_length', 'password_require_uppercase', 'password_require_number', 'require_special_char'] },
            { title: 'Sign-in & devices', keys: ['max_login_attempts', 'lockout_duration_minutes', 'session_timeout_minutes', 'require_device_approval', 'two_factor_enabled'] }
        ],
        fields: {
            password_min_length: { label: 'Minimum length', suffix: 'characters' },
            password_require_uppercase: { label: 'Require an uppercase letter' },
            password_require_number: { label: 'Require a number' },
            require_special_char: { label: 'Require a special character' },
            max_login_attempts: { label: 'Lock after', suffix: 'failed attempts' },
            lockout_duration_minutes: { label: 'Lock for', suffix: 'minutes' },
            session_timeout_minutes: { label: 'Sign out after', suffix: 'minutes' },
            two_factor_enabled: { label: 'Two-factor authentication' },
            require_device_approval: { label: 'Approved devices only', help: 'Reject punches from devices not approved on the Devices page.' }
        },
        status: (v) => `Min ${v.password_min_length ?? '—'} chars · lock after ${v.max_login_attempts ?? '—'} tries${on(v.require_device_approval) ? ' · device approval on' : ''}`
    },
    {
        id: 'auth', label: 'Employee sign-in', icon: KeyRound, area: 'Access & security',
        description: 'How employees sign in to the portal: password, single sign-on or Active Directory.',
        groups: [
            { title: 'Methods', hint: 'Turn on the ways employees may sign in. Each shows whether it works right now.', keys: ['employee_login_modes'] },
            { title: 'Single sign-on (Microsoft 365 / Google / Okta)', hint: 'Register an app with your identity provider, then fill these. The client secret goes in .env, never here.', keys: ['oidc_issuer', 'oidc_redirect_uri', 'oidc_client_id'] },
            { title: 'Active Directory (LDAP)', hint: 'Needs a read-only service account and LDAPS. The bind password goes in .env, never here.', keys: ['ldap_url', 'ldap_base_dn', 'ldap_bind_dn', 'ldap_user_filter'] }
        ],
        fields: {
            employee_login_modes: {
                label: 'Allowed methods', type: 'multi',
                options: [['local', 'Employee code + password'], ['oidc', 'Single sign-on'], ['ldap', 'Active Directory']],
                optionHelp: { local: 'Set by HR per employee.', oidc: 'Microsoft 365, Google or Okta.', ldap: 'Company domain login.' }
            },
            oidc_issuer: { label: 'Issuer URL', span: 2, placeholder: 'https://login.microsoftonline.com/<tenant-id>/v2.0' },
            oidc_client_id: { label: 'Client ID', help: 'Application (client) ID from the provider.' },
            oidc_redirect_uri: { label: 'Redirect URI', span: 2, placeholder: 'https://attendance.example.com/api/portal/auth/oidc/callback', help: 'Must match the provider exactly.' },
            ldap_url: { label: 'Server URL', placeholder: 'ldaps://dc.example.local:636', help: 'Plain ldap:// is refused unless LDAP_ALLOW_INSECURE is set.' },
            ldap_base_dn: { label: 'Base DN', placeholder: 'DC=example,DC=local', help: 'Where to search for users.' },
            ldap_bind_dn: { label: 'Bind DN', help: 'Read-only service account that looks users up.' },
            ldap_user_filter: { label: 'User filter', help: '{login} is replaced by what the employee types.' }
        },
        status: (v) => {
            const m = csv(v.employee_login_modes);
            return m.length ? m.map(x => ({ local: 'Password', oidc: 'SSO', ldap: 'AD' }[x] || x)).join(', ') : 'Password';
        }
    },
    {
        id: 'database', label: 'Backups', icon: DatabaseIcon, area: 'Data',
        description: 'Automatic database backups and how many to keep.',
        groups: [
            { title: 'Schedule', toggle: 'backup_enabled', keys: ['backup_enabled', 'backup_frequency', 'backup_day', 'backup_time'] },
            { title: 'Retention & second copy', keys: ['backup_retention_count', 'backup_external_path'] }
        ],
        fields: {
            backup_enabled: { label: 'Take automatic backups' },
            backup_frequency: { label: 'How often', type: 'select', options: [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] },
            backup_day: { label: 'Day', placeholder: 'Weekly 0–6 · Monthly 1–31', help: 'Weekly: 0 Sunday to 6 Saturday. Monthly: 1–31. Ignored for daily.' },
            backup_time: { label: 'Time', help: 'Server time.' },
            backup_retention_count: { label: 'Keep the last', suffix: 'backups' },
            backup_external_path: { label: 'Second copy location', span: 2 }
        },
        status: (v) => on(v.backup_enabled) ? `${v.backup_frequency || 'daily'} at ${v.backup_time || '—'} · keep ${v.backup_retention_count ?? '—'}` : { warn: 'Off' }
    }
];

export const SETTINGS_AREAS = ['Organisation', 'Attendance', 'Notifications', 'Access & security', 'Data'];
export const sectionById = (id) => SETTINGS_SECTIONS.find(s => s.id === id);
export const isOn = on;
