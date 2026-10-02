import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Save, RefreshCw, Send, Loader2, AlertCircle, BellRing, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../api';
import { Button, ListPage, useToast } from '../components';
import LogoUpload from '../components/LogoUpload';
import ThemeSettings from '../components/ThemeSettings';
import { sectionById, isOn } from '../config/settingsMeta';

// Zones the app is realistically deployed in. Kept short deliberately — the
// full IANA list is hundreds of entries and unusable in a dropdown.
const TIMEZONES = [
    'Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu',
    'Asia/Colombo', 'Asia/Singapore', 'Asia/Manila', 'Asia/Jakarta', 'Asia/Bangkok',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Riyadh', 'Europe/London', 'Europe/Berlin',
    'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'Australia/Sydney', 'UTC'
];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Sentence case, keeping initialisms: ldap_base_dn is "LDAP base DN", not
// "Ldap Base Dn" — administrators copy these from documentation that writes
// them that way.
const INITIALISMS = { ldap: 'LDAP', oidc: 'OIDC', dn: 'DN', url: 'URL', id: 'ID', uri: 'URI', smtp: 'SMTP', gst: 'GST', hr: 'HR', pdf: 'PDF' };
const defaultLabel = (key) => {
    const s = key.replace(/_/g, ' ').replace(/\b\w+/g, w => INITIALISMS[w.toLowerCase()] || w.toLowerCase());
    return s[0].toUpperCase() + s.slice(1);
};
const csv = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const asList = (v) => Array.isArray(v) ? v : (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : csv(v); } catch { return csv(v); } })();

// One grid for every section: as many ~240px columns as fit, so fields fill
// the width at any screen size instead of leaving an empty right half.
const FIELD_GRID = { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' };
const LABEL = 'block text-[13px] font-medium text-slate-800 dark:text-slate-200 mb-1.5';
const HELP = 'mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-snug';

function Switch({ checked, onChange, id, label }) {
    return (
        <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 ${checked ? 'bg-[rgb(var(--brand))]' : 'bg-slate-300 dark:bg-slate-600'}`}>
            {/* bg-[#fff], not bg-white: a global glass rule repaints .bg-white translucent. */}
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition-transform ${checked ? 'translate-x-5 dark:bg-[#18181b]' : ''}`} />
        </button>
    );
}
Switch.propTypes = { checked: PropTypes.bool, onChange: PropTypes.func, id: PropTypes.string, label: PropTypes.string };

function Group({ title, hint, children }) {
    return (
        <section className="px-4 sm:px-6 py-5 border-b border-slate-200 dark:border-slate-800">
            <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                {hint && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{hint}</p>}
            </div>
            <div className="grid gap-x-5 gap-y-5" style={FIELD_GRID}>{children}</div>
        </section>
    );
}
Group.propTypes = { title: PropTypes.node, hint: PropTypes.node, children: PropTypes.node };

