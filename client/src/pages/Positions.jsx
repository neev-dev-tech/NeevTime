import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { Briefcase, Plus, Trash2, Edit2, Search, RefreshCw, X, Save, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import SkeletonLoader from '../components/SkeletonLoader';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function Positions() {
    const toast = useToast();
    const [positions, setPositions] = useState([]);
    const [filteredPositions, setFilteredPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const fileInputRef = useRef(null);

    const fetchPositions = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/positions');
            setPositions(res.data);
            setFilteredPositions(res.data);
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPositions();
    }, []);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredPositions(positions);
        } else {
            setFilteredPositions(positions.filter(p =>
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.description || '').toLowerCase().includes(searchQuery.toLowerCase())
            ));
        }
    }, [searchQuery, positions]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await api.put(`/api/positions/${editItem.id}`, formData);
            } else {
                await api.post('/api/positions', formData);
            }
            setFormData({ name: '', description: '' });
            setShowModal(false);
            setEditItem(null);
            fetchPositions();
        } catch (err) {
            toast.error('Failed to save position');
        }
    };

    const handleEdit = (pos) => {
        setEditItem(pos);
        setFormData({
            name: pos.name || '',
            description: pos.description || ''
        });
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
                await api.delete(`/api/positions/${deleteConfirm.id}`);
            } else if (deleteConfirm.type === 'bulk' && selectedIds.length > 0) {
                await Promise.all(selectedIds.map(id => api.delete(`/api/positions/${id}`)));
                setSelectedIds([]);
            }
            setDeleteConfirm(null);
            fetchPositions();
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
        setEditItem(null);
        setFormData({ name: '', description: '' });
    };

    const downloadTemplate = () => {
        const template = 'name,description\nSoftware Engineer,Develops software applications\nProject Manager,Manages project timelines\nHR Manager,Handles human resources';
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'positions_template.csv';
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
            const dataLines = lines.slice(startIndex);

            let success = 0;
            let failed = 0;
            const errors = [];

            for (const line of dataLines) {
                try {
                    // Parse CSV - handle quoted fields
                    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [line];
                    const name = (parts[0] || '').replace(/^"|"$/g, '').trim();
                    const description = (parts[1] || '').replace(/^"|"$/g, '').trim();

                    if (!name) continue;

                    await api.post('/api/positions', { name, description });
                    success++;
                } catch (err) {
                    failed++;
                    errors.push(`${line.substring(0, 30)}: ${err.response?.data?.error || err.message}`);
                }
            }

            setImportResult({ success, failed, errors });
            fetchPositions();
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
                icon={Briefcase}
                title="Positions"
                actions={
                    <Button
                        variant="primary"
                        icon={Plus}
                        onClick={() => { setShowModal(true); setFormData({ name: '', description: '' }); setEditItem(null); }}
                    >
                        Add Position
                    </Button>
                }
            />

            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b border-slate-200 bg-slate-50 text-sm flex-wrap">
                <Button variant="danger" size="sm" icon={Trash2} onClick={handleBulkDelete}>
                    Delete
                </Button>
                <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchPositions}>
                    Refresh
                </Button>

                {/* Separator */}
                <div className="w-px h-6 bg-slate-300 mx-1" />

                {/* Export Buttons */}
                <ExportMenu
                    rows={positions}
                    columns={[
                        { key: 'id', label: 'ID' },
                        { key: 'name', label: 'Position Name' },
                        { key: 'description', label: 'Description' }
                    ]}
                    mapRow={(p) => ({ ...p, description: p.description || '' })}
                    filename={`positions_${new Date().toISOString().split('T')[0]}`}
                    title="Positions"
                />

                {/* Import Button */}
                <Button variant="secondary" size="sm" icon={Upload} onClick={() => setShowImportModal(true)}>
                    Import
                </Button>

                <div className="ml-auto w-64 relative">
                    <input
                        type="text"
                        placeholder="Search positions..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-orange-400"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <SkeletonLoader rows={8} columns={5} showHeader={true} />
            ) : (
                <div className="card-base overflow-hidden p-0">
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th className="table-header w-8">
                                    <input
                                        type="checkbox"
                                        onChange={(e) => setSelectedIds(e.target.checked ? filteredPositions.map(p => p.id) : [])}
                                        checked={filteredPositions.length > 0 && selectedIds.length === filteredPositions.length}
                                    />
                                </th>
                                <th className="table-header">ID</th>
                                <th className="table-header">Position Name</th>
                                <th className="table-header">Description</th>
                                <th className="table-header text-center sticky-action">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPositions.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                                        No positions found.
                                    </td>
                                </tr>
                            ) : (
                                filteredPositions.map((pos) => (
                                    <tr key={pos.id} className="table-row">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(pos.id)}
                                                onChange={() => toggleSelect(pos.id)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">#{pos.id}</td>
                                        <td className="px-6 py-4 font-semibold text-slate-800">{pos.name}</td>
                                        <td className="px-6 py-4 text-slate-600">{pos.description || '-'}</td>
                                        <td className="px-6 py-4 sticky-action">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(pos)}
                                                    className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                                    style={{ transition: 'all 200ms cubic-bezier(0.25, 0.8, 0.25, 1)' }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDelete(e, pos.id)}
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold text-slate-800">
                                {editItem ? 'Edit Position' : 'Add Position'}
                            </h2>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Position Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="e.g., Software Engineer"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg resize-none"
                                    rows={3}
                                    placeholder="Optional description"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
                                <Button variant="secondary" onClick={closeModal}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" icon={Save}>
                                    {editItem ? 'Update' : 'Create'}
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
                                    ? 'Are you sure you want to delete this position? This action cannot be undone.'
                                    : `Are you sure you want to delete ${deleteConfirm.count} selected position(s)? This action cannot be undone.`
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
                                Import Positions
                            </h2>
                            <button
                                type="button"
                                onClick={closeImportModal}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600">
                                Upload a CSV file with position names and descriptions. Format: name,description
                            </p>

                            {/* Download Template */}
                            <button
                                type="button"
                                onClick={downloadTemplate}
                                className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700"
                            >
                                <Download size={14} /> Download CSV Template
                            </button>

                            {/* File Input */}
                            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-purple-400 transition-colors">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.txt"
                                    onChange={handleImport}
                                    className="hidden"
                                    id="import-positions-file"
                                />
                                <label
                                    htmlFor="import-positions-file"
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
