import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Check, RefreshCw, Users, Shield, Loader2 } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu } from '../components';

const ROLES = ['admin', 'hr', 'user'];

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'user', email: '' });
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/users');
            setUsers(res.data);
        } catch (err) {
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
            setFormData({ username: '', password: '', role: 'user', email: '' });
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
        setFormData({ username: '', password: '', role: 'user', email: '' });
        setError('');
        setShowModal(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            </div>
        );
    }

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
                        <Button variant="primary" icon={Plus} onClick={openNewModal}>
                            Add User
                        </Button>
                    </>
                )}
            />

            {/* Users Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Username</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
                            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 text-sm text-gray-600">{user.id}</td>
                                <td className="px-6 py-4">
                                    <span className="font-medium text-gray-900">{user.username}</span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{user.email || '-'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                                            ? 'bg-red-100 text-red-700'
                                            : user.role === 'hr'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-gray-100 text-gray-700'
                                        }`}>
                                        <Shield size={12} />
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user)}
                                            className="p-1.5 hover:bg-red-100 rounded text-red-600"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    No users found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">
                                {editUser ? 'Edit User' : 'Add New User'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-4 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password {editUser ? '(leave blank to keep current)' : '*'}
                                </label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                    {...(!editUser && { required: true })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                >
                                    {ROLES.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-2 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                                >
                                    <Check size={16} />
                                    {editUser ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' :
                        toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    }`}>
                    <span className="flex-1 pr-3">{toast.message}</span>
                    <button 
                        onClick={() => {
                            if (toastTimeoutRef.current) {
                                clearTimeout(toastTimeoutRef.current);
                                toastTimeoutRef.current = null;
                            }
                            setToast(null);
                        }} 
                        className="text-white hover:text-gray-200 focus:outline-none font-bold text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
