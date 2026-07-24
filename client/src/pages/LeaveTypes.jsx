import React, { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';

const DEFAULT_FORM = { code: '', name: '', annual_quota: 12, carry_forward: false, color: '#3b82f6' };

export default function LeaveTypes() {
    const toast = useToast();
    const [types, setTypes] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);

    const fetchTypes = async () => {
        try {
            const res = await api.get('/api/leave-types');
            setTypes(res.data || []);
        } catch (err) {
            toast.error('Failed to load leave types');
        }
    };

    useEffect(() => { fetchTypes(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/leave-types', form);
            setShowModal(false);
            setForm(DEFAULT_FORM);
            toast.success('Leave type added');
            fetchTypes();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save leave type');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this leave type?')) return;
        try {
            await api.delete(`/api/leave-types/${id}`);
            toast.success('Deleted');
            fetchTypes();
        } catch (err) {
            toast.error('Delete failed');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={FileText}
                title="Leave Types"
                subtitle="Define leave categories and annual quotas"
                actions={<Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>Add Leave Type</Button>}
            />

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-3">Code</th>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Annual Quota</th>
                            <th className="px-6 py-3">Carry Forward</th>
                            <th className="px-6 py-3">Color</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {types.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400">No leave types defined</td></tr>
                        ) : types.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50">
                                <td className="px-6 py-3 font-mono font-bold text-slate-700">{t.code}</td>
                                <td className="px-6 py-3 font-medium text-slate-800">{t.name}</td>
                                <td className="px-6 py-3">{t.annual_quota}</td>
                                <td className="px-6 py-3">{t.carry_forward ? 'Yes' : 'No'}</td>
                                <td className="px-6 py-3">
                                    <span className="inline-block w-5 h-5 rounded-full border" style={{ backgroundColor: t.color }} />
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <Button variant="danger" size="sm" icon={Trash2} aria-label="Delete leave type" onClick={() => handleDelete(t.id)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Add Leave Type</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowModal(false)} />
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex gap-3">
                                <div className="w-24">
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Code</label>
                                    <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-base" placeholder="CL" required />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
                                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-base" placeholder="Casual Leave" required />
                                </div>
                            </div>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Annual Quota (days)</label>
                                    <input type="number" min="0" value={form.annual_quota} onChange={e => setForm(f => ({ ...f, annual_quota: parseInt(e.target.value) || 0 }))} className="input-base" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Color</label>
                                    <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-14 border rounded-lg cursor-pointer" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input type="checkbox" checked={form.carry_forward} onChange={e => setForm(f => ({ ...f, carry_forward: e.target.checked }))} />
                                Unused days carry forward to next year
                            </label>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
