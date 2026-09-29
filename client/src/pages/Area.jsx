import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { Plus, Trash2, Upload, RefreshCw, ArrowRightLeft, Download, Map, AlertCircle, MapPin } from 'lucide-react';
import { useToast, Button, ListPage, ListSearch, ListSelection, ListIconButton } from '../components';
import Modal from '../components/Modal';
import OrgDirectory from '../components/OrgDirectory';

const inArea = (area, e) => e.area_id === area.id || (!e.area_id && e.area_name === area.name);

export default function Area() {
    const toast = useToast();
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Parent for the Add form: null from the header (top level), the selected
    // area from its "Add sub-area" action.
    const [selectedArea, setSelectedArea] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [areaToDelete, setAreaToDelete] = useState(null);
    const [isBulkDelete, setIsBulkDelete] = useState(false);
    const [formData, setFormData] = useState({});
    const [importFile, setImportFile] = useState(null);
    const [selectedRows, setSelectedRows] = useState([]);
    const [transferData, setTransferData] = useState({ fromArea: '', toArea: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const fileInputRef = useRef(null);

    // Fetch Areas
    const fetchAreas = async () => {
        try {
            setError(null);
            const res = await api.get('/api/areas');
            setAreas(res.data);
        } catch (err) {
            console.error("Failed to fetch areas", err);
            setError(err.response?.data?.error || 'Could not load areas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAreas(); }, []);

    // Form Handlers
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/areas', { ...formData, parent_area_id: selectedArea?.id || null });
            setShowModal(false);
            setFormData({});
            fetchAreas();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save area');
        }
    };

    const handleDelete = (id) => {
        const area = areas.find(a => a.id === id);
        setAreaToDelete(area);
        setIsBulkDelete(false);
        setShowDeleteModal(true);
    };

    const handleBulkDelete = () => {
        if (selectedRows.length === 0) {
            toast.warning('Please select areas to delete');
            return;
        }
        setAreaToDelete(null);
        setIsBulkDelete(true);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        try {
            if (isBulkDelete) {
                await Promise.all(selectedRows.map(id => api.delete(`/api/areas/${id}`)));
                setSelectedRows([]);
            } else {
                if (!areaToDelete) return;
                await api.delete(`/api/areas/${areaToDelete.id}`);
            }
            fetchAreas();
            setShowDeleteModal(false);
            setAreaToDelete(null);
        } catch (err) {
            toast.error('Failed to delete areas. Check for dependencies.');
            setShowDeleteModal(false);
        }
    };

    const handleImport = async (e) => {
        e.preventDefault();
        if (!importFile) {
            toast.warning('Please select a file');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const text = evt.target.result;
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

                let imported = 0;
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    const row = {};
                    headers.forEach((h, idx) => row[h] = values[idx]);

                    try {
                        await api.post('/api/areas', {
                            name: row['area name'] || row['name'],
                            code: row['area code'] || row['code'],
                            parent_area_id: null
                        });
                        imported++;
                    } catch (e) { console.error('Row import error:', e); }
                }

                toast.success(`Imported ${imported} areas successfully`);
                setShowImportModal(false);
                setImportFile(null);
                fetchAreas();
            } catch (err) {
                toast.error('Failed to parse CSV file');
            }
        };
        reader.readAsText(importFile);
    };

    const handleTransfer = async (e) => {
        e.preventDefault();
        if (!transferData.fromArea || !transferData.toArea) {
            toast.warning('Please select both source and destination areas');
            return;
        }
        if (transferData.fromArea === transferData.toArea) {
            toast.warning('Source and destination areas must be different');
            return;
        }

        try {
            // Bulk transfer all employees from Source Area to Target Area
            await api.post('/api/personnel-transfer', {
                from_area_id: transferData.fromArea,
                target_area_id: transferData.toArea,
                mode: 'bulk_area'
            });

            toast.success('Personnel transferred successfully');
            setShowTransferModal(false);
            setTransferData({ fromArea: '', toArea: '' });
            fetchAreas(); // Refresh to show new counts
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to transfer personnel');
        }
    };

    const downloadTemplate = () => {
        const csv = 'Area Name,Area Code\nOffice,OFF001\nWarehouse,WH001';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'areas_template.csv';
        a.click();
    };

    const toggleRowSelection = (id) => {
        setSelectedRows(prev =>
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        );
    };


    // Areas in tree order (each parent followed by its children) with depth,
    // filtered by search while keeping that order.
    const depthOf = {};
    const ordered = [];
    const walk = (parentId, depth) => {
        areas.filter(a => (a.parent_area_id || null) === parentId).forEach(a => {
            depthOf[a.id] = depth;
            ordered.push(a);
            walk(a.id, depth + 1);
        });
    };
    walk(null, 0);
    // Orphans (parent missing) still appear, at the top level.
    areas.forEach(a => { if (!(a.id in depthOf)) { depthOf[a.id] = 0; ordered.push(a); } });
    const q = searchQuery.toLowerCase();
    const tableData = ordered.filter(a =>
        String(a.name ?? '').toLowerCase().includes(q) || String(a.code ?? '').toLowerCase().includes(q)
    );

    return (
        <>
        <ListPage
            title="Areas"
            count={areas.length}
            actions={
                <>
                    <Button variant="tonal" size="toolbar" icon={Upload} onClick={() => setShowImportModal(true)}>
                        Import
                    </Button>
                    <Button variant="tonal" size="toolbar" icon={ArrowRightLeft} onClick={() => setShowTransferModal(true)}>
                        Personnel Transfer
                    </Button>
                    <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => { setSelectedArea(null); setFormData({}); setShowModal(true); }}>
                        Add area
                    </Button>
                </>
            }
            toolbarActive={selectedRows.length > 0}
            toolbar={
                <>
                    <ListSearch label="Search areas" placeholder="Search areas..." value={searchQuery} onChange={setSearchQuery} />
                    <ListSelection count={selectedRows.length} onClear={() => setSelectedRows([])} />
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchAreas} disabled={loading} spin={loading} />
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
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load areas</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchAreas}>Try again</Button>
                    </div>
                ) : (
                    <OrgDirectory
                        items={tableData}
                        noun="area"
                        icon={MapPin}
                        memberOf={inArea}
                        memberColumn={{ label: 'Department', value: e => e.department_name }}
                        itemDepth={a => depthOf[a.id] || 0}
                        selectedIds={selectedRows}
                        onToggleSelect={toggleRowSelection}
                        onToggleAll={on => setSelectedRows(on ? tableData.map(a => a.id) : [])}
                        detailMeta={area => [
                            area.code && `Code ${area.code}`,
                            area.parent_area_name ? `Inside ${area.parent_area_name}` : 'Top level',
                            `${area.device_count || 0} device${Number(area.device_count) === 1 ? '' : 's'}`,
                            `${area.fp_count || 0} fingerprint · ${area.face_count || 0} face · ${area.card_count || 0} card`
                        ].filter(Boolean).join('  ·  ')}
                        detailActions={area => (
                            <>
                                <Button mutating variant="tonal" size="toolbar" icon={Plus}
                                    onClick={() => { setSelectedArea(area); setFormData({}); setShowModal(true); }}>
                                    Add sub-area
                                </Button>
                                <Button variant="danger" size="toolbar" icon={Trash2} onClick={() => (selectedRows.length ? handleBulkDelete() : handleDelete(area.id))}>{selectedRows.length ? `Delete ${selectedRows.length}` : 'Delete'}</Button>
                            </>
                        )}
                        emptyState={
                            <div className="py-20 text-center px-6">
                                <Map size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {searchQuery ? 'No matching areas' : 'No areas yet'}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {searchQuery
                                        ? `Nothing matches “${searchQuery}”. Try a different search.`
                                        : 'Add an area to start mapping sites, floors and zones.'}
                                </p>
                            </div>
                        }
                    />
                )}
        </ListPage>

            {/* Modals - Simplified Styling for Consistency */}
            {/* Add Modal */}
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title="Add Area"
                size="sm"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1">Parent Area</label>
                        <div className="input-base bg-slate-50 dark:bg-slate-900/50 flex items-center">
                            {selectedArea ? selectedArea.name : 'Root (None)'}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1">Area Name <span className="text-red-500 dark:text-red-400">*</span></label>
                        <input
                            className="input-base"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1">Area Code</label>
                        <input
                            className="input-base"
                            value={formData.code || ''}
                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                        <Button type="submit" variant="primary">Save</Button>
                    </div>
                </form>
            </Modal>

            {/* Import Modal */}
            <Modal
                open={showImportModal}
                onClose={() => setShowImportModal(false)}
                title="Import Areas"
            >
                <form onSubmit={handleImport} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-2">Select CSV File</label>
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={(e) => setImportFile(e.target.files[0])}
                            className="input-base p-2"
                        />
                    </div>
                    <div className="bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-grey dark:text-slate-400">
                        <p className="font-bold text-slate-600 dark:text-slate-400 mb-1">CSV Format:</p>
                        <code className="block bg-app-surface p-2 rounded border border-slate-100 dark:border-slate-800 mb-2">Area Name, Area Code</code>
                        <Button variant="secondary" icon={Download} type="button" onClick={downloadTemplate}>
                            Download Template
                        </Button>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
                        <Button type="submit" variant="primary">Import</Button>
                    </div>
                </form>
            </Modal>

            {/* Personnel Transfer Modal */}
            <Modal
                open={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                title="Personnel Transfer"
            >
                <form onSubmit={handleTransfer} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1">From Area</label>
                        <select
                            value={transferData.fromArea}
                            onChange={(e) => setTransferData({ ...transferData, fromArea: e.target.value })}
                            className="input-base"
                            required
                        >
                            <option value="">Select source area</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1">To Area</label>
                        <select
                            value={transferData.toArea}
                            onChange={(e) => setTransferData({ ...transferData, toArea: e.target.value })}
                            className="input-base"
                            required
                        >
                            <option value="">Select destination area</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-100 dark:border-yellow-800 p-4 rounded-xl text-sm text-yellow-800 dark:text-yellow-300">
                        <strong>Note:</strong> This will transfer personnel from the source area to the destination area.
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowTransferModal(false)}>Cancel</Button>
                        <Button type="submit" variant="primary">Transfer</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                open={showDeleteModal}
                onClose={() => { setShowDeleteModal(false); setAreaToDelete(null); }}
                size="sm"
                hideClose
            >
                {/* No header: this one is a centred confirmation, and a
                    left-aligned title bar would fight the icon above it. */}
                <div className="text-center">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 dark:text-red-400">
                    <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-charcoal dark:text-slate-100 mb-2">Delete Area?</h3>
                <p className="text-slate-grey dark:text-slate-400 mb-6">
                    Are you sure you want to delete <span className="font-bold text-charcoal dark:text-slate-100">{areaToDelete?.name || 'these items'}</span>? This action cannot be undone.
                </p>
                <div className="flex justify-center gap-3">
                    <Button variant="secondary" onClick={() => { setShowDeleteModal(false); setAreaToDelete(null); }}>
                        Cancel
                    </Button>
                    <Button variant="dangerSolid" onClick={confirmDelete}>
                        Yes, Delete
                    </Button>
                </div>
                </div>
            </Modal>
        </>
    );
}
