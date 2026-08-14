import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Check, RefreshCw, Users, Shield, AlertCircle } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu } from '../components';

// Tiers enforced by server/utils/rbac.js. 'user' is retired — legacy accounts
// still holding it are treated as hr — so it is not offered for new accounts.
const ROLES = ['admin', 'hr', 'viewer'];
const ROLE_HELP = {
    admin: 'Full access, including settings, database, integrations and user management.',
    hr: 'Personnel, attendance, leave and devices. Cannot change settings, database or users.',
    viewer: 'Read-only. Can see every page but cannot change anything.'
};

const BADGE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';
const ROLE_TINTS = {
    admin: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    hr: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
};
const ROLE_FALLBACK = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

const CELL_MONO = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const CELL_SOFT = 'text-slate-600 dark:text-slate-300';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const initialOf = (name) => (String(name || '').trim().charAt(0) || '?').toUpperCase();

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'viewer', email: '' });
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState(null);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/users');
            setUsers(res.data);
            setLoadError(null);
        } catch (err) {
            setLoadError(err.response?.data?.error || 'Failed to load users');
            showToast(err.response?.data?.error || 'Failed to load users', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            if (editUser) {
                // Update existing user
                const payload = { ...formData };
                if (!payload.password) delete payload.password; // Don't update password if empty
                await api.put(`/api/users/${editUser.id}`, payload);
                showToast('User updated successfully', 'success');
            } else {
                // Create new user
                if (!formData.password) {
                    setError('Password is required');
                    return;
                }
                await api.post('/api/users', formData);
                showToast('User created successfully', 'success');
            }
            setShowModal(false);
            setEditUser(null);
            setFormData({ username: '', password: '', role: 'viewer', email: '' });
            fetchUsers();
        } catch (err) {
            setError(err.response?.data?.error || 'Operation failed');
        }
    };

    const handleEdit = (user) => {
        setEditUser(user);
        setFormData({
            username: user.username,
            password: '',
            role: user.role,
            email: user.email || ''
        });
        setError('');
        setShowModal(true);
    };

    const handleDelete = async (user) => {
        if (!confirm(`Delete user "${user.username}"?`)) return;

        try {
            await api.delete(`/api/users/${user.id}`);
            showToast('User deleted', 'success');
            fetchUsers();
        } catch (err) {
            showToast(err.response?.data?.error || 'Delete failed', 'error');
        }
    };

    const toastTimeoutRef = React.useRef(null);
    const showToast = (message, type = 'info') => {
        // Clear any existing timeout
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ message, type });
        // Show toast for 8 seconds for better visibility
        toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
            toastTimeoutRef.current = null;
        }, 8000);
    };

    const openNewModal = () => {
        setEditUser(null);
        setFormData({ username: '', password: '', role: 'viewer', email: '' });
        setError('');
        setShowModal(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Users}
                title="User Management"
                subtitle="Manage system users and their roles"
                actions={(
                    <>
                        <ExportMenu
                            rows={users}
                            columns={[
                                { key: 'username', label: 'Username' },
                                { key: 'role', label: 'Role' },
                                { key: 'email', label: 'Email' }
                            ]}
                            filename="users"
                            title="Users"
                        />
                        <Button
                            variant="secondary"
                            icon={RefreshCw}
                            type="button"
                            aria-label="Refresh"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchUsers();
                            }}
                        />
                        <Button variant="successSolid" icon={Plus} onClick={openNewModal}>
                            Add User
                        </Button>
                    </>
                )}
            />

            {/* Users Table */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : loadError ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load users</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{loadError}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchUsers}>Try again</Button>
                    </div>
                ) : users.length === 0 ? (
                    <div className="py-16 text-center">
                        <Users size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No users yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add a user to give someone access to the system.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">ID</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Username</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Email</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Role</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Created</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {users.map((user, idx) => (
                                    <tr key={user.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3">
                                            <span className={CELL_MONO}>{dash(user.id)}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span
                                                    aria-hidden="true"
                                                    className="w-8 h-8 shrink-0 rounded-full grid place-items-center font-bold text-xs bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70"
                                                >
                                                    {initialOf(user.username)}
                                                </span>
                                                <span className={`${CELL_STRONG} truncate`}>{dash(user.username)}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={CELL_SOFT}>{dash(user.email)}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`${BADGE} ${ROLE_TINTS[user.role] || ROLE_FALLBACK}`}>
                                                <Shield size={11} />
                                                {dash(user.role)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={CELL_SOFT}>
                                                {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <div className="dv-quiet">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={Edit2}
                                                        aria-label="Edit"
                                                        onClick={() => handleEdit(user)}
                                                    />
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        icon={Trash2}
                                                        aria-label="Delete"
                                                        onClick={() => handleDelete(user)}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !loadError && users.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {users.length} user{users.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-xl border border-white/50 dark:border-slate-700">
                        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                {editUser ? 'Edit User' : 'Add New User'}
                            </h2>
                            <Button variant="ghost" size="sm" icon={X} iconSize={20} aria-label="Close" onClick={() => setShowModal(false)} />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username *</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="field"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Password {editUser ? '(leave blank to keep current)' : '*'}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="field"
                                    {...(!editUser && { required: true })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="field"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="field"
                                >
                                    {ROLES.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    {ROLE_HELP[formData.role]}
                                </p>
                            </div>

                            <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    icon={Check}
                                    className="flex-1"
                                >
                                    {editUser ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-xl shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 dark:bg-emerald-500' :
                    toast.type === 'error' ? 'bg-rose-600 dark:bg-rose-500' : 'bg-blue-600 dark:bg-blue-500'
                    }`}>
                    <span className="flex-1 pr-3 text-sm font-medium">{toast.message}</span>
                    <button
                        onClick={() => {
                            if (toastTimeoutRef.current) {
                                clearTimeout(toastTimeoutRef.current);
                                toastTimeoutRef.current = null;
                            }
                            setToast(null);
                        }}
                        className="text-white hover:text-slate-200 dark:hover:text-slate-100 focus:outline-none font-bold text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
