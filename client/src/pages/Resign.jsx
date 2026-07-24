import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    UserMinus, Plus, Trash2, Upload, ChevronDown, ChevronLeft, ChevronRight,
    RefreshCw, Search, RotateCcw, BellOff, Download, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components';

export default function Resign() {
    const [resignations, setResignations] = useState([]);
    const [employees, setEmployees] = useState([]); // Active employees for the dropdown
    const [loading, setLoading] = useState(true);
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
            const [resRes, empRes] = await Promise.all([
                api.get('/api/employees?status=resigned').catch(() => ({ data: [] })),
                api.get('/api/employees').catch(() => ({ data: [] }))
            ]);

            // Filter resigned employees for the table
            console.log('Resignation Fetch:', { resRes, empRes });
            const resigned = (resRes?.data || []).filter(e => e.status === 'resigned' || e.status === 'terminated');
            setResignations(resigned);

            // Filter active employees for the "Add Resignation" modal
            const active = (empRes?.data || []).filter(e => e.status === 'active');
            setEmployees(active);
        } catch (err) {
            console.error(err);
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
                        api.patch(`/api/employees/${id}`, { attendance_enabled: false })
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
        <div className="flex flex-col h-[calc(100vh-120px)] card-base overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white text-sm flex-wrap">
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="btn-primary flex items-center gap-2 shadow-saffron"
                >
                    <Plus size={18} /> Add Resignation
                </button>

                <div className="h-8 w-px bg-gray-200 mx-2 hidden md:block"></div>

                <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 font-medium transition-colors"
                >
                    <Trash2 size={16} /> Delete
                </button>

                <button
                    onClick={handleRehire}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 font-medium transition-colors"
                >
                    <RotateCcw size={16} /> Rehire
                </button>

                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fetchData();
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-slate-grey hover:bg-gray-50 rounded-full font-medium transition-colors border border-gray-200"
                    type="button"
                >
                    <RefreshCw size={16} /> Refresh
                </button>

                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 text-slate-grey hover:bg-gray-50 rounded-full font-medium transition-colors border border-gray-200"
                >
                    <Download size={16} /> Export
                </button>

                <button
                    onClick={handleDisableAttendance}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded-full font-medium transition-colors"
                >
                    <BellOff size={16} /> Disable Attendance
                </button>

                <div className="ml-auto w-72 relative">
                    <input
                        type="text"
                        placeholder="Search resigned employees..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey" />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-orange-50/50 text-charcoal font-semibold sticky top-0 z-10 border-b border-gray-100">
                        <tr>
                            <th className="p-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-saffron focus:ring-saffron"
                                    checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="p-4 border-b border-gray-100">Employee Id</th>
                            <th className="p-4 border-b border-gray-100">Full Name</th>
                            <th className="p-4 border-b border-gray-100">Department</th>
                            <th className="p-4 border-b border-gray-100">Position</th>
                            <th className="p-4 border-b border-gray-100">Area Name</th>
                            <th className="p-4 border-b border-gray-100">Resign Type</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-grey">Loading...</td></tr>
                        ) : paginatedItems.length === 0 ? (
                            <tr><td colSpan={7} className="p-12 text-center text-slate-grey">No resignation records found</td></tr>
                        ) : (
                            paginatedItems.map(emp => (
                                <tr key={emp.id} className="hover:bg-cream-50 transition-colors group">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-saffron focus:ring-saffron"
                                            checked={selectedIds.includes(emp.id)}
                                            onChange={() => toggleSelect(emp.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-mono text-saffron font-medium">{emp.employee_code}</td>
                                    <td className="p-4 font-bold text-charcoal">{emp.name} {emp.last_name || ''}</td>
                                    <td className="p-4 text-slate-grey">{emp.department_name || '-'}</td>
                                    <td className="p-4 text-slate-grey">{emp.position_name || emp.designation || '-'}</td>
                                    <td className="p-4 text-slate-grey">{emp.area_name || '-'}</td>
                                    <td className="p-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${emp.resignation_type === 'Dismissed' ? 'bg-red-50 text-red-700 border border-red-200' :
                                            emp.resignation_type === 'Transfer' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                'bg-orange-50 text-orange-700 border border-orange-200'
                                            }`}>
                                            {emp.resignation_type || 'Resigned'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Component */}
            {/* Pagination Component */}
            <div className="p-3 border-t border-gray-100 flex items-center justify-between text-sm text-slate-grey bg-gray-50/50">
                {/* Left Side: Total Records */}
                <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-slate-grey bg-white border border-gray-200 px-3 py-1 rounded-full shadow-sm">
                        Total Records: <span className="text-charcoal font-bold ml-1">{filteredItems.length}</span>
                    </span>
                </div>

                {/* Right Side: Selected Count */}
                <div className="flex items-center gap-4">
                    {selectedIds.length > 0 && (
                        <span className="text-xs font-medium text-slate-grey bg-white border border-gray-200 px-3 py-1 rounded-full shadow-sm">
                            Selected: <span className="text-charcoal font-bold ml-1">{selectedIds.length}</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Resignation Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-white/50 overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-lg text-charcoal">Add Resignation</h3>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white rounded-full text-slate-grey transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleResignSubmit} className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <label className="w-40 text-right text-slate-grey text-sm font-medium">Employee<span className="text-red-500">*</span>:</label>
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
                                <label className="w-40 text-right text-slate-grey text-sm font-medium">Resignation Date<span className="text-red-500">*</span>:</label>
                                <input
                                    type="date"
                                    value={formData.resignationDate}
                                    onChange={e => setFormData({ ...formData, resignationDate: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="w-40 text-right text-slate-grey text-sm font-medium">Resignation Type<span className="text-red-500">*</span>:</label>
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
                                <label className="w-40 text-right text-slate-grey text-sm font-medium">Report End Date<span className="text-red-500">*</span>:</label>
                                <input
                                    type="date"
                                    value={formData.reportEndDate}
                                    onChange={e => setFormData({ ...formData, reportEndDate: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm"
                                    required
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="w-40 text-right text-slate-grey text-sm font-medium">Attendance<span className="text-red-500">*</span>:</label>
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
                                <label className="w-40 text-right text-slate-grey text-sm font-medium pt-2">Resign Reason:</label>
                                <textarea
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm resize-none"
                                    rows={3}
                                    placeholder="Optional reason for resignation..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 rounded-full text-slate-grey hover:bg-gray-50 font-medium transition-colors border border-gray-200">
                                    Cancel
                                </button>
                                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 font-medium shadow-lg shadow-green-100 transition-all">
                                    Confirm
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* General Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-white/50 text-center p-6">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 
                            ${confirmModal.type === 'danger' ? 'bg-red-100 text-red-500' :
                                confirmModal.type === 'warning' ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-500'}`}>
                            {confirmModal.type === 'danger' ? <Trash2 size={24} /> :
                                confirmModal.type === 'warning' ? <BellOff size={24} /> : <RotateCcw size={24} />}
                        </div>
                        <h3 className="text-lg font-bold text-charcoal mb-2">{confirmModal.title}</h3>
                        <p className="text-slate-grey mb-6">{confirmModal.message}</p>
                        <div className="flex justify-center gap-3">
                            <button
                                onClick={closeConfirmModal}
                                className="px-5 py-2.5 text-slate-grey hover:bg-gray-50 rounded-full font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.action}
                                className={`px-5 py-2.5 text-white rounded-full font-medium shadow-lg transition-all
                                    ${confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' :
                                        confirmModal.type === 'warning' ? 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/30' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30'}`}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
