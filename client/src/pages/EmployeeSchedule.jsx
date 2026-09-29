import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import api from '../api';
import { UserCheck, Plus, Edit2, Trash2, Save, Users, AlertCircle, RefreshCw } from 'lucide-react';
import {
    useToast, Button, ExportMenu, ListPage, ListSearch,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../components';
import Modal from '../components/Modal';
import { toLocalDateString, toDateOnly } from '../utils/dateFormat';
import { confirm } from '../components/ConfirmDialog';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

// `temporary` turns the page into the Temporary Schedule view: it lists only
// temporary overrides and new assignments default to temporary.
export default function EmployeeSchedule({ temporary = false }) {
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
        is_temporary: temporary,
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
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this schedule?' }))) return;
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
            effective_from: toDateOnly(schedule.effective_from) || '',
            effective_to: toDateOnly(schedule.effective_to) || '',
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
            is_temporary: temporary,
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
        const matchesKind = !temporary || Boolean(s.is_temporary);
        return matchesSearch && matchesDept && matchesKind;
    });

    const filteredEmployees = employees.filter(e => {
        const matchesDept = !filterDepartment || e.department_name === filterDepartment;
        return matchesDept;
    });

    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const pager = useTableControls(filteredSchedules, { pageSize: 50 });

    return (
        <>
            <ListPage
                title={temporary ? 'Temporary Schedule' : 'Employee Schedule'}
                count={temporary ? schedules.filter(s => s.is_temporary).length : schedules.length}
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
                                effective_from: toDateOnly(s.effective_from) || '',
                                effective_to: toDateOnly(s.effective_to) || 'Ongoing',
                                is_temporary: s.is_temporary ? 'Temporary' : 'Regular'
                            })}
                        />
                        <Button variant="tonal" size="toolbar" icon={Users} onClick={() => setShowBulkModal(true)}>
                            Bulk Assign
                        </Button>
                        <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => setShowModal(true)}>
                            Assign Schedule
                        </Button>
                    </>
                }
                toolbar={
                    <>
                        <ListSearch label="Search employee" placeholder="Search employee…" value={searchTerm} onChange={setSearchTerm} />
                        <select
                            value={filterDepartment}
                            onChange={e => setFilterDepartment(e.target.value)}
                            className="field-sm !h-8 !py-0 w-auto"
                            aria-label="Filter by department"
                        >
                            <option value="">All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </>
                }
                footer={!loading && !error && filteredSchedules.length > 0 ? <TablePager controls={pager} noun="schedule" /> : null}
            >
                {loading ? (
                    <div className="p-4 sm:p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load schedules</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : filteredSchedules.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <UserCheck size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchTerm || filterDepartment ? 'No matching schedules' : 'No employee schedules yet'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {searchTerm || filterDepartment
                                ? 'Nothing matches the current search and department filter.'
                                : 'Assign a shift to an employee to override their department schedule.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                <th className={LIST_TH}>Employee</th>
                                <th className={LIST_TH}>Department</th>
                                <th className={LIST_TH}>Shift</th>
                                <th className={LIST_TH}>Effective Period</th>
                                <th className={LIST_TH}>Type</th>
                                <th className={`${LIST_TH} !text-right ${LIST_EDGE_LAST}`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pager.view.map((schedule, idx) => (
                                <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums align-top`}>{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-800 dark:text-slate-100">{schedule.employee_name || '—'}</div>
                                        <div className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                                            {schedule.employee_code || '—'}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {schedule.department_name || '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {(schedule.shift_name || schedule.timetable_name) ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
                                                {schedule.shift_name || schedule.timetable_name}
                                            </span>
                                        ) : (
                                            <span className="text-slate-600 dark:text-slate-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                        {toDateOnly(schedule.effective_from) || '—'} → {toDateOnly(schedule.effective_to) || 'Ongoing'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {schedule.is_temporary ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Temporary</span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Regular</span>
                                        )}
                                    </td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
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
                )}
            </ListPage>

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
                                <label key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedEmployees.includes(emp.id)}
                                        onChange={() => toggleEmployeeSelection(emp.id)}
                                        className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{emp.name || '—'}</span>
                                    <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">{emp.employee_code || '—'}</span>
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
        </>
    );
}

EmployeeSchedule.propTypes = {
    temporary: PropTypes.bool
};
