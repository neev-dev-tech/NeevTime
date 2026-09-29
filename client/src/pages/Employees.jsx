import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import {
    Plus, Trash2, Upload, Download,
    ChevronDown, Search, RefreshCw,
    Smartphone, ArrowRightLeft, Settings,
    Fingerprint, ScanFace, Users, AlertCircle, SearchX, X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ResignationModal from '../components/ResignationModal';
import { Button } from '../components';
import Modal from '../components/Modal';
import { toLocalDateString } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

/* ---- shared cell vocabulary (matches DeviceData / Devices) ---- */
const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide';
const BADGE_ON = `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`;
const BADGE_OFF = `${BADGE} bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`;
const CELL_CODE = 'font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const CELL_SOFT = 'text-slate-600 dark:text-slate-300';
const CELL_MONO = 'font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300';
const BIO_ON = 'text-emerald-500';
const BIO_OFF = 'text-slate-300 dark:text-slate-600';

// Quick filters: each is a predicate over one employee row.
const QUICK_FILTERS = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'active', label: 'Active', test: e => e.status === 'active' },
    { key: 'inactive', label: 'Inactive', test: e => e.status !== 'active' },
    { key: 'door', label: 'Door access only', test: e => e.attendance_required === false },
    { key: 'unenrolled', label: 'No biometrics', test: e => !e.has_fingerprint && !e.has_face }
];

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const initialOf = (name) => (String(name || '').trim().charAt(0) || '?').toUpperCase();

