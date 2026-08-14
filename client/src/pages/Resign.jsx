import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    UserMinus, Plus, Trash2, Upload, ChevronDown, ChevronLeft, ChevronRight,
    RefreshCw, Search, RotateCcw, BellOff, Download, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast, Button, PageHeader } from '../components';
import Modal from '../components/Modal';

export default function Resign() {
    const [resignations, setResignations] = useState([]);
    const [employees, setEmployees] = useState([]); // Active employees for the dropdown
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    const navigate = useNavigate();
    const toast = useToast();

    // Resignation Form State
    const [formData, setFormData] = useState({
        selectedEmployee: '',
        resignationDate: new Date().toISOString().split('T')[0],
        resignationType: 'Quit',
        reportEndDate: new Date().toISOString().split('T')[0],
        attendanceOption: 'Disable',
        reason: ''
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [resRes, empRes] = await Promise.all([
                // ?status= was never a parameter the server read. This page
                // worked because /api/employees returned everyone and the
                // filtering happened below — so when the endpoint started
                // defaulting to current staff, the resigned list emptied.
                api.get('/api/employees?view=resigned').catch(() => ({ data: [] })),
                api.get('/api/employees?view=active').catch(() => ({ data: [] }))
            ]);

            // The server has already scoped these; the filters stay as a
            // backstop and are case-insensitive because this column holds both
            // 'active' and 'Active'.
            const isOneOf = (e, ...want) => want.includes(String(e.status || '').toLowerCase());
            const resigned = (resRes?.data || []).filter(e => isOneOf(e, 'resigned', 'terminated'));
            setResignations(resigned);

            const active = (empRes?.data || []).filter(e => isOneOf(e, 'active'));
            setEmployees(active);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load resignation records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Filter Logic
    const filteredItems = resignations.filter(item => {
        if (!searchQuery) return true;
        const lower = searchQuery.toLowerCase();
        return (
            item.name?.toLowerCase().includes(lower) ||
            item.employee_code?.toLowerCase().includes(lower) ||
            item.department_name?.toLowerCase().includes(lower)
        );
    });

    const resetForm = () => {
        setFormData({
            selectedEmployee: '',
            resignationDate: new Date().toISOString().split('T')[0],
            resignationType: 'Quit',
            reportEndDate: new Date().toISOString().split('T')[0],
            attendanceOption: 'Disable',
            reason: ''
        });
    };

    const handleResignSubmit = async (e) => {
        e.preventDefault();
        if (!formData.selectedEmployee) return toast.warning('Please select an employee');

        try {
            // Find the employee code
            const emp = employees.find(e => e.id === Number(formData.selectedEmployee));
            if (!emp) return toast.error('Invalid employee selected');

            await api.post('/api/employees/resign', {
                employee_code: emp.employee_code,
                resignation_date: formData.resignationDate,
                resignation_type: formData.resignationType,
                report_end_date: formData.reportEndDate,
                attendance_enabled: formData.attendanceOption === 'Enable',
                reason_enabled: true,
                reason: formData.reason
            });
            setShowModal(false);
            resetForm();
            fetchData();
            toast.success('Resignation processed successfully');
        } catch (err) {
            toast.error('Action failed: ' + (err.response?.data?.error || err.message));
        }
    };

    // State for Confirmation Modal
    const [confirmModal, setConfirmModal] = useState({
        show: false,
        title: '',
        message: '',
        action: null,
        type: 'danger' // danger, warning, info
    });

    const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, show: false }));

    const handleExport = () => {
        if (filteredItems.length === 0) return toast.warning('No records to export');

        const headers = ['Employee ID', 'Name', 'Department', 'Position', 'Area', 'Resignation Date', 'Type', 'Reason'];
        const rows = filteredItems.map(item => [
            item.employee_code,
            `${item.name} ${item.last_name || ''}`,
            item.department_name || '',
            item.position_name || '',
            item.area_name || '',
            new Date(item.resignation_date).toLocaleDateString(),
            item.resignation_type,
            item.reason || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `resignations_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDisableAttendance = () => {
        if (selectedIds.length === 0) return toast.warning('Select employees to disable attendance');

        setConfirmModal({
            show: true,
            title: 'Disable Attendance?',
            message: `Are you sure you want to disable attendance for ${selectedIds.length} selected employee(s)?`,
            type: 'warning',
            action: async () => {
                try {
                    await Promise.all(selectedIds.map(id =>
                        api.patch(`/api/employees/${id}`, { attendance_required: false })
                    ));
                    toast.success('Attendance disabled successfully');
                    closeConfirmModal();
                    fetchData();
                    setSelectedIds([]);
                } catch (err) {
                    toast.error('Failed to disable attendance');
                    closeConfirmModal();
                }
            }
        });
    };

    const handleDelete = () => {
        if (selectedIds.length === 0) return toast.warning('Select records to delete');

        setConfirmModal({
            show: true,
            title: 'Delete Records?',
            message: `Are you sure you want to permanently delete ${selectedIds.length} resignation records? This cannot be undone.`,
            type: 'danger',
            action: async () => {
                try {
                    await Promise.all(selectedIds.map(id => api.delete(`/api/employees?id=${id}`))); // Adjusted based on standard API patterns
                    toast.success('Records deleted successfully');
                    closeConfirmModal();
                    fetchData();
                    setSelectedIds([]);
                } catch (err) {
                    toast.error('Delete failed');
                    closeConfirmModal();
                }
            }
        });
    };

    const handleRehire = () => {
        if (selectedIds.length === 0) return toast.warning('Select employees to rehire');

        setConfirmModal({
            show: true,
            title: 'Rehire Employees?',
            message: `Are you sure you want to rehire ${selectedIds.length} selected employee(s)? They will be moved back to Active status.`,
            type: 'info',
            action: async () => {
                try {
                    await Promise.all(selectedIds.map(id =>
                        api.post('/api/employees/rehire', { employee_id: id })
                    ));
                    toast.success('Employees rehired successfully');
                    closeConfirmModal();
                    fetchData();
                    setSelectedIds([]);
                } catch (err) {
                    toast.error('Rehire failed: ' + (err.response?.data?.error || err.message));
                    closeConfirmModal();
                }
            }
        });
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredItems.map(r => r.id));
        }
    };

    const resignTypes = ['Quit', 'Dismissed', 'Resign', 'Transfer', 'Retain Job Without Salary'];
    const attendanceOptions = ['Disable', 'Enable', 'Keep Current'];

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)]">
            <PageHeader
                icon={UserMinus}
                title="Resignations"
                subtitle="Resigned and terminated employees"
            />
            <div className="flex flex-col flex-1 card-base overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm flex-wrap">
                <Button variant="successSolid" icon={Plus} onClick={() => { resetForm(); setShowModal(true); }}>
                    Add Resignation
                </Button>

                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>

                <Button variant="danger" icon={Trash2} onClick={handleDelete}>
                    Delete
                </Button>

                <Button variant="secondary" icon={RotateCcw} onClick={handleRehire}>
                    Rehire
                </Button>

                <Button
                    variant="secondary"
                    icon={RefreshCw}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fetchData();
                    }}
                >
                    Refresh
                </Button>

                <Button variant="secondary" icon={Download} onClick={handleExport}>
                    Export
                </Button>

                <Button variant="secondary" icon={BellOff} onClick={handleDisableAttendance}>
                    Disable Attendance
                </Button>

                <div className="ml-auto w-72 relative">
                    <input
                        type="text"
                        placeholder="Search resigned employees..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey dark:text-slate-400" />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-800 custom-scrollbar">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load resignations</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="py-16 text-center">
                        <UserMinus size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching records' : 'No resignations recorded'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? 'No resigned employee matches that search.'
                                : 'Nobody has been marked as resigned or terminated yet.'}
                        </p>
                    </div>
                ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="px-5 py-3 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 dark:border-slate-700 text-saffron focus:ring-saffron"
                                    checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Employee Id</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Full Name</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Position</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Area Name</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Resign Type</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {paginatedItems.map(emp => (
                            <tr key={emp.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors group">
                                <td className="px-5 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-700 text-saffron focus:ring-saffron"
                                        checked={selectedIds.includes(emp.id)}
                                        onChange={() => toggleSelect(emp.id)}
                                    />
                                </td>
                                <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{emp.employee_code || '—'}</td>
                                <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{emp.name} {emp.last_name || ''}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{emp.department_name || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{emp.position_name || emp.designation || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{emp.area_name || '—'}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${emp.resignation_type === 'Dismissed' ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800' :
                                        emp.resignation_type === 'Transfer' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' :
                                            'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800'
                                        }`}>
                                        {emp.resignation_type || 'Resigned'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>

            {/* Pagination Component */}
            {/* Pagination Component */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                {/* Left Side: Total Records */}
                <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-full shadow-sm">
                        Total Records: <span className="text-slate-800 dark:text-slate-100 font-bold ml-1 tabular-nums">{filteredItems.length}</span>
                    </span>
                </div>

                {/* Right Side: Selected Count */}
                <div className="flex items-center gap-4">
                    {selectedIds.length > 0 && (
                        <span className="text-xs font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-3 py-1 rounded-full shadow-sm">
                            Selected: <span className="font-bold ml-1 tabular-nums">{selectedIds.length}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Resignation Modal */}
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title="Add Resignation"
                size="lg"
            >
                <form onSubmit={handleResignSubmit} className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Employee<span className="text-red-500 dark:text-red-400">*</span>:</label>
                        <select
                            value={formData.selectedEmployee}
                            onChange={e => setFormData({ ...formData, selectedEmployee: e.target.value })}
                            className="flex-1 input-base py-2 text-sm"
                            required
                        >
                            <option value="">Select Employee</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.employee_code} - {emp.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Resignation Date<span className="text-red-500 dark:text-red-400">*</span>:</label>
                        <input
                            type="date"
                            value={formData.resignationDate}
                            onChange={e => setFormData({ ...formData, resignationDate: e.target.value })}
                            className="flex-1 input-base py-2 text-sm"
                            required
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Resignation Type<span className="text-red-500 dark:text-red-400">*</span>:</label>
                        <select
                            value={formData.resignationType}
                            onChange={e => setFormData({ ...formData, resignationType: e.target.value })}
                            className="flex-1 input-base py-2 text-sm"
                            required
                        >
                            {resignTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Report End Date<span className="text-red-500 dark:text-red-400">*</span>:</label>
                        <input
                            type="date"
                            value={formData.reportEndDate}
                            onChange={e => setFormData({ ...formData, reportEndDate: e.target.value })}
                            className="flex-1 input-base py-2 text-sm"
                            required
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Attendance<span className="text-red-500 dark:text-red-400">*</span>:</label>
                        <select
                            value={formData.attendanceOption}
                            onChange={e => setFormData({ ...formData, attendanceOption: e.target.value })}
                            className="flex-1 input-base py-2 text-sm"
                            required
                        >
                            {attendanceOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-start gap-3">
                        <label className="w-40 text-right text-slate-grey dark:text-slate-400 text-sm font-medium pt-2">Resign Reason:</label>
                        <textarea
                            value={formData.reason}
                            onChange={e => setFormData({ ...formData, reason: e.target.value })}
                            className="flex-1 input-base py-2 text-sm resize-none"
                            rows={3}
                            placeholder="Optional reason for resignation..."
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-50 dark:border-slate-700">
                        <Button variant="secondary" onClick={() => setShowModal(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="success">
                            Confirm
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* General Confirmation Modal */}
            <Modal
                open={confirmModal.show}
                onClose={closeConfirmModal}
                size="sm"
                hideClose
            >
                {/* Centred confirmation: a left-aligned title bar would sit
                    above the icon and fight it, so it keeps its own layout. */}
                <div className="text-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 
                    ${confirmModal.type === 'danger' ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' :
                        confirmModal.type === 'warning' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                    {confirmModal.type === 'danger' ? <Trash2 size={24} /> :
                        confirmModal.type === 'warning' ? <BellOff size={24} /> : <RotateCcw size={24} />}
                </div>
                <h3 className="text-lg font-bold text-charcoal dark:text-slate-100 mb-2">{confirmModal.title}</h3>
                <p className="text-slate-grey dark:text-slate-400 mb-6">{confirmModal.message}</p>
                <div className="flex justify-center gap-3">
                    <Button variant="secondary" onClick={closeConfirmModal}>
                        Cancel
                    </Button>
                    <Button
                        variant={confirmModal.type === 'danger' ? 'dangerSolid' : 'primary'}
                        onClick={confirmModal.action}
                    >
                        Confirm
                    </Button>
                </div>
                </div>
            </Modal>
            </div>
        </div>
    );
}
