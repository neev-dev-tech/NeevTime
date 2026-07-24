import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { Building2, Plus, Trash2, Edit2, Search, RefreshCw, X, Save, Download, Upload, FileText, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import SkeletonLoader from '../components/SkeletonLoader';
import { useToast } from '../components';
import { exportToExcel, exportToCSV } from '../utils/excelExport';

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

    // Export functions
    const handleExportCSV = async () => {
        await exportToCSV({
            data: departments.map(d => ({ id: d.id, name: d.name })),
            filename: `departments_${new Date().toISOString().split('T')[0]}`,
            headers: [
                { key: 'id', label: 'ID' },
                { key: 'name', label: 'Department Name' }
            ]
        });
    };

    const handleExportExcel = async () => {
        await exportToExcel({
            data: departments.map(d => ({ id: d.id, name: d.name })),
            filename: `departments_${new Date().toISOString().split('T')[0]}`,
            sheetName: 'Departments',
            headers: [
                { key: 'id', label: 'ID' },
                { key: 'name', label: 'Department Name' }
            ]
        });
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
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: '#1E293B', fontWeight: 600 }}>
                    <Building2 className="text-blue-500" />
                    Departments
                </h1>
                <button
                    type="button"
                    onClick={() => { setShowModal(true); setEditingId(null); setName(''); }}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus size={16} />
                    Add Department
                </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50 text-sm flex-wrap">
                <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-red-100 hover:text-red-600 rounded text-gray-700"
                >
                    <Trash2 size={14} /> Delete
                </button>
                <button
                    type="button"
                    onClick={fetchDepartments}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
                >
                    <RefreshCw size={14} /> Refresh
                </button>

                {/* Separator */}
                <div className="w-px h-6 bg-gray-300 mx-1" />

                {/* Export Buttons */}
                <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors"
                >
                    <FileText size={14} /> Export CSV
                </button>
                <button
                    type="button"
                    onClick={handleExportExcel}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                >
                    <FileSpreadsheet size={14} /> Export Excel
                </button>

                {/* Import Button */}
                <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded hover:bg-purple-100 transition-colors"
                >
                    <Upload size={14} /> Import
                </button>

                <div className="ml-auto w-64 relative">
                    <input
                        type="text"
                        placeholder="Search departments..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
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
                                    <td colSpan="4" className="px-6 py-8 text-center" style={{ color: '#64748B' }}>
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
                                        <td className="px-6 py-4" style={{ color: '#64748B' }}>#{dept.id}</td>
                                        <td className="px-6 py-4 font-semibold" style={{ color: '#1E293B', fontWeight: 600 }}>{dept.name}</td>
                                        <td className="px-6 py-4 sticky-action">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(dept)}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    style={{ transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)' }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDelete(e, dept.id)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    style={{ transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50" style={{ borderRadius: '16px' }}>
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold" style={{ color: '#1E293B', fontWeight: 600 }}>
                                {editingId ? 'Edit Department' : 'Add Department'}
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
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
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="btn-secondary rounded-full"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary flex items-center gap-2"
                                >
                                    <Save size={16} />
                                    {editingId ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-white/50" style={{ borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4" style={{ color: '#1E293B', fontWeight: 600 }}>Confirm Delete</h3>
                            <p className="text-gray-600 mb-6">
                                {deleteConfirm.type === 'single'
                                    ? 'Are you sure you want to delete this department? This action cannot be undone.'
                                    : `Are you sure you want to delete ${deleteConfirm.count} selected department(s)? This action cannot be undone.`
                                }
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setDeleteConfirm(null)}
                                    className="btn-secondary rounded-full"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmDelete}
                                    className="btn-ghost-red rounded-full bg-red-50 hover:bg-red-100 text-red-600 font-medium px-5 py-2.5"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4" onClick={closeImportModal}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50" style={{ borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold" style={{ color: '#1E293B', fontWeight: 600 }}>
                                Import Departments
                            </h2>
                            <button
                                type="button"
                                onClick={closeImportModal}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Upload a CSV file with department names. Each row should contain one department name.
                            </p>

                            {/* Download Template */}
                            <button
                                type="button"
                                onClick={downloadTemplate}
                                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <Download size={14} /> Download CSV Template
                            </button>

                            {/* File Input */}
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
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
                                    <Upload size={32} className="text-gray-400" />
                                    <span className="text-sm text-gray-600">
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
                                            <p className="font-medium text-gray-800">
                                                Import Complete
                                            </p>
                                            <p className="text-sm text-gray-600 mt-1">
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
                                <button
                                    type="button"
                                    onClick={closeImportModal}
                                    className="btn-secondary rounded-full"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
