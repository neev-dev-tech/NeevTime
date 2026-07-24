import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, LogOut, User, Briefcase, CheckCircle, XCircle,
    Plus, Send, Fingerprint
} from 'lucide-react';
import api from '../../api';
import useStore from '../../store/useStore';

const firstOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
};
const today = () => new Date().toISOString().split('T')[0];

export default function EmployeePortal() {
    const navigate = useNavigate();
    const { auth, logout } = useStore();
    const [tab, setTab] = useState('attendance');
    const [profile, setProfile] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [leave, setLeave] = useState({ applications: [], balances: [], types: [] });
    const [range, setRange] = useState({ start: firstOfMonth(), end: today() });
    const [showApply, setShowApply] = useState(false);
    const [form, setForm] = useState({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
    const [message, setMessage] = useState(null);

    useEffect(() => {
        api.get('/api/portal/me').then(res => setProfile(res.data)).catch(() => {});
        fetchLeave();
    }, []);

    useEffect(() => {
        api.get('/api/portal/attendance', { params: { start_date: range.start, end_date: range.end } })
            .then(res => setAttendance(res.data || []))
            .catch(() => {});
    }, [range]);

    const fetchLeave = () => {
        api.get('/api/portal/leave').then(res => setLeave(res.data)).catch(() => {});
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
            approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            rejected: 'bg-rose-50 text-rose-700 border-rose-200',
            pending: 'bg-amber-50 text-amber-700 border-amber-200'
        };
        return map[(status || 'pending').toLowerCase()] || map.pending;
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-100 rounded-lg text-orange-600"><Fingerprint size={18} /></div>
                        <span className="font-bold text-slate-800">My NeevTime</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 hidden sm:block">{profile?.name || auth?.name}</span>
                        <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-600 transition-colors" title="Logout">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
                {/* Profile card */}
                {profile && (
                    <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-lg">
                            {(profile.name || '?').charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate">{profile.name}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-2">
                                <span className="font-mono">{profile.employee_code}</span>
                                {profile.department && <span className="flex items-center gap-1"><Briefcase size={11} />{profile.department}</span>}
                            </p>
                        </div>
                        <div className="text-right hidden sm:block">
                            <p className="text-lg font-bold text-slate-800">{presentDays}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Days present</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-slate-800">{Math.floor(totalMinutes / 60)}h</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Hours worked</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex bg-white rounded-lg border p-1 gap-1">
                    <button
                        onClick={() => setTab('attendance')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'attendance' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Clock size={15} /> My Attendance
                    </button>
                    <button
                        onClick={() => setTab('leave')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'leave' ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Calendar size={15} /> My Leave
                    </button>
                </div>

                {message && (
                    <div className={`text-sm rounded-lg px-3 py-2 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        {message.text}
                    </div>
                )}

                {tab === 'attendance' && (
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-4 py-3 border-b flex items-center gap-2 flex-wrap">
                            <input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} className="text-sm border rounded-md px-2 py-1" />
                            <span className="text-slate-300">→</span>
                            <input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} className="text-sm border rounded-md px-2 py-1" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-4 py-2">Date</th>
                                        <th className="px-4 py-2">In</th>
                                        <th className="px-4 py-2">Out</th>
                                        <th className="px-4 py-2">Hours</th>
                                        <th className="px-4 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {attendance.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No records in this range</td></tr>
                                    ) : attendance.map((row, i) => (
                                        <tr key={i}>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <span className="font-medium text-slate-700">{row.date}</span>
                                                <span className="text-xs text-slate-400 ml-1">{(row.weekday || '').trim().slice(0, 3)}</span>
                                            </td>
                                            <td className="px-4 py-2 font-mono text-xs">{row.in_time || '-'}</td>
                                            <td className="px-4 py-2 font-mono text-xs">{row.out_time || '-'}</td>
                                            <td className="px-4 py-2">{row.duration_minutes != null ? (row.duration_minutes / 60).toFixed(1) : '-'}</td>
                                            <td className="px-4 py-2">
                                                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${row.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                    {row.status === 'Present' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                                    {row.status || '-'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === 'leave' && (
                    <div className="space-y-4">
                        {/* Balances */}
                        {leave.balances.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {leave.balances.map(b => (
                                    <div key={b.id} className="bg-white rounded-xl border p-3">
                                        <p className="text-xs text-slate-500 truncate">{b.leave_type_name}</p>
                                        <p className="text-xl font-bold text-slate-800">{b.balance}<span className="text-xs text-slate-400 font-normal"> left</span></p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setShowApply(v => !v)}
                            className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg transition-colors"
                        >
                            <Plus size={16} /> Apply for Leave
                        </button>

                        {showApply && (
                            <form onSubmit={applyLeave} className="bg-white rounded-xl border p-4 space-y-3">
                                <select
                                    value={form.leave_type_id}
                                    onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}
                                    className="w-full text-sm border rounded-lg px-3 py-2"
                                    required
                                >
                                    <option value="">Select leave type</option>
                                    {leave.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <div className="flex gap-2">
                                    <input type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} className="flex-1 text-sm border rounded-lg px-3 py-2" required />
                                    <input type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} className="flex-1 text-sm border rounded-lg px-3 py-2" required />
                                </div>
                                <textarea
                                    value={form.reason}
                                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                    placeholder="Reason (optional)"
                                    rows={2}
                                    className="w-full text-sm border rounded-lg px-3 py-2"
                                />
                                <button type="submit" className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-2 rounded-lg transition-colors">
                                    <Send size={14} /> Submit
                                </button>
                            </form>
                        )}

                        {/* Applications */}
                        <div className="bg-white rounded-xl border divide-y">
                            {leave.applications.length === 0 ? (
                                <p className="px-4 py-8 text-center text-slate-400 text-sm">No leave applications yet</p>
                            ) : leave.applications.map(app => (
                                <div key={app.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-700 truncate">{app.leave_type_name}</p>
                                        <p className="text-xs text-slate-500">
                                            {String(app.from_date).split('T')[0]} → {String(app.to_date).split('T')[0]} · {app.total_days} day{app.total_days > 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full border capitalize ${statusBadge(app.status)}`}>
                                        {app.status || 'pending'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
