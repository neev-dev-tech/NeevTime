import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    GitBranch, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, Check, X, AlertCircle
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalFlow() {
    const toast = useToast();
    const [flows, setFlows] = useState([]);
    const [nodes, setNodes] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            setError(null);
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
            setError(err.response?.data?.error || 'Could not load approval flows');
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
            await Promise.all(selectedIds.map(id => api.delete(`/api/approval/flows/${id}`)));
            toast.success(`Deleted ${selectedIds.length} flow${selectedIds.length > 1 ? 's' : ''}`);
            setSelectedIds([]);
            fetchData();
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
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm flex-wrap">
                <Button
                    variant="successSolid"
                    icon={Plus}
                    onClick={() => { resetForm(); setShowModal('add'); setEditItem(null); }}
                >
                    Add Flow
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
                        placeholder="Search flows..."
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
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load flows</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="py-16 text-center">
                        <GitBranch size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching flows' : 'No approval flows yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? 'No flow matches that search.'
                                : 'Add a flow to chain approval nodes into a workflow.'}
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
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Flow Code</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Name</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Start Date</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">End Date</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Request Type</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {paginatedItems.map(flow => (
                            <tr key={flow.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors group">
                                <td className="px-5 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                        checked={selectedIds.includes(flow.id)}
                                        onChange={() => toggleSelect(flow.id)}
                                    />
                                </td>
                                <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{flow.flow_code || '—'}</td>
                                <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{flow.name || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{flow.start_date?.split('T')[0] || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{flow.end_date?.split('T')[0] || '—'}</td>
                                <td className="px-5 py-3">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                                        {flow.request_type || '—'}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{flow.department_name || '—'}</td>
                                <td className="px-5 py-3">
                                    <div className="dv-quiet">
                                        <Button variant="ghost" size="sm" icon={Edit} iconSize={16} onClick={() => handleEdit(flow)} aria-label="Edit flow" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(flow.id)} aria-label="Delete flow" />
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


            {/* Add/Edit Flow Modal */}
            {(showModal === 'add' || showModal === 'edit') && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col border border-white/50 dark:border-slate-700">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-lg text-charcoal dark:text-slate-100">{editItem ? 'Edit Flow' : 'Add Flow'}</h3>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={() => { setShowModal(null); setEditItem(null); resetForm(); }} aria-label="Close" />
                        </div>
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Start Date<span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                        className="input-base" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">End Date<span className="text-red-500">*</span></label>
                                    <input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                        className="input-base" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Flow Code<span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.flow_code} onChange={e => setFormData({ ...formData, flow_code: e.target.value })}
                                        className="input-base" placeholder="e.g. FLOW001" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Name<span className="text-red-500">*</span></label>
                                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="input-base" placeholder="Flow name" required />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Request Type<span className="text-red-500">*</span></label>
                                    <select value={formData.request_type} onChange={e => setFormData({ ...formData, request_type: e.target.value })}
                                        className="input-base" required>
                                        <option value="">Select Type</option>
                                        {requestTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Department</label>
                                    <select value={formData.department_id} onChange={e => setFormData({ ...formData, department_id: e.target.value, position_id: '', requester: '' })}
                                        className="input-base">
                                        <option value="">Select Department</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.name || d.department_name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* Nodes Section */}
                            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-charcoal dark:text-slate-100">Approval Nodes</h4>
                                    <Button variant="success" size="sm" icon={Plus} onClick={addNode}>
                                        Add Node
                                    </Button>
                                </div>

                                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                            <tr className="text-left">
                                                <th className="p-3 pl-4 font-bold">#</th>
                                                <th className="p-3 font-bold">Node Name</th>
                                                <th className="p-3 text-right pr-4 font-bold">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {flowNodes.length === 0 ? (
                                                <tr><td colSpan={3} className="p-6 text-center text-slate-500 dark:text-slate-400 text-xs">No nodes added yet — add one to build the approval chain.</td></tr>
                                            ) : (
                                                flowNodes.map((node, i) => (
                                                    <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                                        <td className="p-3 pl-4 text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
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

                            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-800 dark:text-blue-300 text-xs">
                                <strong>Note:</strong> Select only one among Requester, Department and Position for the flow scope.
                            </div>
                        </form>
                        <div className="flex justify-end gap-3 p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
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
