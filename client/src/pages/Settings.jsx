import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Send, Loader2, AlertCircle, Building, Timer, CalendarDays, Mail, ShieldCheck, BarChart3, FileCheck, Database as DatabaseIcon, Globe, Settings as SettingsIcon, BellRing, Palette, KeyRound } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';
import LogoUpload from '../components/LogoUpload';
import ThemeSettings from '../components/ThemeSettings';

const CATEGORIES = [
    { id: 'company', label: 'Company', icon: Building, iconClass: 'text-blue-500 dark:text-blue-400' },
    { id: 'attendance', label: 'Attendance Rules', icon: Timer, iconClass: 'text-orange-500 dark:text-orange-400' },
    { id: 'weekend', label: 'Weekend Rules', icon: CalendarDays, iconClass: 'text-violet-500 dark:text-violet-400' },
    { id: 'notifications', label: 'Email/SMTP', icon: Mail, iconClass: 'text-emerald-500 dark:text-emerald-400' },
    { id: 'security', label: 'Security', icon: ShieldCheck, iconClass: 'text-rose-500 dark:text-rose-400' },
    // Employee sign-in: single sign-on and directory settings. The rows were
    // seeded into app_settings and rendered nowhere, so the whole feature was
    // configurable only by editing the database — the same mistake as the
    // backup path that lived on a page nobody would think to open.
    //
    // The client secret and LDAP bind password are deliberately NOT here. They
    // come from the environment, so this tab shows what an administrator may
    // safely see on a screen someone else might be standing behind.
    { id: 'auth', label: 'Employee Sign-in', icon: KeyRound, iconClass: 'text-indigo-500 dark:text-indigo-400' },
    // Fields render generically from app_settings, so this tab needed only the
    // entry. Placed next to Email/SMTP because it depends on it: alerting is
    // email-only, and a broken SMTP means no alerts at all.
    { id: 'alerts', label: 'Alerts', icon: BellRing, iconClass: 'text-amber-500 dark:text-amber-400' },
    // Appearance lives in the browser, not app_settings, so this tab renders its
    // own component instead of the generic field list. It is here because this
    // is where people look — the controls previously existed only in a slide-over
    // panel behind a palette icon in the header, which is why the theme toggle
    // was reported as not working when it worked fine.
    { id: 'appearance', label: 'Appearance', icon: Palette, iconClass: 'text-violet-500 dark:text-violet-400' },
    // SMS and WhatsApp tabs removed — the server has no provider integration for
    // either, so every field on them was saved and never read by anything.
    { id: 'reports', label: 'Auto Reports', icon: BarChart3, iconClass: 'text-emerald-500 dark:text-emerald-400' },
    { id: 'pdf', label: 'PDF Settings', icon: FileCheck, iconClass: 'text-amber-500 dark:text-amber-400' },
    { id: 'database', label: 'Database', icon: DatabaseIcon, iconClass: 'text-violet-500 dark:text-violet-400' },
    { id: 'timezone', label: 'Timezone', icon: Globe, iconClass: 'text-sky-500 dark:text-sky-400' },
];

// Zones the app is realistically deployed in. Kept short deliberately — the
// full IANA list is hundreds of entries and unusable in a dropdown.
const TIMEZONES = [
    'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu',
    'Asia/Colombo', 'Asia/Singapore', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Bangkok',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Riyadh', 'Europe/London', 'Europe/Berlin',
    'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Australia/Sydney', 'UTC'
];

