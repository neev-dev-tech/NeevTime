import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import { Briefcase, Plus, Trash2, Edit2, RefreshCw, Save, Download, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast, Button, ExportMenu, ListPage, ListSearch, ListSelection, ListIconButton } from '../components';
import { toLocalDateString } from '../utils/dateFormat';
import OrgDirectory from '../components/OrgDirectory';

// Employees record their position as a title (designation); match on the id
// when present, otherwise on the title text, case-insensitively.
const inPosition = (pos, e) => (e.position_id != null && e.position_id === pos.id)
    || String(e.designation || '').trim().toLowerCase() === String(pos.name || '').trim().toLowerCase();

export default function Positions() {
    const toast = useToast();
    const [positions, setPositions] = useState([]);
    const [filteredPositions, setFilteredPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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

    // Job titles already typed on employee records but not yet set up as
    // positions, offered on the empty page so the list isn't rebuilt by hand.
    const [unlistedTitles, setUnlistedTitles] = useState([]);
    const [creatingTitles, setCreatingTitles] = useState(false);
    useEffect(() => {
        api.get('/api/employees').then(res => {
            const known = new Set(positions.map(p => String(p.name || '').trim().toLowerCase()));
            const titles = [...new Set((res.data || []).map(e => String(e.designation || '').trim()).filter(Boolean))];
            setUnlistedTitles(titles.filter(t => !known.has(t.toLowerCase())).sort());
        }).catch(() => setUnlistedTitles([]));
    }, [positions]);

    const createFromTitles = async () => {
        setCreatingTitles(true);
        let made = 0;
        for (const name of unlistedTitles) {
            try { await api.post('/api/positions', { name }); made += 1; } catch { /* reported below */ }
        }
        setCreatingTitles(false);
        if (made) toast.success(`Created ${made} position${made === 1 ? '' : 's'}`);
        if (made < unlistedTitles.length) toast.error(`${unlistedTitles.length - made} could not be created`);
        fetchPositions();
    };

    const fetchPositions = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await api.get('/api/positions');
            setPositions(res.data);
            setFilteredPositions(res.data);
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load positions');
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
        <>
        <ListPage
            title="Positions"
            count={positions.length}
            actions={
                <>
                    <Button variant="tonal" size="toolbar" icon={Upload} onClick={() => setShowImportModal(true)}>
                        Import
                    </Button>
                    <ExportMenu
                        rows={positions}
                        columns={[
                            { key: 'id', label: 'ID' },
                            { key: 'name', label: 'Position Name' },
                            { key: 'description', label: 'Description' }
                        ]}
                        mapRow={(p) => ({ ...p, description: p.description || '' })}
                        filename={`positions_${toLocalDateString()}`}
                        title="Positions"
                    />
                    <Button mutating
                        variant="primary"
                        size="toolbar"
                        icon={Plus}
                        onClick={() => { setShowModal(true); setFormData({ name: '', description: '' }); setEditItem(null); }}
                    >
                        Add Position
                    </Button>
                </>
            }
            toolbarActive={selectedIds.length > 0}
            toolbar={
                <>
                    <ListSearch label="Search positions" placeholder="Search positions..." value={searchQuery} onChange={setSearchQuery} />
                    <ListSelection count={selectedIds.length} onClear={() => setSelectedIds([])} />
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchPositions} disabled={loading} spin={loading} />
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
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load positions</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchPositions}>Try again</Button>
                    </div>
                ) : (
                    <OrgDirectory
                        items={filteredPositions}
                        noun="position"
                        icon={Briefcase}
                        memberOf={inPosition}
                        memberColumn={{ label: 'Department', value: e => e.department_name }}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onToggleAll={on => setSelectedIds(on ? filteredPositions.map(p => p.id) : [])}
                        detailMeta={pos => pos.description || 'No description'}
                        detailActions={pos => (
                            <>
                                <Button variant="tonal" size="toolbar" icon={Edit2} onClick={() => handleEdit(pos)}>Edit</Button>
                                <Button variant="danger" size="toolbar" icon={Trash2} onClick={(e) => (selectedIds.length ? handleBulkDelete(e) : handleDelete(e, pos.id))}>{selectedIds.length ? `Delete ${selectedIds.length}` : 'Delete'}</Button>
                            </>
                        )}
                        emptyState={
                            <div className="py-20 text-center px-6">
                                <Briefcase size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {searchQuery ? 'No matching positions' : 'No positions yet'}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {searchQuery
                                        ? `Nothing matches “${searchQuery}”. Try a different search.`
                                        : 'Add a position to define the job titles employees can hold.'}
                                </p>
                                {!searchQuery && unlistedTitles.length > 0 && (
                                    <div className="mt-6 mx-auto max-w-md text-left rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                            {unlistedTitles.length} job title{unlistedTitles.length === 1 ? ' is' : 's are'} already used on employee records
                                        </p>
                                        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">{unlistedTitles.slice(0, 8).join(', ')}{unlistedTitles.length > 8 ? '…' : ''}</p>
                                        <Button mutating variant="primary" size="toolbar" icon={Plus} className="mt-3" onClick={createFromTitles} disabled={creatingTitles}>
                                            {creatingTitles ? 'Creating…' : `Create ${unlistedTitles.length} position${unlistedTitles.length === 1 ? '' : 's'} from these`}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        }
                    />
                )}
        </ListPage>

            {/* Add/Edit Modal */}
            <Modal
                open={showModal}
                onClose={closeModal}
                title={editItem ? 'Edit Position' : 'Add Position'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Position Name *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="field"
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
                            className="field resize-none"
                            rows={3}
                            placeholder="Optional description"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" icon={Save}>
                            {editItem ? 'Update' : 'Create'}
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
                            ? 'Are you sure you want to delete this position? This action cannot be undone.'
                            : `Are you sure you want to delete ${deleteConfirm.count} selected position(s)? This action cannot be undone.`
                        }
                    </p>
                </Modal>
            )}

            {/* Import Modal */}
            <Modal
                open={showImportModal}
                onClose={closeImportModal}
                title="Import Positions"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Upload a CSV file with position names and descriptions. Format: name,description
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
                            id="import-positions-file"
                        />
                        <label
                            htmlFor="import-positions-file"
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
        </>
    );
}
