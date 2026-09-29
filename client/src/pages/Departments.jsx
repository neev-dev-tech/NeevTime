import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import { Building2, Plus, Trash2, Edit2, RefreshCw, Save, Download, Upload, AlertCircle, CheckCircle, UserCheck } from 'lucide-react';
import { useToast, Button, ExportMenu, ListPage, ListSearch, ListSelection, ListIconButton } from '../components';
import { toLocalDateString } from '../utils/dateFormat';
import OrgDirectory from '../components/OrgDirectory';

// An employee belongs to a department by id, or by name for rows that only
// carry the name.
const inDepartment = (dept, e) => e.department_id === dept.id || (!e.department_id && e.department_name === dept.name);

export default function Departments() {
    const toast = useToast();
    const [departments, setDepartments] = useState([]);
    const [filteredDepartments, setFilteredDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [name, setName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    /**
     * Who approves leave and corrections for a department.
     *
     * The approval chain has resolved department approvers since it shipped,
     * and assigning one required curl: the API existed with no screen, which
     * for an HR user means the feature did not exist.
     */
    const [approverDept, setApproverDept] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [approverIds, setApproverIds] = useState([]);
    const [savingApprovers, setSavingApprovers] = useState(false);

    const openApprovers = async (dept) => {
        setApproverDept(dept);
        setApproverIds([]);
        try {
            const [emps, current] = await Promise.all([
                employees.length ? { data: employees } : api.get('/api/employees'),
                api.get(`/api/departments/${dept.id}/approvers`),
            ]);
            if (!employees.length) setEmployees(emps.data || []);
            setApproverIds((current.data || []).map(a => a.employee_id));
        } catch {
            toast.error('Could not load the current approvers');
        }
    };

    const saveApprovers = async () => {
        setSavingApprovers(true);
        try {
            const current = await api.get(`/api/departments/${approverDept.id}/approvers`);
            const existing = new Set((current.data || []).map(a => a.employee_id));
            const wanted = new Set(approverIds);
            for (const id of wanted) {
                if (!existing.has(id)) await api.post(`/api/departments/${approverDept.id}/approvers`, { employee_id: id });
            }
            for (const id of existing) {
                if (!wanted.has(id)) await api.delete(`/api/departments/${approverDept.id}/approvers/${id}`);
            }
            toast.success(`${wanted.size} approver(s) set for ${approverDept.name}`);
            setApproverDept(null);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save approvers');
        } finally {
            setSavingApprovers(false);
        }
    };
    const fileInputRef = useRef(null);

    const fetchDepartments = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.get('/api/departments');
            setDepartments(res.data);
            setFilteredDepartments(res.data);
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load departments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredDepartments(departments);
        } else {
            setFilteredDepartments(departments.filter(d =>
                String(d.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
            ));
        }
    }, [searchQuery, departments]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/api/departments/${editingId}`, { name });
            } else {
                await api.post('/api/departments', { name });
            }
            setName('');
            setShowModal(false);
            setEditingId(null);
            fetchDepartments();
        } catch (err) {
            toast.error('Failed to save department');
        }
    };

    const handleEdit = (dept) => {
        setEditingId(dept.id);
        setName(dept.name || '');
        setShowModal(true);
    };

    const handleDelete = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirm({ type: 'single', id, count: 1 });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm) return;

        try {
            if (deleteConfirm.type === 'single' && deleteConfirm.id) {
                await api.delete(`/api/departments/${deleteConfirm.id}`);
            } else if (deleteConfirm.type === 'bulk' && selectedIds.length > 0) {
                await Promise.all(selectedIds.map(id => api.delete(`/api/departments/${id}`)));
                setSelectedIds([]);
            }
            setDeleteConfirm(null);
            fetchDepartments();
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error('Failed to delete');
            setDeleteConfirm(null);
        }
    };

    const handleBulkDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedIds.length === 0) {
            toast.warning('Please select items to delete');
            return;
        }
        setDeleteConfirm({ type: 'bulk', id: null, count: selectedIds.length });
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setName('');
    };

    const downloadTemplate = () => {
        const template = 'name\nEngineering\nHuman Resources\nFinance\nMarketing\nOperations';
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'departments_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);

        try {
            const text = await file.text();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);

            // Skip header if present
            const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
            const names = lines.slice(startIndex).filter(name => name.length > 0);

            let success = 0;
            let failed = 0;
            const errors = [];

            for (const deptName of names) {
                try {
                    await api.post('/api/departments', { name: deptName });
                    success++;
                } catch (err) {
                    failed++;
                    errors.push(`${deptName}: ${err.response?.data?.error || err.message}`);
                }
            }

            setImportResult({ success, failed, errors });
            fetchDepartments();
        } catch (err) {
            setImportResult({ success: 0, failed: 1, errors: [err.message] });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const closeImportModal = () => {
        setShowImportModal(false);
        setImportResult(null);
    };

    return (
        <>
        <ListPage
            title="Departments"
            count={departments.length}
            actions={
                <>
                    <Button variant="tonal" size="toolbar" icon={Upload} onClick={() => setShowImportModal(true)}>
                        Import
                    </Button>
                    <ExportMenu
                        rows={departments}
                        columns={[
                            { key: 'id', label: 'ID' },
                            { key: 'name', label: 'Department Name' }
                        ]}
                        filename={`departments_${toLocalDateString()}`}
                        title="Departments"
                    />
                    <Button mutating
                        variant="primary"
                        size="toolbar"
                        icon={Plus}
                        onClick={() => { setShowModal(true); setEditingId(null); setName(''); }}
                    >
                        Add Department
                    </Button>
                </>
            }
            toolbarActive={selectedIds.length > 0}
            toolbar={
                <>
                    <ListSearch label="Search departments" placeholder="Search departments..." value={searchQuery} onChange={setSearchQuery} />
                    <ListSelection count={selectedIds.length} onClear={() => setSelectedIds([])} />
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchDepartments} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            bodyClassName="!overflow-hidden"
        >
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load departments</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchDepartments}>Try again</Button>
                    </div>
                ) : (
                    <OrgDirectory
                        items={filteredDepartments}
                        noun="department"
                        icon={Building2}
                        memberOf={inDepartment}
                        memberColumn={{ label: 'Position', value: e => e.designation }}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onToggleAll={on => setSelectedIds(on ? filteredDepartments.map(d => d.id) : [])}
                        detailActions={dept => (
                            <>
                                <Button variant="tonal" size="toolbar" icon={UserCheck} onClick={() => openApprovers(dept)}>Approvers</Button>
                                <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => handleEdit(dept)}>Edit</Button>
                                <Button variant="danger" size="toolbar" icon={Trash2} onClick={(e) => (selectedIds.length ? handleBulkDelete(e) : handleDelete(e, dept.id))}>{selectedIds.length ? `Delete ${selectedIds.length}` : 'Delete'}</Button>
                            </>
                        )}
                        emptyState={
                            <div className="py-20 text-center px-6">
                                <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {searchQuery ? 'No matching departments' : 'No departments yet'}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {searchQuery
                                        ? `Nothing matches “${searchQuery}”. Try a different search.`
                                        : 'Add a department to start grouping employees by team.'}
                                </p>
                            </div>
                        }
                    />
                )}
        </ListPage>

            {/* Add/Edit Modal */}
            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingId ? 'Edit Department' : 'Add Department'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="field"
                            placeholder="e.g., Engineering, HR"
                            required
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" icon={Save}>
                            {editingId ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <Modal
                    open
                    onClose={() => setDeleteConfirm(null)}
                    title="Confirm Delete"
                    size="sm"
                    footer={<>
                        <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                            Cancel
                        </Button>
                        <Button variant="dangerSolid" onClick={confirmDelete}>
                            Delete
                        </Button>
                    </>}
                >
                    <p className="text-slate-600 dark:text-slate-400 mb-6">
                        {deleteConfirm.type === 'single'
                            ? 'Are you sure you want to delete this department? This action cannot be undone.'
                            : `Are you sure you want to delete ${deleteConfirm.count} selected department(s)? This action cannot be undone.`
                        }
                    </p>
                </Modal>
            )}

            {/* Import Modal */}
            <Modal
                open={showImportModal}
                onClose={closeImportModal}
                title="Import Departments"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Upload a CSV file with department names. Each row should contain one department name.
                    </p>

                    {/* Download Template */}
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        onClick={downloadTemplate}
                    >
                        Download CSV Template
                    </Button>

                    {/* File Input */}
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center hover:border-slate-400 transition-colors">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt"
                            onChange={handleImport}
                            className="hidden"
                            id="import-file"
                        />
                        <label
                            htmlFor="import-file"
                            className="cursor-pointer flex flex-col items-center gap-2"
                        >
                            <Upload size={32} className="text-slate-500" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                                {importing ? 'Importing...' : 'Click to select CSV file'}
                            </span>
                        </label>
                    </div>

                    {/* Import Result */}
                    {importResult && (
                        <div className={`p-4 rounded-lg ${importResult.failed > 0 ? 'bg-amber-50 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800' : 'bg-green-50 border border-green-200 dark:bg-green-900/30 dark:border-green-800'}`}>
                            <div className="flex items-start gap-3">
                                {importResult.failed > 0 ? (
                                    <AlertCircle size={20} className="text-amber-700 dark:text-amber-400 mt-0.5" />
                                ) : (
                                    <CheckCircle size={20} className="text-green-600 dark:text-green-400 mt-0.5" />
                                )}
                                <div>
                                    <p className="font-medium text-slate-800 dark:text-slate-100">
                                        Import Complete
                                    </p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        {importResult.success} imported successfully
                                        {importResult.failed > 0 && `, ${importResult.failed} failed`}
                                    </p>
                                    {importResult.errors.length > 0 && (
                                        <ul className="text-xs text-red-600 dark:text-red-400 mt-2 list-disc list-inside">
                                            {importResult.errors.slice(0, 5).map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                            {importResult.errors.length > 5 && (
                                                <li>...and {importResult.errors.length - 5} more errors</li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeImportModal}>
                            Close
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Department approvers */}
            {approverDept && (
                <Modal
                    open
                    onClose={() => setApproverDept(null)}
                    title={`Approvers for ${approverDept.name}`}
                    size="md"
                >
                    <div className="space-y-4">
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                            These people can approve leave and attendance corrections for anyone in
                            this department — alongside reporting managers and HR, per the approval
                            chain in Settings. More than one is normal: a deputy covers absences.
                        </p>
                        <select multiple size={8} className="field w-full"
                                value={approverIds.map(String)}
                                onChange={e => setApproverIds([...e.target.selectedOptions].map(o => Number(o.value)))}>
                            {employees
                                .filter(e => (e.status || '').toLowerCase() !== 'resigned')
                                .map(e => (
                                    <option key={e.id} value={e.id}>{e.employee_code} — {e.name}</option>
                                ))}
                        </select>
                        <p className="text-xs text-slate-500">Hold Ctrl/Cmd to pick several. Empty means requests fall through to HR.</p>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setApproverDept(null)}>Cancel</Button>
                            <Button variant="primary" onClick={saveApprovers} disabled={savingApprovers}>
                                {savingApprovers ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