export default function Settings() {
    const globalToast = useToast();
    const [activeTab, setActiveTab] = useState('company');
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({});
    const [testEmail, setTestEmail] = useState('');
    const [testingEmail, setTestingEmail] = useState(false);
    const [testingAlert, setTestingAlert] = useState(false);

    // Fetch all settings on mount
    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/settings');
            setSettings(res.data);
            // Set initial form data for current tab
            if (res.data[activeTab]) {
                const tabData = {};
                Object.entries(res.data[activeTab]).forEach(([key, config]) => {
                    tabData[key] = config.value;
                });
                setFormData(tabData);
            }
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load settings');
            showToast('Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Update form data when tab changes
    useEffect(() => {
        if (settings[activeTab]) {
            const tabData = {};
            Object.entries(settings[activeTab]).forEach(([key, config]) => {
                tabData[key] = config.value;
            });
            setFormData(tabData);
        }
    }, [activeTab, settings]);

    const handleChange = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/api/settings/${activeTab}`, formData);
            // Update local state
            const updatedSettings = { ...settings };
            Object.keys(formData).forEach(key => {
                if (updatedSettings[activeTab]?.[key]) {
                    updatedSettings[activeTab][key].value = formData[key];
                }
            });
            setSettings(updatedSettings);
            showToast('Settings saved successfully!', 'success');
        } catch (err) {
            // Show what the server said. A rejected value — a Windows path in
            // the backup field, say — comes back with the reason and the exact
            // commands to fix it, and "Failed to save settings" threw all of
            // that away and left someone guessing at their own screen.
            const d = err.response?.data || {};
            showToast([d.error, d.hint].filter(Boolean).join('\n\n') || 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (settings[activeTab]) {
            const tabData = {};
            Object.entries(settings[activeTab]).forEach(([key, config]) => {
                tabData[key] = config.value;
            });
            setFormData(tabData);
            showToast('Form reset to saved values', 'info');
        }
    };

    const showToast = (message, type = 'info') => {
        (globalToast[type] || globalToast.info)(message);
    };

    // Fires a real alert through raise()/resolve() rather than calling the mail
    // service directly — a test that skips the plumbing only proves SMTP works,
    // which the Email tab already tells you.
    const handleTestAlert = async () => {
        setTestingAlert(true);
        try {
            const res = await api.post('/api/settings/test-alert');
            showToast(res.data.message || 'Test alert sent', 'success');
        } catch (err) {
            const d = err.response?.data || {};
            showToast([d.error, d.hint].filter(Boolean).join(' — ') || 'Test alert failed', 'error');
        } finally {
            setTestingAlert(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail) {
            showToast('Enter a recipient address first', 'warning');
            return;
        }
        setTestingEmail(true);
        try {
            const res = await api.post('/api/settings/test-email', { test_email: testEmail });
            showToast(res.data.message || 'Test email sent', 'success');
        } catch (err) {
            showToast(err.response?.data?.message || err.response?.data?.error || 'Test email failed', 'error');
        } finally {
            setTestingEmail(false);
        }
    };

    const getSortedSettings = () => {
        if (!settings[activeTab]) return [];

        const entries = Object.entries(settings[activeTab]);

        if (activeTab === 'company') {
            const priority = [
                'company_name',
                'company_address',
                'company_email',
                'company_phone',
                'company_website',
                'company_city',
                'company_state',
                'company_country',
                'company_pincode',
                'company_logo'
            ];

            return entries.sort((a, b) => {
                const indexA = priority.indexOf(a[0]);
                const indexB = priority.indexOf(b[0]);

                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a[0].localeCompare(b[0]);
            });
        }

        return entries;
    };

    const renderInput = (key, config) => {
        const value = formData[key];
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        // The logo is a picture, not a string. It was rendered as a text input
        // because the generic renderer keys off data_type, and the setting is
        // stored as a base64 data URI — which is technically a string and
        // completely unusable as one.
        if (key === 'company_logo') {
            return (
                <LogoUpload
                    key={key}
                    value={value || ''}
                    onChange={(v) => handleChange(key, v)}
                    label={label}
                    description={config.description}
                />
            );
        }

        if (config.data_type === 'boolean') {
            return (
                <label key={key} className="flex items-center justify-between p-4 rounded-xl transition-colors border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 group hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-sm cursor-pointer">
                    <div className="flex-1">
                        <span className="font-medium block mb-1 text-slate-700 dark:text-slate-300 group-hover:text-orange-700 dark:group-hover:text-orange-300 transition-colors">{label}</span>
                        {config.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">{config.description}</p>
                        )}
                    </div>
                    <div className={`toggle-switch ml-4 ${value === true || value === 'true' ? 'active' : ''}`}>
                        <input
                            type="checkbox"
                            checked={value === true || value === 'true'}
                            onChange={(e) => handleChange(key, e.target.checked)}
                            className="sr-only"
                        />
                        <span className="toggle-thumb"></span>
                    </div>
                </label>
            );
        }

        if (config.data_type === 'number') {
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                    <input
                        type="number"
                        value={value ?? ''}
                        onChange={(e) => handleChange(key, parseFloat(e.target.value) || 0)}
                        className="input-premium transition-ui duration-200"
                    />
                    {config.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">{config.description}</p>
                    )}
                </div>
            );
        }

        // Shown, but not editable here.
        //
        // The description has said "read-only here" since the destination
        // picker was built, and the box stayed typeable — so a Windows path was
        // pasted into it three times in a row, refused three times, with the
        // real screen one click away. A field that rejects everything you type
        // should not accept typing.
        //
        // It stays visible because someone looking for the backup path should
        // find it where the other backup settings are, and see its value.
        if (key === 'backup_external_path') {
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                    <input
                        type="text"
                        value={value || ''}
                        readOnly
                        disabled
                        placeholder="Not set — configure it in Database Tools"
                        className="input-premium opacity-60 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                        Set this in <a href="/database/backup" className="underline font-medium">System &rarr; Database &rarr; Backup</a>, under &ldquo;Second copy&rdquo; —
                        which can also send to a Windows share, S3, SFTP or SharePoint — and tests
                        the destination before saving.
                    </p>
                </div>
            );
        }

        // Times get a real time control. Typed as free text, "2:00", "2 AM" or
        // "0200" all look reasonable and none of them parse — the scheduler
        // compares against HH:MM, so a near-miss means the backup silently
        // never runs. The browser's own picker cannot produce an invalid value.
        if (/(^|_)time$/.test(key) && config.data_type !== 'number') {
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                    <input
                        type="time"
                        value={String(value ?? '').slice(0, 5)}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="input-premium transition-ui duration-200"
                    />
                    {config.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">{config.description}</p>
                    )}
                </div>
            );
        }

        // A free-text timezone is easy to typo, and a typo silently falls back
        // to the default inside the attendance engine.
        if (key === 'system_timezone') {
            return (
                <div key={key} className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                    <select
                        value={value ?? 'Asia/Kolkata'}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="input-premium"
                    >
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                    {config.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">{config.description}</p>
                    )}
                </div>
            );
        }

        // Default: string input
        const isPassword = key.toLowerCase().includes('password') || key.toLowerCase().includes('api_key');
        const isTextarea = key.toLowerCase().includes('address') || key.toLowerCase().includes('template') || key.toLowerCase().includes('description');

        if (isTextarea) {
            return (
                <div key={key} className="space-y-2 md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                    <textarea
                        value={value ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        rows={3}
                        className="input-premium resize-y min-h-[100px] transition-ui duration-200"
                    />
                    {config.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">{config.description}</p>
                    )}
                </div>
            );
        }

        return (
            <div key={key} className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{label}</label>
                <input
                    type={isPassword ? 'password' : 'text'}
                    value={value ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="input-premium transition-ui duration-200"
                />
                {config.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-1">{config.description}</p>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <PageHeader
                    icon={SettingsIcon}
                    title="Settings"
                    subtitle="Configure your application preferences"
                />
                <div className="card-base !p-0 overflow-hidden">
                    <div className="flex gap-1.5 p-2 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                        {CATEGORIES.slice(0, 6).map(cat => (
                            <div key={cat.id} className="h-9 w-28 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/70 dark:bg-slate-800/70">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                <PageHeader
                    icon={SettingsIcon}
                    title="Settings"
                    subtitle="Configure your application preferences"
                />
                <div className="card-base !p-0 overflow-hidden">
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load settings</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchSettings}>Try again</Button>
                    </div>
                </div>
            </div>
        );
    }

    const sortedSettings = getSortedSettings();

    return (
        <div className="space-y-6">
            <PageHeader
                icon={SettingsIcon}
                title="Settings"
                subtitle="Configure your application preferences"
            />

            {/* Tabs + Content */}
            <div className="card-base !p-0 overflow-hidden">
                {/* Tab Navigation — pill segmented control */}
                <div className="flex gap-1.5 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 overflow-x-auto custom-scrollbar">
                    {CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const isActive = activeTab === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${isActive
                                    ? 'bg-orange-600 text-white border-transparent shadow-sm'
                                    : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
                                    }`}
                            >
                                <Icon size={15} className={isActive ? 'text-white' : cat.iconClass} />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="p-6 bg-white/70 dark:bg-slate-800/70">
                    {activeTab === 'appearance' ? (
                        <ThemeSettings />
                    ) : sortedSettings.length === 0 ? (
                        <div className="py-12 text-center">
                            <SettingsIcon size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing to configure here</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                This section has no settings defined yet.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {sortedSettings.map(([key, config]) =>
                                renderInput(key, config)
                            )}
                        </div>
                    )}

                    {/* Alert test — only on the Alerts tab */}
                    {activeTab === 'alerts' && (
                        <div className="mt-6 p-4 bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Send a test alert</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                Goes to the recipients above, through the same path a real alert takes.
                                Expect two messages: the alert, then confirmation it cleared. Save your
                                settings first.
                            </p>
                            <Button variant="dark" icon={BellRing} onClick={handleTestAlert} disabled={testingAlert}>
                                {testingAlert ? 'Sending...' : 'Send Test Alert'}
                            </Button>
                        </div>
                    )}

                    {/* SMTP test — only on the Email tab */}
                    {activeTab === 'notifications' && (
                        <div className="mt-6 p-4 bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Test email delivery</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Save your SMTP settings first, then send a test message.</p>
                            <div className="flex gap-2 flex-wrap">
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                    placeholder="recipient@example.com"
                                    className="field flex-1 min-w-[220px]"
                                />
                                <Button variant="dark" icon={Send} onClick={handleTestEmail} disabled={testingEmail}>
                                    {testingEmail ? 'Sending...' : 'Send Test Email'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Actions. Hidden on Appearance: those preferences live in
                        this browser and apply the moment they are chosen, so a
                        Save button would either do nothing or PUT to a settings
                        category that does not exist. */}
                    {activeTab !== 'appearance' && (
                        <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                            <Button icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button variant="secondary" icon={RefreshCw} onClick={handleReset}>Reset</Button>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
