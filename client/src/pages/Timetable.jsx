import React, { useState, useEffect } from 'react';
import api from '../api';
import { Clock, Plus, Edit2, Trash2, X, Save, CalendarDays, Coffee, Moon, Sun, Check } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function Timetable() {
    const toast = useToast();
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showBreakModal, setShowBreakModal] = useState(false);
    const [selectedTimetable, setSelectedTimetable] = useState(null);
    const [breaks, setBreaks] = useState([]);

    const [form, setForm] = useState({
        name: '',
        code: '',
        check_in: '09:00',
        check_out: '18:00',
        late_in: '09:15',
        early_out: '17:45',
        overtime_start: '',
        min_hours_for_full_day: 8,
        min_hours_for_half_day: 4,
        is_overnight: false,
        is_flexible: false,
        grace_period_minutes: 15,
        color: '#3B82F6',
        description: ''
    });

    const [breakForm, setBreakForm] = useState({
        name: '',
        start_time: '13:00',
        end_time: '14:00',
        is_paid: true
    });

    useEffect(() => {
        fetchTimetables();
    }, []);

    const fetchTimetables = async () => {
        try {
            const res = await api.get('/api/timetables');
            setTimetables(res.data);
        } catch (err) {
            console.error('Error fetching timetables:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchBreaks = async (timetableId) => {
        try {
            const res = await api.get(`/api/timetables/${timetableId}`);
            setBreaks(res.data.breaks || []);
        } catch (err) {
            console.error('Error fetching breaks:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/api/timetables/${editingId}`, form);
            } else {
                await api.post('/api/timetables', form);
            }
            fetchTimetables();
            closeModal();
        } catch (err) {
            console.error('Error saving timetable:', err);
            toast.error('Error saving timetable');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this timetable?')) return;
        try {
            await api.delete(`/api/timetables/${id}`);
            fetchTimetables();
        } catch (err) {
            console.error('Error deleting timetable:', err);
        }
    };

    const openEdit = (timetable) => {
        setForm({
            name: timetable.name || '',
            code: timetable.code || '',
            check_in: timetable.check_in?.substring(0, 5) || '09:00',
            check_out: timetable.check_out?.substring(0, 5) || '18:00',
            late_in: timetable.late_in?.substring(0, 5) || '',
            early_out: timetable.early_out?.substring(0, 5) || '',
            overtime_start: timetable.overtime_start?.substring(0, 5) || '',
            min_hours_for_full_day: timetable.min_hours_for_full_day || 8,
            min_hours_for_half_day: timetable.min_hours_for_half_day || 4,
            is_overnight: timetable.is_overnight || false,
            is_flexible: timetable.is_flexible || false,
            grace_period_minutes: timetable.grace_period_minutes || 15,
            color: timetable.color || '#3B82F6',
            description: timetable.description || ''
        });
        setEditingId(timetable.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({
            name: '', code: '', check_in: '09:00', check_out: '18:00',
            late_in: '09:15', early_out: '17:45', overtime_start: '',
            min_hours_for_full_day: 8, min_hours_for_half_day: 4,
            is_overnight: false, is_flexible: false, grace_period_minutes: 15,
            color: '#3B82F6', description: ''
        });
    };

    const openBreakModal = async (timetable) => {
        setSelectedTimetable(timetable);
        await fetchBreaks(timetable.id);
        setShowBreakModal(true);
    };

    const handleBreakSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/break-times', {
                ...breakForm,
                timetable_id: selectedTimetable.id
            });
            await fetchBreaks(selectedTimetable.id);
            setBreakForm({ name: '', start_time: '13:00', end_time: '14:00', is_paid: true });
        } catch (err) {
            console.error('Error adding break:', err);
        }
    };

    const deleteBreak = async (id) => {
        try {
            await api.delete(`/api/break-times/${id}`);
            await fetchBreaks(selectedTimetable.id);
        } catch (err) {
            console.error('Error deleting break:', err);
        }
    };

    const formatTime = (time) => {
        if (!time) return '-';
        return time.substring(0, 5);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={CalendarDays}
                title="Timetable Management"
                actions={
                    <>
                        <ExportMenu
                            rows={timetables}
                            columns={[
                                { key: 'name', label: 'Name' },
                                { key: 'code', label: 'Code' },
                                { key: 'check_in', label: 'Check In' },
                                { key: 'check_out', label: 'Check Out' },
                                { key: 'grace_period_minutes', label: 'Grace (min)' },
                                { key: 'min_hours_for_full_day', label: 'Full Day Hours' },
                                { key: 'min_hours_for_half_day', label: 'Half Day Hours' }
                            ]}
                            filename="timetables"
                            title="Timetables"
                            mapRow={t => ({
                                ...t,
                                check_in: t.check_in?.substring(0, 5) || '',
                                check_out: t.check_out?.substring(0, 5) || ''
                            })}
                        />
                        <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>Add Timetable</Button>
                    </>
                }
            />

            {/* Timetable Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    <div className="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">Loading...</div>
                ) : timetables.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">No timetables defined</div>
                ) : timetables.map(tt => (
                    <div
                        key={tt.id}
                        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow"
                    >
                        {/* Header with color */}
                        <div
                            className="h-2"
                            style={{ backgroundColor: tt.color || '#3B82F6' }}
                        />
                        <div className="p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="font-semibold text-lg">{tt.name}</h3>
                                    <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                                        {tt.code}
                                    </span>
                                </div>
                                <div className="flex gap-1">
                                    {tt.is_overnight && (
                                        <span className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded" title="Overnight">
                                            <Moon size={14} />
                                        </span>
                                    )}
                                    {tt.is_flexible && (
                                        <span className="p-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded" title="Flexible">
                                            <Sun size={14} />
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Time Display */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
                                    <div className="text-xs text-green-600 dark:text-green-400 mb-1">Check In</div>
                                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatTime(tt.check_in)}</div>
                                    {tt.late_in && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Late after {formatTime(tt.late_in)}</div>
                                    )}
                                </div>
                                <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 text-center">
                                    <div className="text-xs text-red-600 dark:text-red-400 mb-1">Check Out</div>
                                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{formatTime(tt.check_out)}</div>
                                    {tt.early_out && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400">Early before {formatTime(tt.early_out)}</div>
                                    )}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1 mb-4">
                                <div className="flex justify-between">
                                    <span>Grace Period:</span>
                                    <span className="font-medium">{tt.grace_period_minutes} min</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Full Day Hours:</span>
                                    <span className="font-medium">{tt.min_hours_for_full_day || 8}h</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Breaks:</span>
                                    <span className="font-medium">{tt.break_count || 0}</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-3 border-t dark:border-slate-700">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={Coffee}
                                    className="flex-1"
                                    onClick={() => openBreakModal(tt)}
                                >
                                    Breaks
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={Edit2}
                                    className="flex-1"
                                    onClick={() => openEdit(tt)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    icon={Trash2}
                                    aria-label="Delete"
                                    onClick={() => handleDelete(tt.id)}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Edit Timetable Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <h2 className="text-lg font-semibold">
                                {editingId ? 'Edit Timetable' : 'Add Timetable'}
                            </h2>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={closeModal} />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Code *</label>
                                    <input
                                        type="text"
                                        value={form.code}
                                        onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        maxLength={10}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Check In Time *</label>
                                    <input
                                        type="time"
                                        value={form.check_in}
                                        onChange={e => setForm({ ...form, check_in: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Check Out Time *</label>
                                    <input
                                        type="time"
                                        value={form.check_out}
                                        onChange={e => setForm({ ...form, check_out: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Late After</label>
                                    <input
                                        type="time"
                                        value={form.late_in}
                                        onChange={e => setForm({ ...form, late_in: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Early Leave Before</label>
                                    <input
                                        type="time"
                                        value={form.early_out}
                                        onChange={e => setForm({ ...form, early_out: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Grace Period (min)</label>
                                    <input
                                        type="number"
                                        value={form.grace_period_minutes}
                                        onChange={e => setForm({ ...form, grace_period_minutes: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Full Day Hours</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={form.min_hours_for_full_day}
                                        onChange={e => setForm({ ...form, min_hours_for_full_day: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Half Day Hours</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={form.min_hours_for_half_day}
                                        onChange={e => setForm({ ...form, min_hours_for_half_day: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Color</label>
                                    <input
                                        type="color"
                                        value={form.color}
                                        onChange={e => setForm({ ...form, color: e.target.value })}
                                        className="w-full h-10 rounded-lg cursor-pointer"
                                    />
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.is_overnight}
                                        onChange={e => setForm({ ...form, is_overnight: e.target.checked })}
                                        className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-sm">Overnight Shift</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.is_flexible}
                                        onChange={e => setForm({ ...form, is_flexible: e.target.checked })}
                                        className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-sm">Flexible Hours</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                    rows={2}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" icon={Save}>
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Break Times Modal */}
            {showBreakModal && selectedTimetable && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Coffee className="text-amber-600 dark:text-amber-400" />
                                Break Times - {selectedTimetable.name}
                            </h2>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowBreakModal(false)} />
                        </div>

                        <div className="p-4">
                            {/* Existing Breaks */}
                            <div className="space-y-2 mb-4">
                                {breaks.length === 0 ? (
                                    <div className="text-center py-4 text-slate-500 dark:text-slate-400">No breaks defined</div>
                                ) : breaks.map(b => (
                                    <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                        <div>
                                            <div className="font-medium">{b.name}</div>
                                            <div className="text-sm text-slate-500 dark:text-slate-400">
                                                {formatTime(b.start_time)} - {formatTime(b.end_time)}
                                                {b.is_paid && <span className="ml-2 text-green-600 dark:text-green-400">(Paid)</span>}
                                            </div>
                                        </div>
                                        <Button
                                            variant="danger"
                                            size="sm"
                                            icon={Trash2}
                                            aria-label="Delete break"
                                            onClick={() => deleteBreak(b.id)}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Add Break Form */}
                            <form onSubmit={handleBreakSubmit} className="border-t dark:border-slate-700 pt-4">
                                <h3 className="font-medium mb-3">Add New Break</h3>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="col-span-2">
                                        <input
                                            type="text"
                                            placeholder="Break Name (e.g., Lunch Break)"
                                            value={breakForm.name}
                                            onChange={e => setBreakForm({ ...breakForm, name: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                            required
                                        />
                                    </div>
                                    <input
                                        type="time"
                                        value={breakForm.start_time}
                                        onChange={e => setBreakForm({ ...breakForm, start_time: e.target.value })}
                                        className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                        required
                                    />
                                    <input
                                        type="time"
                                        value={breakForm.end_time}
                                        onChange={e => setBreakForm({ ...breakForm, end_time: e.target.value })}
                                        className="px-3 py-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                        required
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={breakForm.is_paid}
                                            onChange={e => setBreakForm({ ...breakForm, is_paid: e.target.checked })}
                                            className="w-4 h-4 text-green-600 rounded"
                                        />
                                        <span className="text-sm">Paid Break</span>
                                    </label>
                                    <Button type="submit" icon={Plus}>
                                        Add Break
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
