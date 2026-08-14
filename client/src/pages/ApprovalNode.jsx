import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    CircleDot, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, X, AlertCircle
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalNode() {
    const toast = useToast();
    const [nodes, setNodes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [roles, setRoles] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({
        node_code: '', node_name: '', approver_type: '', approver_id: '', description: ''
    });
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [nodesRes, empRes, rolesRes, posRes] = await Promise.all([
                api.get('/api/approval/nodes').catch(() => ({ data: [] })),
                api.get('/api/employees').catch(() => ({ data: [] })),
                api.get('/api/approval/roles').catch(() => ({ data: [] })),
                api.get('/api/positions').catch(() => ({ data: [] }))
            ]);
            setNodes(nodesRes.data);
            setEmployees(empRes.data);
            setRoles(rolesRes.data);
            setPositions(posRes.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load approval nodes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Filter Logic
    const filteredItems = nodes.filter(item => {
        if (!searchQuery) return true;
        const lower = searchQuery.toLowerCase();
        return (
            item.node_name?.toLowerCase().includes(lower) ||
            item.node_code?.toLowerCase().includes(lower) ||
            item.description?.toLowerCase().includes(lower)
        );
    });

    const resetForm = () => {
        setFormData({ node_code: '', node_name: '', approver_type: '', approver_id: '', description: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await api.put(`/api/approval/nodes/${editItem.id}`, formData);
            } else {
                await api.post('/api/approval/nodes', formData);
            }
            setShowModal(null); setEditItem(null); resetForm();
            fetchData();
        } catch (err) { toast.error('Failed to save node'); }
    };

    const handleEdit = (node) => {
        setEditItem(node);
        setFormData({
            node_code: node.node_code || '', node_name: node.node_name || node.name || '',
            approver_type: node.approver_type || '', approver_id: node.approver_id || '',
            description: node.description || ''
        });
        setShowModal('edit');
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this node?')) return;
        try { await api.delete(`/api/approval/nodes/${id}`); fetchData(); }
        catch (err) { toast.error('Delete failed'); }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return toast.warning('Select nodes to delete');
        if (!confirm(`Delete ${selectedIds.length} nodes?`)) return;
        try {
            await Promise.all(selectedIds.map(id => api.delete(`/api/approval/nodes/${id}`)));
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredItems.map(r => r.id));
        }
    };

    const getApproverOptions = () => {
        switch (formData.approver_type) {
            case 'Person': return employees.map(e => ({ value: e.id, label: `${e.employee_code} - ${e.name}` }));
            case 'Role': return roles.map(r => ({ value: r.id, label: r.role_name || r.name }));
            case 'Position': return positions.map(p => ({ value: p.id, label: p.position_name || p.name }));
            default: return [];
        }
    };

    const approverTypes = ['Person', 'Role', 'Position'];
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)]">
            <PageHeader
                icon={CircleDot}
                title="Approval Nodes"
                subtitle="Define approval steps and their approvers"
            />
            <div className="flex flex-col flex-1 card-base overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm flex-wrap">
                <Button
                    variant="successSolid"
                    icon={Plus}
                    onClick={() => { resetForm(); setShowModal('add'); setEditItem(null); }}
                >
                    Add Node
                </Button>

                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>

                <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>
                    Delete
                </Button>

                <Button
                    variant="secondary"
                    icon={RefreshCw}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        fetchData();
                    }}
                >
                    Refresh
                </Button>

                <div className="ml-auto w-72 relative">
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey dark:text-slate-400" />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-800 custom-scrollbar">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load nodes</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="py-16 text-center">
                        <CircleDot size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching nodes' : 'No approval nodes yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? 'No node matches that search.'
                                : 'Add a node to define a single step in an approval flow.'}
                        </p>
                    </div>
                ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700">
                        <tr>
                            <th className="px-5 py-3 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                    checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Node Code</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Node Name</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Approver Type</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Description</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {paginatedItems.map(node => (
                            <tr key={node.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors group">
                                <td className="px-5 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                        checked={selectedIds.includes(node.id)}
                                        onChange={() => toggleSelect(node.id)}
                                    />
                                </td>
                                <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{node.node_code || '—'}</td>
                                <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{node.node_name || node.name || '—'}</td>
                                <td className="px-5 py-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800">
                                        {node.approver_type || '—'}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{node.description || '—'}</td>
                                <td className="px-5 py-3">
                                    <div className="dv-quiet">
                                        <Button variant="ghost" size="sm" icon={Edit} iconSize={16} onClick={() => handleEdit(node)} aria-label="Edit node" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(node.id)} aria-label="Delete node" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchData} title="Refresh" aria-label="Refresh" />
                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))} className="field-sm font-semibold">
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-r border-slate-200 dark:border-slate-700">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 py-1 font-bold bg-orange-600 text-white text-xs tabular-nums">{currentPage}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-l border-slate-200 dark:border-slate-700">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                <span className="text-xs font-medium">Total <span className="text-slate-800 dark:text-slate-100 font-bold tabular-nums">{filteredItems.length}</span> Records</span>
            </div>

            {/* Add/Edit Modal */}
            {(showModal === 'add' || showModal === 'edit') && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md border border-white/50 dark:border-slate-700 overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-lg text-charcoal dark:text-slate-100">{editItem ? 'Edit Node' : 'Add Node'}</h3>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }} aria-label="Close" />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Node Code<span className="text-red-500">*</span></label>
                                <input type="text" value={formData.node_code} onChange={e => setFormData({ ...formData, node_code: e.target.value })}
                                    className="input-base" placeholder="e.g. NODE001" required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Node Name<span className="text-red-500">*</span></label>
                                <input type="text" value={formData.node_name} onChange={e => setFormData({ ...formData, node_name: e.target.value })}
                                    className="input-base" placeholder="e.g. Manager Approval" required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Approver Type<span className="text-red-500">*</span></label>
                                <select value={formData.approver_type} onChange={e => setFormData({ ...formData, approver_type: e.target.value, approver_id: '' })}
                                    className="input-base" required>
                                    <option value="">Select Type</option>
                                    {approverTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            {formData.approver_type && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Approver<span className="text-red-500">*</span></label>
                                    <select value={formData.approver_id} onChange={e => setFormData({ ...formData, approver_id: e.target.value })}
                                        className="input-base" required>
                                        <option value="">Select Approver</option>
                                        {getApproverOptions().map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Description</label>
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="input-base resize-none" rows={3} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50 dark:border-slate-700">
                                <Button variant="secondary" onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }}>
                                    Cancel
                                </Button>
                                <Button variant="primary" type="submit">
                                    Confirm
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
