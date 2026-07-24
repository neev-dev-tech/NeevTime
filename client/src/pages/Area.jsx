import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import {
    Plus, Trash2, Folder,
    ChevronRight, ChevronDown,
    Upload, RefreshCw, LayoutList,
    ArrowRightLeft, X, Download, Search, Map
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

const AreaTreeItem = ({ area, areas, onSelect, selectedId, level = 0 }) => {
    const [expanded, setExpanded] = useState(true);
    const children = areas.filter(a => a.parent_area_id === area.id);
    const isSelected = selectedId === area.id;

    return (
        <div className="">
            <div
                className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg transition-colors mb-0.5 ${isSelected ? 'bg-orange-50 text-saffron' : 'text-slate-grey hover:bg-slate-50'}`}
                style={{ paddingLeft: `${level * 16 + 12}px` }}
                onClick={() => onSelect(area)}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className={`text-slate-grey/50 hover:text-saffron transition-colors ${children.length === 0 ? 'invisible' : ''}`}
                >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <Folder size={16} className={isSelected ? 'text-saffron fill-saffron/20' : 'text-yellow-400 fill-yellow-100'} />
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
            const res = await api.get('/api/areas');
            setAreas(res.data);
        } catch (err) { console.error("Failed to fetch areas", err); }
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
            <PageHeader icon={Map} title="Areas" />

            <div className="flex gap-6 h-[calc(100vh-12rem)]">
                {/* Tree View Sidebar */}
                <div className="w-64 card-base p-0 flex flex-col overflow-hidden shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-charcoal text-sm uppercase tracking-wide">Area Structure</h3>
                    </div>
                    <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
                        <div
                            className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg mb-0.5 transition-colors ${!selectedArea ? 'bg-orange-50 text-saffron' : 'text-slate-grey hover:bg-slate-50'}`}
                            onClick={() => setSelectedArea(null)}
                        >
                            <Folder size={16} className={!selectedArea ? 'text-saffron fill-saffron/20' : 'text-yellow-400 fill-yellow-100'} />
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
                    </div>
                </div>

                {/* Main Table Section */}
                <div className="flex-1 flex flex-col card-base overflow-hidden p-0">
                    {/* Toolbar */}
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                            <Button variant="successSolid" icon={Plus} onClick={() => { setFormData({}); setShowModal(true); }}>
                                Add
                            </Button>
                            <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                                Delete
                            </Button>
                            <div className="h-6 w-px bg-slate-200 mx-2"></div>
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
                            <Search size={18} className="absolute left-3 top-2.5 text-slate-grey" />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-orange-50 border-b border-orange-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 w-16">
                                        <input type="checkbox" checked={selectedRows.length === tableData.length && tableData.length > 0} onChange={toggleAllRows} className="rounded text-saffron focus:ring-saffron" />
                                    </th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Area Code</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Area Name</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Parent</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Device Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Employee Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Resigned Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">FP Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Face Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm">Card Count</th>
                                    <th className="px-6 py-4 font-semibold text-charcoal text-sm w-20">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {tableData.length === 0 ? (
                                    <tr>
                                        <td colSpan="11" className="p-8 text-center text-slate-grey">No areas found</td>
                                    </tr>
                                ) : (
                                    tableData.map(area => (
                                        <tr key={area.id} className={`bg-white hover:bg-cream-50 transition-colors ${selectedRows.includes(area.id) ? 'bg-orange-50/30' : ''}`}>
                                            <td className="px-6 py-4">
                                                <input type="checkbox" checked={selectedRows.includes(area.id)} onChange={() => toggleRowSelection(area.id)} className="rounded text-saffron focus:ring-saffron" />
                                            </td>
                                            <td className="px-6 py-4 text-saffron font-medium">{area.code || '-'}</td>
                                            <td className="px-6 py-4 text-slate-grey font-medium">{area.name}</td>
                                            <td className="px-6 py-4 text-slate-grey/70">{area.parent_area_name || '-'}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.device_count || 0}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.employee_count || 0}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.resigned_count || 0}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.fp_count || 0}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.face_count || 0}</td>
                                            <td className="px-6 py-4 text-slate-grey">{area.card_count || 0}</td>
                                            <td className="px-6 py-4">
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    icon={Trash2}
                                                    title="Delete Area"
                                                    aria-label="Delete Area"
                                                    onClick={() => handleDelete(area.id)}
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals - Simplified Styling for Consistency */}
            {/* Add Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal">Add Area</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowModal(false)} />
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-1">Parent Area</label>
                                <div className="input-base bg-slate-50 flex items-center">
                                    {selectedArea ? selectedArea.name : 'Root (None)'}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-1">Area Name <span className="text-red-500">*</span></label>
                                <input
                                    className="input-base"
                                    value={formData.name || ''}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-1">Area Code</label>
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
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-white/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal">Import Areas</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowImportModal(false)} />
                        </div>
                        <form onSubmit={handleImport} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-2">Select CSV File</label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    ref={fileInputRef}
                                    onChange={(e) => setImportFile(e.target.files[0])}
                                    className="input-base p-2"
                                />
                            </div>
                            <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 text-sm text-slate-grey">
                                <p className="font-bold text-saffron mb-1">CSV Format:</p>
                                <code className="block bg-white p-2 rounded border border-orange-100 mb-2">Area Name, Area Code</code>
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
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-white/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-charcoal">Personnel Transfer</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowTransferModal(false)} />
                        </div>
                        <form onSubmit={handleTransfer} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-1">From Area</label>
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
                                <label className="block text-sm font-medium text-slate-grey mb-1">To Area</label>
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
                            <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl text-sm text-yellow-800">
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
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/50 text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-charcoal mb-2">Delete Area?</h3>
                        <p className="text-slate-grey mb-6">
                            Are you sure you want to delete <span className="font-bold text-charcoal">{areaToDelete?.name || 'these items'}</span>? This action cannot be undone.
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
