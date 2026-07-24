import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    CircleDot, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, X
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalNode() {
    const toast = useToast();
    const [nodes, setNodes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [roles, setRoles] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
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
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white text-sm flex-wrap">
                <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => { resetForm(); setShowModal('add'); setEditItem(null); }}
                >
                    Add Node
                </Button>

                <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>

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
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey" />
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-orange-50/50 text-charcoal font-semibold sticky top-0 z-10 border-b border-slate-100">
                        <tr>
                            <th className="p-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 text-saffron focus:ring-saffron"
                                    checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="p-4 border-b border-slate-100">Node Code</th>
                            <th className="p-4 border-b border-slate-100">Node Name</th>
                            <th className="p-4 border-b border-slate-100">Approver Type</th>
                            <th className="p-4 border-b border-slate-100">Description</th>
                            <th className="p-4 w-24 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-grey">Loading...</td></tr>
                        ) : paginatedItems.length === 0 ? (
                            <tr><td colSpan={6} className="p-12 text-center text-slate-grey">No nodes found</td></tr>
                        ) : (
                            paginatedItems.map(node => (
                                <tr key={node.id} className="hover:bg-cream-50 transition-colors group">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-saffron focus:ring-saffron"
                                            checked={selectedIds.includes(node.id)}
                                            onChange={() => toggleSelect(node.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-mono text-saffron font-medium">{node.node_code}</td>
                                    <td className="p-4 font-bold text-charcoal">{node.node_name || node.name}</td>
                                    <td className="p-4"><span className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-bold">{node.approver_type || '-'}</span></td>
                                    <td className="p-4 text-slate-grey">{node.description || '-'}</td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <button onClick={() => handleEdit(node)} className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50 transition-colors">
                                            <Edit size={16} />
                                        </button>
                                        <button onClick={() => handleDelete(node.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-grey bg-slate-50/50">
                <div className="flex items-center gap-3">
                    <button onClick={fetchData} className="p-1.5 hover:bg-slate-200 rounded transition-colors" title="Refresh"><RefreshCw size={14} /></button>
                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-saffron">
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <div className="flex items-center bg-white border border-slate-200 rounded-md">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 hover:bg-slate-100 rounded-l disabled:opacity-50 transition-colors border-r border-slate-200">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 py-1 font-medium bg-green-600 text-white text-xs">{currentPage}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} className="p-1.5 hover:bg-slate-100 rounded-r disabled:opacity-50 transition-colors border-l border-slate-200">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                <span className="text-xs font-medium">Total <span className="text-charcoal font-bold">{filteredItems.length}</span> Records</span>
            </div>

            {/* Add/Edit Modal */}
            {(showModal === 'add' || showModal === 'edit') && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50 overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-lg text-charcoal">{editItem ? 'Edit Node' : 'Add Node'}</h3>
                            <button onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }} className="p-2 hover:bg-white rounded-full text-slate-grey transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey text-sm font-medium">Node Code<span className="text-red-500">*</span></label>
                                <input type="text" value={formData.node_code} onChange={e => setFormData({ ...formData, node_code: e.target.value })}
                                    className="input-base" placeholder="e.g. NODE001" required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey text-sm font-medium">Node Name<span className="text-red-500">*</span></label>
                                <input type="text" value={formData.node_name} onChange={e => setFormData({ ...formData, node_name: e.target.value })}
                                    className="input-base" placeholder="e.g. Manager Approval" required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey text-sm font-medium">Approver Type<span className="text-red-500">*</span></label>
                                <select value={formData.approver_type} onChange={e => setFormData({ ...formData, approver_type: e.target.value, approver_id: '' })}
                                    className="input-base" required>
                                    <option value="">Select Type</option>
                                    {approverTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            {formData.approver_type && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Approver<span className="text-red-500">*</span></label>
                                    <select value={formData.approver_id} onChange={e => setFormData({ ...formData, approver_id: e.target.value })}
                                        className="input-base" required>
                                        <option value="">Select Approver</option>
                                        {getApproverOptions().map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-slate-grey text-sm font-medium">Description</label>
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="input-base resize-none" rows={3} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
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
