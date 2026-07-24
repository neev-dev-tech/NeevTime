import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Edit2, Trash2, Clock, Sun, Moon, X } from 'lucide-react';
import { useToast } from '../components';

export default function ShiftMaster() {
    const toast = useToast();
    const [shifts, setShifts] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [form, setForm] = useState({
        name: '', start_time: '09:00', end_time: '18:00', shift_type: 'Fixed',
        grace_in_minutes: 15, late_threshold_minutes: 15, break_duration_minutes: 60, is_night_shift: false
    });

    useEffect(() => { fetchShifts(); }, []);

    const fetchShifts = async () => {
        try {
            const res = await api.get('/api/shifts');
            setShifts(res.data);
        } catch (err) { console.error(err); }
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
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Clock /> Shift Master</h1>
                <button onClick={() => { setEditingShift(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <Plus size={18} /> Add Shift
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shifts.map(shift => (
                    <div key={shift.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{shift.name}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded ${shift.shift_type === 'Night' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                                    {shift.shift_type || 'Fixed'}
                                </span>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(shift)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(shift.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                            <span className="flex items-center gap-1"><Sun size={14} className="text-yellow-500" /> {shift.start_time?.substring(0, 5)}</span>
                            <span>→</span>
                            <span className="flex items-center gap-1"><Moon size={14} className="text-blue-500" /> {shift.end_time?.substring(0, 5)}</span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                            <div>Grace: {shift.grace_in_minutes || 0} min | Late after: {shift.late_threshold_minutes || 15} min</div>
                            {shift.break_duration_minutes > 0 && <div>Break: {shift.break_duration_minutes} min</div>}
                            {shift.is_night_shift && <div className="text-indigo-600">🌙 Night Shift</div>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg">{editingShift ? 'Edit Shift' : 'Add New Shift'}</h3>
                            <button onClick={() => setShowModal(false)}><X className="text-gray-400 hover:text-red-500" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shift Name *</label>
                                <input required type="text" className="w-full border rounded-lg px-3 py-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., General Shift" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                    <input type="time" className="w-full border rounded-lg px-3 py-2" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                    <input type="time" className="w-full border rounded-lg px-3 py-2" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Shift Type</label>
                                    <select className="w-full border rounded-lg px-3 py-2 bg-white" value={form.shift_type} onChange={e => setForm({ ...form, shift_type: e.target.value })}>
                                        <option value="Fixed">Fixed</option>
                                        <option value="Rotational">Rotational</option>
                                        <option value="Night">Night</option>
                                        <option value="Split">Split</option>
                                        <option value="General">General</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Grace In (min)</label>
                                    <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.grace_in_minutes} onChange={e => setForm({ ...form, grace_in_minutes: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Late Threshold (min)</label>
                                    <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.late_threshold_minutes} onChange={e => setForm({ ...form, late_threshold_minutes: parseInt(e.target.value) || 15 })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Break Duration (min)</label>
                                    <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.break_duration_minutes} onChange={e => setForm({ ...form, break_duration_minutes: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" id="nightShift" checked={form.is_night_shift} onChange={e => setForm({ ...form, is_night_shift: e.target.checked })} className="w-4 h-4" />
                                <label htmlFor="nightShift" className="text-sm text-gray-700">Night Shift (crosses midnight)</label>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingShift ? 'Update' : 'Create'} Shift</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
