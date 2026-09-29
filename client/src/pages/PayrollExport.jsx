import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, RefreshCw, Download, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../api';
import { useToast, Button, ListPage, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { confirm } from '../components/ConfirmDialog';
import { toLocalDateString } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

/**
 * Attendance in the shape payroll reads, for whichever payroll the client runs.
 *
 * There is no API that reaches every payroll product — the desktop ones have
 * none, and the cloud ones want a partner agreement. Every one of them imports a
 * file, so this previews the numbers and downloads them in the columns that
 * payroll expects. Templates come from the server, which is where they are
 * defined, so a template added there appears here without a release.
 *
 * The uncollected-days warning is the important part of this screen. A day when
 * no reader in the building reported is not a day anybody failed to attend, and
 * paying someone less for it is a deduction nobody chose. It is shown before the
 * download, not after.
 */

const lastCompleteMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toLocalDateString(first), to: toLocalDateString(last) };
};

const COLUMNS = [
    { key: 'employee_code', label: 'Code', mono: true },
    { key: 'employee_name', label: 'Name' },
    { key: 'payable_days', label: 'Payable', num: true },
    { key: 'present_days', label: 'Present', num: true },
    { key: 'lop_days', label: 'Loss of pay', num: true, emphasis: 'bad' },
    { key: 'paid_leave_days', label: 'Paid leave', num: true },
    { key: 'holiday_days', label: 'Holiday', num: true },
    { key: 'weekly_off_days', label: 'Weekly off', num: true },
    { key: 'uncollected_days', label: 'No data', num: true, emphasis: 'warn' },
    { key: 'overtime_hours', label: 'OT hrs', num: true }
];

