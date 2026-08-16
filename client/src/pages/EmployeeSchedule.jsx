import React, { useState, useEffect } from 'react';
import api from '../api';
import { UserCheck, Plus, Edit2, Trash2, Save, Users, Search, Filter, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';
import Modal from '../components/Modal';
import { toLocalDateString } from '../utils/dateFormat';

export default function EmployeeSchedule() {
    const toast = useToast();
    const [schedules, setSchedules] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [timetables, setTimetables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
        effective_from: toLocalDateString(),
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
            setError(null);
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
            setError(err.response?.data?.error || 'Could not load employee schedules');
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
            effective_from: toLocalDateString(),
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
                subtitle="Per-employee shift assignments and temporary overrides"
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
                        <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>
                            Assign Schedule
                        </Button>
                    </>
                }
            />

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="field pl-9 pr-3"
                    />
                </div>
                <div className="relative">
                    <Filter size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    <select
                        value={filterDepartment}
                        onChange={e => setFilterDepartment(e.target.value)}
                        className="field pl-9 pr-3"
                    >
                        <option value="">All Departments</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Schedules Table */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load schedules</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : filteredSchedules.length === 0 ? (
                    <div className="py-16 text-center">
                        <UserCheck size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchTerm || filterDepartment ? 'No matching schedules' : 'No employee schedules yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchTerm || filterDepartment
                                ? 'Nothing matches the current search and department filter.'
                                : 'Assign a shift to an employee to override their department schedule.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Shift</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Effective Period</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Type</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredSchedules.map((schedule, idx) => (
                                    <tr key={schedule.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums align-top">{idx + 1}</td>
                                        <td className="px-5 py-3">
                                            <div className="font-semibold text-slate-800 dark:text-slate-100">{schedule.employee_name || '—'}</div>
                                            <div className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {schedule.employee_code || '—'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                            {schedule.department_name || '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            {(schedule.shift_name || schedule.timetable_name) ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                                    {schedule.shift_name || schedule.timetable_name}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                            {schedule.effective_from?.split('T')[0] || '—'} → {schedule.effective_to?.split('T')[0] || 'Ongoing'}
                                        </td>
                                        <td className="px-5 py-3">
                                            {schedule.is_temporary ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Temporary</span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Regular</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <div className="dv-quiet">
                                                    <Button variant="ghost" size="sm" icon={Edit2} iconSize={16} onClick={() => openEdit(schedule)} aria-label="Edit schedule" />
                                                    <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(schedule.id)} aria-label="Delete schedule" />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && filteredSchedules.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {filteredSchedules.length} schedule{filteredSchedules.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>

            {/* Individual Schedule Modal */}
            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingId ? 'Edit Employee Schedule' : 'Assign Employee Schedule'}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Employee *</label>
                        <select
                            value={form.employee_id}
                            onChange={e => setForm({ ...form, employee_id: e.target.value })}
                            className="field"
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
                                className="field"
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
                                className="field"
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
                                className="field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Effective To</label>
                            <input
                                type="date"
                                value={form.effective_to}
                                onChange={e => setForm({ ...form, effective_to: e.target.value })}
                                className="field"
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
                                className="field"
                                placeholder="Reason for temporary schedule"
                            />
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                        <Button type="submit" icon={Save}>
                            {editingId ? 'Update' : 'Assign'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Bulk Assign Modal */}
            <Modal
                open={showBulkModal}
                onClose={() => { setShowBulkModal(false); setSelectedEmployees([]); }}
                title="Bulk Assign Schedule"
                size="xl"
            >
                <div className="flex flex-1 overflow-hidden -mx-5 -my-4">
                    {/* Employee Selection */}
                    <div className="w-1/2 border-r dark:border-slate-700 p-4 overflow-auto">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-medium">Select Employees ({selectedEmployees.length})</h3>
                            <Button variant="ghost" size="sm" onClick={selectAllFiltered}>
                                Select All
                            </Button>
                        </div>
                        <div className="space-y-1">
                            {filteredEmployees.map(emp => (
                                <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-orange-50/50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedEmployees.includes(emp.id)}
                                        onChange={() => toggleEmployeeSelection(emp.id)}
                                        className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{emp.name || '—'}</span>
                                    <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{emp.employee_code || '—'}</span>
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
                                className="field"
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
                                className="field"
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
                                className="field"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Effective To</label>
                            <input
                                type="date"
                                value={form.effective_to}
                                onChange={e => setForm({ ...form, effective_to: e.target.value })}
                                className="field"
                            />
                        </div>
                        <div className="pt-4 border-t dark:border-slate-700">
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
            </Modal>
        </div>
    );
}
