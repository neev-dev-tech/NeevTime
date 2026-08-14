import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import {
    Plus, Trash2, Upload, Download,
    ChevronDown, Search, RefreshCw,
    Smartphone, ArrowRightLeft, Settings,
    Fingerprint, ScanFace, Users, AlertCircle, SearchX
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ResignationModal from '../components/ResignationModal';
import { Button, PageHeader } from '../components';
import Modal from '../components/Modal';

/* ---- shared cell vocabulary (matches DeviceData / Devices) ---- */
const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';
const BADGE_ON = `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`;
const BADGE_OFF = `${BADGE} bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`;
const CELL_CODE = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const CELL_SOFT = 'text-slate-600 dark:text-slate-300';
const CELL_MONO = 'font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300';
const BIO_ON = 'text-emerald-500';
const BIO_OFF = 'text-slate-300 dark:text-slate-600';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const initialOf = (name) => (String(name || '').trim().charAt(0) || '?').toUpperCase();

export default function Employees() {
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Menus
    const [showTransferMenu, setShowTransferMenu] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);
    const [showAppMenu, setShowAppMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);

    // Modals & Refs
    const [showAddModal, setShowAddModal] = useState(false);
    // Toast notification state
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);
    const showToast = (message, type = 'info') => {
        // Clear any existing timeout
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ message, type });
        // Show toast for 8 seconds for better visibility
        toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
            toastTimeoutRef.current = null;
        }, 8000);
    };
    const [showImportModal, setShowImportModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showResignationModal, setShowResignationModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmMessage, setConfirmMessage] = useState('');
    const [transferType, setTransferType] = useState(null);
    const fileInputRef = useRef(null);

    // Form Data
    const [newEmp, setNewEmp] = useState({
        employee_code: '',
        name: '',
        department_id: '',
        designation: '',
        area_id: '',
        card_number: '',
        password: '',
        privilege: 0,
        gender: 'Male',
        dob: '',
        joining_date: new Date().toISOString().split('T')[0],
        mobile: '',
        email: '',
        address: '',
        status: 'active',
        employment_type: 'Permanent'
    });

    const [transferData, setTransferData] = useState({
        targetId: '',
        effectiveDate: new Date().toISOString().split('T')[0]
    });
    // Target Selection State
    const [targetValue, setTargetValue] = useState('');

    const [departments, setDepartments] = useState([]);
    const [areas, setAreas] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside any dropdown container
            const isClickInsideDropdown = event.target.closest('.dropdown-container') ||
                event.target.closest('.dropdown-menu');

            if (!isClickInsideDropdown) {
                setShowTransferMenu(false);
                setShowImportMenu(false);
                setShowAppMenu(false);
                setShowMoreMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        fetchEmployees();
        fetchDepsAndAreas();
    }, []);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredEmployees(employees);
        } else {
            const lower = searchQuery.toLowerCase();
            // Every one of these is nullable. Two employees came across from
            // ERPNext with no name at all, and e.name.toLowerCase() took the
            // whole page down to the error boundary the moment anyone typed.
            const has = (v) => String(v ?? '').toLowerCase().includes(lower);
            setFilteredEmployees(employees.filter(e =>
                has(e.name) || has(e.employee_code) || has(e.department_name)
            ));
        }
    }, [searchQuery, employees]);

    const [refreshing, setRefreshing] = useState(false);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            setError(null);
            console.log('[Employees] fetchEmployees called');
            const res = await api.get('/api/employees');
            console.log('[Employees] Fetched', res.data?.length || 0, 'employees');
            setEmployees(res.data);
            setFilteredEmployees(res.data);
            setSelectedIds([]);
        } catch (err) {
            console.error("Failed to fetch employees", err);
            setError(err.response?.data?.error || err.message || 'Could not load employees');
            showToast('Failed to refresh employees', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchDepsAndAreas = async () => {
        try {
            const deps = await api.get('/api/departments').catch(() => ({ data: [] }));
            const ars = await api.get('/api/areas').catch(() => ({ data: [] }));
            const pos = await api.get('/api/positions').catch(() => ({ data: [] }));
            setDepartments(deps.data);
            setAreas(ars.data);
            setPositions(pos.data);
        } catch (err) { console.warn('Lookups failed', err); }
    };

    const toggleSelect = (id) => {
        console.log('Toggling ID:', id);
        if (!id) {
            console.warn('Attempted to select undefined ID');
            return;
        }
        setSelectedIds(prev => {
            const newSelection = prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id];
            console.log('New Selection:', newSelection);
            return newSelection;
        });
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/employees', newEmp);
            setShowAddModal(false);
            setNewEmp({
                employee_code: '', name: '', department_id: '', designation: '', area_id: '',
                card_number: '', password: '', privilege: 0, gender: 'Male', dob: '',
                joining_date: '', mobile: '', email: '', address: '', status: 'active', employment_type: 'Permanent'
            });
            fetchEmployees();
        } catch (err) { showToast('Failed to add employee: ' + (err.response?.data?.error || err.message), 'error'); }
    };

    // Delete Handler
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handleDelete = () => {
        if (selectedIds.length === 0) return showToast('Select employees to delete', 'error');
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/api/employees?ids=${selectedIds.join(',')}`);
            fetchEmployees();
            setShowDeleteModal(false);
        } catch (err) {
            console.error(err);
            showToast('Delete failed', 'error');
        }
    };

    const handleTransfer = (type) => {
        if (selectedIds.length === 0) return showToast('Select employees first', 'error');
        setTransferType(type);
        setShowTransferModal(true);
    };

    const submitTransfer = async (e) => {
        e.preventDefault();

        if (!targetValue) return showToast('Please select a target destination', 'error');

        try {
            await api.post('/api/personnel-transfer', {
                ids: selectedIds,
                type: transferType,
                targetId: targetValue
            });
            showToast(`Transferred ${selectedIds.length} employees to new ${transferType}. Sync commands sent.`, 'success');
            setShowTransferModal(false);
            setTargetValue('');
            fetchEmployees();
        } catch (err) {
            console.error(err);
            showToast('Transfer failed: ' + (err.response?.data?.error || err.message), 'error');
        }
    };

    // Export Handler
    const handleExport = () => {
        try {
            // Create CSV content
            const headers = ['Employee ID', 'Name', 'Department', 'Mobile', 'Email', 'Position', 'Area', 'Status', 'Employment Type', 'Joining Date'];
            const csvRows = [headers.join(',')];

            filteredEmployees.forEach(emp => {
                const row = [
                    emp.employee_code || '',
                    emp.name || '',
                    emp.department_name || '',
                    emp.mobile || '',
                    emp.email || '',
                    emp.designation || '',
                    emp.area_name || '',
                    emp.status || '',
                    emp.employment_type || '',
                    emp.joining_date || ''
                ];
                // Escape commas and quotes in data
                const escapedRow = row.map(field => {
                    const stringField = String(field);
                    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                        return `"${stringField.replace(/"/g, '""')}"`;
                    }
                    return stringField;
                });
                csvRows.push(escapedRow.join(','));
            });

            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', `employees_export_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Export failed:', err);
            showToast('Failed to export data', 'error');
        }
    };

    // Import Handler (File Upload)
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            try {
                // Initial simple CSV parsing
                const lines = text.split(/\r?\n/);
                const data = lines.map(line => {
                    const parts = line.split(',');
                    if (parts.length < 2) return null;
                    return {
                        employee_code: parts[0]?.trim(),
                        name: parts[1]?.trim(),
                        department_id: parts[2]?.trim() || null
                    };
                }).filter(Boolean);

                if (data.length === 0) {
                    showToast('No valid data found in CSV', 'error');
                    return;
                }

                await api.post('/api/employees/import', { employees: data });
                setShowImportModal(false);
                fetchEmployees();
                showToast(`Imported ${data.length} records`, 'success');
            } catch (err) {
                console.error(err);
                showToast('Import failed', 'error');
            }
        };
        reader.readAsText(file);
    };

    const handleAppAccess = async (enabled) => {
        if (selectedIds.length === 0) return showToast('Select employees first', 'error');
        try {
            await api.put('/api/employees/app-access', { ids: selectedIds, enabled });
            fetchEmployees();
            showToast(`App Access ${enabled ? 'Enabled' : 'Disabled'} for ${selectedIds.length} employees`, 'success');
        } catch (err) { showToast('Update failed', 'error'); }
    };

    const handleResignationSubmit = async (formData) => {
        try {
            // Loop through selected IDs and send resignation for each
            // (Since backend endpoint is setup for single employee currently)
            let successCount = 0;
            const employeesToProcess = filteredEmployees.filter(e => selectedIds.includes(e.id));

            for (const emp of employeesToProcess) {
                // Convert string "Enable"/"Disable" to boolean for DB
                const payload = {
                    employee_code: emp.employee_code,
                    ...formData,
                    attendance_enabled: formData.attendance_enabled === 'Enable',
                    reason_enabled: formData.reason_enabled === 'Enable'
                };

                await api.post('/api/employees/resign', payload);
                successCount++;
            }

            showToast(`Successfully processed resignation for ${successCount} employees.`, 'success');
            setShowResignationModal(false);
            setSelectedIds([]); // Clear selection
            fetchEmployees(); // Refresh list
        } catch (err) {
            console.error(err);
            showToast('Operation failed: ' + (err.response?.data?.error || err.message), 'error');
        }
    };

    // Dropdown Item Component
    const DropdownItem = ({ label, onClick, danger = false }) => (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); }}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick?.();
                // Close all dropdowns after action
                setShowTransferMenu(false);
                setShowImportMenu(false);
                setShowAppMenu(false);
                setShowMoreMenu(false);
            }}
            className={`block w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}
        >
            {label}
        </button>
    );

    const handleMoreSettings = (action) => {
        console.log('HandleMoreSettings Action:', action, 'SelectedIds:', selectedIds);
        if (selectedIds.length === 0) return showToast('Please select at least one employee.', 'error');

        const messages = {
            'push': `Resynchronize ${selectedIds.length} employees to all devices?`,
            'pull': `Re-upload data for ${selectedIds.length} employees from devices?`,
            'delete-bio': `Delete biometric templates for ${selectedIds.length} employees from all devices? This cannot be undone.`
        };

        // Show custom confirmation modal instead of window.confirm
        setConfirmMessage(messages[action]);
        setConfirmAction(() => async () => {
            const endpoints = {
                'push': '/api/devices/employee-actions/push',
                'pull': '/api/devices/employee-actions/pull',
                'delete-bio': '/api/devices/employee-actions/delete-template'
            };

            try {
                const res = await api.post(endpoints[action], { employee_ids: selectedIds });
                showToast('Success: ' + res.data.message, 'success');
                setShowMoreMenu(false);
            } catch (err) {
                console.error(err);
                showToast('Operation failed: ' + (err.response?.data?.error || err.message), 'error');
            }
        });
        setShowConfirmModal(true);
    };

    const handleConfirmAction = () => {
        if (confirmAction) {
            confirmAction();
        }
        setShowConfirmModal(false);
        setConfirmAction(null);
        setConfirmMessage('');
    };

    const tableHead = (
        <thead>
            <tr>
                <th className="table-header w-12 text-center">
                    <input
                        type="checkbox"
                        className="rounded border-slate-300 dark:border-slate-700 text-saffron focus:ring-saffron"
                        onChange={(e) => {
                            if (e.target.checked) setSelectedIds(filteredEmployees.map(e => e.id));
                            else setSelectedIds([]);
                        }}
                    />
                </th>
                <th className="table-header">Employee Id</th>
                <th className="table-header">Full Name</th>
                <th className="table-header">Department</th>
                <th className="table-header">Mobile</th>
                <th className="table-header text-center">Status</th>
                <th className="table-header text-center">Biometrics</th>
                <th className="table-header text-center">App Access</th>
                <th className="table-header">Position</th>
                <th className="table-header">Area</th>
            </tr>
        </thead>
    );

    return (
        <div className="relative">
            <PageHeader
                icon={Users}
                title="Employees"
                subtitle="Personnel records, biometric enrolment and app access"
            />

            <div className="flex flex-col h-[calc(100vh-210px)] card-base !p-0 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200/80 dark:border-slate-700 text-sm flex-wrap">
                <Button variant="successSolid" icon={Plus} onClick={() => setShowAddModal(true)}>
                    Add Employee
                </Button>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>
                <Button variant="danger" icon={Trash2} onClick={handleDelete}>
                    Delete
                </Button>
                <Button
                    variant="secondary"
                    disabled={refreshing}
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[Employees] Refresh button clicked');
                        setRefreshing(true);
                        try {
                            await Promise.all([fetchEmployees(), fetchDepsAndAreas()]);
                            showToast('Data refreshed successfully', 'success');
                        } catch (err) {
                            console.error('[Employees] Refresh error:', err);
                            showToast('Failed to refresh data', 'error');
                        } finally {
                            setRefreshing(false);
                        }
                    }}
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </Button>
                <Button variant="secondary" icon={Download} onClick={handleExport}>
                    Export
                </Button>

                {/* Import Dropdown */}
                <div className="relative dropdown-container">
                    <Button
                        variant="secondary"
                        icon={Upload}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowImportMenu(!showImportMenu);
                            // Close other dropdowns
                            setShowTransferMenu(false);
                            setShowAppMenu(false);
                            setShowMoreMenu(false);
                        }}
                    >
                        Import <ChevronDown size={14} className={showImportMenu ? 'rotate-180 transition-transform' : ''} />
                    </Button>
                    {showImportMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowImportMenu(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-2xl z-20 overflow-hidden dropdown-menu">
                            <DropdownItem label="Import Employee (CSV)" onClick={() => setShowImportModal(true)} />
                        </div>
                        </>
                    )}
                </div>

                {/* Personnel Transfer Dropdown */}
                <div className="relative dropdown-container">
                    <Button
                        variant="secondary"
                        icon={ArrowRightLeft}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTransferMenu(!showTransferMenu);
                            // Close other dropdowns
                            setShowImportMenu(false);
                            setShowAppMenu(false);
                            setShowMoreMenu(false);
                        }}
                    >
                        Transfer <ChevronDown size={14} className={showTransferMenu ? 'rotate-180 transition-transform' : ''} />
                    </Button>
                    {
                        showTransferMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowTransferMenu(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-2xl z-20 overflow-hidden dropdown-menu">
                            <DropdownItem label="Department Transfer" onClick={() => handleTransfer('Department')} />
                            <DropdownItem label="Position Transfer" onClick={() => handleTransfer('Position')} />
                            <DropdownItem label="Move to New Area" onClick={() => handleTransfer('Area')} />
                            <DropdownItem
                                label="Resignation"
                                onClick={() => {
                                    if (selectedIds.length === 0) return showToast('Select employees first', 'error');
                                    setShowResignationModal(true);
                                }}
                                danger
                            />
                        </div>
                            </>
                        )
                    }
                </div >

                {/* App Dropdown */}
                <div className="relative dropdown-container">
                    <Button
                        variant="secondary"
                        icon={Smartphone}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAppMenu(!showAppMenu);
                            // Close other dropdowns
                            setShowImportMenu(false);
                            setShowTransferMenu(false);
                            setShowMoreMenu(false);
                        }}
                    >
                        App Access <ChevronDown size={14} className={showAppMenu ? 'rotate-180 transition-transform' : ''} />
                    </Button>
                    {
                        showAppMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowAppMenu(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-2xl z-20 overflow-hidden dropdown-menu">
                            <DropdownItem label="Enable Access" onClick={() => handleAppAccess(true)} />
                            <DropdownItem label="Disable Access" onClick={() => handleAppAccess(false)} danger />
                        </div>
                            </>
                        )
                    }
                </div >

                {/* More Settings Dropdown */}
                < div className="relative dropdown-container" >
                    <Button
                        variant="secondary"
                        icon={Settings}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowMoreMenu(!showMoreMenu);
                            // Close other dropdowns
                            setShowImportMenu(false);
                            setShowTransferMenu(false);
                            setShowAppMenu(false);
                        }}
                    >
                        More <ChevronDown size={14} className={showMoreMenu ? 'rotate-180 transition-transform' : ''} />
                    </Button>
                    {
                        showMoreMenu && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-2xl z-20 overflow-hidden dropdown-menu">
                            <DropdownItem label="Resynchronize to device" onClick={() => handleMoreSettings('push')} />
                            <DropdownItem label="Re-upload from device" onClick={() => handleMoreSettings('pull')} />
                            <DropdownItem label="Delete Biometric Template" onClick={() => handleMoreSettings('delete-bio')} danger />
                        </div>
                            </>
                        )
                    }
                </div >

                <div className="ml-auto w-72 relative">
                    <input
                        type="text"
                        placeholder="Search employee by name, code..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey dark:text-slate-400" />
                </div>
            </div >

            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                {loading ? (
                    <table className="w-full text-left text-sm border-collapse">
                        {tableHead}
                        <tbody>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <tr key={i} className="border-b border-slate-100 dark:border-slate-700/60">
                                    <td className="px-6 py-4">
                                        <div className="h-4 w-4 mx-auto rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="h-3 w-16 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                            <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                        </div>
                                    </td>
                                    {Array.from({ length: 7 }).map((__, j) => (
                                        <td key={j} className="px-6 py-4">
                                            <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load employees</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchEmployees}>Try again</Button>
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    searchQuery ? (
                        <div className="py-20 text-center px-6">
                            <SearchX size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No results match your search</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Nothing matches &ldquo;{searchQuery}&rdquo;. Try another name, employee id or department.
                            </p>
                        </div>
                    ) : (
                        <div className="py-20 text-center px-6">
                            <Users size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No employees yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Add an employee with the button above, or import a CSV to bring your existing list in.
                            </p>
                        </div>
                    )
                ) : (
                <table className="w-full text-left text-sm border-collapse">
                    {tableHead}
                    <tbody>
                        {filteredEmployees.map(emp => {
                            const isActive = emp.status === 'active';
                            const appOn = !!emp.app_login_enabled;
                            return (
                            <tr key={emp.employee_code} className="table-row group">
                                <td className="px-6 py-4 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(emp.id)}
                                        onChange={() => toggleSelect(emp.id)}
                                        className="rounded border-slate-300 dark:border-slate-700 text-saffron focus:ring-saffron"
                                    />
                                </td>
                                <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/employees/${emp.id}`)}>
                                    <span className={CELL_CODE}>{dash(emp.employee_code)}</span>
                                </td>
                                <td className="px-6 py-4 cursor-pointer" onClick={() => navigate(`/employees/${emp.id}`)}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span
                                            aria-hidden="true"
                                            className="w-9 h-9 shrink-0 rounded-full grid place-items-center font-bold text-xs bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70"
                                        >
                                            {initialOf(emp.name)}
                                        </span>
                                        <span className={`${CELL_STRONG} truncate`}>{dash(emp.name)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><span className={CELL_SOFT}>{dash(emp.department_name)}</span></td>
                                <td className="px-6 py-4"><span className={CELL_MONO}>{dash(emp.mobile)}</span></td>
                                <td className="px-6 py-4 text-center">
                                    <span className={isActive ? BADGE_ON : BADGE_OFF}>
                                        {dash(emp.status)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <span
                                            className="inline-flex"
                                            title={emp.has_fingerprint ? 'Fingerprint enrolled' : 'No fingerprint enrolled'}
                                        >
                                            <Fingerprint size={18} className={emp.has_fingerprint ? BIO_ON : BIO_OFF} />
                                        </span>
                                        <span
                                            className="inline-flex"
                                            title={emp.has_face ? 'Face enrolled' : 'No face enrolled'}
                                        >
                                            <ScanFace size={18} className={emp.has_face ? BIO_ON : BIO_OFF} />
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={appOn ? BADGE_ON : BADGE_OFF}>
                                        {appOn ? 'Enabled' : 'Disabled'}
                                    </span>
                                </td>
                                <td className="px-6 py-4"><span className={CELL_SOFT}>{dash(emp.designation)}</span></td>
                                <td className="px-6 py-4"><span className={CELL_SOFT}>{dash(emp.area_name)}</span></td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
                )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200/80 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center">
                <span>Total <span className="font-bold text-slate-700 dark:text-slate-200">{filteredEmployees.length}</span> Records</span>
                <span>Selected: <span className="font-bold text-orange-600 dark:text-orange-400">{selectedIds.length}</span></span>
            </div>
            </div>

            {/* Add Employee Modal */}
            <Modal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                title="Add Employee"
                size="xl"
            >
                <form onSubmit={handleAddSubmit} autoComplete="off">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Personal Details */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-2 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700">
                        <div className="w-1 h-4 bg-saffron rounded-full"></div>
                        <span className="text-sm font-bold text-charcoal dark:text-slate-100 uppercase tracking-wider">Personal Details</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Employee ID *</label>
                        <input required type="text" className="input-base"
                            value={newEmp.employee_code} onChange={e => setNewEmp({ ...newEmp, employee_code: e.target.value })}
                                placeholder="e.g. EMP001" autoComplete="off" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Full Name *</label>
                        <input required type="text" className="input-base"
                            value={newEmp.name} onChange={e => setNewEmp({ ...newEmp, name: e.target.value })}
                            placeholder="John Doe" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Gender</label>
                        <select className="input-base"
                            value={newEmp.gender} onChange={e => setNewEmp({ ...newEmp, gender: e.target.value })}>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Date of Birth</label>
                        <input type="date" className="input-base"
                            value={newEmp.dob} onChange={e => setNewEmp({ ...newEmp, dob: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Mobile</label>
                        <input type="text" className="input-base"
                            value={newEmp.mobile} onChange={e => setNewEmp({ ...newEmp, mobile: e.target.value })}
                            placeholder="+91..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Email</label>
                        <input type="email" className="input-base"
                            value={newEmp.email} onChange={e => setNewEmp({ ...newEmp, email: e.target.value })}
                            placeholder="john@example.com" />
                    </div>
                    <div className="col-span-1 md:col-span-3">
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Address</label>
                        <textarea rows={2} className="input-base resize-none"
                            value={newEmp.address} onChange={e => setNewEmp({ ...newEmp, address: e.target.value })}
                            placeholder="Enter full address" />
                    </div>

                    {/* Work Details */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-2 pb-2 mb-2 mt-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="w-1 h-4 bg-saffron rounded-full"></div>
                        <span className="text-sm font-bold text-charcoal dark:text-slate-100 uppercase tracking-wider">Work Details</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Department</label>
                        <select className="input-base"
                            value={newEmp.department_id} onChange={e => setNewEmp({ ...newEmp, department_id: e.target.value })}>
                            <option value="">Select Department</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Position / Designation</label>
                            <select className="input-base"
                                value={newEmp.designation} onChange={e => setNewEmp({ ...newEmp, designation: e.target.value })}>
                                <option value="">Select Position</option>
                                {positions.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Area</label>
                        <select className="input-base"
                            value={newEmp.area_id} onChange={e => setNewEmp({ ...newEmp, area_id: e.target.value })}>
                            <option value="">Select Area</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Joining Date</label>
                        <input type="date" className="input-base"
                            value={newEmp.joining_date} onChange={e => setNewEmp({ ...newEmp, joining_date: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Status</label>
                        <select className="input-base"
                            value={newEmp.status} onChange={e => setNewEmp({ ...newEmp, status: e.target.value })}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="resigned">Resigned</option>
                            <option value="terminated">Terminated</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Employment Type</label>
                        <select className="input-base"
                            value={newEmp.employment_type} onChange={e => setNewEmp({ ...newEmp, employment_type: e.target.value })}>
                            <option value="Permanent">Permanent</option>
                            <option value="Contract">Contract</option>
                            <option value="Intern">Intern</option>
                        </select>
                    </div>

                    {/* System Access */}
                    <div className="col-span-1 md:col-span-3 flex items-center gap-2 pb-2 mb-2 mt-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="w-1 h-4 bg-saffron rounded-full"></div>
                        <span className="text-sm font-bold text-charcoal dark:text-slate-100 uppercase tracking-wider">System & Device</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Card Number</label>
                        <input type="text" className="input-base"
                            value={newEmp.card_number} onChange={e => setNewEmp({ ...newEmp, card_number: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Password (Device)</label>
                        <input type="password" className="input-base"
                                value={newEmp.password} onChange={e => setNewEmp({ ...newEmp, password: e.target.value })}
                                autoComplete="new-password" />
                    </div>

                    <div className="col-span-1 md:col-span-3 flex justify-end gap-4 pt-6 border-t border-slate-100 dark:border-slate-700 mt-4">
                        <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
                        <Button type="submit" variant="primary">Add Employee</Button>
                    </div>
                </div>
                </form>
            </Modal>

            {/* Import Modal */}
            <Modal
                open={showImportModal}
                onClose={() => setShowImportModal(false)}
                title="Import Employees"
                size="lg"
            >
                <div className="p-8 text-center">
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:bg-orange-50/50 dark:hover:bg-slate-700/50 hover:border-saffron/50 transition-ui cursor-pointer group">
                        <div className="w-16 h-16 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <Upload className="text-orange-500 dark:text-orange-400" size={28} />
                        </div>
                        <h4 className="text-lg font-bold text-charcoal dark:text-slate-100 mb-2">Upload CSV File</h4>
                        <p className="text-sm text-slate-grey dark:text-slate-400 mb-6">Format: ID, Name, DeptID</p>
                        <div className="relative inline-block">
                            <Button variant="secondary" className="relative pointer-events-none">Select File</Button>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Transfer Modal */}
            <Modal
                open={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                size="md"
                hideClose
            >
                <div className="mb-6">
                    <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
                        <ArrowRightLeft className="text-saffron" size={24} />
                    </div>
                        <h3 className="font-semibold text-xl mb-1 text-slate-800 dark:text-slate-100">{transferType} Transfer</h3>
                    <p className="text-slate-grey dark:text-slate-400 text-sm">Move <span className="font-bold text-charcoal dark:text-slate-100">{selectedIds.length}</span> employees to a new {transferType.toLowerCase()}.</p>
                </div>

                <div className="mb-8">
                    <label className="block text-sm font-bold text-charcoal dark:text-slate-100 mb-2">
                        Select New {transferType}
                    </label>

                    {transferType === 'Department' && (
                        <select
                            className="input-base"
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                        >
                            <option value="">Select Department</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    )}

                    {transferType === 'Area' && (
                        <select
                            className="input-base"
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                        >
                            <option value="">Select Area</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    )}

                    {transferType === 'Position' && (
                        <input
                            type="text"
                            className="input-base"
                            placeholder="Enter new position/designation"
                            value={targetValue}
                            onChange={(e) => setTargetValue(e.target.value)}
                        />
                    )}
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Cancel</Button>
                    <Button variant="primary" onClick={submitTransfer}>Confirm Transfer</Button>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                open={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                size="sm"
                hideClose
            >
                <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <Trash2 className="text-red-500 dark:text-red-400" size={32} />
                </div>
                    <h3 className="text-xl font-semibold mb-2 text-slate-800 dark:text-slate-100">Delete Employees?</h3>
                <p className="text-slate-grey dark:text-slate-400 text-sm mb-8 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-charcoal dark:text-slate-100">{selectedIds.length}</span> selected employees? This action cannot be undone.
                </p>
                <div className="flex justify-center gap-4">
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="dangerSolid" onClick={confirmDelete}>
                        Delete
                    </Button>
                </div>
                </div>
            </Modal>

            {/* Resignation Modal */}
            <ResignationModal
                isOpen={showResignationModal}
                onClose={() => setShowResignationModal(false)}
                selectedCount={selectedIds.length}
                onConfirm={handleResignationSubmit}
            />

            {/* Confirmation Modal */}
            <Modal
                open={showConfirmModal}
                onClose={() => { setShowConfirmModal(false); setConfirmAction(null); setConfirmMessage(''); }}
                size="md"
                hideClose
            >
                <div className="mb-6">
                    <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
                        <Settings className="text-saffron" size={24} />
                    </div>
                        <h3 className="font-semibold text-xl mb-1 text-slate-800 dark:text-slate-100">Confirm Action</h3>
                    <p className="text-slate-grey dark:text-slate-400 text-sm">{confirmMessage}</p>
                </div>
                <div className="flex justify-end gap-3">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setShowConfirmModal(false);
                            setConfirmAction(null);
                            setConfirmMessage('');
                        }}
                    >
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleConfirmAction}>
                        Confirm
                    </Button>
                </div>
            </Modal>

            {/* Toast UI */}
            {
                toast && (
                    <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
                        <span className="flex-1 pr-3">{toast.message}</span>
                        <button
                            onClick={() => {
                                if (toastTimeoutRef.current) {
                                    clearTimeout(toastTimeoutRef.current);
                                    toastTimeoutRef.current = null;
                                }
                                setToast(null);
                            }}
                            className="text-white hover:text-slate-200 focus:outline-none font-bold text-lg leading-none"
                        >
                        ✕
                    </button>
                </div>
                )
            }
        </div >
    );
}
