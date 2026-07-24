import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Send, Loader2, Building, Timer, CalendarDays, Mail, ShieldCheck, MessageCircle, PhoneCall, BarChart3, FileCheck, Settings as SettingsIcon } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';

const CATEGORIES = [
    { id: 'company', label: 'Company', icon: Building, iconColor: '#3B82F6' },
    { id: 'attendance', label: 'Attendance Rules', icon: Timer, iconColor: '#F97316' },
    { id: 'weekend', label: 'Weekend Rules', icon: CalendarDays, iconColor: '#8B5CF6' },
    { id: 'notifications', label: 'Email/SMTP', icon: Mail, iconColor: '#10B981' },
    { id: 'security', label: 'Security', icon: ShieldCheck, iconColor: '#EF4444' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, iconColor: '#25D366' },
    { id: 'sms', label: 'SMS', icon: PhoneCall, iconColor: '#3B82F6' },
    { id: 'reports', label: 'Auto Reports', icon: BarChart3, iconColor: '#10B981' },
    { id: 'pdf', label: 'PDF Settings', icon: FileCheck, iconColor: '#F59E0B' },
];

export default function Settings() {
    const globalToast = useToast();
    const [activeTab, setActiveTab] = useState('company');
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({});
    const [testEmail, setTestEmail] = useState('');
    const [testingEmail, setTestingEmail] = useState(false);

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
        } catch (err) {
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
            showToast('Failed to save settings', 'error');
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

        if (config.data_type === 'boolean') {
            return (
                <label key={key} className="flex items-center justify-between p-4 rounded-[12px] transition-colors border group hover:border-orange-200 hover:shadow-sm cursor-pointer" style={{ backgroundColor: '#F8FAFC', borderColor: '#E5E7EB' }}>
                    <div className="flex-1">
                        <span className="font-medium block mb-1 text-slate-700 group-hover:text-orange-700 transition-colors">{label}</span>
                        {config.description && (
                            <p className="text-xs text-slate-500">{config.description}</p>
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
                    <label className="block text-sm font-semibold text-slate-700 ml-1">{label}</label>
                    <input
                        type="number"
                        value={value ?? ''}
                        onChange={(e) => handleChange(key, parseFloat(e.target.value) || 0)}
                        className="input-premium transition-all duration-200"
                    />
                    {config.description && (
                        <p className="text-xs text-slate-500 ml-1">{config.description}</p>
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
                    <label className="block text-sm font-semibold text-slate-700 ml-1">{label}</label>
                    <textarea
                        value={value ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        rows={3}
                        className="input-premium resize-y min-h-[100px] transition-all duration-200"
                    />
                    {config.description && (
                        <p className="text-xs text-slate-500 ml-1">{config.description}</p>
                    )}
                </div>
            );
        }

        return (
            <div key={key} className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 ml-1">{label}</label>
                <input
                    type={isPassword ? 'password' : 'text'}
                    value={value ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="input-premium transition-all duration-200"
                />
                {config.description && (
                    <p className="text-xs text-slate-500 ml-1">{config.description}</p>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-saffron" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={SettingsIcon}
                title="Settings"
                subtitle="Configure your application preferences"
            />

            {/* Tabs + Content */}
            <div className="card-premium overflow-hidden">
                {/* Tab Navigation */}
                <div className="flex border-b border-slate-200 overflow-x-auto custom-scrollbar" style={{ backgroundColor: '#F8FAFC' }}>
                    {CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const isActive = activeTab === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${isActive
                                    ? 'border-saffron text-saffron bg-white'
                                    : 'border-transparent hover:bg-white/50'
                                    }`}
                                style={{
                                    transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    color: isActive ? '#C2410C' : '#1E293B',
                                    fontWeight: 600
                                }}
                            >
                                <Icon
                                    size={18}
                                    style={{
                                        color: isActive ? '#C2410C' : (cat.iconColor || '#1E293B'),
                                        transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)'
                                    }}
                                />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {getSortedSettings().map(([key, config]) =>
                            renderInput(key, config)
                        )}
                    </div>

                    {/* SMTP test — only on the Email tab */}
                    {activeTab === 'notifications' && (
                        <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-sm font-semibold text-slate-700 mb-1">Test email delivery</p>
                            <p className="text-xs text-slate-500 mb-3">Save your SMTP settings first, then send a test message.</p>
                            <div className="flex gap-2 flex-wrap">
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                    placeholder="recipient@example.com"
                                    className="flex-1 min-w-[220px] text-sm border border-slate-200 rounded-lg px-3 py-2"
                                />
                                <Button variant="dark" icon={Send} onClick={handleTestEmail} disabled={testingEmail}>
                                    {testingEmail ? 'Sending...' : 'Send Test Email'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-100">
                        <Button icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button variant="secondary" icon={RefreshCw} onClick={handleReset}>Reset</Button>
                    </div>
                </div>
            </div>

        </div>
    );
}
