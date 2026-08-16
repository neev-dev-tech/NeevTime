import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Download, AlertCircle, Info } from 'lucide-react';
import api from '../api';
import { useToast, Button, PageHeader } from '../components';
import { toLocalDateString } from '../utils/dateFormat';

/**
 * The registers a labour inspection asks for.
 *
 * Defaults to last complete month, because that is what these are produced for.
 * A register for a month still running is half a document.
 *
 * The muster roll is a grid — every worker down the side, every day across —
 * and at 31 columns it is wider than any viewport. It scrolls inside its own
 * container so the page body never moves sideways, and the name column is
 * sticky, because a row of marks with the name scrolled off is unreadable.
 */

const REGISTERS = [
    { key: 'muster-roll', label: 'Muster roll', hint: 'Daily attendance of every worker' },
    { key: 'overtime', label: 'Overtime', hint: 'Days with overtime recorded' },
    { key: 'leave', label: 'Leave', hint: 'Approved leave in the period' }
];

/**
 * Each mark carries a letter as well as a colour. Colour alone excludes anyone
 * who cannot distinguish these hues, and this is a document people are asked to
 * read carefully.
 */
const MARK_STYLE = {
    P: { label: 'Present', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    A: { label: 'Absent', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
    L: { label: 'Leave', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
    H: { label: 'Holiday', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    W: { label: 'Weekly off', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400' },
    '?': { label: 'No data — readers not reporting', cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
    '–': { label: 'Not employed', cls: 'bg-transparent text-slate-300 dark:text-slate-600' }
};

const lastCompleteMonth = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toLocalDateString(first), to: toLocalDateString(last) };
};

export default function StatutoryRegisters() {
    const toast = useToast();
    const [type, setType] = useState('muster-roll');
    const [range, setRange] = useState(lastCompleteMonth);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchRegister = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/api/reports/registers/${type}`, {
                params: { from: range.from, to: range.to }
            });
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not build the register');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [type, range.from, range.to]);

    useEffect(() => { fetchRegister(); }, [fetchRegister]);

    const downloadCsv = () => {
        if (!data) return;
        let rows;
        if (type === 'muster-roll') {
            rows = [
                ['Employee code', 'Name', 'Designation', 'Department', 'Joined', ...data.days,
                 'Present', 'Absent', 'Leave', 'Holiday', 'Weekly off', 'No data'],
                ...data.rows.map(r => [
                    r.employee_code, r.name || '', r.designation || '', r.department_name || '',
                    r.date_of_joining || '', ...r.marks,
                    r.totals.present, r.totals.absent, r.totals.leave,
                    r.totals.holiday, r.totals.weekly_off, r.totals.no_data
                ])
            ];
        } else {
            const keys = data.rows.length ? Object.keys(data.rows[0]) : [];
            rows = [keys, ...data.rows.map(r => keys.map(k => r[k] ?? ''))];
        }
        const csv = rows.map(r => r.map(cell => {
            const s = String(cell ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')).join('\r\n');

        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}_${range.from}_to_${range.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Register downloaded');
    };

    const dayLabel = (iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return { num: d.getDate(), dow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()] };
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={FileText}
                title="Statutory Registers"
                subtitle="The muster roll, overtime and leave registers a labour inspection asks for"
                actions={
                    <>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRegister}>Refresh</Button>
                        <Button variant="primary" icon={Download} disabled={!data || loading} onClick={downloadCsv}>
                            Download CSV
                        </Button>
                    </>
                }
            />

            <div className="card-base">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="reg-type" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Register</label>
                        <select id="reg-type" className="field-sm" value={type} onChange={e => setType(e.target.value)}>
                            {REGISTERS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="reg-from" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">From</label>
                        <input id="reg-from" type="date" className="field-sm" value={range.from}
                               onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
                    </div>
                    <div>
                        <label htmlFor="reg-to" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">To</label>
                        <input id="reg-to" type="date" className="field-sm" value={range.to}
                               onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 ml-auto max-w-sm">
                        {REGISTERS.find(r => r.key === type)?.hint}
                    </p>
                </div>
            </div>

            {data?.missingFields?.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                    <Info size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm">
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                            Not held by this system — fill in by hand
                        </p>
                        <ul className="mt-1 text-amber-700 dark:text-amber-400 list-disc pl-5">
                            {data.missingFields.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                        <p className="mt-2 text-amber-700 dark:text-amber-400">
                            Form numbers and column layouts are set by your state&rsquo;s Factories Rules.
                            This is the register&rsquo;s content, not a certified form.
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
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not build the register</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRegister}>Try again</Button>
                    </div>
                ) : !data || data.rows.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing to show</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            No records for {range.from} to {range.to}.
                        </p>
                    </div>
                ) : type === 'muster-roll' ? (
                    <>
                        <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700">
                            {Object.entries(MARK_STYLE).map(([mark, s]) => (
                                <span key={mark} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-bold ${s.cls}`}>{mark}</span>
                                    {s.label}
                                </span>
                            ))}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                                        <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-left text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 min-w-[13rem]">
                                            Worker
                                        </th>
                                        {data.days.map(d => {
                                            const { num, dow } = dayLabel(d);
                                            return (
                                                <th key={d} className="px-1 py-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 w-8">
                                                    <span className="block tabular-nums">{num}</span>
                                                    <span className="block text-[9px] text-slate-400 dark:text-slate-500">{dow}</span>
                                                </th>
                                            );
                                        })}
                                        <th className="px-3 py-2 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">P</th>
                                        <th className="px-3 py-2 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">A</th>
                                        <th className="px-3 py-2 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">L</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {data.rows.map(r => (
                                        <tr key={r.employee_code} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                            <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 px-4 py-2 min-w-[13rem] border-r border-slate-100 dark:border-slate-700">
                                                <span className="block font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name || '—'}</span>
                                                <span className="block text-xs text-slate-500 dark:text-slate-400 font-mono">
                                                    {r.employee_code}{r.designation ? ` · ${r.designation}` : ''}
                                                </span>
                                            </td>
                                            {r.marks.map((m, i) => (
                                                <td key={i} className="px-1 py-1 text-center">
                                                    <span
                                                        className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${MARK_STYLE[m]?.cls || ''}`}
                                                        title={`${data.days[i]} — ${MARK_STYLE[m]?.label || m}`}
                                                    >
                                                        {m}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{r.totals.present}</td>
                                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-rose-700 dark:text-rose-400">{r.totals.absent}</td>
                                            <td className="px-3 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{r.totals.leave}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    {Object.keys(data.rows[0]).map(k => (
                                        <th key={k} className="px-4 py-2 text-left font-bold">{k.replace(/_/g, ' ')}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.rows.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                                        {Object.keys(data.rows[0]).map(k => (
                                            <td key={k} className="px-4 py-2 text-slate-700 dark:text-slate-300 tabular-nums">
                                                {row[k] === null || row[k] === undefined || row[k] === '' ? '—' : String(row[k])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {data?.retention_years && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {data.register} · keep for {data.retention_years} years · {data.rows.length} row(s)
                    {data.notes?.length ? ` · ${data.notes[0]}` : ''}
                </p>
            )}
        </div>
    );
}
