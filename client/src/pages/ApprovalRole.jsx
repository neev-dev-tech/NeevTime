import React, { useEffect, useState } from 'react';
import api from '../api';
import Modal from '../components/Modal';
import {
    Shield, Plus, Trash2, Edit, ChevronLeft, ChevronRight,
    RefreshCw, AlertCircle
} from 'lucide-react';
import { useToast, Button, ListPage, ListSearch, ListSelection, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { confirm } from '../components/ConfirmDialog';

export default function ApprovalRole() {
    const toast = useToast();
    // True when the member list could not be loaded for the role being edited.
    // Saving must then leave members alone: sending the empty list would
    // delete every member the role actually has.
    const [membersUnknown, setMembersUnknown] = useState(false);
    const [roles, setRoles] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(null); // 'add' | 'edit' | 'assign'
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({ role_code: '', role_name: '', description: '' });
    // A role IS its members; a role with none approves nothing. The employee
    // list is already loaded above for other selects; only the chosen ids are
    // new state, loaded when an edit opens and saved with the form.
    const [memberIds, setMemberIds] = useState([]);
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
                if (!membersUnknown) {
                    await api.put(`/api/approval/roles/${editItem.id}/members`, { employee_ids: memberIds });
                }
            } else {
                const created = await api.post('/api/approval/roles', formData);
                if (created.data?.id) await api.put(`/api/approval/roles/${created.data.id}/members`, { employee_ids: memberIds });
            }
            setFormData({ role_code: '', role_name: '', description: '' });
            setShowModal(null);
            setEditItem(null);
            fetchRoles();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save role');
        }
    };

    const handleEdit = (role) => {
        setEditItem(role);
        setMemberIds([]);
        setMembersUnknown(false);
        api.get(`/api/approval/roles/${role.id}/members`)
            .then(r => setMemberIds(r.data.map(m => m.employee_id)))
            .catch((err) => {
                setMembersUnknown(true);
                toast.error(`Could not load this role's members (${err.response?.data?.error || err.message}). Saving will keep the existing members unchanged.`);
            });
        setFormData({
            role_code: role.role_code || '',
            role_name: role.role_name || role.name || '',
            description: role.description || ''
        });
        setShowModal('edit');
    };

    const handleDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this role?' }))) return;
        try {
            await api.delete(`/api/approval/roles/${id}`);
            fetchRoles();
        } catch (err) {
            toast.error('Failed to delete');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return toast.warning('Select roles to delete');
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: `Delete ${selectedIds.length} roles?` }))) return;
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
        <>
        <ListPage
            title="Approval Roles"
            count={roles.length}
            actions={
                <Button mutating
                    variant="primary"
                    size="toolbar"
                    icon={Plus}
                    onClick={() => { setShowModal('add'); setFormData({ role_code: '', role_name: '', description: '' }); setEditItem(null); }}
                >
                    Add Role
                </Button>
            }
            toolbarActive={selectedIds.length > 0}
            toolbar={
                <>
                    <ListSearch label="Search roles" placeholder="Search roles..." value={searchQuery} onChange={setSearchQuery} />
                    <ListSelection count={selectedIds.length} onClear={() => setSelectedIds([])} />
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <Button variant="danger" size="toolbar" icon={Trash2} onClick={handleBulkDelete}>
                            Delete
                        </Button>
                        <ListIconButton
                            label="Refresh"
                            icon={RefreshCw}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchRoles();
                            }}
                            disabled={loading}
                            spin={loading}
                        />
                    </div>
                </>
            }
            footer={
                <div className="px-4 sm:px-6 py-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-3">
                        <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))} className="field-sm font-semibold">
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <div className="flex items-center bg-app-surface border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <button type="button" aria-label="Previous page" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-r border-slate-200 dark:border-slate-700">
                                <ChevronLeft size={16} />
                            </button>
                            <span className="px-3 py-1 font-bold bg-slate-600 text-white text-xs tabular-nums">{currentPage}</span>
                            <button type="button" aria-label="Next page" onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} disabled={currentPage === totalPages} className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors border-l border-slate-200 dark:border-slate-700">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                    <span className="text-xs font-medium">Total <span className="text-slate-800 dark:text-slate-100 font-bold tabular-nums">{filteredItems.length}</span> Records</span>
                </div>
            }
        >
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 px-6 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load roles</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRoles}>Try again</Button>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <Shield size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchQuery ? 'No matching roles' : 'No approval roles yet'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {searchQuery
                                ? 'No role matches that search.'
                                : 'Add a role to describe who can approve requests.'}
                        </p>
                    </div>
                ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead className={LIST_THEAD}>
                        <tr>
                            <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>
                                <input
                                    type="checkbox"
                                    className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                    checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className={LIST_TH}>Role Code</th>
                            <th className={LIST_TH}>Role Name</th>
                            <th className={LIST_TH}>Description</th>
                            <th className={LIST_TH}>Total Employees</th>
                            <th className={`${LIST_TH} ${LIST_EDGE_LAST} w-24 !text-right`}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedItems.map(role => (
                            <tr key={role.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                                <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-600 text-saffron focus:ring-saffron"
                                        checked={selectedIds.includes(role.id)}
                                        onChange={() => toggleSelect(role.id)}
                                    />
                                </td>
                                <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">{role.role_code || role.id || '—'}</td>
                                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{role.role_name || role.name || '—'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{role.description || '—'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 tabular-nums">{role.employee_count || 0}</td>
                                <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
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
        </ListPage>

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
                                <label className="text-slate-grey dark:text-slate-400 text-sm font-medium">Members</label>
                                <select multiple size={6} className="input-base"
                                        value={memberIds.map(String)}
                                        onChange={e => setMemberIds([...e.target.selectedOptions].map(o => Number(o.value)))}>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.employee_code} — {emp.name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-500">Hold Ctrl/Cmd to pick several. These people approve wherever a flow step names this role.</p>
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
        </>
    );
}
