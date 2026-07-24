import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    GitBranch, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, Check, X
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalFlow() {
    const toast = useToast();
    const [flows, setFlows] = useState([]);
    const [nodes, setNodes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({
        flow_code: '', name: '', start_date: '', end_date: '',
        request_type: '', requester: '', position_id: '', department_id: ''
    });
    const [flowNodes, setFlowNodes] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [flowsRes, nodesRes, depsRes, posRes] = await Promise.all([
                api.get('/api/approval/flows').catch(() => ({ data: [] })),
                api.get('/api/approval/nodes').catch(() => ({ data: [] })),
                api.get('/api/departments').catch(() => ({ data: [] })),
                api.get('/api/positions').catch(() => ({ data: [] }))
            ]);
            setFlows(flowsRes.data);
            setNodes(nodesRes.data);
            setDepartments(depsRes.data);
            setPositions(posRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Filter Logic
    const filteredItems = flows.filter(item => {
        if (!searchQuery) return true;
        const lower = searchQuery.toLowerCase();
        return (
            item.name?.toLowerCase().includes(lower) ||
            item.flow_code?.toLowerCase().includes(lower) ||
            item.department_name?.toLowerCase().includes(lower)
        );
    });

    const resetForm = () => {
        const today = new Date().toISOString().split('T')[0];
        setFormData({ flow_code: '', name: '', start_date: today, end_date: '', request_type: '', requester: '', position_id: '', department_id: '' });
        setFlowNodes([]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await api.put(`/api/approval/flows/${editItem.id}`, { ...formData, nodes: flowNodes });
            } else {
                await api.post('/api/approval/flows', { ...formData, nodes: flowNodes });
            }
            setShowModal(null); setEditItem(null); resetForm();
            fetchData();
        } catch (err) { toast.error('Failed to save flow'); }
    };

    const handleEdit = (flow) => {
        setEditItem(flow);
        setFormData({
            flow_code: flow.flow_code || '', name: flow.name || '',
            start_date: flow.start_date?.split('T')[0] || '', end_date: flow.end_date?.split('T')[0] || '',
            request_type: flow.request_type || '', requester: flow.requester || '',
            position_id: flow.position_id || '', department_id: flow.department_id || ''
        });
        setFlowNodes(flow.nodes || []);
        setShowModal('edit');
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this flow?')) return;
        try { await api.delete(`/api/approval/flows/${id}`); fetchData(); }
        catch (err) { toast.error('Delete failed'); }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return toast.warning('Select flows to delete');
        if (!confirm(`Delete ${selectedIds.length} flows?`)) return;
        try {
            // await Promise.all(selectedIds.map(id => api.delete(`/api/approval/flows/${id}`))); // Assuming endpoint exists
            toast.info('Bulk delete not implemented for flows yet');
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    const addNode = () => {
        setFlowNodes([...flowNodes, { node_id: '', node_name: '' }]);
    };

    const removeNode = (index) => {
        setFlowNodes(flowNodes.filter((_, i) => i !== index));
    };

    const updateNode = (index, field, value) => {
        const updated = [...flowNodes];
        updated[index][field] = value;
        if (field === 'node_id') {
            const node = nodes.find(n => n.id == value);
            updated[index].node_name = node?.node_name || node?.name || '';
        }
        setFlowNodes(updated);
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

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const requestTypes = ['Leave', 'Overtime', 'Attendance Correction'];

    return (
        <div className="flex flex-col h-[calc(100vh-120px)]">
            <PageHeader
                icon={GitBranch}
                title="Approval Flows"
                subtitle="Configure multi-step approval workflows"
            />
            <div className="flex flex-col flex-1 card-base overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white text-sm flex-wrap">
                <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => { resetForm(); setShowModal('add'); setEditItem(null); }}
                >
                    Add Flow
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
                        placeholder="Search flows..."
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
                            <th className="p-4 border-b border-slate-100">Flow Code</th>
                            <th className="p-4 border-b border-slate-100">Name</th>
                            <th className="p-4 border-b border-slate-100">Start Date</th>
                            <th className="p-4 border-b border-slate-100">End Date</th>
                            <th className="p-4 border-b border-slate-100">Request Type</th>
                            <th className="p-4 border-b border-slate-100">Department</th>
                            <th className="p-4 w-24 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan={8} className="p-8 text-center text-slate-grey">Loading...</td></tr>
                        ) : paginatedItems.length === 0 ? (
                            <tr><td colSpan={8} className="p-12 text-center text-slate-grey">No flows found</td></tr>
                        ) : (
                            paginatedItems.map(flow => (
                                <tr key={flow.id} className="hover:bg-cream-50 transition-colors group">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-saffron focus:ring-saffron"
                                            checked={selectedIds.includes(flow.id)}
                                            onChange={() => toggleSelect(flow.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-mono text-saffron font-medium">{flow.flow_code}</td>
                                    <td className="p-4 font-bold text-charcoal">{flow.name}</td>
                                    <td className="p-4 text-slate-grey">{flow.start_date?.split('T')[0] || '-'}</td>
                                    <td className="p-4 text-slate-grey">{flow.end_date?.split('T')[0] || '-'}</td>
                                    <td className="p-4"><span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">{flow.request_type || '-'}</span></td>
                                    <td className="p-4 text-slate-grey">{flow.department_name || '-'}</td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <Button variant="ghost" size="sm" icon={Edit} iconSize={16} onClick={() => handleEdit(flow)} aria-label="Edit flow" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(flow.id)} aria-label="Delete flow" />
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
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchData} title="Refresh" aria-label="Refresh" />
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


            {/* Add/Edit Flow Modal */}
            {(showModal === 'add' || showModal === 'edit') && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border border-white/50">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="font-bold text-lg text-charcoal">{editItem ? 'Edit Flow' : 'Add Flow'}</h3>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }} aria-label="Close" />
                        </div>
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Start Date<span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        className="input-base" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">End Date<span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                        className="input-base" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Flow Code<span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.flow_code} onChange={e => setFormData({ ...formData, flow_code: e.target.value })}
                                        className="input-base" placeholder="e.g. FLOW001" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Name<span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="input-base" placeholder="Flow name" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Request Type<span className="text-red-500">*</span></label>
                                    <select value={formData.request_type} onChange={e => setFormData({ ...formData, request_type: e.target.value })}
                                        className="input-base" required>
                                        <option value="">Select Type</option>
                                        {requestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey text-sm font-medium">Department</label>
                                    <select value={formData.department_id} onChange={e => setFormData({ ...formData, department_id: e.target.value, position_id: '', requester: '' })}
                                        className="input-base">
                                        <option value="">Select Department</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name || d.department_name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Nodes Section */}
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-charcoal">Approval Nodes</h4>
                                    <Button variant="success" size="sm" icon={Plus} onClick={addNode}>
                                        Add Node
                                    </Button>
                                </div>

                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50/50">
                                            <tr className="text-left text-slate-grey font-medium">
                                                <th className="p-3 pl-4">#</th>
                                                <th className="p-3">Node Name</th>
                                                <th className="p-3 text-right pr-4">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {flowNodes.length === 0 ? (
                                                <tr><td colSpan={3} className="p-6 text-center text-slate-grey text-xs italic">No nodes added yet.</td></tr>
                                            ) : (
                                                flowNodes.map((node, i) => (
                                                    <tr key={i} className="hover:bg-cream-50">
                                                        <td className="p-3 pl-4 text-slate-grey">{i + 1}</td>
                                                        <td className="p-3">
                                                            <select value={node.node_id} onChange={e => updateNode(i, 'node_id', e.target.value)}
                                                                className="input-base py-1.5 text-sm">
                                                                <option value="">Select Node</option>
                                                                {nodes.map(n => <option key={n.id} value={n.id}>{n.node_name || n.name}</option>)}
                                                            </select>
                                                        </td>
                                                        <td className="p-3 text-right pr-4">
                                                            <Button type="button" variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => removeNode(i)} aria-label="Remove node" />
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="p-3 bg-blue-50 rounded-lg text-blue-800 text-xs">
                                <strong>Note:</strong> Select only one among Requester, Department and Position for the flow scope.
                            </div>
                        </form>
                        <div className="flex justify-end gap-3 p-5 border-t border-slate-100 bg-slate-50/50">
                            <Button variant="secondary" onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }}>Cancel</Button>
                            <Button variant="primary" type="submit" onClick={handleSubmit}>Confirm</Button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
