import { useState, useEffect, useCallback } from 'react';
import { Calculator, RefreshCw, Download, AlertCircle, AlertTriangle } from 'lucide-react';
import api from '../api';
import { useToast, Button, PageHeader } from '../components';
import { toLocalDateString } from '../utils/dateFormat';

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
        } catch (err) {
            setError(err.response?.data?.error || 'Could not build the payroll summary');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [range.from, range.to]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    const download = async () => {
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

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Calculator}
                title="Payroll Export"
                subtitle="Attendance in the columns your payroll software imports"
                actions={
                    <>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchSummary}>Refresh</Button>
                        <Button variant="primary" icon={Download} disabled={!data || loading} onClick={download}>
                            Download CSV
                        </Button>
                    </>
                }
            />

            <div className="card-base">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="pay-from" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">From</label>
                        <input id="pay-from" type="date" className="field-sm" value={range.from}
                               onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
                    </div>
                    <div>
                        <label htmlFor="pay-to" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">To</label>
                        <input id="pay-to" type="date" className="field-sm" value={range.to}
                               onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
                    </div>
                    <div className="min-w-[16rem]">
                        <label htmlFor="pay-template" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Format</label>
                        <select id="pay-template" className="field-sm" value={template} onChange={e => setTemplate(e.target.value)}>
                            {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                        </select>
                    </div>
                </div>
                {selected && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {selected.description}
                        <span className="block mt-1 font-mono text-[11px]">{selected.columns.join(' · ')}</span>
                    </p>
                )}
            </div>

            {totalUncollected > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5 text-orange-600 dark:text-orange-400" />
                    <div className="text-sm">
                        <p className="font-semibold text-orange-800 dark:text-orange-300">
                            {totalUncollected} employee-day(s) in this period have no attendance data
                        </p>
                        <p className="mt-1 text-orange-700 dark:text-orange-400">
                            No reader reported on those days, so they are counted as payable and
                            <strong> not</strong> as loss of pay. That is deliberate — a reader outage is not
                            an absence, and deducting for it takes money off someone who came to work.
                            Reconcile these before running payroll.
                        </p>
                    </div>
                </div>
            )}

            <div className="card-base p-0 overflow-hidden">
                {loading ? (
                    <div className="p-5 space-y-2" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not build the summary</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchSummary}>Try again</Button>
                    </div>
                ) : !data || data.rows.length === 0 ? (
                    <div className="py-16 text-center">
                        <Calculator size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing to export</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            No attendance for {range.from} to {range.to}.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    {COLUMNS.map(c => (
                                        <th key={c.key} className={`px-4 py-2 font-bold ${c.num ? 'text-right' : 'text-left'}`}>
                                            {c.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.rows.map(r => (
                                    <tr key={r.employee_code} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                        {COLUMNS.map(c => {
                                            const v = r[c.key];
                                            const emphasise =
                                                c.emphasis === 'bad' && v > 0 ? 'font-semibold text-rose-700 dark:text-rose-400' :
                                                c.emphasis === 'warn' && v > 0 ? 'font-semibold text-orange-700 dark:text-orange-400' :
                                                'text-slate-700 dark:text-slate-300';
                                            return (
                                                <td key={c.key}
                                                    className={`px-4 py-2 ${c.num ? 'text-right tabular-nums' : ''} ${c.mono ? 'font-mono text-xs' : ''} ${emphasise}`}>
                                                    {v === null || v === undefined || v === '' ? '—' : String(v)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {data?.rows?.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {data.rows.length} employee(s) · {range.from} to {range.to} · figures come from the same
                    computation as the muster roll, so the register and this file cannot disagree.
                </p>
            )}
        </div>
    );
}
