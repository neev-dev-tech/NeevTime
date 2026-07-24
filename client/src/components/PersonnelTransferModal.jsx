import React, { useState } from 'react';
import { X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from './Toast';

export default function PersonnelTransferModal({ isOpen, onClose, transferType = 'Department', employees = [], departments = [], positions = [], areas = [], onConfirm }) {
    const toast = useToast();
    const [selectedDept, setSelectedDept] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [targetValue, setTargetValue] = useState('');
    const [remarks, setRemarks] = useState('');
    const itemsPerPage = 50;

    const filteredEmployees = employees.filter(emp =>
        (emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.employee_code?.includes(searchTerm)) &&
        (!selectedDept || emp.department_id == selectedDept)
    );

    const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

    const toggleEmployee = (empId) => {
        setSelectedEmployees(prev =>
            prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedEmployees.length === filteredEmployees.length) {
            setSelectedEmployees([]);
        } else {
            setSelectedEmployees(filteredEmployees.map(e => e.id));
        }
    };

    const getTargetOptions = () => {
        switch (transferType) {
            case 'Department': return departments.map(d => ({ value: d.id, label: d.name || d.department_name }));
            case 'Position': return positions.map(p => ({ value: p.id, label: p.name || p.position_name }));
            case 'Area': return areas.map(a => ({ value: a.id, label: a.name || a.area_name }));
            default: return [];
        }
    };

    const handleConfirm = () => {
        if (selectedEmployees.length === 0) return toast.warning('Please select employees');
        if (!targetValue) return toast.warning(`Please select target ${transferType}`);
        onConfirm({ employeeIds: selectedEmployees, targetId: targetValue, remarks });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col border border-white/50">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <h3 className="text-xl font-bold text-charcoal">{transferType} Transfer</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full transition-colors text-slate-grey hover:text-charcoal">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-hidden flex flex-col gap-6">
                    {/* Target Selection */}
                    <div className="flex items-center gap-4">
                        <label className="text-slate-grey font-medium whitespace-nowrap">Target {transferType}<span className="text-red-500">*</span>:</label>
                        <select
                            value={targetValue}
                            onChange={e => setTargetValue(e.target.value)}
                            className="input-base max-w-md"
                        >
                            <option value="">Select {transferType}</option>
                            {getTargetOptions().map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                        {/* Left Panel - Employee Selection */}
                        <div className="flex-1 border border-gray-200 rounded-xl flex flex-col overflow-hidden bg-white">
                            {/* Filters */}
                            <div className="flex gap-3 p-3 border-b border-gray-100 bg-gray-50/30">
                                <select
                                    value={selectedDept}
                                    onChange={e => setSelectedDept(e.target.value)}
                                    className="input-base py-1.5 text-sm min-w-40"
                                >
                                    <option value="">All Departments</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name || d.department_name}</option>
                                    ))}
                                </select>
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="Search employee..."
                                        className="input-base py-1.5 text-sm pr-9"
                                    />
                                    <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>
                            </div>

                            {/* Employee Table */}
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr className="text-left text-gray-600">
                                            <th className="p-2 w-8">
                                                <input type="checkbox" checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0} onChange={toggleSelectAll} />
                                            </th>
                                            <th className="p-2">Employee Id</th>
                                            <th className="p-2">First Name</th>
                                            <th className="p-2">Last Name</th>
                                            <th className="p-2">Department</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedEmployees.length === 0 ? (
                                            <tr><td colSpan={5} className="p-8 text-center text-gray-400">No employees found</td></tr>
                                        ) : (
                                            paginatedEmployees.map(emp => (
                                                <tr key={emp.id} className="border-t hover:bg-gray-50">
                                                    <td className="p-2">
                                                        <input type="checkbox" checked={selectedEmployees.includes(emp.id)} onChange={() => toggleEmployee(emp.id)} />
                                                    </td>
                                                    <td className="p-2 text-blue-600">{emp.employee_code}</td>
                                                    <td className="p-2">{emp.name}</td>
                                                    <td className="p-2">{emp.last_name || ''}</td>
                                                    <td className="p-2">{emp.department_name || '-'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center gap-2 p-2 border-t text-sm text-gray-600 bg-gray-50">
                                <select className="border rounded px-2 py-1" value={itemsPerPage}>
                                    <option>50</option>
                                </select>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 hover:bg-gray-200 rounded">
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="px-2">{currentPage} / {totalPages || 1}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 hover:bg-gray-200 rounded">
                                    <ChevronRight size={16} />
                                </button>
                                <span>Total {filteredEmployees.length} Records</span>
                            </div>
                        </div>

                        {/* Right Panel - Selected */}
                        <div className="w-80 border border-gray-200 rounded-xl flex flex-col flex-shrink-0 bg-white overflow-hidden">
                            <div className="p-3 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
                                <span className="text-charcoal font-bold text-sm">Selected Employees</span>
                                <span className="bg-saffron text-white text-xs px-2 py-0.5 rounded-full font-bold">{selectedEmployees.length}</span>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-orange-50/50 sticky top-0 z-10">
                                        <tr className="text-left text-charcoal font-semibold">
                                            <th className="p-3">ID</th>
                                            <th className="p-3">Name</th>
                                            <th className="p-3 w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {selectedEmployees.length === 0 ? (
                                            <tr><td colSpan={3} className="p-8 text-center text-gray-400 text-xs">No employees selected</td></tr>
                                        ) : (
                                            employees.filter(e => selectedEmployees.includes(e.id)).map(emp => (
                                                <tr key={emp.id} className="hover:bg-cream-50 transition-colors group">
                                                    <td className="p-3 text-saffron font-medium">{emp.employee_code}</td>
                                                    <td className="p-3 text-slate-grey">{emp.name}</td>
                                                    <td className="p-3">
                                                        <button onClick={() => toggleEmployee(emp.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors opacity-0 group-hover:opacity-100">
                                                            <X size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Remarks */}
                    <div className="pt-2">
                        <textarea
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            className="input-base"
                            rows={2}
                            placeholder="Add optional remarks for this transfer..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50/30">
                    <button onClick={onClose} className="px-6 py-2.5 text-slate-grey hover:bg-gray-100 rounded-full font-medium transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleConfirm} className="btn-primary px-8">
                        Confirm Transfer
                    </button>
                </div>
            </div>
        </div>
    );
}
