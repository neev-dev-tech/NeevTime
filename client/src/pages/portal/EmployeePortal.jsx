import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, LogOut, User, Briefcase, CheckCircle, XCircle,
    Plus, Send, Fingerprint, AlertCircle, RefreshCw, Inbox, Download, CalendarDays, CheckSquare
} from 'lucide-react';
import api from '../../api';
import PunchCard from './PunchCard';
import useStore from '../../store/useStore';
import { Button } from '../../components';
import { toLocalDateString, formatDate, formatDateWithWeekday } from '../../utils/dateFormat';

const firstOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
};
const today = () => toLocalDateString();

const TABS = [
    { id: 'attendance', label: 'My Attendance', icon: Clock },
    { id: 'leave', label: 'My Leave', icon: Calendar },
    { id: 'requests', label: 'Requests', icon: Send },
    // The two questions HR is asked most often, and the system already knows
    // both answers.
    // Shown only to people who approve for somebody — see the filter below.
    { id: 'approvals', label: 'Approvals', icon: CheckSquare },
    { id: 'schedule', label: 'Shift & Holidays', icon: CalendarDays },
    { id: 'profile', label: 'My Profile', icon: User }
];

const ListSkeleton = ({ rows = 5 }) => (
    <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
        ))}
    </div>
);

const LoadError = ({ message, onRetry }) => (
    <div className="py-12 text-center">
        <AlertCircle size={36} className="mx-auto mb-3 text-rose-400" />
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Something went wrong</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{message}</p>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>Try again</Button>
    </div>
);

