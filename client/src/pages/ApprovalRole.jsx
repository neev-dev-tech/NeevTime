import React, { useEffect, useState } from 'react';
import api from '../api';
import {
    Shield, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, Users, X
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalRole() {
    const toast = useToast();
    const [roles, setRoles] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(null); // 'add' | 'edit' | 'assign'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({ role_code: '', role_name: '', description: '' });
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);

    // Assignment modal state
    const [assignedEmployees, setAssignedEmployees] = useState([]);

    const fetchRoles = async () => {
        try {
            setLoading(true);
            const [rolesRes, empRes] = await Promise.all([
                api.get('/api/approval/roles').catch(() => ({ data: [] })),
                api.get('/api/employees').catch(() => ({ data: [] }))
            ]);
            setRoles(rolesRes.data);
            setEmployees(empRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    // Filter Logic
    const filteredItems = roles.filter(item => {
        if (!searchQuery) return true;
        const lower = searchQuery.toLowerCase();
        return (
            item.role_name?.toLowerCase().includes(lower) ||
            item.role_code?.toLowerCase().includes(lower) ||
            item.description?.toLowerCase().includes(lower)
        );
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editItem) {
                await api.put(`/api/approval/roles/${editItem.id}`, formData);
            } else {
                await api.post('/api/approval/roles', formData);
            }
            setFormData({ role_code: '', role_name: '', description: '' });
            setShowModal(null);
            setEditItem(null);
            fetchRoles();
        } catch (err) {
            toast.error('Failed to save role');
        }
    };

    const handleEdit = (role) => {
        setEditItem(role);
        setFormData({
            role_code: role.role_code || '',
            role_name: role.role_name || role.name || '',
            description: role.description || ''
        });
        setShowModal('edit');
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this role?')) return;
        try {
            await api.delete(`/api/approval/roles/${id}`);
            fetchRoles();
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return toast.warning('Select roles to delete');
        if (!confirm(`Delete ${selectedIds.length} roles?`)) return;
        try {
            await Promise.all(selectedIds.map(id => api.delete(`/api/approval/roles/${id}`)));
            setSelectedIds([]);
            fetchRoles();
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

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)]">
            <PageHeader
                icon={Shield}
                title="Approval Roles"
                subtitle="Define approver roles for approval workflows"
            />
            <div className="flex flex-col flex-1 card-base overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white text-sm flex-wrap">
                <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => { setShowModal('add'); setFormData({ role_code: '', role_name: '', description: '' }); setEditItem(null); }}
                >
                    Add Role
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
                        fetchRoles();
                    }}
                >
                    Refresh
                </Button>

                <div className="ml-auto w-72 relative">
                    <input
                        type="text"
                        placeholder="Search roles..."
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
                            <th className="p-4 border-b border-slate-100">Role Code</th>
                            <th className="p-4 border-b border-slate-100">Role Name</th>
                            <th className="p-4 border-b border-slate-100">Description</th>
                            <th className="p-4 border-b border-slate-100">Total Employees</th>
                            <th className="p-4 w-24 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-grey">Loading...</td></tr>
                        ) : paginatedItems.length === 0 ? (
                            <tr><td colSpan={6} className="p-12 text-center text-slate-grey">No roles found</td></tr>
                        ) : (
                            paginatedItems.map(role => (
                                <tr key={role.id} className="hover:bg-cream-50 transition-colors group">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-saffron focus:ring-saffron"
                                            checked={selectedIds.includes(role.id)}
                                            onChange={() => toggleSelect(role.id)}
                                        />
                                    </td>
                                    <td className="p-4 font-mono text-saffron font-medium">{role.role_code || role.id}</td>
                                    <td className="p-4 font-bold text-charcoal">{role.role_name || role.name}</td>
                                    <td className="p-4 text-slate-grey">{role.description || '-'}</td>
                                    <td className="p-4 text-slate-grey">{role.employee_count || 0}</td>
                                    <td className="p-4 flex justify-center gap-2">
                                        <Button variant="ghost" size="sm" icon={Edit} iconSize={16} onClick={() => handleEdit(role)} aria-label="Edit role" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(role.id)} aria-label="Delete role" />
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
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchRoles} title="Refresh" aria-label="Refresh" />
                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))} className="border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-saffron">
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <div className="flex items-center bg-white border border-slate-200 rounded-md">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 hover:bg-slate-100 rounded-l disabled:opacity-50 transition-colors border-r border-slate-200">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 py-1 font-medium bg-green-600 text-white text-xs">{currentPage}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} disabled={currentPage === totalPages} className="p-1.5 hover:bg-slate-100 rounded-r disabled:opacity-50 transition-colors border-l border-slate-200">
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
                            <h3 className="font-bold text-lg text-charcoal">{editItem ? 'Edit Role' : 'Add Role'}</h3>
                            <Button variant="ghost" icon={X} iconSize={20} onClick={() => { setShowModal(null); setEditItem(null); }} aria-label="Close" />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <label className="w-28 text-right text-slate-grey text-sm font-medium">Role Code<span className="text-red-500">*</span>:</label>
                                <input type="text" value={formData.role_code} onChange={e => setFormData({ ...formData, role_code: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm" placeholder="e.g. ROLE001" required />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="w-28 text-right text-slate-grey text-sm font-medium">Role Name<span className="text-red-500">*</span>:</label>
                                <input type="text" value={formData.role_name} onChange={e => setFormData({ ...formData, role_name: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm" placeholder="e.g. Manager" required />
                            </div>
                            <div className="flex items-start gap-3">
                                <label className="w-28 text-right text-slate-grey text-sm font-medium pt-2">Description:</label>
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm resize-none" rows={3} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
                                <Button variant="secondary" onClick={() => { setShowModal(null); setEditItem(null); }}>
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
