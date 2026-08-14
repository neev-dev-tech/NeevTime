import React, { useEffect, useState } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import {
    Shield, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, Search, Users, X, AlertCircle
} from 'lucide-react';
import { useToast, Button, PageHeader } from '../components';

export default function ApprovalRole() {
    const toast = useToast();
    const [roles, setRoles] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            setError(null);
            const [rolesRes, empRes] = await Promise.all([
                api.get('/api/approval/roles').catch(() => ({ data: [] })),
                api.get('/api/employees').catch(() => ({ data: [] }))
            ]);
            setRoles(rolesRes.data);
            setEmployees(empRes.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load approval roles');
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
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm flex-wrap">
                <Button
                    variant="successSolid"
                    icon={Plus}
                    onClick={() => { setShowModal('add'); setFormData({ role_code: '', role_name: '', description: '' }); setEditItem(null); }}
                >
                    Add Role
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
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load roles</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRoles}>Try again</Button>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="py-16 text-center">
                        <Shield size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching roles' : 'No approval roles yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? 'No role matches that search.'
                                : 'Add a role to describe who can approve requests.'}
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
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Role Code</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Role Name</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Description</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap">Total Employees</th>
                            <th className="px-5 py-3 font-bold whitespace-nowrap w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {paginatedItems.map(role => (
                            <tr key={role.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors group">
                                <td className="px-5 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                        checked={selectedIds.includes(role.id)}
                                        onChange={() => toggleSelect(role.id)}
                                    />
                                </td>
                                <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{role.role_code || role.id || '—'}</td>
                                <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{role.role_name || role.name || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{role.description || '—'}</td>
                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{role.employee_count || 0}</td>
                                <td className="px-5 py-3">
                                    <div className="dv-quiet">
                                        <Button variant="ghost" size="sm" icon={Edit} iconSize={16} onClick={() => handleEdit(role)} aria-label="Edit role" />
                                        <Button variant="danger" size="sm" icon={Trash2} iconSize={16} onClick={() => handleDelete(role.id)} aria-label="Delete role" />
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
                    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={fetchRoles} title="Refresh" aria-label="Refresh" />
                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))} className="field-sm font-semibold">
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-r border-slate-200 dark:border-slate-700">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 py-1 font-bold bg-orange-600 text-white text-xs tabular-nums">{currentPage}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} disabled={currentPage === totalPages} className="p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-l border-slate-200 dark:border-slate-700">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                <span className="text-xs font-medium">Total <span className="text-slate-800 dark:text-slate-100 font-bold tabular-nums">{filteredItems.length}</span> Records</span>
            </div>

            {/* Add/Edit Modal */}
            {(showModal === 'add' || showModal === 'edit') && (
                <Modal
                    open
                    onClose={() => { setShowModal(null); setEditItem(null); }}
                    title={editItem ? 'Edit Role' : 'Add Role'}
                    size="md"
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex items-center gap-3">
                                <label className="w-28 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Role Code<span className="text-red-500">*</span>:</label>
                                <input type="text" value={formData.role_code} onChange={e => setFormData({ ...formData, role_code: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm" placeholder="e.g. ROLE001" required />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="w-28 text-right text-slate-grey dark:text-slate-400 text-sm font-medium">Role Name<span className="text-red-500">*</span>:</label>
                                <input type="text" value={formData.role_name} onChange={e => setFormData({ ...formData, role_name: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm" placeholder="e.g. Manager" required />
                            </div>
                            <div className="flex items-start gap-3">
                                <label className="w-28 text-right text-slate-grey dark:text-slate-400 text-sm font-medium pt-2">Description:</label>
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="flex-1 input-base py-2 text-sm resize-none" rows={3} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50 dark:border-slate-700">
                                <Button variant="secondary" onClick={() => { setShowModal(null); setEditItem(null); }}>
                                    Cancel
                                </Button>
                                <Button variant="primary" type="submit">
                                    Confirm
                                </Button>
                            </div>
                        </form>
                </Modal>
            )}
            </div>
        </div>
    );
}