export default function PayrollExport() {
    const toast = useToast();
    const [range, setRange] = useState(lastCompleteMonth);
    const [templates, setTemplates] = useState([]);
    const [template, setTemplate] = useState('generic');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Open items that would change these numbers if resolved after export.
    const [readiness, setReadiness] = useState(null);

    useEffect(() => {
        api.get('/api/reports/payroll-templates')
            .then(res => setTemplates(res.data || []))
            .catch(() => setTemplates([]));
    }, []);

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/reports/payroll-export', {
                params: { from: range.from, to: range.to }
            });
            setData(res.data);
            api.get('/api/reports/payroll-readiness', { params: { from: range.from, to: range.to } })
                .then(r => setReadiness(r.data))
                .catch(() => setReadiness(null));
        } catch (err) {
            setError(err.response?.data?.error || 'Could not build the payroll summary');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [range.from, range.to]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    const openItems = readiness
        ? readiness.pending_leave + readiness.pending_regularizations + readiness.missed_punches
        : 0;

    const download = async () => {
        if (openItems > 0) {
            const ok = await confirm({
                title: 'Export with open items?',
                message: `${openItems} item(s) in this period still need a decision. Numbers exported now may change once they are resolved.`,
                confirmText: 'Export anyway',
                type: 'warning'
            });
            if (!ok) return;
        }
        try {
            const res = await api.get('/api/reports/payroll-export', {
                params: { from: range.from, to: range.to, template, format: 'csv' },
                responseType: 'blob'
            });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `payroll_${template}_${range.from}_to_${range.to}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Payroll file downloaded');
        } catch (err) {
            toast.error('Download failed: ' + (err.response?.data?.error || err.message));
        }
    };

    const selected = templates.find(t => t.key === template);
    const totalUncollected = data?.rows?.reduce((s, r) => s + (r.uncollected_days || 0), 0) || 0;
    // Column sums for the figures strip and the table's Total row. Summed over
    // every row in the period, not just the page on screen.
    const totals = Object.fromEntries(COLUMNS.filter(c => c.num).map(c => [
        c.key, (data?.rows || []).reduce((n, r) => n + (Number(r[c.key]) || 0), 0)
    ]));
    const fmt = (v) => (Number.isInteger(v) ? v : Math.round(v * 10) / 10).toLocaleString();

    // Display only; the downloaded file is built server-side from the full period.
    const pager = useTableControls(data?.rows || [], {
        searchKeys: ['employee_code', 'employee_name'],
        pageSize: 50
    });

    return (
        <>
        <ListPage
            title="Payroll Export"
            count={data?.rows ? data.rows.length : undefined}
            actions={
                <Button variant="primary" size="toolbar" icon={Download} disabled={!data || loading} onClick={download}>
                    Download CSV
                </Button>
            }
            toolbar={
                <>
                    <ListSearch label="Search payroll rows" placeholder="Search by name or code…" value={pager.query} onChange={pager.setQuery} />
                    <label htmlFor="pay-from" className="text-xs text-slate-600 dark:text-slate-400">From</label>
                    <input id="pay-from" type="date" className="field-sm !h-8 !py-0 w-auto" value={range.from}
                           onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
                    <label htmlFor="pay-to" className="text-xs text-slate-600 dark:text-slate-400">to</label>
                    <input id="pay-to" type="date" className="field-sm !h-8 !py-0 w-auto" value={range.to}
                           onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
                    <label htmlFor="pay-template" className="text-xs text-slate-600 dark:text-slate-400">Format</label>
                    <select id="pay-template" className="field-sm !h-8 !py-0 w-auto min-w-[12rem]" value={template} onChange={e => setTemplate(e.target.value)}>
                        {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                    </select>
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchSummary} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            footer={!loading && !error && data?.rows?.length > 0 ? <TablePager controls={pager} noun="employee" /> : null}
        >
            {/* Period totals: the figures payroll will import, at a glance. */}
            {data?.rows?.length > 0 && !loading && (
                <div className="grid grid-cols-3 lg:grid-cols-6 border-b border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800">
                    {[
                        ['Employees', data.rows.length],
                        ['Payable days', totals.payable_days],
                        ['Loss of pay', totals.lop_days, totals.lop_days > 0 && 'text-rose-700 dark:text-rose-400'],
                        ['Paid leave', totals.paid_leave_days],
                        ['Overtime hrs', totals.overtime_hours],
                        ['No data days', totals.uncollected_days, totals.uncollected_days > 0 && 'text-amber-700 dark:text-amber-400']
                    ].map(([label, value, tone]) => (
                        <div key={label} className="px-4 sm:px-6 py-3">
                            <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                            <span className={`block mt-0.5 text-2xl font-semibold tabular-nums ${tone || 'text-slate-900 dark:text-slate-50'}`}>{fmt(value)}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Readiness and data-gap notes as slim strips, not boxes. */}
            {readiness && (
                openItems === 0 ? (
                    <div className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-950/30 text-[13px] text-emerald-800 dark:text-emerald-300">
                        <CheckCircle size={15} className="shrink-0" /> Ready to export — nothing pending for this period.
                    </div>
                ) : (
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 sm:px-6 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-[13px] text-amber-900 dark:text-amber-200">
                        <span className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={15} className="shrink-0" />{openItems} item{openItems === 1 ? '' : 's'} still need a decision:</span>
                        {[
                            { n: readiness.pending_leave, label: 'leave requests', to: '/leaves?status=Pending' },
                            { n: readiness.pending_regularizations, label: 'regularizations', to: '/regularizations' },
                            { n: readiness.missed_punches, label: 'days with IN but no OUT', to: '/attendance/manual' }
                        ].filter(i => i.n > 0).map(i => (
                            <Link key={i.label} to={i.to} className="underline underline-offset-2 hover:no-underline">{i.n} {i.label}</Link>
                        ))}
                    </div>
                )
            )}
            {totalUncollected > 0 && (
                <details className="group px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-[13px] text-slate-700 dark:text-slate-300">
                    <summary className="cursor-pointer list-none flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0 text-slate-600 dark:text-slate-400" />
                        <span><strong className="font-semibold">{totalUncollected} employee-day{totalUncollected === 1 ? '' : 's'}</strong> have no attendance data and are counted as payable.</span>
                        <span className="text-xs underline underline-offset-2 text-slate-600 dark:text-slate-400">Why?</span>
                    </summary>
                    <p className="mt-1.5 pl-6 text-slate-600 dark:text-slate-400">
                        No reader reported on those days, so they are counted as payable and not as loss of pay. That is
                        deliberate — a reader outage is not an absence, and deducting for it takes money off someone who
                        came to work. Reconcile these before running payroll.
                    </p>
                </details>
            )}
            {selected && (
                <details className="px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 text-[13px] text-slate-700 dark:text-slate-300">
                    <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
                        What&apos;s in the <span className="font-medium text-slate-800 dark:text-slate-200">{selected.name}</span> file
                    </summary>
                    <p className="mt-1.5">{selected.description}</p>
                    <p className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">{selected.columns.join(' · ')}</p>
                </details>
            )}

                {loading ? (
                    <div className="px-4 sm:px-6 py-5 space-y-2" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not build the summary</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchSummary}>Try again</Button>
                    </div>
                ) : !data || data.rows.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Calculator size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing to export</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            No attendance for {range.from} to {range.to}.
                        </p>
                    </div>
                ) : (
                    <>
                        <table className="w-full text-sm border-collapse border-t border-slate-200 dark:border-slate-800">
                            <thead className={LIST_THEAD}>
                                <tr>
                                    {COLUMNS.map((c, i) => (
                                        <th key={c.key} className={`${LIST_TH} ${c.num ? '!text-right' : ''} ${i === 0 ? LIST_EDGE_FIRST : ''} ${i === COLUMNS.length - 1 ? LIST_EDGE_LAST : ''}`}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map(r => (
                                    <tr key={r.employee_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        {COLUMNS.map((c, i) => {
                                            const v = r[c.key];
                                            const emphasise =
                                                c.emphasis === 'bad' && v > 0 ? 'font-semibold text-rose-700 dark:text-rose-400' :
                                                c.emphasis === 'warn' && v > 0 ? 'font-semibold text-slate-700 dark:text-slate-400' :
                                                'text-slate-700 dark:text-slate-300';
                                            const pad = i === 0 ? `${LIST_EDGE_FIRST} pr-4` : i === COLUMNS.length - 1 ? `pl-4 ${LIST_EDGE_LAST}` : 'px-4';
                                            return (
                                                <td key={c.key}
                                                    className={`${pad} py-2 ${c.num ? 'text-right tabular-nums' : ''} ${c.mono ? 'font-mono text-xs' : ''} ${emphasise}`}>
                                                    {v === null || v === undefined || v === '' ? '—' : String(v)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                                <tr>
                                    {COLUMNS.map((c, i) => {
                                        const pad = i === 0 ? `${LIST_EDGE_FIRST} pr-4` : i === COLUMNS.length - 1 ? `pl-4 ${LIST_EDGE_LAST}` : 'px-4';
                                        return (
                                            <td key={c.key} className={`${pad} py-2.5 font-semibold text-slate-900 dark:text-slate-100 ${c.num ? 'text-right tabular-nums' : ''}`}>
                                                {i === 0 ? 'Total' : c.num ? fmt(totals[c.key]) : ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                        <p className="px-4 sm:px-6 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {data.rows.length} employee(s) · {range.from} to {range.to} · figures come from the same
                            computation as the muster roll, so the register and this file cannot disagree.
                        </p>
                    </>
                )}
        </ListPage>
        </>
    );
}
