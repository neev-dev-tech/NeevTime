import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Edit2, Trash2, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, ExportMenu, ListPage, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import Modal from '../components/Modal';
import { confirm } from '../components/ConfirmDialog';
import DayTrack, { DayTrackScale } from '../components/DayTrack';

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
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Delete this shift?' }))) return;
        try {
            await api.delete(`/api/shifts/${id}`);
            fetchShifts();
        } catch (err) { toast.error('Delete failed'); }
    };

    return (
        <>
            <ListPage
                title="Shifts"
                count={shifts.length}
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
                        <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => { setEditingShift(null); setShowModal(true); }}>Add Shift</Button>
                    </>
                }
            >
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load shifts</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchShifts}>Try again</Button>
                    </div>
                ) : shifts.length === 0 ? (
                    <div className="py-16 text-center">
                        <Clock size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No shifts yet</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            A shift defines the start and end of a working day before schedules can use it.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Shift</th>
                                <th className={LIST_TH}>Hours</th>
                                <th className={`${LIST_TH} w-[32%] min-w-[220px]`}><span className="sr-only">Hours of the day</span><DayTrackScale /></th>
                                <th className={`${LIST_TH} !text-right`}>Grace</th>
                                <th className={`${LIST_TH} !text-right`}>Late after</th>
                                <th className={`${LIST_TH} !text-right`}>Break</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {shifts.map(shift => (
                                <tr key={shift.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-medium text-slate-900 dark:text-slate-100">{shift.name || '—'}</span>
                                            <span className="px-1.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{shift.shift_type || 'Fixed'}</span>
                                            {shift.is_night_shift && <span className="px-1.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Overnight</span>}
                                        </div>
                                        {shift.code && <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{shift.code}</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                                        {shift.start_time?.substring(0, 5) || '—'} – {shift.end_time?.substring(0, 5) || '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <DayTrack start={shift.start_time} end={shift.end_time} />
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{shift.grace_in_minutes || 0}m</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{shift.late_threshold_minutes || 15}m</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{shift.break_duration_minutes > 0 ? `${shift.break_duration_minutes}m` : '—'}</td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                        <div className="flex items-center justify-end gap-1.5">
                                            <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => handleEdit(shift)}>Edit</Button>
                                            <Button variant="danger" size="toolbar" icon={Trash2} aria-label={`Delete ${shift.name}`} title="Delete" onClick={() => handleDelete(shift.id)} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPage>

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={editingShift ? 'Edit Shift' : 'Add New Shift'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
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
            </Modal>
        </>
    );
}
