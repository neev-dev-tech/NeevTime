import React, { useEffect, useState } from 'react';
import api from '../api';
import Modal from './Modal';
import { Plus, Trash2, Edit, RefreshCw } from 'lucide-react';
import { useToast } from './Toast';
import Button from './ui/Button';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from './TableControls';
import ListPage, { ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from './ui/ListPage';

export default function GenericCrud({ title, endpoint, columns }) {
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

    const pager = useTableControls(items, {
        searchKeys: columns.map(c => c.key),
        pageSize: 50
    });

    const [submitting, setSubmitting] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return; // guard against a double-click creating two records
        setSubmitting(true);
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
        } catch (err) {
            toast.error(err.response?.data?.error || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
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
        <>
        <ListPage
            title={title}
            count={items.length}
            actions={
                <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => setShowModal(true)}>
                    Add {title}
                </Button>
            }
            toolbar={
                <>
                    <ListSearch label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} value={pager.query} onChange={pager.setQuery} />
                    {pager.isFiltered && (
                        <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                            {pager.matched} of {pager.total}
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchItems} />
                    </div>
                </>
            }
            footer={<TablePager controls={pager} noun="record" />}
        >
                <table className="w-full text-left text-sm">
                    <thead className={LIST_THEAD}>
                        <tr>
                            <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>ID</th>
                            {columns.map(col => <th key={col.key} className={LIST_TH}>{col.label}</th>)}
                            <th className={`${LIST_TH} ${LIST_EDGE_LAST} !text-right`}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pager.view.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-grey dark:text-slate-400 text-sm font-medium`}>#{item.id}</td>
                                {columns.map(col => (
                                    <td key={col.key} className="px-4 py-3 text-slate-grey dark:text-slate-400 text-sm">
                                        {item[col.key] || '-'}
                                    </td>
                                ))}
                                <td className={`pl-4 ${LIST_EDGE_LAST} py-3 text-right`}>
                                    <div className="flex justify-end gap-2">
                                        <button type="button" aria-label="Edit" title="Edit" onClick={() => handleEdit(item)} className="text-saffron hover:bg-slate-50 dark:hover:bg-slate-900/30 p-2 rounded-full transition-colors"><Edit size={18} /></button>
                                        <button type="button" aria-label="Delete" title="Delete" onClick={() => confirmDelete(item.id)} className="text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-full transition-colors"><Trash2 size={18} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
        </ListPage>

            {/* Edit/Add Modal */}
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={`${editingId ? 'Edit' : 'Add'} ${title}`}
                size="sm"
            >
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
                            {/* Inside the form, so Enter still submits. Modal's
                                footer slot renders outside it. */}
                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="secondary" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</Button>
                                <Button type="submit" variant="primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
                            </div>
                        </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                open={Boolean(deleteId)}
                onClose={() => setDeleteId(null)}
                title={`Delete ${title}?`}
                size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
                    <Button variant="dangerSolid" onClick={handleDelete}>Delete</Button>
                </>}
            >
                {/* No guard needed here, unlike the delete dialogs on Departments
                    and Positions: this body reads nothing off deleteId, so
                    building it while closed is harmless. */}
                <div className="text-center">
                    <div className="mx-auto w-12 h-12 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                        <Trash2 className="text-red-500" size={24} />
                    </div>
                    <p className="text-slate-grey dark:text-slate-400 text-sm">
                        Are you sure you want to delete this {title.toLowerCase()}? This action cannot be undone.
                    </p>
                </div>
            </Modal>
        </>
    );
}
