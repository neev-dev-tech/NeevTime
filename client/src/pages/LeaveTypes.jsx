import React, { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, X, AlertCircle, RefreshCw, Edit2 } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';
import { TableToolbar, SortableTh, TablePager } from '../components/TableControls';
import useTableControls from '../hooks/useTableControls';
import Modal from '../components/Modal';

const DEFAULT_FORM = { code: '', name: '', annual_quota: 12, carry_forward: false, max_carry_forward: 0, is_paid: true, encashable: false, color: '#3b82f6' };
const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

export default function LeaveTypes() {
    const toast = useToast();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [editingId, setEditingId] = useState(null);

    const openEdit = (t) => {
        setEditingId(t.id);
        setForm({
            code: t.code || '', name: t.name || '',
            annual_quota: t.annual_quota ?? 0,
            carry_forward: !!t.carry_forward,
            max_carry_forward: t.max_carry_forward ?? 0,
            is_paid: t.is_paid !== false,
            encashable: !!t.encashable,
            color: t.color || '#3b82f6',
        });
        setShowModal(true);
    };

    const fetchTypes = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/leave-types');
            setTypes(res.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load leave types');
            toast.error('Failed to load leave types');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTypes(); }, []);

    // Nine types today, but the list is sorted and searchable for the same
    // reason the others are: a screen that behaves differently from its
    // neighbours is the thing being fixed, not the row count.
    const controls = useTableControls(types, {
        searchKeys: ['code', 'name'],
        initialSort: { key: 'name', dir: 'asc' },
        pageSize: 25
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) await api.put(`/api/leave-types/${editingId}`, form);
            else await api.post('/api/leave-types', form);
            setShowModal(false);
            setForm(DEFAULT_FORM);
            setEditingId(null);
            toast.success(editingId ? 'Leave type updated' : 'Leave type added');
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
            // The 409 names the balances and applications in the way and says
            // to deactivate instead — the message is the fix.
            toast.error(err.response?.data?.error || 'Delete failed');
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

            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load leave types</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchTypes}>Try again</Button>
                    </div>
                ) : types.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No leave types defined</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add a leave type to set the annual quota employees can draw from.
                        </p>
                    </div>
                ) : (
                    <>
                    <TableToolbar controls={controls} placeholder="Search leave types…" />
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <SortableTh controls={controls} sortKey="code" className="whitespace-nowrap">Code</SortableTh>
                                    <SortableTh controls={controls} sortKey="name" className="whitespace-nowrap">Name</SortableTh>
                                    <SortableTh controls={controls} sortKey="annual_quota" className="whitespace-nowrap">Annual Quota</SortableTh>
                                    <SortableTh controls={controls} sortKey="carry_forward" className="whitespace-nowrap">Carry Forward</SortableTh>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Color</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {controls.view.map((t, idx) => (
                                    <tr key={t.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{(controls.page - 1) * controls.pageSize + idx + 1}</td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {t.code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {t.name || '—'}
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                                            {t.annual_quota ?? '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`${BADGE_BASE} ${t.carry_forward
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                                {t.carry_forward ? `Yes, max ${t.max_carry_forward ?? 0}` : 'No'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-2">
                                                <span
                                                    className="inline-block w-4 h-4 rounded-full ring-1 ring-black/5 dark:ring-white/10"
                                                    style={{ backgroundColor: t.color || 'transparent' }}
                                                />
                                                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                                    {t.color || '—'}
                                                </span>
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <Button variant="secondary" size="sm" icon={Edit2} aria-label="Edit leave type" onClick={() => openEdit(t)} />
                                                <div className="dv-quiet ml-1">
                                                    <Button variant="danger" size="sm" icon={Trash2} aria-label="Delete leave type" onClick={() => handleDelete(t.id)} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <TablePager controls={controls} noun="leave type" />
                    </>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={() => { setShowModal(false); setEditingId(null); setForm(DEFAULT_FORM); }}
                title={editingId ? "Edit Leave Type" : "Add Leave Type"}
                size="sm"
            >
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex gap-3">
                                <div className="w-24">
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Code</label>
                                    <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input-base font-mono dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" placeholder="CL" required />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
                                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-base dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" placeholder="Casual Leave" required />
                                </div>
                            </div>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Annual Quota (days)</label>
                                    <input type="number" min="0" value={form.annual_quota} onChange={e => setForm(f => ({ ...f, annual_quota: parseInt(e.target.value) || 0 }))} className="input-base tabular-nums dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" required />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Color</label>
                                    <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="field h-10 w-14 cursor-pointer" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={form.carry_forward} onChange={e => setForm(f => ({ ...f, carry_forward: e.target.checked }))} />
                                Unused days carry forward to next year
                            </label>
                            {form.carry_forward && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Maximum days carried</label>
                                    {/* Required with the box ticked: a cap of
                                        zero means year-end carries nothing
                                        while the screen says Yes. The server
                                        refuses that combination too. */}
                                    <input type="number" min="1" value={form.max_carry_forward}
                                           onChange={e => setForm(f => ({ ...f, max_carry_forward: parseInt(e.target.value) || 0 }))}
                                           className="input-base tabular-nums dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" required />
                                </div>
                            )}
                            <div className="flex gap-6">
                                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <input type="checkbox" checked={form.is_paid} onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))} />
                                    Paid leave
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <input type="checkbox" checked={form.encashable} onChange={e => setForm(f => ({ ...f, encashable: e.target.checked }))} />
                                    Encashable
                                </label>
                            </div>
                            {/* Kept inside the form so Enter still submits and
                                the buttons stay wired to it, rather than moved
                                into Modal's footer slot which sits outside. */}
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                                <Button type="submit" variant="primary">Save</Button>
                            </div>
                        </form>
            </Modal>
        </div>
    );
}
