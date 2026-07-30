import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import {
    Plus, Trash2, Folder,
    ChevronRight, ChevronDown,
    Upload, RefreshCw, LayoutList,
    ArrowRightLeft, X, Download, Search, Map, AlertCircle
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

const AreaTreeItem = ({ area, areas, onSelect, selectedId, level = 0 }) => {
    const [expanded, setExpanded] = useState(true);
    const children = areas.filter(a => a.parent_area_id === area.id);
    const isSelected = selectedId === area.id;

    return (
        <div className="">
            <div
                className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg transition-colors mb-0.5 ${isSelected
                    ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                style={{ paddingLeft: `${level * 16 + 12}px` }}
                onClick={() => onSelect(area)}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className={`text-slate-400 dark:text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 transition-colors ${children.length === 0 ? 'invisible' : ''}`}
                >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <Folder size={16} className={isSelected ? 'text-orange-500 dark:text-orange-400 fill-orange-200/60 dark:fill-orange-400/20' : 'text-amber-400 dark:text-amber-300 fill-amber-100 dark:fill-amber-400/20'} />
                <span className="text-sm font-medium truncate">{area.name}</span>
            </div>
            {expanded && children.map(child => (
                <AreaTreeItem
                    key={child.id}
                    area={child}
                    areas={areas}
                    onSelect={onSelect}
                    selectedId={selectedId}
                    level={level + 1}
                />
            ))}
        </div>
    );
};

// Force rebuild for HMR
export default function Area() {
    const toast = useToast();
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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

    const toggleAllRows = () => {
        if (selectedRows.length === tableData.length) {
            setSelectedRows([]);
        } else {
            setSelectedRows(tableData.map(a => a.id));
        }
    };

    // Derived Display Data
    const rootAreas = areas.filter(a => !a.parent_area_id);
    const tableData = (selectedArea
        ? areas.filter(a => a.parent_area_id === selectedArea.id)
        : areas).filter(a =>
            a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (a.code && a.code.toLowerCase().includes(searchQuery.toLowerCase()))
        );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <PageHeader icon={Map} title="Areas" subtitle="Sites and zones devices and employees belong to" />

            <div className="flex gap-6 h-[calc(100vh-12rem)]">
                {/* Tree View Sidebar */}
                <div className="w-64 bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col overflow-hidden shrink-0">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Area Structure</h3>
                    </div>
                    <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="p-2 space-y-2">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="h-8 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                ))}
                            </div>
                        ) : (
                            <>
                                <div
                                    className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg mb-0.5 transition-colors ${!selectedArea
                                        ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-semibold'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                    onClick={() => setSelectedArea(null)}
                                >
                                    <Folder size={16} className={!selectedArea ? 'text-orange-500 dark:text-orange-400 fill-orange-200/60 dark:fill-orange-400/20' : 'text-amber-400 dark:text-amber-300 fill-amber-100 dark:fill-amber-400/20'} />
                                    <span className="text-sm font-medium">All Areas</span>
                                </div>
                                {rootAreas.map(area => (
                                    <AreaTreeItem
                                        key={area.id}
                                        area={area}
                                        areas={areas}
                                        onSelect={setSelectedArea}
                                        selectedId={selectedArea?.id}
                                    />
                                ))}
                                {!error && rootAreas.length === 0 && (
                                    <p className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">
                                        No areas defined yet.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Main Table Section */}
                <div className="flex-1 flex flex-col card-base !p-0 overflow-hidden">
                    {/* Toolbar */}
                    <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white/70 dark:bg-slate-800/70 flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <Button variant="successSolid" icon={Plus} onClick={() => { setFormData({}); setShowModal(true); }}>
                                Add
                            </Button>
                            <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                                Delete
                            </Button>
                            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
                            <Button variant="secondary" icon={Upload} onClick={() => setShowImportModal(true)}>
                                Import
                            </Button>
                            <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setShowTransferModal(true)}>
                                Personnel Transfer
                            </Button>
                        </div>
                        <div className="relative w-64">
                            <input
                                type="text"
                                placeholder="Search areas..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="input-base pl-10 py-2"
                            />
                            <Search size={18} className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        {loading ? (
                            <div className="p-6 space-y-3">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                                ))}
                            </div>
                        ) : error ? (
                            <div className="py-16 text-center">
                                <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load areas</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                                <Button variant="secondary" icon={RefreshCw} onClick={fetchAreas}>Try again</Button>
                            </div>
                        ) : tableData.length === 0 ? (
                            <div className="py-16 text-center">
                                <Map size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {searchQuery ? 'No matching areas' : 'No areas here'}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {searchQuery
                                        ? `Nothing matches “${searchQuery}”. Try a different search.`
                                        : selectedArea
                                            ? `${selectedArea.name} has no sub-areas yet. Use Add to create one.`
                                            : 'Add an area to start mapping sites, floors and zones.'}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-5 py-3 font-bold w-10">
                                            <input type="checkbox" checked={selectedRows.length === tableData.length && tableData.length > 0} onChange={toggleAllRows} className="rounded text-orange-600 focus:ring-orange-500" />
                                        </th>
                                        <th className="px-5 py-3 font-bold w-12">#</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Area Code</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Area Name</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Parent</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Device Count</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Employee Count</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Resigned Count</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">FP Count</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Face Count</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Card Count</th>
                                        <th className="px-5 py-3 font-bold text-right whitespace-nowrap w-20">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {tableData.map((area, idx) => (
                                        <tr key={area.id} className={`hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors ${selectedRows.includes(area.id) ? 'bg-orange-50/60 dark:bg-orange-900/20' : ''}`}>
                                            <td className="px-5 py-3">
                                                <input type="checkbox" checked={selectedRows.includes(area.id)} onChange={() => toggleRowSelection(area.id)} className="rounded text-orange-600 focus:ring-orange-500" />
                                            </td>
                                            <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                            <td className="px-5 py-3">
                                                <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                    {area.code || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{area.name || '—'}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{area.parent_area_name || '—'}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.device_count || 0}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.employee_count || 0}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.resigned_count || 0}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.fp_count || 0}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.face_count || 0}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{area.card_count || 0}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-end">
                                                    <div className="dv-quiet">
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            icon={Trash2}
                                                            title="Delete Area"
                                                            aria-label="Delete Area"
                                                            onClick={() => handleDelete(area.id)}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {!loading && !error && tableData.length > 0 && (
                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {tableData.length} record{tableData.length === 1 ? '' : 's'}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals - Simplified Styling for Consistency */}
            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal dark:text-slate-100">Add Area</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowModal(false)} />
                        </div>
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
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal dark:text-slate-100">Import Areas</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowImportModal(false)} />
                        </div>
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
                            <div className="bg-orange-50/50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-100 dark:border-orange-800 text-sm text-slate-grey dark:text-slate-400">
                                <p className="font-bold text-orange-600 dark:text-orange-400 mb-1">CSV Format:</p>
                                <code className="block bg-white dark:bg-slate-800 p-2 rounded border border-orange-100 dark:border-orange-800 mb-2">Area Name, Area Code</code>
                                <Button variant="secondary" icon={Download} type="button" onClick={downloadTemplate}>
                                    Download Template
                                </Button>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="secondary" onClick={() => setShowImportModal(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Import</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Personnel Transfer Modal */}
            {showTransferModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal dark:text-slate-100">Personnel Transfer</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowTransferModal(false)} />
                        </div>
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
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-200 dark:border-slate-700 text-center">
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
                </div>
            )}
        </div>
    );
}
