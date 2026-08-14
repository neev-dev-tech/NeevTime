import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import { Building2, Plus, Trash2, Edit2, Search, RefreshCw, Save, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

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
                d.name.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Building2}
                title="Departments"
                subtitle="Organisational units employees are grouped under"
                actions={
                    <Button
                        variant="successSolid"
                        icon={Plus}
                        onClick={() => { setShowModal(true); setEditingId(null); setName(''); }}
                    >
                        Add Department
                    </Button>
                }
            />

            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 text-sm flex-wrap">
                <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                    Delete
                </Button>
                <Button variant="secondary" icon={RefreshCw} onClick={fetchDepartments}>
                    Refresh
                </Button>

                {/* Separator */}
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />

                {/* Export Buttons */}
                <ExportMenu
                    rows={departments}
                    columns={[
                        { key: 'id', label: 'ID' },
                        { key: 'name', label: 'Department Name' }
                    ]}
                    filename={`departments_${new Date().toISOString().split('T')[0]}`}
                    title="Departments"
                />

                {/* Import Button */}
                <Button variant="secondary" icon={Upload} onClick={() => setShowImportModal(true)}>
                    Import
                </Button>

                <div className="ml-auto w-64 relative">
                    <input
                        type="text"
                        placeholder="Search departments..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="field-sm pl-8 pr-3"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-slate-400 dark:text-slate-500" />
                </div>
            </div>

            {/* Table */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load departments</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchDepartments}>Try again</Button>
                    </div>
                ) : filteredDepartments.length === 0 ? (
                    <div className="py-16 text-center">
                        <Building2 size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching departments' : 'No departments yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? `Nothing matches “${searchQuery}”. Try a different search.`
                                : 'Add a department to start grouping employees by team.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-10">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => setSelectedIds(e.target.checked ? filteredDepartments.map(d => d.id) : [])}
                                            checked={filteredDepartments.length > 0 && selectedIds.length === filteredDepartments.length}
                                        />
                                    </th>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">ID</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Department Name</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredDepartments.map((dept, idx) => (
                                    <tr key={dept.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(dept.id)}
                                                onChange={() => toggleSelect(dept.id)}
                                            />
                                        </td>
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {dept.id ?? '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">
                                            {dept.name || '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <div className="dv-quiet">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={Edit2}
                                                        aria-label="Edit department"
                                                        onClick={() => handleEdit(dept)}
                                                    />
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        icon={Trash2}
                                                        aria-label="Delete department"
                                                        onClick={(e) => handleDelete(e, dept.id)}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && filteredDepartments.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {filteredDepartments.length} record{filteredDepartments.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>

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
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
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
                            <Upload size={32} className="text-slate-400" />
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
                                    <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 mt-0.5" />
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
        </div>
    );
}