/** An on/off setting, or a one-off action, as a bordered row the height of a field. */
function Tile({ title, help, badge, children }) {
    return (
        <div className="flex items-center justify-between gap-4 h-full min-h-[64px] px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="min-w-0">
                <div className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{title}{badge}</div>
                {help && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-snug">{help}</p>}
            </div>
            {children}
        </div>
    );
}
Tile.propTypes = { title: PropTypes.node, help: PropTypes.node, badge: PropTypes.node, children: PropTypes.node };

/**
 * An on/off setting laid out like every other field — label, a control box
 * the height of an input, help below — so switches and inputs line up in the
 * same row. The whole box toggles.
 */
function ToggleField({ id, label, badge, help, checked, onChange, className = '' }) {
    return (
        <div className={className}>
            <span className={LABEL}>{label}{badge}</span>
            <label htmlFor={id} className="field flex items-center justify-between gap-3 h-[43px] !py-0 cursor-pointer select-none">
                <span className={`text-[13px] ${checked ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{checked ? 'On' : 'Off'}</span>
                <Switch id={id} label={label} checked={checked} onChange={onChange} />
            </label>
            {help && <p className={HELP}>{help}</p>}
        </div>
    );
}
ToggleField.propTypes = {
    id: PropTypes.string, label: PropTypes.node, badge: PropTypes.node, help: PropTypes.node,
    checked: PropTypes.bool, onChange: PropTypes.func, className: PropTypes.string
};

/** Whether a sign-in method actually works right now, per the server. */
function LiveBadge({ on, chosen }) {
    // Nothing to say about a method that is off and not chosen; the box already says Off.
    if (!on && !chosen) return null;
    const [text, cls] = on
        ? ['Working', 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300']
        : ['Not working', 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'];
    return <span className={`ml-2 px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap ${cls}`}>{text}</span>;
}
LiveBadge.propTypes = { on: PropTypes.bool, chosen: PropTypes.bool };

export default function Settings() {
    const toast = useToast();
    const { tab = 'company' } = useParams();
    const section = sectionById(tab);
    const activeTab = section ? tab : 'company';

    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({});
    const [testEmail, setTestEmail] = useState('');
    const [testingEmail, setTestingEmail] = useState(false);
    const [testingAlert, setTestingAlert] = useState(false);
    const [drilling, setDrilling] = useState(false);

    /**
     * Live usability of the sign-in modes — the answer to "did what I typed
     * actually work". The server reports what is usable and why something is
     * not (including a missing environment secret no field here can show).
     */
    const [authStatus, setAuthStatus] = useState(null);
    const loadAuthStatus = () =>
        api.get('/api/portal/auth/modes').then(r => setAuthStatus(r.data)).catch(() => setAuthStatus(null));
    useEffect(() => { if (activeTab === 'auth') loadAuthStatus(); }, [activeTab]);

    const showToast = (message, type = 'info') => (toast[type] || toast.info)(message);

    const savedValues = (tabId, all = settings) =>
        Object.fromEntries(Object.entries(all[tabId] || {}).map(([k, c]) => [k, c.value]));

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/settings');
            setSettings(res.data);
            setFormData(savedValues(activeTab, res.data));
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load settings');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchSettings(); }, []);
    useEffect(() => { setFormData(savedValues(activeTab)); }, [activeTab, settings]);

    // Edited in place; the save bar appears only while something differs from
    // what is saved.
    const saved = savedValues(activeTab);
    const dirtyKeys = Object.keys(formData).filter(k => JSON.stringify(formData[k]) !== JSON.stringify(saved[k]));
    const dirty = dirtyKeys.length > 0;
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const handleChange = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put(`/api/settings/${activeTab}`, formData);
            if (activeTab === 'auth') loadAuthStatus();
            const next = { ...settings, [activeTab]: { ...settings[activeTab] } };
            Object.keys(formData).forEach(key => {
                if (next[activeTab][key]) next[activeTab][key] = { ...next[activeTab][key], value: formData[key] };
            });
            setSettings(next);
            showToast('Settings saved', 'success');
        } catch (err) {
            // Show what the server said: a rejected value comes back with the
            // reason and how to fix it.
            const d = err.response?.data || {};
            showToast([d.error, d.hint].filter(Boolean).join('\n\n') || 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => setFormData(savedValues(activeTab));

    // Fires a real alert through raise()/resolve() rather than calling the mail
    // service directly — a test that skips the plumbing only proves SMTP works.
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

    const handleNoPunchDrill = async () => {
        setDrilling(true);
        try {
            const res = await api.post('/api/settings/test-alert/no-punches');
            showToast(res.data.message || 'Drill sent', 'success');
        } catch (err) {
            showToast(err.response?.data?.error || 'Drill failed', 'error');
        } finally {
            setDrilling(false);
        }
    };

    const handleTestEmail = async () => {
        if (!testEmail) { showToast('Enter a recipient address first', 'warning'); return; }
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

    // Groups from the section definition; anything the server sends that no
    // group lists still appears under "Other", so nothing is silently hidden.
    const groups = useMemo(() => {
        if (!section || section.custom) return [];
        const available = Object.keys(settings[activeTab] || {}).filter(k => !(section.hidden || []).includes(k));
        const listed = new Set();
        const out = (section.groups || []).map(g => {
            const keys = g.keys.filter(k => available.includes(k));
            keys.forEach(k => listed.add(k));
            return { ...g, keys };
        }).filter(g => g.keys.length);
        const rest = available.filter(k => !listed.has(k));
        if (rest.length) out.push({ title: 'Other', keys: rest });
        return out;
    }, [section, settings, activeTab]);

    const renderField = (key) => {
        const config = settings[activeTab]?.[key] || {};
        const meta = section.fields?.[key] || {};
        const label = meta.label || defaultLabel(key);
        // Only curated help is shown. The stored descriptions mostly repeat
        // the label ("Company email: Contact email"), which is noise.
        const help = meta.help;
        const value = formData[key];
        const inert = (section.inert || []).includes(key);
        const id = `set-${key}`;
        const badge = inert ? <span className="ml-2 px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" title="Saved, but the server does not use it yet">Not applied yet</span> : null;
        const Help = help ? <p className={HELP}>{help}</p> : null;
        const Label = <label htmlFor={id} className={LABEL}>{label}{badge}</label>;
        // Long values take two columns (or the full row) so rows stay filled.
        const span = meta.wide ? 'col-span-full' : meta.span === 2 ? 'sm:col-span-2' : '';

        if (config.data_type === 'boolean') {
            return (
                <ToggleField key={key} id={id} label={label} badge={badge} help={help} className={span}
                    checked={isOn(value)} onChange={(v) => handleChange(key, v)} />
            );
        }

        // The logo is a picture, not a string.
        if (key === 'company_logo') {
            return (
                <div key={key} className="col-span-full">
                    <LogoUpload value={value || ''} onChange={(v) => handleChange(key, v)} />
                </div>
            );
        }

        // Shown, but not editable here: the destination picker lives in Backup
        // and tests the destination before saving.
        if (key === 'backup_external_path') {
            return (
                <div key={key} className={span || 'col-span-full'}>
                    {Label}
                    <input id={id} type="text" value={value || ''} readOnly disabled placeholder="Not set" className="field" />
                    <p className={HELP}>
                        Set it in <Link to="/database/backup" className="font-medium underline underline-offset-2">System › Backup</Link> under “Second copy” — Windows share, S3, SFTP or SharePoint — which tests the destination before saving.
                    </p>
                </div>
            );
        }

        if (meta.type === 'select' || key === 'system_timezone') {
            const options = key === 'system_timezone' ? TIMEZONES.map(t => [t, t]) : meta.options;
            return (
                <div key={key} className={span}>
                    {Label}
                    <select id={id} className="field" value={value ?? ''} onChange={(e) => handleChange(key, e.target.value)}>
                        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {Help}
                </div>
            );
        }

        // Several choices stored as a comma-separated list: one tile each.
        if (meta.type === 'multi') {
            const chosen = csv(value);
            // Sign-in methods carry the server's verdict on whether each works.
            const live = key === 'employee_login_modes' ? authStatus : null;
            return meta.options.map(([v, l]) => {
                const sel = chosen.includes(v);
                return (
                    <ToggleField key={`${key}-${v}`} id={`${id}-${v}`} label={l} help={meta.optionHelp?.[v]}
                        badge={live && <LiveBadge on={!!live[v]} chosen={sel} />} checked={sel}
                        onChange={() => handleChange(key, (sel ? chosen.filter(x => x !== v) : [...chosen, v]).join(','))} />
                );
            });
        }

        // An ordered list, drawn as the path a request takes. Stored
        // comma-separated.
        if (meta.type === 'order') {
            const order = csv(value);
            const names = Object.fromEntries(meta.options);
            const move = (i, d) => { const n = [...order]; [n[i], n[i + d]] = [n[i + d], n[i]]; handleChange(key, n.join(',')); };
            return (
                <div key={key} className="col-span-full">
                    <span className={LABEL}>{label}</span>
                    <ol className="grid gap-3 sm:grid-cols-3">
                        {order.map((v, i) => (
                            <li key={v} className="flex items-center gap-3 h-[52px] px-3.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                <span className="grid place-items-center w-6 h-6 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold tabular-nums">{i + 1}</span>
                                <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">{names[v] || v}</span>
                                <button type="button" aria-label={`Move ${names[v] || v} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"><ChevronLeft size={15} /></button>
                                <button type="button" aria-label={`Move ${names[v] || v} later`} disabled={i === order.length - 1} onClick={() => move(i, 1)} className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-800"><ChevronRight size={15} /></button>
                            </li>
                        ))}
                    </ol>
                    {Help}
                </div>
            );
        }

        // Days of the week, stored as a list.
        if (meta.type === 'days') {
            const chosen = asList(value).map(d => String(d).toLowerCase());
            const setDays = (next) => handleChange(key, Array.isArray(value) || config.data_type === 'json' ? next : next.join(','));
            return (
                <div key={key} className={span || 'col-span-full'}>
                    <span className={LABEL}>{label}</span>
                    <div className="flex flex-wrap gap-1.5">
                        {WEEKDAYS.map(d => {
                            const sel = chosen.includes(d.toLowerCase());
                            return (
                                <button key={d} type="button" aria-pressed={sel}
                                    onClick={() => setDays(sel ? asList(value).filter(x => String(x).toLowerCase() !== d.toLowerCase()) : [...asList(value), d])}
                                    className={`h-[43px] flex-1 min-w-[44px] max-w-[64px] rounded-lg text-[13px] font-medium border ${sel ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                    {d.slice(0, 3)}
                                </button>
                            );
                        })}
                    </div>
                    {Help}
                </div>
            );
        }

        // Times get a real time control: free text like "2 AM" never parses,
        // and a near-miss means a schedule silently never runs.
        if (/(^|_)time$/.test(key) && config.data_type !== 'number') {
            return (
                <div key={key} className={span}>
                    {Label}
                    <input id={id} type="time" className="field" value={String(value ?? '').slice(0, 5)} onChange={(e) => handleChange(key, e.target.value)} />
                    {Help}
                </div>
            );
        }

        if (config.data_type === 'number') {
            return (
                <div key={key} className={span}>
                    {Label}
                    <div className="relative">
                        <input id={id} type="number" className="field tabular-nums" value={value ?? ''}
                            style={meta.suffix ? { paddingRight: `${meta.suffix.length * 7 + 28}px` } : undefined}
                            onChange={(e) => handleChange(key, e.target.value === '' ? '' : parseFloat(e.target.value))} />
                        {meta.suffix && (
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-600 dark:text-slate-400 pointer-events-none">{meta.suffix}</span>
                        )}
                    </div>
                    {Help}
                </div>
            );
        }

        const isPassword = /password|api_key/.test(key);
        const isLong = meta.type === 'textarea' || /address|template/.test(key);
        if (config.data_type === 'json' && typeof value !== 'string') {
            return (
                <div key={key} className={span}>
                    {Label}
                    <input id={id} type="text" className="field" value={asList(value).join(', ')} placeholder={meta.placeholder}
                        onChange={(e) => handleChange(key, csv(e.target.value))} />
                    {Help}
                </div>
            );
        }
        return (
            <div key={key} className={isLong && !span ? 'col-span-full' : span}>
                {Label}
                {isLong ? (
                    <textarea id={id} rows={2} className="field resize-y" value={value ?? ''} placeholder={meta.placeholder} onChange={(e) => handleChange(key, e.target.value)} />
                ) : (
                    <input id={id} type={isPassword ? 'password' : meta.inputType || 'text'} className="field" value={value ?? ''} placeholder={meta.placeholder}
                        autoComplete={isPassword ? 'new-password' : 'off'} onChange={(e) => handleChange(key, e.target.value)} />
                )}
                {Help}
            </div>
        );
    };

    return (
        <ListPage
            title={section?.label || 'Settings'}
            actions={
                <Link to="/settings" className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[13px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200">
                    <ChevronLeft size={15} /> All settings
                </Link>
            }
            bodyClassName="flex flex-col !overflow-hidden"
        >
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {section?.description && (
                    <p className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[13px] text-slate-700 dark:text-slate-300">{section.description}</p>
                )}

                {loading ? (
                    <div className="px-4 sm:px-6 py-5 grid gap-5" style={FIELD_GRID}>
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Could not load settings</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="tonal" icon={RefreshCw} onClick={fetchSettings}>Try again</Button>
                    </div>
                ) : section?.custom ? (
                    // Appearance lives in this browser and applies immediately, so
                    // it has its own component and no Save.
                    <div className="px-4 sm:px-6 py-5"><ThemeSettings /></div>
                ) : (
                    <>
                        {activeTab === 'auth' && authStatus?.problems?.length > 0 && (
                            <div className="px-4 sm:px-6 py-3 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
                                <ul className="space-y-1">
                                    {authStatus.problems.map((prob, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[13px] text-amber-900 dark:text-amber-200"><AlertCircle size={14} className="mt-0.5 shrink-0" />{prob}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {groups.map((g, i) => (
                            <Group key={`${g.title}-${i}`} title={g.title} hint={g.hint}>
                                {g.keys.map(renderField)}
                            </Group>
                        ))}

                        {section?.test === 'email' && (
                            <Group title="Test delivery" hint="Save your mail server settings first, then send a test message.">
                                <div className="col-span-full flex gap-2 flex-wrap">
                                    <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                                        aria-label="Test recipient" placeholder="recipient@example.com" className="field flex-1 min-w-[220px] max-w-md" />
                                    <Button variant="tonal" icon={testingEmail ? Loader2 : Send} onClick={handleTestEmail} disabled={testingEmail}>
                                        {testingEmail ? 'Sending…' : 'Send test email'}
                                    </Button>
                                </div>
                            </Group>
                        )}

                        {section?.test === 'alerts' && (
                            <Group title="Test alerts" hint="Save first. These go to the recipients above through the same path a real alert takes.">
                                <Tile title="Send a test alert" help="Expect two messages: the alert, then confirmation it cleared.">
                                    <Button variant="tonal" size="toolbar" icon={BellRing} onClick={handleTestAlert} disabled={testingAlert}>{testingAlert ? 'Sending…' : 'Send test'}</Button>
                                </Tile>
                                <Tile title="Fire drill: no-attendance alert" help="Runs the real “no punches today” check with the verdict forced. Subject prefixed [DRILL].">
                                    <Button variant="tonal" size="toolbar" icon={BellRing} onClick={handleNoPunchDrill} disabled={drilling}>{drilling ? 'Firing…' : 'Run drill'}</Button>
                                </Tile>
                            </Group>
                        )}
                    </>
                )}
            </div>

            {/* Save bar: only while there are unsaved changes. */}
            {dirty && !section?.custom && (
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-app-surface shadow-[0_-4px_12px_rgb(15_23_42/0.06)]">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{dirtyKeys.length}</span> unsaved change{dirtyKeys.length === 1 ? '' : 's'}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button variant="tonal" size="toolbar" onClick={handleDiscard} disabled={saving}>Discard</Button>
                        <Button mutating variant="primary" size="toolbar" icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                    </div>
                </div>
            )}
        </ListPage>
    );
}
