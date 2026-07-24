import React, { useEffect, useState } from 'react';
import api from '../api';
import { Plus, Trash2, Edit } from 'lucide-react';
import { useToast } from './Toast';
import Button from './ui/Button';

export default function GenericCrud({ title, endpoint, columns, icon: Icon }) {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({});
    const [editingId, setEditingId] = useState(null);

    const fetchItems = async () => {
        try {
            const res = await api.get(endpoint);
            setItems(res.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchItems(); }, [endpoint]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`${endpoint}/${editingId}`, formData);
            } else {
                await api.post(endpoint, formData);
            }
            setShowModal(false);
            setFormData({});
            setEditingId(null);
            fetchItems();
        } catch (err) { toast.error('Operation failed'); }
    };

    const handleEdit = (item) => {
        setFormData(item);
        setEditingId(item.id);
        setShowModal(true);
    };

    // Delete Confirmation State
    const [deleteId, setDeleteId] = useState(null);

    const confirmDelete = (id) => {
        setDeleteId(id);
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`${endpoint}/${deleteId}`);
            setDeleteId(null);
            fetchItems();
        } catch (err) { toast.error('Delete failed: ' + (err.response?.data?.error || err.message)); }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-charcoal dark:text-slate-100 flex items-center gap-2">
                    {Icon && <Icon className="text-saffron" />} {title}
                </h2>
                <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>
                    Add {title}
                </Button>
            </div>

            <div className="card-base overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-orange-50/50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-800">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-charcoal dark:text-slate-100 text-sm">ID</th>
                            {columns.map(col => <th key={col.key} className="px-6 py-4 font-semibold text-charcoal dark:text-slate-100 capitalize text-sm">{col.label}</th>)}
                            <th className="px-6 py-4 font-semibold text-charcoal dark:text-slate-100 text-right text-sm">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {items.map((item) => (
                            <tr key={item.id} className="hover:bg-cream-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 text-slate-grey dark:text-slate-400 text-sm font-medium">#{item.id}</td>
                                {columns.map(col => (
                                    <td key={col.key} className="px-6 py-4 text-slate-grey dark:text-slate-400 text-sm">
                                        {item[col.key] || '-'}
                                    </td>
                                ))}
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    <button onClick={() => handleEdit(item)} className="text-saffron hover:bg-orange-50 dark:hover:bg-orange-900/30 p-2 rounded-full transition-colors"><Edit size={18} /></button>
                                    <button onClick={() => confirmDelete(item.id)} className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-full transition-colors"><Trash2 size={18} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit/Add Modal */}
            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-white/50 dark:border-slate-700" style={{ borderRadius: '16px' }}>
                        <h3 className="text-lg font-bold mb-4 text-charcoal dark:text-slate-100">{editingId ? 'Edit' : 'Add'} {title}</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {columns.map(col => (
                                <div key={col.key}>
                                    <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1 capitalize">{col.label}</label>
                                    <input
                                        type="text"
                                        value={formData[col.key] || ''}
                                        onChange={e => setFormData({ ...formData, [col.key]: e.target.value })}
                                        className="input-base"
                                        required
                                    />
                                </div>
                            ))}
                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteId && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center border border-white/50 dark:border-slate-700" style={{ borderRadius: '16px' }}>
                        <div className="mx-auto w-12 h-12 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="text-red-500" size={24} />
                        </div>
                        <h3 className="text-lg font-bold mb-2 text-charcoal dark:text-slate-100">Delete {title}?</h3>
                        <p className="text-slate-grey dark:text-slate-400 text-sm mb-6">Are you sure you want to delete this {title.toLowerCase()}? This action cannot be undone.</p>
                        <div className="flex justify-center gap-3">
                            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
                            <Button variant="dangerSolid" onClick={handleDelete}>Delete</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
