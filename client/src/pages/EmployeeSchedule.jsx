import React, { useState, useEffect } from 'react';
import api from '../api';
import { UserCheck, Plus, Edit2, Trash2, X, Save, Users, Search, Filter } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function EmployeeSchedule() {
    const toast = useToast();
    const [schedules, setSchedules] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('');
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState([]);

    const [form, setForm] = useState({
        employee_id: '',
        shift_id: '',
        timetable_id: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        is_temporary: false,
        reason: '',
        week_off_days: ['saturday', 'sunday']
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [schedRes, empRes, deptRes, shiftRes, ttRes] = await Promise.all([
                api.get('/api/schedules/employee'),
                api.get('/api/employees'),
                api.get('/api/departments'),
                api.get('/api/shifts'),
                api.get('/api/timetables')
            ]);
            setSchedules(schedRes.data || []);
            setEmployees(empRes.data || []);
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
                employee_id: parseInt(form.employee_id),
                shift_id: form.shift_id ? parseInt(form.shift_id) : null,
                timetable_id: form.timetable_id ? parseInt(form.timetable_id) : null
            };

            if (editingId) {
                await api.put(`/api/schedules/employee/${editingId}`, payload);
            } else {
                await api.post('/api/schedules/employee', payload);
            }
            fetchData();
            closeModal();
        } catch (err) {
            console.error('Error saving schedule:', err);
            toast.error('Error saving schedule');
        }
    };

    const handleBulkSubmit = async (e) => {
        e.preventDefault();
        if (selectedEmployees.length === 0) {
            toast.warning('Please select at least one employee');
            return;
        }
        try {
            await api.post('/api/schedules/employee/bulk', {
                employee_ids: selectedEmployees,
                shift_id: form.shift_id ? parseInt(form.shift_id) : null,
                timetable_id: form.timetable_id ? parseInt(form.timetable_id) : null,
                effective_from: form.effective_from,
                effective_to: form.effective_to || null,
                week_off_days: form.week_off_days
            });
            fetchData();
            setShowBulkModal(false);
            setSelectedEmployees([]);
        } catch (err) {
            console.error('Error bulk assigning:', err);
            toast.error('Error assigning schedules');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return;
        try {
            await api.delete(`/api/schedules/employee/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting schedule:', err);
        }
    };

    const openEdit = (schedule) => {
        setForm({
            employee_id: schedule.employee_id?.toString() || '',
            shift_id: schedule.shift_id?.toString() || '',
            timetable_id: schedule.timetable_id?.toString() || '',
            effective_from: schedule.effective_from?.split('T')[0] || '',
            effective_to: schedule.effective_to?.split('T')[0] || '',
            is_temporary: schedule.is_temporary || false,
            reason: schedule.reason || '',
            week_off_days: schedule.week_off_days || ['saturday', 'sunday']
        });
        setEditingId(schedule.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({
            employee_id: '',
            shift_id: '',
            timetable_id: '',
            effective_from: new Date().toISOString().split('T')[0],
            effective_to: '',
            is_temporary: false,
            reason: '',
            week_off_days: ['saturday', 'sunday']
        });
    };

    const toggleEmployeeSelection = (empId) => {
        setSelectedEmployees(prev =>
            prev.includes(empId)
                ? prev.filter(id => id !== empId)
                : [...prev, empId]
        );
    };

    const selectAllFiltered = () => {
        const filtered = filteredEmployees.map(e => e.id);
        setSelectedEmployees(prev => {
            const newSelection = [...new Set([...prev, ...filtered])];
            return newSelection;
        });
    };

    const filteredSchedules = schedules.filter(s => {
        const matchesSearch = !searchTerm ||
            s.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.employee_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = !filterDepartment || s.department_name === filterDepartment;
        return matchesSearch && matchesDept;
    });

    const filteredEmployees = employees.filter(e => {
        const matchesDept = !filterDepartment || e.department_name === filterDepartment;
        return matchesDept;
    });

    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={UserCheck}
                title="Employee Schedule"
                actions={
                    <>
                        <ExportMenu
                            rows={filteredSchedules}
                            columns={[
                                { key: 'employee_name', label: 'Employee' },
                                { key: 'employee_code', label: 'Code' },
                                { key: 'department_name', label: 'Department' },
                                { key: 'shift_name', label: 'Shift' },
                                { key: 'timetable_name', label: 'Timetable' },
                                { key: 'effective_from', label: 'Effective From' },
                                { key: 'effective_to', label: 'Effective To' },
                                { key: 'is_temporary', label: 'Type' }
                            ]}
                            filename="employee-schedules"
                            title="Employee Schedules"
                            mapRow={s => ({
                                ...s,
                                effective_from: s.effective_from?.split('T')[0] || '',
                                effective_to: s.effective_to?.split('T')[0] || 'Ongoing',
                                is_temporary: s.is_temporary ? 'Temporary' : 'Regular'
                            })}
                        />
                        <Button variant="secondary" icon={Users} onClick={() => setShowBulkModal(true)}>
                            Bulk Assign
                        </Button>
                        <Button icon={Plus} onClick={() => setShowModal(true)}>
                            Assign Schedule
                        </Button>
                    </>
                }
            />

            {/* Filters */}
            <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border rounded-lg"
                    />
                </div>
                <select
                    value={filterDepartment}
                    onChange={e => setFilterDepartment(e.target.value)}
                    className="px-3 py-2 border rounded-lg"
                >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                </select>
            </div>

            {/* Schedules Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Employee</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Department</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Shift</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Effective Period</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">Type</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-slate-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                            </tr>
                        ) : filteredSchedules.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                    No employee schedules found.
                                </td>
                            </tr>
                        ) : filteredSchedules.map(schedule => (
                            <tr key={schedule.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3">
                                    <div className="font-medium">{schedule.employee_name}</div>
                                    <div className="text-xs text-slate-500">{schedule.employee_code}</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-600">
                                    {schedule.department_name || '-'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                                        {schedule.shift_name || schedule.timetable_name || '-'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {schedule.effective_from?.split('T')[0]} → {schedule.effective_to?.split('T')[0] || 'Ongoing'}
                                </td>
                                <td className="px-4 py-3">
                                    {schedule.is_temporary ? (
                                        <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">Temporary</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Regular</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => openEdit(schedule)}
                                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(schedule.id)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Individual Schedule Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-auto">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">
                                {editingId ? 'Edit Employee Schedule' : 'Assign Employee Schedule'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Employee *</label>
                                <select
                                    value={form.employee_id}
                                    onChange={e => setForm({ ...form, employee_id: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    required
                                >
                                    <option value="">Select Employee</option>
                                    {employees.map(e => (
                                        <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Shift</label>
                                    <select
                                        value={form.shift_id}
                                        onChange={e => setForm({ ...form, shift_id: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
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
                                        className="w-full px-3 py-2 border rounded-lg"
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
                                        className="w-full px-3 py-2 border rounded-lg"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Effective To</label>
                                    <input
                                        type="date"
                                        value={form.effective_to}
                                        onChange={e => setForm({ ...form, effective_to: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.is_temporary}
                                        onChange={e => setForm({ ...form, is_temporary: e.target.checked })}
                                        className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-sm">Temporary Schedule</span>
                                </label>
                            </div>

                            {form.is_temporary && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Reason</label>
                                    <input
                                        type="text"
                                        value={form.reason}
                                        onChange={e => setForm({ ...form, reason: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                        placeholder="Reason for temporary schedule"
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" icon={Save}>
                                    {editingId ? 'Update' : 'Assign'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Assign Modal */}
            {showBulkModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">Bulk Assign Schedule</h2>
                            <button onClick={() => { setShowBulkModal(false); setSelectedEmployees([]); }} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex flex-1 overflow-hidden">
                            {/* Employee Selection */}
                            <div className="w-1/2 border-r p-4 overflow-auto">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="font-medium">Select Employees ({selectedEmployees.length})</h3>
                                    <button onClick={selectAllFiltered} className="text-sm text-orange-600 hover:underline">
                                        Select All
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {filteredEmployees.map(emp => (
                                        <label key={emp.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedEmployees.includes(emp.id)}
                                                onChange={() => toggleEmployeeSelection(emp.id)}
                                                className="w-4 h-4 text-green-600 rounded"
                                            />
                                            <span className="text-sm">{emp.name}</span>
                                            <span className="text-xs text-slate-500">({emp.employee_code})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {/* Schedule Form */}
                            <form onSubmit={handleBulkSubmit} className="w-1/2 p-4 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Shift</label>
                                    <select
                                        value={form.shift_id}
                                        onChange={e => setForm({ ...form, shift_id: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
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
                                        className="w-full px-3 py-2 border rounded-lg"
                                    >
                                        <option value="">Select Timetable</option>
                                        {timetables.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Effective From *</label>
                                    <input
                                        type="date"
                                        value={form.effective_from}
                                        onChange={e => setForm({ ...form, effective_from: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Effective To</label>
                                    <input
                                        type="date"
                                        value={form.effective_to}
                                        onChange={e => setForm({ ...form, effective_to: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    />
                                </div>
                                <div className="pt-4 border-t">
                                    <Button
                                        type="submit"
                                        icon={Users}
                                        disabled={selectedEmployees.length === 0}
                                        className="w-full"
                                    >
                                        Assign to {selectedEmployees.length} Employees
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