export default function Employees() {
    const [employees, setEmployees] = useState([]);
    const [filteredEmployees, setFilteredEmployees] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    // Quick filter chips above the table; composes with the search box.
    const [quickFilter, setQuickFilter] = useState('all');

    // Menus
    const [showTransferMenu, setShowTransferMenu] = useState(false);
    const [showAppMenu, setShowAppMenu] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showSyncMenu, setShowSyncMenu] = useState(false);

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
        joining_date: toLocalDateString(),
        mobile: '',
        email: '',
        address: '',
        status: 'active',
        employment_type: 'Permanent',
        // Defaults must live here as well as in the reset. Without them
        // newEmp.attendance_required is undefined, and the control reads
        // !undefined — every new employee would open pre-ticked as door
        // access only.
        attendance_required: true,
        exclude_from_hrms: false
    });

    const [transferData, setTransferData] = useState({
        targetId: '',
        effectiveDate: toLocalDateString()
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
                setShowAppMenu(false);
                setShowMoreMenu(false);
                setShowSyncMenu(false);
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
        const quick = QUICK_FILTERS.find(f => f.key === quickFilter)?.test || (() => true);
        let rows = employees.filter(quick);
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            // Every one of these is nullable. Two employees came across from
            // ERPNext with no name at all, and e.name.toLowerCase() took the
            // whole page down to the error boundary the moment anyone typed.
            const has = (v) => String(v ?? '').toLowerCase().includes(lower);
            rows = rows.filter(e =>
                has(e.name) || has(e.employee_code) || has(e.department_name)
            );
        }
        setFilteredEmployees(rows);
    }, [searchQuery, employees, quickFilter]);

    // Paginates the filtered list for display only; select-all, export and
    // the bulk actions still work on the whole filtered list as before.
    const pager = useTableControls(filteredEmployees, { pageSize: 50 });

    const [refreshing, setRefreshing] = useState(false);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.get('/api/employees');
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
        if (!id) {
            console.warn('Attempted to select undefined ID');
            return;
        }
        setSelectedIds(prev => {
            const newSelection = prev.includes(id)
                ? prev.filter(i => i !== id)
                : [...prev, id];
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
                joining_date: '', mobile: '', email: '', address: '', status: 'active', employment_type: 'Permanent', attendance_required: true, exclude_from_hrms: false
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
            link.setAttribute('download', `employees_export_${toLocalDateString()}.csv`);
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
                setShowAppMenu(false);
                setShowMoreMenu(false);
                setShowSyncMenu(false);
            }}
            role="menuitem"
            className={`block w-full text-left px-3.5 py-2 text-[13px] hover:bg-slate-100 dark:hover:bg-slate-800 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}
        >
            {label}
        </button>
    );

    /**
     * Door access without attendance.
     *
     * Drivers, security and housekeeping are enrolled on the readers because
     * they need to get into the building, but they are not on the HRMS list.
     * Left as ordinary staff they are counted in the headcount and marked
     * absent for every working day they do not appear — and their punches are
     * pushed to the HRMS, which rejects codes it has never heard of and retries
     * forever.
     *
     * Both flags already existed and the API already accepted them; the only
     * screen with the toggles was EmployeeFormModal, which nothing renders. So
     * this was a psql job until now.
     */
    const handleDoorAccessOnly = (excluded) => {
        if (selectedIds.length === 0) return showToast('Please select at least one employee.', 'error');

        setConfirmMessage(excluded
            ? `Mark ${selectedIds.length} employee(s) as door access only? They keep punching and keep their biometric templates, but stop counting as staff and stop being pushed to the HRMS.`
            : `Return ${selectedIds.length} employee(s) to normal attendance tracking?`);

        setConfirmAction(() => async () => {
            try {
                await Promise.all(selectedIds.map(id =>
                    api.patch(`/api/employees/${id}`, {
                        attendance_required: !excluded,
                        exclude_from_hrms: excluded
                    })
                ));
                showToast(`Updated ${selectedIds.length} employee(s).`, 'success');
                setSelectedIds([]);
                fetchEmployees();
            } catch (err) {
                showToast('Update failed: ' + (err.response?.data?.error || err.message), 'error');
            }
            setShowConfirmModal(false);
            setConfirmAction(null);
        });
        setShowConfirmModal(true);
    };

    const handleMoreSettings = (action) => {
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

    const allSelected = filteredEmployees.length > 0 && filteredEmployees.every(e => selectedIds.includes(e.id));
    const someSelected = selectedIds.length > 0 && !allSelected;
    const TH = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400 whitespace-nowrap';

    const closeMenus = () => {
        setShowTransferMenu(false);
        setShowAppMenu(false);
        setShowMoreMenu(false);
        setShowSyncMenu(false);
    };

    // One size for every toolbar control on this page: 32px tall, 13px text.
    const TB = '!h-8 !px-3 !py-0 !text-[13px] !gap-1.5';

    // Bulk-action menu: button plus a panel of DropdownItems. Always clickable;
    // with nothing ticked the panel says so instead of listing actions.
    const BulkMenu = ({ label, icon: Icon, open, onToggle, width = 'w-56', children }) => (
        <div className="relative dropdown-container">
            <Button
                variant="tonal"
                icon={Icon}
                iconSize={15}
                className={TB}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); const was = open; closeMenus(); if (!was) onToggle(); }}
            >
                {label} <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </Button>
            {open && (
                <div role="menu" className={`absolute top-full right-0 mt-1.5 ${width} bg-app-surface border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl z-30 overflow-hidden py-1 dropdown-menu`}>
                    {selectedIds.length ? children : (
                        <p className="px-3.5 py-2.5 text-[13px] text-slate-500 dark:text-slate-400">
                            Tick one or more employees in the list first.
                        </p>
                    )}
                </div>
            )}
        </div>
    );

    const tableHead = (
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr>
                <th className="pl-4 sm:pl-6 pr-2 py-3 w-10">
                    <input
                        type="checkbox"
                        aria-label="Select all employees in this list"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        disabled={filteredEmployees.length === 0}
                        className="rounded border-slate-300 dark:border-slate-600"
                        onChange={(e) => {
                            if (e.target.checked) setSelectedIds(filteredEmployees.map(emp => emp.id));
                            else setSelectedIds([]);
                        }}
                    />
                </th>
                <th className={TH}>Employee</th>
                <th className={TH}>Department</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-center`}>Biometrics</th>
                <th className={TH}>App access</th>
                <th className={TH}>Area</th>
                <th className={`${TH} pr-4 sm:pr-6`}>Mobile</th>
            </tr>
        </thead>
    );

    const refreshAll = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchEmployees(), fetchDepsAndAreas()]);
            showToast('Data refreshed successfully', 'success');
        } catch (err) {
            showToast('Failed to refresh data', 'error');
        } finally {
            setRefreshing(false);
        }
    };

    return (
        // Full-bleed: cancels the layout padding and fills the content area edge
        // to edge. Header, toolbar and pager stay put; only the rows scroll.
        <div className="relative -m-4 sm:-m-6 h-[calc(100%+2rem)] sm:h-[calc(100%+3rem)] flex flex-col bg-app-surface">
            {/* Row 1: title + count, view tabs, page actions */}
            <div className="flex items-center gap-x-4 gap-y-2 px-4 sm:px-6 min-h-14 py-2.5 border-b border-slate-200 dark:border-slate-800 flex-wrap">
                <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    Employees
                    <span className="text-sm font-medium text-slate-400 tabular-nums">{employees.length}</span>
                </h1>
                <div role="tablist" aria-label="Filter employees" className="flex items-center gap-0.5 flex-wrap">
                    {QUICK_FILTERS.map(f => {
                        const n = employees.filter(f.test).length;
                        const on = quickFilter === f.key;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => setQuickFilter(f.key)}
                                className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${on
                                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'}`}
                            >
                                {f.label}
                                <span className="tabular-nums text-xs text-slate-400">{n}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <Button variant="tonal" icon={Upload} iconSize={15} className={TB} onClick={() => setShowImportModal(true)}>Import</Button>
                    <Button variant="tonal" icon={Download} iconSize={15} className={TB} onClick={handleExport}>Export</Button>
                    <Button variant="successSolid" icon={Plus} iconSize={15} className={TB} onClick={() => setShowAddModal(true)}>Add employee</Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
                {/* Row 2: search, selection, actions on the ticked employees */}
                <div className={`flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 flex-wrap ${selectedIds.length ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
                    <div className="relative w-full sm:w-64">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input
                            type="search"
                            aria-label="Search employees"
                            placeholder="Search name, code or department"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="field-sm !h-8 !py-0 pl-9"
                        />
                    </div>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-1 pl-1">
                            <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{selectedIds.length} selected</span>
                            <button
                                type="button"
                                onClick={() => { setSelectedIds([]); closeMenus(); }}
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                            >
                                <X size={13} /> Clear
                            </button>
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <BulkMenu label="Sync" icon={RefreshCw} open={showSyncMenu} onToggle={() => setShowSyncMenu(true)} width="w-60">
                            <DropdownItem label="Resynchronize to device" onClick={() => { closeMenus(); handleMoreSettings('push'); }} />
                            <DropdownItem label="Re-upload from device" onClick={() => { closeMenus(); handleMoreSettings('pull'); }} />
                            <DropdownItem label="Delete Biometric Template" danger onClick={() => { closeMenus(); handleMoreSettings('delete-bio'); }} />
                        </BulkMenu>
                        <BulkMenu label="Transfer" icon={ArrowRightLeft} open={showTransferMenu} onToggle={() => setShowTransferMenu(true)}>
                            <DropdownItem label="Department Transfer" onClick={() => { closeMenus(); handleTransfer('Department'); }} />
                            <DropdownItem label="Position Transfer" onClick={() => { closeMenus(); handleTransfer('Position'); }} />
                            <DropdownItem label="Move to New Area" onClick={() => { closeMenus(); handleTransfer('Area'); }} />
                            <DropdownItem label="Resignation" danger onClick={() => { closeMenus(); setShowResignationModal(true); }} />
                        </BulkMenu>
                        <BulkMenu label="App access" icon={Smartphone} open={showAppMenu} onToggle={() => setShowAppMenu(true)} width="w-48">
                            <DropdownItem label="Enable Access" onClick={() => { closeMenus(); handleAppAccess(true); }} />
                            <DropdownItem label="Disable Access" danger onClick={() => { closeMenus(); handleAppAccess(false); }} />
                        </BulkMenu>
                        <BulkMenu label="More" icon={Settings} open={showMoreMenu} onToggle={() => setShowMoreMenu(true)} width="w-60">
                            <DropdownItem label="Mark as door access only" onClick={() => { closeMenus(); handleDoorAccessOnly(true); }} />
                            <DropdownItem label="Restore attendance tracking" onClick={() => { closeMenus(); handleDoorAccessOnly(false); }} />
                        </BulkMenu>
                        <Button variant="danger" icon={Trash2} iconSize={15} className={TB} onClick={handleDelete}>Delete</Button>
                        <button
                            type="button"
                            onClick={refreshAll}
                            disabled={refreshing}
                            className="grid place-items-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <table className="w-full text-left text-sm">
                            {tableHead}
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i}>
                                        <td className="pl-4 sm:pl-6 pr-2 py-3"><div className="h-4 w-4 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /></td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                                <div className="space-y-1.5">
                                                    <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                                    <div className="h-2.5 w-14 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                                </div>
                                            </div>
                                        </td>
                                        {Array.from({ length: 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /></td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : error ? (
                        <div className="py-20 text-center px-6">
                            <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">Could not load employees</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                            <Button variant="secondary" icon={RefreshCw} onClick={fetchEmployees}>Try again</Button>
                        </div>
                    ) : filteredEmployees.length === 0 ? (
                        employees.length > 0 ? (
                            <div className="py-20 text-center px-6">
                                <SearchX size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">No matching employees</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    {searchQuery ? <>Nothing matches &ldquo;{searchQuery}&rdquo; in this view.</> : 'Nobody fits this filter.'}
                                </p>
                                <Button variant="tonal" size="sm" onClick={() => { setSearchQuery(''); setQuickFilter('all'); }}>Clear search and filters</Button>
                            </div>
                        ) : (
                            <div className="py-20 text-center px-6">
                                <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800">
                                    <Users size={26} className="text-slate-400 dark:text-slate-500" />
                                </div>
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100">No employees yet</h3>
                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                    Add people one by one, import a CSV from your HR system, or let them appear as they enrol on a device.
                                </p>
                                <div className="mt-5 flex items-center justify-center gap-2">
                                    <Button variant="tonal" icon={Upload} onClick={() => setShowImportModal(true)}>Import CSV</Button>
                                    <Button variant="successSolid" icon={Plus} onClick={() => setShowAddModal(true)}>Add employee</Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <table className="w-full text-left text-sm">
                            {tableHead}
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map(emp => {
                                    const isActive = emp.status === 'active';
                                    const appOn = !!emp.app_login_enabled;
                                    const selected = selectedIds.includes(emp.id);
                                    const open = () => navigate(`/employees/${emp.id}`);
                                    return (
                                        <tr
                                            key={emp.employee_code}
                                            onClick={open}
                                            className={`cursor-pointer transition-colors ${selected ? 'bg-slate-50 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                                        >
                                            <td className="pl-4 sm:pl-6 pr-2 py-3" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${emp.name || emp.employee_code}`}
                                                    checked={selected}
                                                    onChange={() => toggleSelect(emp.id)}
                                                    className="rounded border-slate-300 dark:border-slate-600"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span
                                                        aria-hidden="true"
                                                        className="w-8 h-8 shrink-0 rounded-full grid place-items-center font-semibold text-xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        {initialOf(emp.name)}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <Link
                                                            to={`/employees/${emp.id}`}
                                                            onClick={e => e.stopPropagation()}
                                                            className={`${CELL_STRONG} block truncate hover:underline underline-offset-2`}
                                                        >
                                                            {dash(emp.name)}
                                                        </Link>
                                                        <span className={CELL_CODE}>{dash(emp.employee_code)}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={CELL_SOFT}>{dash(emp.department_name)}</div>
                                                {emp.designation && <div className="text-xs text-slate-400 dark:text-slate-500">{emp.designation}</div>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1.5 text-[13px] ${isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                                    <span className="capitalize">{dash(emp.status)}</span>
                                                </span>
                                                {/* Door-access-only staff look identical to
                                                    everyone else in this table otherwise,
                                                    which is how eleven of them sat in the
                                                    headcount unnoticed. */}
                                                {emp.attendance_required === false && (
                                                    <span
                                                        className="ml-2 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                                        title="Door access only — not counted as staff, not pushed to the HRMS"
                                                    >
                                                        Door only
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    <span className="inline-flex" title={emp.has_fingerprint ? 'Fingerprint enrolled' : 'No fingerprint enrolled'}>
                                                        <Fingerprint size={17} className={emp.has_fingerprint ? BIO_ON : BIO_OFF} />
                                                        <span className="sr-only">{emp.has_fingerprint ? 'Fingerprint enrolled' : 'No fingerprint'}</span>
                                                    </span>
                                                    <span className="inline-flex" title={emp.has_face ? 'Face enrolled' : 'No face enrolled'}>
                                                        <ScanFace size={17} className={emp.has_face ? BIO_ON : BIO_OFF} />
                                                        <span className="sr-only">{emp.has_face ? 'Face enrolled' : 'No face'}</span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`text-[13px] ${appOn ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                                    {appOn ? 'Enabled' : 'Off'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3"><span className={CELL_SOFT}>{dash(emp.area_name)}</span></td>
                                            <td className="px-4 pr-4 sm:pr-6 py-3"><span className={CELL_MONO}>{dash(emp.mobile)}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700">
                    <div className="[&>div]:border-t-0">
                        <TablePager controls={pager} noun="employee" />
                    </div>
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

                    {/* Drivers, security, housekeeping and the co-located
                        company's staff need the readers to get in and are not
                        on the HRMS list. Set here rather than discovered later
                        in a headcount that does not match. */}
                    <div className="col-span-1 md:col-span-3">
                        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40">
                            <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4"
                                checked={!newEmp.attendance_required}
                                onChange={e => setNewEmp({
                                    ...newEmp,
                                    attendance_required: !e.target.checked,
                                    exclude_from_hrms: e.target.checked
                                })}
                            />
                            <span>
                                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                                    Door access only — no attendance
                                </span>
                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Biometric entry works as normal. They are not counted in the headcount,
                                    never marked absent, and their punches are not sent to the HRMS.
                                </span>
                            </span>
                        </label>
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
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-8 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 hover:border-saffron/50 transition-ui cursor-pointer group">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                            <Upload className="text-slate-500 dark:text-slate-400" size={28} />
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
            {/* The guard stays. transferType is null until a transfer is
                started, and the body dereferences it — Modal renders nothing
                when closed, but its children are still constructed, so
                open={showTransferModal} alone crashes the page on load. */}
            {showTransferModal && transferType && (
                <Modal
                    open
                    onClose={() => setShowTransferModal(false)}
                    size="md"
                    hideClose
                >
                    <div className="mb-6">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900/30 rounded-full flex items-center justify-center mb-4">
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
            )}

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
                    Move <span className="font-bold text-charcoal dark:text-slate-100">{selectedIds.length}</span> selected
                    employee(s) to Deleted? Their attendance history is kept and they can be restored
                    from Employee Management &rsaquo; Deleted.
                    <span className="block mt-2">
                        Biometric access is revoked on every reader, so they will need to enrol again if restored.
                    </span>
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
                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900/30 rounded-full flex items-center justify-center mb-4">
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
                    <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}>
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
