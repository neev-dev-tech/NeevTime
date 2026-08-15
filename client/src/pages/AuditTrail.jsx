import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import api from '../api';
import { Button, PageHeader } from '../components';
import Modal from '../components/Modal';

/**
 * Who changed what, and what it said before.
 *
 * The audit table has existed since the first schema and was never written to,
 * so this is the first time any of it has been readable. The question it exists
 * to answer is narrow and specific — in a payroll dispute, who edited this
 * punch — so the default view is newest-first and the filters are the ones
 * somebody actually arrives with: a person, a table, a date.
 *
 * Paging is server-side. The table only grows, and a page that tries to render
 * a year of changes is a page nobody opens twice.
 */

const ACTION_STYLE = {
    INSERT: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    UPDATE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    DELETE: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
};

const PAGE = 50;

/** The fields that actually differ, so a wide row does not hide a one-word change. */
const diffOf = (before, after) => {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const out = [];
    for (const k of [...keys].sort()) {
        const a = before ? before[k] : undefined;
        const b = after ? after[k] : undefined;
        if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, from: a, to: b });
    }
    return out;
};

const show = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    if (v === '') return '(empty)';
    return String(v);
};

export default function AuditTrail() {
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [tables, setTables] = useState([]);
    const [filters, setFilters] = useState({ table: '', action: '', from: '', to: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [detail, setDetail] = useState(null);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
            for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
            const res = await api.get(`/api/audit?${params}`);
            setEntries(res.data.entries || []);
            setTotal(res.data.total || 0);
            setError(null);
        } catch (err) {
            setError(err.response?.status === 403
                ? 'The audit trail is available to administrators only.'
                : (err.response?.data?.error || 'Could not load the audit trail'));
        } finally {
            setLoading(false);
        }
    }, [offset, filters]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    useEffect(() => {
        api.get('/api/audit/tables').then(r => setTables(r.data || [])).catch(() => setTables([]));
    }, []);

    const setFilter = (k, v) => { setOffset(0); setFilters(f => ({ ...f, [k]: v })); };

    const page = Math.floor(offset / PAGE) + 1;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const when = (v) => new Date(v).toLocaleString();

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Shield}
                title="Audit Trail"
                subtitle="Every change to attendance, employees, users and settings — who made it, and what it said before."
                actions={<Button variant="secondary" icon={RefreshCw} onClick={fetchEntries}>Refresh</Button>}
            />

            <div className="card-base p-0 overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                    <select className="field-sm w-auto" value={filters.table}
                            onChange={e => setFilter('table', e.target.value)} aria-label="Filter by record type">
                        <option value="">All records</option>
                        {tables.map(t => (
                            <option key={t.table_name} value={t.table_name}>
                                {t.table_name.replace(/_/g, ' ')} ({t.entries})
                            </option>
                        ))}
                    </select>

                    <select className="field-sm w-auto" value={filters.action}
                            onChange={e => setFilter('action', e.target.value)} aria-label="Filter by change type">
                        <option value="">Any change</option>
                        <option value="INSERT">Created</option>
                        <option value="UPDATE">Edited</option>
                        <option value="DELETE">Deleted</option>
                    </select>

                    <label className="text-xs text-slate-500 dark:text-slate-400">From</label>
                    <input type="date" className="field-sm w-auto" value={filters.from}
                           onChange={e => setFilter('from', e.target.value)} aria-label="From date" />
                    <label className="text-xs text-slate-500 dark:text-slate-400">to</label>
                    <input type="date" className="field-sm w-auto" value={filters.to}
                           onChange={e => setFilter('to', e.target.value)} aria-label="To date" />

                    {(filters.table || filters.action || filters.from || filters.to) && (
                        <button
                            type="button"
                            onClick={() => { setOffset(0); setFilters({ table: '', action: '', from: '', to: '' }); }}
                            className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400"
                        >
                            Clear
                        </button>
                    )}

                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {total.toLocaleString()} entr{total === 1 ? 'y' : 'ies'}
                    </span>
                </div>

                {loading ? (
                    <div className="p-5 space-y-2" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load the audit trail</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchEntries}>Try again</Button>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="py-16 text-center">
                        <Shield size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing recorded yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Changes to attendance, employees, users and settings appear here as they happen.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        <th className="px-5 py-3 font-bold">When</th>
                                        <th className="px-5 py-3 font-bold">Who</th>
                                        <th className="px-5 py-3 font-bold">Change</th>
                                        <th className="px-5 py-3 font-bold">Record</th>
                                        <th className="px-5 py-3 font-bold">What changed</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {entries.map(e => {
                                        const changes = diffOf(e.old_data, e.new_data);
                                        return (
                                            <tr key={e.id}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                                                onClick={() => setDetail(e)}>
                                                <td className="px-5 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                                                    {when(e.created_at)}
                                                </td>
                                                <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">
                                                    {/* A change nobody triggered is a device or a scheduled job,
                                                        not an unknown person. Saying so avoids implying a gap. */}
                                                    {e.username || <span className="text-slate-400 dark:text-slate-500">System</span>}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${ACTION_STYLE[e.action] || ''}`}>
                                                        {e.action === 'INSERT' ? 'CREATED' : e.action === 'UPDATE' ? 'EDITED' : 'DELETED'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                    {e.table_name.replace(/_/g, ' ')}
                                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-xs ml-1.5">#{e.record_id ?? '—'}</span>
                                                </td>
                                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                                    {changes.length === 0
                                                        ? <span className="text-slate-400">—</span>
                                                        : changes.slice(0, 3).map(c => c.field.replace(/_/g, ' ')).join(', ')
                                                          + (changes.length > 3 ? ` +${changes.length - 3} more` : '')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-700">
                            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                {offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
                            </span>
                            {pages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button type="button" aria-label="Previous page"
                                            onClick={() => setOffset(o => Math.max(0, o - PAGE))}
                                            disabled={offset === 0}
                                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <ChevronLeft size={15} />
                                    </button>
                                    <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums px-2">{page} / {pages}</span>
                                    <button type="button" aria-label="Next page"
                                            onClick={() => setOffset(o => o + PAGE)}
                                            disabled={page >= pages}
                                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* The guard stays: the body reads detail.table_name, and Modal builds
                its children even when closed. */}
            {detail && (
                <Modal
                    open
                    onClose={() => setDetail(null)}
                    title={`${detail.table_name.replace(/_/g, ' ')} #${detail.record_id ?? '—'}`}
                    description={`${detail.username || 'System'} · ${when(detail.created_at)}`}
                    size="lg"
                >
                    {(() => {
                        const changes = diffOf(detail.old_data, detail.new_data);
                        if (changes.length === 0) {
                            return <p className="text-sm text-slate-500 dark:text-slate-400">No field-level differences recorded.</p>;
                        }
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                        <tr>
                                            <th className="py-2 pr-4 text-left font-bold">Field</th>
                                            <th className="py-2 pr-4 text-left font-bold">Before</th>
                                            <th className="py-2 text-left font-bold">After</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {changes.map(c => (
                                            <tr key={c.field}>
                                                <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                    {c.field.replace(/_/g, ' ')}
                                                </td>
                                                <td className="py-2 pr-4 text-rose-700 dark:text-rose-300 font-mono text-xs break-all">
                                                    {show(c.from)}
                                                </td>
                                                <td className="py-2 text-emerald-700 dark:text-emerald-300 font-mono text-xs break-all">
                                                    {show(c.to)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </Modal>
            )}
        </div>
    );
}
