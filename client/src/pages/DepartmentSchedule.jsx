import React, { useState, useEffect } from 'react';
import api from '../api';
import { Building2, Plus, Edit2, Trash2, X, Save, Calendar, Clock } from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function DepartmentSchedule() {
    const toast = useToast();
    const [schedules, setSchedules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [form, setForm] = useState({
        department_id: '',
        shift_id: '',
        timetable_id: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        week_off_days: ['saturday', 'sunday']
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [schedRes, deptRes, shiftRes, ttRes] = await Promise.all([
                api.get('/api/schedules/department'),
                api.get('/api/departments'),
                api.get('/api/shifts'),
                api.get('/api/timetables')
            ]);
            setSchedules(schedRes.data || []);
            setDepartments(deptRes.data || []);
            setShifts(shiftRes.data || []);
            setTimetables(ttRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                department_id: parseInt(form.department_id),
                shift_id: form.shift_id ? parseInt(form.shift_id) : null,
                timetable_id: form.timetable_id ? parseInt(form.timetable_id) : null
            };

            if (editingId) {
                await api.put(`/api/schedules/department/${editingId}`, payload);
            } else {
                await api.post('/api/schedules/department', payload);
            }
            fetchData();
            closeModal();
        } catch (err) {
            console.error('Error saving schedule:', err);
            toast.error('Error saving schedule');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await api.delete(`/api/schedules/department/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting schedule:', err);
        }
    };

    const openEdit = (schedule) => {
        setForm({
            department_id: schedule.department_id?.toString() || '',
            shift_id: schedule.shift_id?.toString() || '',
            timetable_id: schedule.timetable_id?.toString() || '',
            effective_from: schedule.effective_from?.split('T')[0] || '',
            effective_to: schedule.effective_to?.split('T')[0] || '',
            week_off_days: schedule.week_off_days || ['saturday', 'sunday']
        });
        setEditingId(schedule.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({
            department_id: '',
            shift_id: '',
            timetable_id: '',
            effective_from: new Date().toISOString().split('T')[0],
            effective_to: '',
            week_off_days: ['saturday', 'sunday']
        });
    };

    const toggleWeekOff = (day) => {
        const days = [...form.week_off_days];
        const index = days.indexOf(day);
        if (index > -1) {
            days.splice(index, 1);
        } else {
            days.push(day);
        }
        setForm({ ...form, week_off_days: days });
    };

    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Building2}
                title="Department Schedule"
                actions={
                    <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>Assign Schedule</Button>
                }
            />

            {/* Schedules Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Department</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Shift</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Timetable</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Effective From</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Effective To</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-400">Week Off</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">Loading...</td>
                            </tr>
                        ) : schedules.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                    No department schedules defined. Click "Assign Schedule" to create one.
                                </td>
                            </tr>
                        ) : schedules.map(schedule => (
                            <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-4 py-3">
                                    <div className="font-medium">{schedule.department_name}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded text-sm">
                                        {schedule.shift_name || '-'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                    {schedule.timetable_name || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {schedule.effective_from?.split('T')[0] || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {schedule.effective_to?.split('T')[0] || 'Ongoing'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1">
                                        {schedule.week_off_days?.map(day => (
                                            <span key={day} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs capitalize">
                                                {day.substring(0, 3)}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-2">
                                        <Button variant="ghost" size="sm" icon={Edit2} iconSize={16} onClick={() => openEdit(schedule)} aria-label="Edit schedule" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(schedule.id)} aria-label="Delete schedule" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <h2 className="text-lg font-semibold">
                                {editingId ? 'Edit Department Schedule' : 'Assign Department Schedule'}
                            </h2>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={closeModal} aria-label="Close" />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Department *</label>
                                <select
                                    value={form.department_id}
                                    onChange={e => setForm({ ...form, department_id: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    required
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Shift</label>
                                    <select
                                        value={form.shift_id}
                                        onChange={e => setForm({ ...form, shift_id: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    >
                                        <option value="">Select Shift</option>
                                        {shifts.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Timetable</label>
                                    <select
                                        value={form.timetable_id}
                                        onChange={e => setForm({ ...form, timetable_id: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    >
                                        <option value="">Select Timetable</option>
                                        {timetables.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Effective From *</label>
                                    <input
                                        type="date"
                                        value={form.effective_from}
                                        onChange={e => setForm({ ...form, effective_from: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Effective To</label>
                                    <input
                                        type="date"
                                        value={form.effective_to}
                                        onChange={e => setForm({ ...form, effective_to: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">Week Off Days</label>
                                <div className="flex flex-wrap gap-2">
                                    {weekDays.map(day => (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => toggleWeekOff(day)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${form.week_off_days.includes(day)
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                                                }`}
                                        >
                                            {day.substring(0, 3)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" icon={Save}>
                                    {editingId ? 'Update' : 'Assign'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
