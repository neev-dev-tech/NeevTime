import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Download, AlertCircle, Info } from 'lucide-react';
import api from '../api';
import { useToast, Button, ListPage, ListTabs, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { toLocalDateString } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

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
// Plain coloured letters, not boxed chips: a month of 31 boxes per worker was
// a wall of grey; letters let the few exceptions (A, ?) stand out.
const MARK_STYLE = {
    P: { label: 'Present', cls: 'text-emerald-700 dark:text-emerald-400 font-semibold' },
    A: { label: 'Absent', cls: 'text-rose-700 dark:text-rose-400 font-bold' },
    L: { label: 'Leave', cls: 'text-sky-700 dark:text-sky-400 font-semibold' },
    H: { label: 'Holiday', cls: 'text-amber-700 dark:text-amber-400 font-semibold' },
    W: { label: 'Weekly off', cls: 'text-slate-500 dark:text-slate-400' },
    '?': { label: 'No data — readers not reporting', cls: 'text-slate-500 dark:text-slate-400' },
    '–': { label: 'Not employed', cls: 'text-slate-400 dark:text-slate-500' }
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

    const isWeekend = (iso) => { const g = new Date(`${iso}T00:00:00`).getDay(); return g === 0 || g === 6; };

    const dayLabel = (iso) => {
        const d = new Date(`${iso}T00:00:00`);
        return { num: d.getDate(), dow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()] };
    };

    // Display only; the downloaded register still carries every row.
    const pager = useTableControls(data?.rows || [], {
        searchKeys: ['name', 'employee_name', 'employee_code', 'designation', 'department'],
        pageSize: 50
    });

    const hasRows = !loading && !error && data?.rows?.length > 0;

    return (
        <>
        <ListPage
            title="Statutory Registers"
            count={data?.rows ? data.rows.length : undefined}
            tabs={
                <ListTabs
                    label="Register"
                    value={type}
                    onChange={setType}
                    items={REGISTERS.map(r => ({ key: r.key, label: r.label }))}
                />
            }
            actions={
                <Button variant="primary" size="toolbar" icon={Download} disabled={!data || loading} onClick={downloadCsv}>
                    Download CSV
                </Button>
            }
            toolbar={
                <>
                    <ListSearch label="Search register" placeholder="Search by name or code…" value={pager.query} onChange={pager.setQuery} />
                    <label htmlFor="reg-from" className="text-xs text-slate-600 dark:text-slate-400">From</label>
                    <input id="reg-from" type="date" className="field-sm !h-8 !py-0 w-auto" value={range.from}
                           onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
                    <label htmlFor="reg-to" className="text-xs text-slate-600 dark:text-slate-400">to</label>
                    <input id="reg-to" type="date" className="field-sm !h-8 !py-0 w-auto" value={range.to}
                           onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
                    <div className="ml-auto flex items-center gap-3">
                        <p className="hidden md:block text-xs text-slate-600 dark:text-slate-400 max-w-sm">
                            {REGISTERS.find(r => r.key === type)?.hint}
                        </p>
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchRegister} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            footer={hasRows ? <TablePager controls={pager} noun={type === 'muster-roll' ? 'worker' : 'row'} /> : null}
        >
            {data?.missingFields?.length > 0 && (
                <details className="px-4 sm:px-6 py-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-[13px] text-amber-900 dark:text-amber-200">
                    <summary className="cursor-pointer list-none flex items-center gap-2">
                        <Info size={15} className="shrink-0" />
                        <span><strong className="font-semibold">Fill in by hand:</strong> {data.missingFields.join('; ')}</span>
                        <span className="text-xs underline underline-offset-2">Why?</span>
                    </summary>
                    <p className="mt-1.5 pl-6">
                        This system doesn&rsquo;t hold those fields. Form numbers and column layouts are set by your
                        state&rsquo;s Factories Rules; this is the register&rsquo;s content, not a certified form.
                    </p>
                </details>
            )}

            {/* Period totals for the muster roll. */}
            {hasRows && type === 'muster-roll' && (() => {
                const sum = (k) => data.rows.reduce((n, r) => n + (Number(r.totals?.[k]) || 0), 0);
                const noData = data.rows.reduce((n, r) => n + r.marks.filter(m => m === '?').length, 0);
                return (
                    <div className="grid grid-cols-5 border-b border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800">
                        {[['Workers', data.rows.length], ['Present days', sum('present')], ['Absent days', sum('absent'), sum('absent') > 0 && 'text-rose-700 dark:text-rose-400'],
                          ['Leave days', sum('leave')], ['No data days', noData, noData > 0 && 'text-amber-700 dark:text-amber-400']].map(([label, v, tone]) => (
                            <div key={label} className="px-4 sm:px-6 py-3">
                                <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                <span className={`block mt-0.5 text-2xl font-semibold tabular-nums ${tone || 'text-slate-900 dark:text-slate-50'}`}>{v.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                );
            })()}

                {loading ? (
                    <div className="px-4 sm:px-6 py-5 space-y-2" aria-busy="true">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not build the register</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRegister}>Try again</Button>
                    </div>
                ) : !data || data.rows.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <FileText size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Nothing to show</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            No records for {range.from} to {range.to}.
                        </p>
                    </div>
                ) : type === 'muster-roll' ? (
                    <>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800">
                            {Object.entries(MARK_STYLE).map(([mark, s]) => (
                                <span key={mark} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                    <span className={`w-3 text-center ${s.cls}`}>{mark}</span>{s.label}
                                </span>
                            ))}
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800" aria-hidden="true" />Weekend
                            </span>
                        </div>
                        {/* Scrolls in ListPage's body on both axes, so the header
                            stays pinned and the worker column stays sticky. */}
                            <table className="text-sm border-collapse">
                                <thead className={LIST_THEAD}>
                                    <tr>
                                        <th className={`sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 ${LIST_TH} ${LIST_EDGE_FIRST} min-w-[13rem]`}>
                                            Worker
                                        </th>
                                        {data.days.map(d => {
                                            const { num, dow } = dayLabel(d);
                                            return (
                                                <th key={d} className={`px-1 py-2 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-400 w-8 ${isWeekend(d) ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                                                    <span className="block tabular-nums">{num}</span>
                                                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{dow}</span>
                                                </th>
                                            );
                                        })}
                                        <th className={`${LIST_TH} !px-3 !text-center`}>P</th>
                                        <th className={`${LIST_TH} !px-3 !text-center`}>A</th>
                                        <th className={`${LIST_TH} !pl-3 !text-center ${LIST_EDGE_LAST}`}>L</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {pager.view.map(r => (
                                        <tr key={r.employee_code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className={`sticky left-0 z-[1] bg-app-surface ${LIST_EDGE_FIRST} pr-4 py-2 min-w-[13rem] border-r border-slate-100 dark:border-slate-800`}>
                                                <span className="block font-semibold text-slate-800 dark:text-slate-100 truncate">{r.name || '—'}</span>
                                                <span className="block text-xs text-slate-600 dark:text-slate-400 font-mono">
                                                    {r.employee_code}{r.designation ? ` · ${r.designation}` : ''}
                                                </span>
                                            </td>
                                            {r.marks.map((m, i) => (
                                                <td key={i} className={`px-1 py-1 text-center ${isWeekend(data.days[i]) ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
                                                    <span
                                                        className={`inline-flex items-center justify-center w-6 h-6 text-[13px] ${MARK_STYLE[m]?.cls || ''}`}
                                                        title={`${data.days[i]} — ${MARK_STYLE[m]?.label || m}`}
                                                    >
                                                        {m}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{r.totals.present}</td>
                                            <td className="px-3 py-2 text-center tabular-nums font-semibold text-rose-700 dark:text-rose-400">{r.totals.absent}</td>
                                            <td className={`pl-3 ${LIST_EDGE_LAST} py-2 text-center tabular-nums text-slate-600 dark:text-slate-300`}>{r.totals.leave}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                    </>
                ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead className={LIST_THEAD}>
                                <tr>
                                    {Object.keys(data.rows[0]).map((k, i, keys) => (
                                        <th key={k} className={`${LIST_TH} ${i === 0 ? LIST_EDGE_FIRST : ''} ${i === keys.length - 1 ? LIST_EDGE_LAST : ''}`}>{k.replace(/_/g, ' ')}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        {Object.keys(data.rows[0]).map((k, j, keys) => (
                                            <td key={k} className={`${j === 0 ? `${LIST_EDGE_FIRST} pr-4` : j === keys.length - 1 ? `pl-4 ${LIST_EDGE_LAST}` : 'px-4'} py-2 text-slate-700 dark:text-slate-300 tabular-nums`}>
                                                {row[k] === null || row[k] === undefined || row[k] === '' ? '—' : String(row[k])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                )}

            {data?.retention_years && (
                <p className="px-4 sm:px-6 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {data.register} · keep for {data.retention_years} years · {data.rows.length} row(s)
                    {data.notes?.length ? ` · ${data.notes[0]}` : ''}
                </p>
            )}
        </ListPage>
        </>
    );
}