const EmptyRow = ({ icon: Icon = Inbox, title, hint }) => (
    <div className="py-12 text-center">
        <Icon size={36} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</h3>
        {hint && <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
);

const RowCount = ({ n, noun }) => (
    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
        {n} {noun}{n === 1 ? '' : 's'}
    </div>
);

export default function EmployeePortal() {
    const navigate = useNavigate();
    const { auth, logout } = useStore();
    const [tab, setTab] = useState('attendance');
    const [schedule, setSchedule] = useState(null);
    const [approvals, setApprovals] = useState(null);
    const [deciding, setDeciding] = useState(null);
    // Distinct from `profile` above, which holds the small /me payload used by
    // the header. This is the full record for the My Profile tab.
    const [profileDetail, setProfileDetail] = useState(null);
    const [downloading, setDownloading] = useState(false);

    /**
     * Download this month's attendance.
     *
     * Fetched rather than linked, for the same reason the punch photos are: an
     * anchor sends no Authorization header, and this route is authenticated
     * because it is somebody's attendance record.
     */
    const loadApprovals = async () => {
        try {
            const res = await api.get('/api/portal/approvals');
            setApprovals(res.data);
        } catch {
            setApprovals({ leaves: [], regularizations: [], is_approver: false });
        }
    };

    // Fetched once on load, not only when the tab opens: the tab itself is
    // hidden for the many employees who approve for nobody, and a tab that
    // exists to say "nothing here" teaches people to stop opening it.
    useEffect(() => { loadApprovals(); }, []);

    const decide = async (item, decision) => {
        setDeciding(item.type + item.id);
        try {
            await api.post(`/api/portal/approvals/${item.type}/${item.id}`, { decision });
            await loadApprovals();
        } catch (err) {
            // 409 means somebody else got there first, which is normal when two
            // approvers share a queue and worth saying rather than swallowing.
            alert(err.response?.data?.error || 'Could not record that decision');
            await loadApprovals();
        } finally {
            setDeciding(null);
        }
    };

    const downloadMonth = async () => {
        setDownloading(true);
        try {
            const month = new Date().toISOString().slice(0, 7);
            const res = await api.get(`/api/portal/attendance/export?month=${month}`,
                { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `my-attendance-${month}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            /* the button simply does nothing rather than throwing a stack at someone */
        } finally {
            setDownloading(false);
        }
    };
    const [profile, setProfile] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [leave, setLeave] = useState({ applications: [], balances: [], types: [] });
    const [range, setRange] = useState({ start: firstOfMonth(), end: today() });
    const [showApply, setShowApply] = useState(false);
    const [form, setForm] = useState({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
    const [message, setMessage] = useState(null);
    const [regularizations, setRegularizations] = useState([]);
    const [showRegForm, setShowRegForm] = useState(false);
    const [regForm, setRegForm] = useState({ date: '', requested_in_time: '', requested_out_time: '', reason: '' });
    const [loading, setLoading] = useState({ attendance: true, leave: true, requests: false });
    const [loadError, setLoadError] = useState({ attendance: null, leave: null, requests: null });

    useEffect(() => {
        api.get('/api/portal/me').then(res => setProfile(res.data)).catch(() => {});
        fetchLeave();
    }, []);

    const fetchAttendance = () => {
        setLoading(l => ({ ...l, attendance: true }));
        setLoadError(e => ({ ...e, attendance: null }));
        api.get('/api/portal/attendance', { params: { start_date: range.start, end_date: range.end } })
            .then(res => setAttendance(res.data || []))
            .catch(err => setLoadError(e => ({ ...e, attendance: err.response?.data?.error || 'Could not load attendance' })))
            .finally(() => setLoading(l => ({ ...l, attendance: false })));
    };

    useEffect(() => { fetchAttendance(); }, [range]);

    const fetchLeave = () => {
        setLoading(l => ({ ...l, leave: true }));
        setLoadError(e => ({ ...e, leave: null }));
        api.get('/api/portal/leave')
            .then(res => setLeave(res.data))
            .catch(err => setLoadError(e => ({ ...e, leave: err.response?.data?.error || 'Could not load leave' })))
            .finally(() => setLoading(l => ({ ...l, leave: false })));
    };

    const fetchRegularizations = () => {
        setLoading(l => ({ ...l, requests: true }));
        setLoadError(e => ({ ...e, requests: null }));
        api.get('/api/portal/regularizations')
            .then(res => setRegularizations(res.data || []))
            .catch(err => setLoadError(e => ({ ...e, requests: err.response?.data?.error || 'Could not load requests' })))
            .finally(() => setLoading(l => ({ ...l, requests: false })));
    };

    useEffect(() => {
        if (tab === 'requests') fetchRegularizations();
        if (tab === 'approvals') loadApprovals();
        if (tab === 'schedule' && !schedule) {
            api.get('/api/portal/schedule').then(r => setSchedule(r.data)).catch(() => setSchedule({ shift: null, holidays: [] }));
        }
        if (tab === 'profile' && !profileDetail) {
            api.get('/api/portal/profile').then(r => setProfileDetail(r.data)).catch(() => {});
        }
    }, [tab]);

    const submitRegularization = async (e) => {
        e.preventDefault();
        setMessage(null);
        try {
            await api.post('/api/portal/regularizations', regForm);
            setShowRegForm(false);
            setRegForm({ date: '', requested_in_time: '', requested_out_time: '', reason: '' });
            setMessage({ type: 'success', text: 'Regularization request submitted' });
            fetchRegularizations();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to submit request' });
        }
    };

    const applyLeave = async (e) => {
        e.preventDefault();
        setMessage(null);
        try {
            await api.post('/api/portal/leave', form);
            setShowApply(false);
            setForm({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
            setMessage({ type: 'success', text: 'Leave application submitted' });
            fetchLeave();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to apply' });
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/portal/login');
    };

    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const totalMinutes = attendance.reduce((s, a) => s + (a.duration_minutes || 0), 0);

    const statusBadge = (status) => {
        const map = {
            approved: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
            rejected: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
            pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        };
        return map[(status || 'pending').toLowerCase()] || map.pending;
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <header className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-300"><Fingerprint size={18} /></div>
                        <span className="font-bold text-slate-800 dark:text-slate-100">My NeevTime</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">{profile?.name || auth?.name}</span>
                        <Button variant="ghost" size="sm" icon={LogOut} iconSize={18} onClick={handleLogout} title="Logout" />
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
                {/* Profile card */}
                {profile && (
                    <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                            {/* Optional chaining throughout this card: it renders
                                on every tab, so a null here takes the entire
                                portal down rather than one panel. */}
                            {(profile?.name || '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{profile?.name || '—'}</p>
                            <p className="text-xs flex items-center gap-2">
                                <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                    {profile?.employee_code || '—'}
                                </span>
                                {profile?.department && (
                                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                        <Briefcase size={11} />{profile?.department}
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="text-right hidden sm:block">
                            <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{presentDays}</p>
                            <p className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Days present</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{Math.floor(totalMinutes / 60)}h</p>
                            <p className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Hours worked</p>
                        </div>
                    </div>
                )}

                {/* Tabs — pill segmented control */}
                {/* Scrolls within itself on a phone. Six tabs no longer fit
                    375px — the bar used to widen the PAGE, so the whole portal
                    scrolled sideways and two tabs hung outside the card. The
                    portal's primary device is a phone; the punch card cannot
                    depend on nobody noticing a horizontal scrollbar. */}
                <div className="flex overflow-x-auto bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-1 gap-1">
                    {TABS.filter(t => t.id !== 'approvals' || approvals?.is_approver)
                          .map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            aria-pressed={tab === id}
                            className={`shrink-0 sm:flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${tab === id
                                ? 'bg-orange-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-orange-50/60 dark:hover:bg-slate-700/40 hover:text-orange-600 dark:hover:text-orange-400'
                                }`}
                        >
                            <Icon size={15} /> {label}
                        </button>
                    ))}
                </div>

                {message && (
                    <div className={`text-sm rounded-lg px-3 py-2 border ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'}`}>
                        {message.text}
                    </div>
                )}

                {tab === 'attendance' && (
                    <div className="space-y-4">
                    {/* Punching comes before the history. Someone opening this
                        on a phone at the gate is here to clock in, not to read
                        last week — and asking them to scroll past a month of
                        records to reach the one button they came for is how a
                        feature goes unused. */}
                    <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-1">
                        <PunchCard />
                    </div>

                    <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
                            <input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} className="field-sm tabular-nums" />
                            <span className="text-slate-400">→</span>
                            <input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} className="field-sm tabular-nums" />
                        </div>

                        {loading.attendance ? (
                            <ListSkeleton rows={6} />
                        ) : loadError.attendance ? (
                            <LoadError message={loadError.attendance} onRetry={fetchAttendance} />
                        ) : attendance.length === 0 ? (
                            <EmptyRow
                                icon={Clock}
                                title="No records in this range"
                                hint={`Nothing between ${range.start} and ${range.end}.`}
                            />
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                            <tr>
                                                <th className="px-4 py-3 font-bold whitespace-nowrap">Date</th>
                                                <th className="px-4 py-3 font-bold whitespace-nowrap">In</th>
                                                <th className="px-4 py-3 font-bold whitespace-nowrap">Out</th>
                                                <th className="px-4 py-3 font-bold whitespace-nowrap">Hours</th>
                                                <th className="px-4 py-3 font-bold whitespace-nowrap">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {attendance.map((row, i) => (
                                                <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{row.date || '—'}</span>
                                                        <span className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 ml-1.5">
                                                            {(row.weekday || '').trim().slice(0, 3)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">{row.in_time || '—'}</td>
                                                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">{row.out_time || '—'}</td>
                                                    <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                                                        {row.duration_minutes != null ? (row.duration_minutes / 60).toFixed(1) : '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${row.status === 'Present' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                                            {row.status === 'Present' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                                            {row.status || '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <RowCount n={attendance.length} noun="day" />
                            </>
                        )}
                    </div>
                    </div>
                )}

                {tab === 'leave' && (
                    <div className="space-y-4">
                        {/* Balances */}
                        {leave.balances.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {leave.balances.map(b => (
                                    <div key={b.id} className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 truncate">{b.leave_type_name}</p>
                                        <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                                            {b.balance}<span className="text-xs text-slate-500 dark:text-slate-400 font-normal"> left</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Button
                            variant="successSolid"
                            size="lg"
                            icon={Plus}
                            className="w-full"
                            onClick={() => setShowApply(v => !v)}
                        >
                            Apply for Leave
                        </Button>

                        {showApply && (
                            <form onSubmit={applyLeave} className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                                <select
                                    value={form.leave_type_id}
                                    onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}
                                    className="field"
                                    required
                                >
                                    <option value="">Select leave type</option>
                                    {leave.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <div className="flex gap-2">
                                    <input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} className="field flex-1" required />
                                    <input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} className="field flex-1" required />
                                </div>
                                <textarea
                                    value={form.reason}
                                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                    placeholder="Reason (optional)"
                                    rows={2}
                                    className="field"
                                />
                                <Button type="submit" variant="primary" icon={Send} iconSize={14} className="w-full">
                                    Submit
                                </Button>
                            </form>
                        )}

                        {/* Applications */}
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            {loading.leave ? (
                                <ListSkeleton rows={4} />
                            ) : loadError.leave ? (
                                <LoadError message={loadError.leave} onRetry={fetchLeave} />
                            ) : leave.applications.length === 0 ? (
                                <EmptyRow
                                    icon={Calendar}
                                    title="No leave applications yet"
                                    hint="Anything you apply for will appear here."
                                />
                            ) : (
                                <>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {leave.applications.map(app => (
                                            <div key={app.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{app.leave_type_name || '—'}</p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                                                        {String(app.from_date).split('T')[0]} → {String(app.to_date).split('T')[0]} · {app.total_days} day{app.total_days > 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${statusBadge(app.status)}`}>
                                                    {app.status || 'pending'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <RowCount n={leave.applications.length} noun="application" />
                                </>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'requests' && (
                    <div className="space-y-4">
                        <Button
                            variant="successSolid"
                            size="lg"
                            icon={Plus}
                            className="w-full"
                            onClick={() => setShowRegForm(v => !v)}
                        >
                            Request Attendance Correction
                        </Button>

                        {showRegForm && (
                            <form onSubmit={submitRegularization} className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date</label>
                                    <input type="date" value={regForm.date} max={today()} onChange={e => setRegForm(f => ({ ...f, date: e.target.value }))} className="field" required />
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Correct In Time</label>
                                        <input type="time" value={regForm.requested_in_time} onChange={e => setRegForm(f => ({ ...f, requested_in_time: e.target.value }))} className="field" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Correct Out Time</label>
                                        <input type="time" value={regForm.requested_out_time} onChange={e => setRegForm(f => ({ ...f, requested_out_time: e.target.value }))} className="field" />
                                    </div>
                                </div>
                                <textarea
                                    value={regForm.reason}
                                    onChange={e => setRegForm(f => ({ ...f, reason: e.target.value }))}
                                    placeholder="Reason (e.g. forgot to punch out)"
                                    rows={2}
                                    className="field"
                                    required
                                />
                                <Button type="submit" variant="primary" icon={Send} iconSize={14} className="w-full">
                                    Submit Request
                                </Button>
                            </form>
                        )}

                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            {loading.requests ? (
                                <ListSkeleton rows={4} />
                            ) : loadError.requests ? (
                                <LoadError message={loadError.requests} onRetry={fetchRegularizations} />
                            ) : regularizations.length === 0 ? (
                                <EmptyRow
                                    icon={Send}
                                    title="No correction requests yet"
                                    hint="Requests you raise will show up here with their status."
                                />
                            ) : (
                                <>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {regularizations.map(reg => (
                                            <div key={reg.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{reg.date || '—'}</p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                                        {reg.requested_in_time && <span className="font-mono tabular-nums">In {reg.requested_in_time}</span>}
                                                        {reg.requested_in_time && reg.requested_out_time && ' · '}
                                                        {reg.requested_out_time && <span className="font-mono tabular-nums">Out {reg.requested_out_time}</span>}
                                                        {' — '}{reg.reason || '—'}
                                                    </p>
                                                    {reg.review_comment && (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">"{reg.review_comment}"</p>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border ${statusBadge(reg.status)}`}>
                                                    {reg.status || 'pending'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <RowCount n={regularizations.length} noun="request" />
                                </>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'approvals' && (
                    <div className="space-y-4">
                        {!approvals ? (
                            <ListSkeleton rows={3} />
                        ) : (approvals.leaves.length + approvals.regularizations.length) === 0 ? (
                            <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700">
                                <EmptyRow icon={CheckSquare} title="Nothing waiting on you"
                                          hint="Leave and correction requests from your team appear here." />
                            </div>
                        ) : (
                            [...approvals.leaves, ...approvals.regularizations].map(item => (
                                <div key={`${item.type}-${item.id}`}
                                     className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-800 dark:text-slate-100">
                                                {item.employee_name}
                                                <span className="ml-2 font-mono text-xs text-slate-500">{item.employee_code}</span>
                                            </p>
                                            {item.type === 'leave' ? (
                                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                                    {item.leave_type} · {formatDate(item.start_date)} – {formatDate(item.end_date)}
                                                    {item.days ? ` · ${item.days} day(s)` : ''}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                                    Correction for {formatDate(item.date)}
                                                    {item.requested_in_time && ` · in ${String(item.requested_in_time).slice(0, 5)}`}
                                                    {item.requested_out_time && ` · out ${String(item.requested_out_time).slice(0, 5)}`}
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.reason || 'No reason given'}</p>
                                            {/* Which hat they are wearing. Somebody who
                                                is both a manager and a department
                                                approver should know which one this is. */}
                                            <span className="mt-2 inline-block text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-500">
                                                as {item.via}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button variant="secondary" onClick={() => decide(item, 'rejected')}
                                                    disabled={deciding === item.type + item.id}>
                                                Reject
                                            </Button>
                                            <Button variant="primary" onClick={() => decide(item, 'approved')}
                                                    disabled={deciding === item.type + item.id}>
                                                Approve
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {tab === 'schedule' && (
                    <div className="space-y-4">
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">My shift</h3>
                            {!schedule ? (
                                <div className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                            ) : schedule.shift ? (
                                <>
                                    <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{schedule.shift.name}</p>
                                    <p className="text-sm font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                        {String(schedule.shift.start_time).slice(0, 5)} – {String(schedule.shift.end_time).slice(0, 5)}
                                    </p>
                                </>
                            ) : (
                                /* Said, not hidden. Somebody with no shift assigned is
                                   measured against the default rules, and should know
                                   rather than assume the page is broken. */
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    No shift is assigned to you. Your hours are measured against the
                                    company default — ask HR if that is not right.
                                </p>
                            )}
                        </div>

                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-4 pt-4 pb-2">Holidays</h3>
                            {!schedule ? (
                                <ListSkeleton rows={3} />
                            ) : schedule.holidays.length === 0 ? (
                                <EmptyRow icon={CalendarDays} title="No holidays listed"
                                          hint="Once HR publishes the holiday list it appears here." />
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {schedule.holidays.map((h, i) => {
                                        const past = new Date(h.date) < new Date(new Date().toDateString());
                                        return (
                                            <div key={i} className={`px-4 py-3 flex items-center justify-between gap-3 ${past ? 'opacity-50' : ''}`}>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{h.name}</p>
                                                    <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                                        {formatDateWithWeekday(h.date)}
                                                    </p>
                                                </div>
                                                {h.is_optional && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600 text-slate-500">
                                                        Optional
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'profile' && (
                    <div className="space-y-4">
                        <div className="bg-white/70 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                            {!profileDetail ? (
                                <ListSkeleton rows={5} />
                            ) : (
                                <dl className="space-y-2 text-sm">
                                    {[
                                        ['Employee code', profileDetail.employee_code],
                                        ['Name', profileDetail.name],
                                        ['Department', profileDetail.department],
                                        ['Designation', profileDetail.designation],
                                        ['Area', profileDetail.area],
                                        ['Employment type', profileDetail.employment_type],
                                        ['Joined', profileDetail.joining_date && formatDate(profileDetail.joining_date)],
                                        ['Mobile', profileDetail.mobile],
                                        ['Email', profileDetail.email],
                                        ['Address', profileDetail.address],
                                    ].map(([label, value]) => (
                                        <div key={label} className="grid grid-cols-3 gap-2 border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0">
                                            <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                                            <dd className="col-span-2 text-slate-700 dark:text-slate-200">{value || '—'}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            {/* Read-only, and it says why. Joining date and department
                                decide leave accrual and who approves requests; an
                                employee editing them is an audit problem. */}
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Something wrong here? Ask HR to correct it — these fields decide your
                                leave and your shift, so they are not editable from this page.
                            </p>
                        </div>

                        <Button variant="secondary" icon={Download} onClick={downloadMonth}
                                disabled={downloading} className="w-full">
                            {downloading ? 'Preparing...' : 'Download this month\'s attendance'}
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
}
