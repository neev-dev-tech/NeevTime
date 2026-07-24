import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { Building2, Plus, Trash2, Edit2, Search, RefreshCw, X, Save, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import SkeletonLoader from '../components/SkeletonLoader';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function Departments() {
    const toast = useToast();
    const [departments, setDepartments] = useState([]);
    const [filteredDepartments, setFilteredDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
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
            const res = await api.get('/api/departments');
            setDepartments(res.data);
            setFilteredDepartments(res.data);
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
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
            <div className="flex items-center gap-2 p-2 border-b border-slate-200 bg-slate-50 text-sm flex-wrap">
                <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                    Delete
                </Button>
                <Button variant="secondary" icon={RefreshCw} onClick={fetchDepartments}>
                    Refresh
                </Button>

                {/* Separator */}
                <div className="w-px h-6 bg-slate-300 mx-1" />

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
                        className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-400"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <SkeletonLoader rows={8} columns={4} showHeader={true} />
            ) : (
                <div className="card-base overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th className="table-header w-8">
                                    <input
                                        type="checkbox"
                                        onChange={(e) => setSelectedIds(e.target.checked ? filteredDepartments.map(d => d.id) : [])}
                                        checked={filteredDepartments.length > 0 && selectedIds.length === filteredDepartments.length}
                                    />
                                </th>
                                <th className="table-header">ID</th>
                                <th className="table-header">Department Name</th>
                                <th className="table-header text-center sticky-action">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredDepartments.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                                        No departments found.
                                    </td>
                                </tr>
                            ) : (
                                filteredDepartments.map((dept) => (
                                    <tr key={dept.id} className="table-row">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(dept.id)}
                                                onChange={() => toggleSelect(dept.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">#{dept.id}</td>
                                        <td className="px-6 py-4 font-semibold text-slate-800">{dept.name}</td>
                                        <td className="px-6 py-4 sticky-action">
                                            <div className="flex items-center justify-center gap-2">
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
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold text-slate-800">
                                {editingId ? 'Edit Department' : 'Add Department'}
                            </h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={X}
                                iconSize={20}
                                aria-label="Close"
                                onClick={closeModal}
                            />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="e.g., Engineering, HR"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="secondary" onClick={closeModal}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" icon={Save}>
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-white/50" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4 text-slate-800">Confirm Delete</h3>
                            <p className="text-slate-600 mb-6">
                                {deleteConfirm.type === 'single'
                                    ? 'Are you sure you want to delete this department? This action cannot be undone.'
                                    : `Are you sure you want to delete ${deleteConfirm.count} selected department(s)? This action cannot be undone.`
                                }
                            </p>
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                                    Cancel
                                </Button>
                                <Button variant="dangerSolid" onClick={confirmDelete}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4" onClick={closeImportModal}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold text-slate-800">
                                Import Departments
                            </h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={X}
                                iconSize={20}
                                aria-label="Close"
                                onClick={closeImportModal}
                            />
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600">
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
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
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
                                    <span className="text-sm text-slate-600">
                                        {importing ? 'Importing...' : 'Click to select CSV file'}
                                    </span>
                                </label>
                            </div>

                            {/* Import Result */}
                            {importResult && (
                                <div className={`p-4 rounded-lg ${importResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                                    <div className="flex items-start gap-3">
                                        {importResult.failed > 0 ? (
                                            <AlertCircle size={20} className="text-amber-600 mt-0.5" />
                                        ) : (
                                            <CheckCircle size={20} className="text-green-600 mt-0.5" />
                                        )}
                                        <div>
                                            <p className="font-medium text-slate-800">
                                                Import Complete
                                            </p>
                                            <p className="text-sm text-slate-600 mt-1">
                                                {importResult.success} imported successfully
                                                {importResult.failed > 0 && `, ${importResult.failed} failed`}
                                            </p>
                                            {importResult.errors.length > 0 && (
                                                <ul className="text-xs text-red-600 mt-2 list-disc list-inside">
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

                            <div className="flex justify-end pt-4 border-t">
                                <Button variant="secondary" onClick={closeImportModal}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
