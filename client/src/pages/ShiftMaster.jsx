import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Edit2, Trash2, Clock, Sun, Moon, X, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function ShiftMaster() {
    const toast = useToast();
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [form, setForm] = useState({
        name: '', start_time: '09:00', end_time: '18:00', shift_type: 'Fixed',
        grace_in_minutes: 15, late_threshold_minutes: 15, break_duration_minutes: 60, is_night_shift: false
    });

    useEffect(() => { fetchShifts(); }, []);

    const fetchShifts = async () => {
        try {
            setError(null);
            const res = await api.get('/api/shifts');
            setShifts(res.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load shifts');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingShift) {
                await api.put(`/api/shifts/${editingShift.id}`, form);
            } else {
                await api.post('/api/shifts', form);
            }
            setShowModal(false);
            setEditingShift(null);
            setForm({ name: '', start_time: '09:00', end_time: '18:00', shift_type: 'Fixed', grace_in_minutes: 15, late_threshold_minutes: 15, break_duration_minutes: 60, is_night_shift: false });
            fetchShifts();
        } catch (err) { toast.error('Failed to save shift'); }
    };

    const handleEdit = (shift) => {
        setEditingShift(shift);
        setForm({
            name: shift.name,
            start_time: shift.start_time?.substring(0, 5) || '09:00',
            end_time: shift.end_time?.substring(0, 5) || '18:00',
            shift_type: shift.shift_type || 'Fixed',
            grace_in_minutes: shift.grace_in_minutes || 0,
            late_threshold_minutes: shift.late_threshold_minutes || 15,
            break_duration_minutes: shift.break_duration_minutes || 0,
            is_night_shift: shift.is_night_shift || false,
            is_active: shift.is_active !== false
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this shift?')) return;
        try {
            await api.delete(`/api/shifts/${id}`);
            fetchShifts();
        } catch (err) { toast.error('Delete failed'); }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Clock}
                title="Shift Master"
                subtitle="Working-hour patterns employees and departments can be assigned to"
                actions={
                    <>
                        <ExportMenu
                            rows={shifts}
                            columns={[
                                { key: 'name', label: 'Name' },
                                { key: 'shift_type', label: 'Type' },
                                { key: 'start_time', label: 'Start' },
                                { key: 'end_time', label: 'End' },
                                { key: 'grace_in_minutes', label: 'Grace (min)' },
                                { key: 'late_threshold_minutes', label: 'Late After (min)' },
                                { key: 'break_duration_minutes', label: 'Break (min)' },
                                { key: 'is_night_shift', label: 'Night Shift' }
                            ]}
                            filename="shifts"
                            title="Shift Master"
                            mapRow={s => ({
                                ...s,
                                start_time: s.start_time?.substring(0, 5) || '',
                                end_time: s.end_time?.substring(0, 5) || '',
                                is_night_shift: s.is_night_shift ? 'Yes' : 'No'
                            })}
                        />
                        <Button variant="successSolid" icon={Plus} onClick={() => { setEditingShift(null); setShowModal(true); }}>Add Shift</Button>
                    </>
                }
            />

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="card-base !p-0 overflow-hidden">
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load shifts</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchShifts}>Try again</Button>
                    </div>
                </div>
            ) : shifts.length === 0 ? (
                <div className="card-base !p-0 overflow-hidden">
                    <div className="py-16 text-center">
                        <Clock size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No shifts yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            A shift defines the start and end of a working day before schedules can use it.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {shifts.map(shift => (
                            <div key={shift.id} className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
                                <div className="flex justify-between items-start gap-3 mb-3">
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{shift.name || '—'}</h3>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${shift.shift_type === 'Night'
                                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                                                {shift.shift_type || 'Fixed'}
                                            </span>
                                            {shift.is_night_shift && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                    <Moon size={10} /> Overnight
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={() => handleEdit(shift)} aria-label="Edit shift" className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-700 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(shift.id)} aria-label="Delete shift" className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-sm mb-3">
                                    <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-semibold tabular-nums">
                                        <Sun size={14} className="text-amber-500 dark:text-amber-400" />
                                        {shift.start_time?.substring(0, 5) || '—'}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500">→</span>
                                    <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-semibold tabular-nums">
                                        <Moon size={14} className="text-blue-500 dark:text-blue-400" />
                                        {shift.end_time?.substring(0, 5) || '—'}
                                    </span>
                                </div>

                                <dl className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-center">
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 font-bold">Grace</dt>
                                        <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{shift.grace_in_minutes || 0}m</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 font-bold">Late After</dt>
                                        <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{shift.late_threshold_minutes || 15}m</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 font-bold">Break</dt>
                                        <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                                            {shift.break_duration_minutes > 0 ? `${shift.break_duration_minutes}m` : '—'}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        ))}
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {shifts.length} shift{shifts.length === 1 ? '' : 's'}
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{editingShift ? 'Edit Shift' : 'Add New Shift'}</h3>
                            <Button variant="ghost" size="sm" icon={X} iconSize={20} aria-label="Close" onClick={() => setShowModal(false)} />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shift Name *</label>
                                <input required type="text" className="field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., General Shift" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
                                    <input type="time" className="field" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Time</label>
                                    <input type="time" className="field" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Shift Type</label>
                                    <select className="field" value={form.shift_type} onChange={e => setForm({ ...form, shift_type: e.target.value })}>
                                        <option value="Fixed">Fixed</option>
                                        <option value="Rotational">Rotational</option>
                                        <option value="Night">Night</option>
                                        <option value="Split">Split</option>
                                        <option value="General">General</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Grace In (min)</label>
                                    <input type="number" className="field" value={form.grace_in_minutes} onChange={e => setForm({ ...form, grace_in_minutes: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Late Threshold (min)</label>
                                    <input type="number" className="field" value={form.late_threshold_minutes} onChange={e => setForm({ ...form, late_threshold_minutes: parseInt(e.target.value) || 15 })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Break Duration (min)</label>
                                    <input type="number" className="field" value={form.break_duration_minutes} onChange={e => setForm({ ...form, break_duration_minutes: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="nightShift" checked={form.is_night_shift} onChange={e => setForm({ ...form, is_night_shift: e.target.checked })} className="w-4 h-4" />
                                <label htmlFor="nightShift" className="text-sm text-slate-700 dark:text-slate-300">Night Shift (crosses midnight)</label>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                                <Button type="submit">{editingShift ? 'Update' : 'Create'} Shift</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
