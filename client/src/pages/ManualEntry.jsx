import React, { useState, useEffect } from 'react';
import api from '../api';
import { ClipboardEdit, Search, Calendar, Clock, User, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';
import { toLocalDateString } from '../utils/dateFormat';

// YYYY-MM-DD of the following day, computed on the calendar date alone so no
// timezone can shift it.
function nextDay(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return t.toISOString().slice(0, 10);
}

export default function ManualEntry() {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [form, setForm] = useState({
        date: toLocalDateString(),
        in_time: '09:00',
        out_time: '18:00',
        reason: ''
    });
    // Which side of the day is being corrected. A missed OUT is the usual
    // case; the device already recorded the IN, so only OUT is sent.
    const [mode, setMode] = useState('both');
    const [outNextDay, setOutNextDay] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => { fetchEmployees(); }, []);

    const fetchEmployees = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/employees');
            setEmployees(res.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load employees');
        } finally {
            setLoading(false);
        }
    };

    const filteredEmployees = employees.filter(e =>
        e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEmployee) return toast.warning('Select an employee');
        if (!form.reason.trim()) return toast.warning('Reason is required');
        if (mode === 'both' && !outNextDay && form.out_time <= form.in_time) {
            return toast.warning('OUT is before IN. Tick "OUT is next day" for a night shift.');
        }

        const outDate = outNextDay ? nextDay(form.date) : form.date;
        setSubmitting(true);
        try {
            await api.post('/api/attendance/manual', {
                employee_code: selectedEmployee.employee_code,
                date: form.date,
                in_time: mode !== 'out' ? `${form.date} ${form.in_time}:00` : null,
                out_time: mode !== 'in' ? `${outDate} ${form.out_time}:00` : null,
                reason: form.reason
            });
            const what = mode === 'in' ? 'IN time' : mode === 'out' ? 'OUT time' : 'IN and OUT';
            setResult({ success: true, message: `${what} saved for ${selectedEmployee.name || selectedEmployee.employee_code} on ${form.date}` });
            setForm({ date: toLocalDateString(), in_time: '09:00', out_time: '18:00', reason: '' });
            setOutNextDay(false);
            setSelectedEmployee(null);
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Failed to add' });
        }
        setSubmitting(false);
    };

    const fieldClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-app-surface text-sm text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 pl-10 pr-4 py-2 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500';
    const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5';
    const MODES = [
        { key: 'both', label: 'IN and OUT' },
        { key: 'in', label: 'IN only' },
        { key: 'out', label: 'OUT only' }
    ];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <PageHeader
                icon={ClipboardEdit}
                title="Manual Attendance Entry"
                subtitle="Add a missed punch record for an employee"
            />

            {result && (
                <div className={`p-4 rounded-2xl border flex items-center gap-3 text-sm ${result.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-300'}`}>
                    {result.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span className="font-semibold">{result.message}</span>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 flex items-center gap-3 flex-wrap">
                    <AlertCircle size={20} className="text-rose-500 dark:text-rose-400" />
                    <div className="min-w-0">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">Could not load employees</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
                    </div>
                    <div className="ml-auto">
                        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchEmployees}>Try again</Button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="card-base space-y-6">
                {/* Employee Search */}
                <div>
                    <label htmlFor="me-employee" className={labelClass}>Employee *</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                        <input
                            id="me-employee"
                            type="text"
                            autoComplete="off"
                            placeholder="Search by name or code…"
                            className={fieldClass}
                            value={selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employee_code})` : searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setSelectedEmployee(null); }}
                            onFocus={() => setSelectedEmployee(null)}
                        />
                    </div>
                    {!selectedEmployee && searchTerm && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl mt-1.5 max-h-40 overflow-auto bg-app-surface shadow-lg divide-y divide-slate-100 dark:divide-slate-700">
                            {loading ? (
                                <div className="p-3 space-y-2">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="h-6 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                    ))}
                                </div>
                            ) : filteredEmployees.length === 0 ? (
                                <div className="p-4 text-center">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">No matching employees</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Nothing matches “{searchTerm}”. Try a different name or code.
                                    </p>
                                </div>
                            ) : filteredEmployees.slice(0, 8).map(emp => (
                                <button key={emp.id} type="button" onClick={() => { setSelectedEmployee(emp); setSearchTerm(''); }}
                                    className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-2">
                                    <User size={16} className="text-slate-400 dark:text-slate-500" />
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">{emp.name || '—'}</span>
                                    <span className="ml-auto font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                                        {emp.employee_code || '—'}
                                    </span>
                                </button>
                            ))}
                            {!loading && filteredEmployees.length > 8 && (
                                <p className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                                    {filteredEmployees.length - 8} more — keep typing to narrow down
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* What is being corrected */}
                <fieldset>
                    <legend className={labelClass}>Correct</legend>
                    <div role="radiogroup" className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800 gap-1">
                        {MODES.map(m => (
                            <button
                                key={m.key}
                                type="button"
                                role="radio"
                                aria-checked={mode === m.key}
                                onClick={() => setMode(m.key)}
                                className={`px-3 h-8 rounded-md text-sm font-medium transition-colors ${mode === m.key
                                    ? 'bg-app-surface text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {mode === 'both'
                            ? 'Replaces both times for the day.'
                            : `Keeps the ${mode === 'in' ? 'OUT' : 'IN'} already recorded for the day and sets only the ${mode === 'in' ? 'IN' : 'OUT'}.`}
                    </p>
                </fieldset>

                {/* Date */}
                <div>
                    <label htmlFor="me-date" className={labelClass}>Date *</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                        <input id="me-date" type="date" className={`${fieldClass} tabular-nums`} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                    </div>
                </div>

                {/* Time */}
                <div className={`grid gap-4 ${mode === 'both' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {mode !== 'out' && (
                        <div>
                            <label htmlFor="me-in" className={labelClass}>IN time *</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                                <input id="me-in" type="time" className={`${fieldClass} tabular-nums`} value={form.in_time} onChange={e => setForm({ ...form, in_time: e.target.value })} required />
                            </div>
                        </div>
                    )}
                    {mode !== 'in' && (
                        <div>
                            <label htmlFor="me-out" className={labelClass}>OUT time *</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                                <input id="me-out" type="time" className={`${fieldClass} tabular-nums`} value={form.out_time} onChange={e => setForm({ ...form, out_time: e.target.value })} required />
                            </div>
                            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={outNextDay} onChange={e => setOutNextDay(e.target.checked)} className="rounded border-slate-300" />
                                OUT is next day (night shift)
                            </label>
                        </div>
                    )}
                </div>

                {/* Reason */}
                <div>
                    <label htmlFor="me-reason" className={labelClass}>Reason *</label>
                    <textarea
                        id="me-reason"
                        className="field"
                        rows={3}
                        placeholder="Reason for manual entry..."
                        value={form.reason}
                        onChange={e => setForm({ ...form, reason: e.target.value })}
                        required
                    />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                    A corrected day is locked: device punches that arrive later for this date won't change it. Use OUT only to add the out-time afterwards.
                </p>

                <Button type="submit" size="lg" disabled={submitting || !selectedEmployee} className="w-full">
                    {submitting ? 'Submitting...' : 'Submit Manual Entry'}
                </Button>
            </form>
        </div>
    );
}
