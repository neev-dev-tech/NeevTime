import React, { useState, useEffect } from 'react';
import api from '../api';
import { ClipboardEdit, Search, Calendar, Clock, User, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ManualEntry() {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        in_time: '09:00',
        out_time: '18:00',
        reason: ''
    });
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

        setSubmitting(true);
        try {
            await api.post('/api/attendance/manual', {
                employee_code: selectedEmployee.employee_code,
                date: form.date,
                in_time: `${form.date} ${form.in_time}:00`,
                out_time: `${form.date} ${form.out_time}:00`,
                reason: form.reason
            });
            setResult({ success: true, message: 'Manual attendance added successfully' });
            setForm({ date: new Date().toISOString().split('T')[0], in_time: '09:00', out_time: '18:00', reason: '' });
            setSelectedEmployee(null);
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Failed to add' });
        }
        setSubmitting(false);
    };

    const fieldClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 pl-10 pr-4 py-2 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500';
    const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-2';

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
                    <label className={labelClass}>Select Employee *</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            className={fieldClass}
                            value={selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employee_code})` : searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setSelectedEmployee(null); }}
                            onFocus={() => setSelectedEmployee(null)}
                        />
                    </div>
                    {!selectedEmployee && searchTerm && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl mt-1.5 max-h-40 overflow-auto bg-white dark:bg-slate-800 shadow-lg divide-y divide-slate-100 dark:divide-slate-700">
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
                            ) : filteredEmployees.slice(0, 5).map(emp => (
                                <button key={emp.id} type="button" onClick={() => { setSelectedEmployee(emp); setSearchTerm(''); }}
                                    className="w-full text-left px-4 py-2 hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors flex items-center gap-2">
                                    <User size={16} className="text-slate-400 dark:text-slate-500" />
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">{emp.name || '—'}</span>
                                    <span className="ml-auto font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                        {emp.employee_code || '—'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Date */}
                <div>
                    <label className={labelClass}>Date *</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                        <input type="date" className={`${fieldClass} tabular-nums`} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                    </div>
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>In Time *</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                            <input type="time" className={`${fieldClass} tabular-nums`} value={form.in_time} onChange={e => setForm({ ...form, in_time: e.target.value })} required />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Out Time *</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                            <input type="time" className={`${fieldClass} tabular-nums`} value={form.out_time} onChange={e => setForm({ ...form, out_time: e.target.value })} required />
                        </div>
                    </div>
                </div>

                {/* Reason */}
                <div>
                    <label className={labelClass}>Reason *</label>
                    <textarea
                        className="field"
                        rows={3}
                        placeholder="Reason for manual entry..."
                        value={form.reason}
                        onChange={e => setForm({ ...form, reason: e.target.value })}
                        required
                    />
                </div>

                <Button type="submit" size="lg" disabled={submitting || !selectedEmployee} className="w-full">
                    {submitting ? 'Submitting...' : 'Submit Manual Entry'}
                </Button>
            </form>
        </div>
    );
}
