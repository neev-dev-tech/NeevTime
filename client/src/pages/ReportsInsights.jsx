import { useEffect, useMemo, useState } from 'react';
import { Building, AlertCircle } from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import api from '../api';
import { ExportMenu, ListPage, ListSearch, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

/**
 * The two questions HR asks monthly that had no screen:
 * "which department worked what", and "is lateness or overtime creeping".
 *
 * Both read attendance_daily_summary — the figures people are paid on — so
 * neither can disagree with the register. The cross-tab was previously made by
 * exporting the register and pivoting in Excel by hand, every month.
 */
export default function ReportsInsights() {
    const now = new Date();
    const [month, setMonth] = useState(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const [departments, setDepartments] = useState(null);
    const [trends, setTrends] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const [y, m] = month.split('-');
        setLoading(true);
        setError('');
        api.get(`/api/reports/department-monthly?year=${y}&month=${m}`)
            .then(r => setDepartments(r.data.data))
            .catch(e => setError(e.response?.data?.error || 'Could not load the department summary'))
            .finally(() => setLoading(false));
    }, [month]);

    useEffect(() => {
        api.get('/api/reports/trends?months=6')
            .then(r => setTrends(r.data.data.map(row => ({
                ...row,
                late_hours: Math.round(Number(row.late_minutes) / 6) / 10,
                overtime_hours: Number(row.overtime_hours),
            }))))
            .catch(() => setTrends([]));
    }, []);

    const columns = [
        { key: 'department', label: 'Department' },
        { key: 'employees', label: 'Employees' },
        { key: 'days_present', label: 'Days present' },
        { key: 'hours_worked', label: 'Hours' },
        { key: 'overtime_minutes', label: 'OT (min)' },
        { key: 'late_minutes', label: 'Late (min)' },
        { key: 'days_absent', label: 'Days absent' },
    ];

    const pager = useTableControls(departments || [], {
        searchKeys: ['department'],
        pageSize: 50
    });

    // Month totals across every department, for the key-figure strip.
    const totals = useMemo(() => {
        if (!departments) return null;
        const sum = (k) => departments.reduce((n, r) => n + (Number(r[k]) || 0), 0);
        return {
            employees: sum('employees'),
            days_present: sum('days_present'),
            hours_worked: sum('hours_worked'),
            overtime_minutes: sum('overtime_minutes'),
            late_minutes: sum('late_minutes'),
            days_absent: sum('days_absent')
        };
    }, [departments]);

    const fmt = (n, digits = 0) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
    const figures = [
        { label: 'Employees', value: totals ? fmt(totals.employees) : '–', hint: 'counted in attendance' },
        { label: 'Days present', value: totals ? fmt(totals.days_present) : '–', hint: 'across all departments' },
        { label: 'Hours worked', value: totals ? fmt(totals.hours_worked, 1) : '–', hint: 'total for the month' },
        { label: 'Overtime', value: totals ? `${fmt(totals.overtime_minutes / 60, 1)}h` : '–', hint: totals ? `${fmt(totals.overtime_minutes)} min` : '' },
        { label: 'Late', value: totals ? `${fmt(totals.late_minutes / 60, 1)}h` : '–', hint: totals ? `${fmt(totals.late_minutes)} min` : '' },
        { label: 'Days absent', value: totals ? fmt(totals.days_absent) : '–', hint: 'across all departments' }
    ];

    const hasTable = !loading && departments && departments.length > 0;

    return (
        <ListPage
            title="Insights"
            actions={
                <ExportMenu rows={departments || []} columns={columns}
                            filename={`departments-${month}`} title={`Department summary ${month}`} />
            }
            toolbar={
                <>
                    <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-400">
                        Month
                        <input type="month" aria-label="Month" className="field-sm !h-8 !py-0 !w-auto tabular-nums" value={month}
                               onChange={e => setMonth(e.target.value)} />
                    </label>
                    {hasTable && (
                        <ListSearch label="Search departments" placeholder="Search departments…"
                                    value={pager.query} onChange={pager.setQuery} />
                    )}
                    <span className="ml-auto hidden md:block text-xs text-slate-600 dark:text-slate-400">
                        From the same daily figures payroll uses
                    </span>
                </>
            }
            footer={hasTable && pager.matched > 0 ? <TablePager controls={pager} noun="department" /> : null}
        >
            {error && (
                <div role="alert" className="mx-4 sm:mx-6 mt-4 flex items-center gap-3 p-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                    <AlertCircle size={16} className="shrink-0" />
                    <span className="flex-1 min-w-0">{error}</span>
                </div>
            )}

            {/* Band 1: the month in figures */}
            <section aria-label="Month totals" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-slate-200 dark:border-slate-800 divide-x divide-y lg:divide-y-0 divide-slate-200 dark:divide-slate-800">
                {figures.map(k => (
                    <div key={k.label} className="px-4 sm:px-6 py-4">
                        <span className="block text-xs text-slate-600 dark:text-slate-400">{k.label}</span>
                        <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{loading ? '–' : k.value}</span>
                        <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{k.hint || ' '}</span>
                    </div>
                ))}
            </section>

            {/* Band 2: six-month trend */}
            <section className="px-4 sm:px-6 py-5 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                    Late and overtime, last six months
                </h2>
                {!trends ? (
                    <div className="h-56 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ) : trends.length < 2 ? (
                    /* One month of history draws a dot, not a trend. Say so
                       instead of rendering a chart that looks broken. */
                    <p className="text-sm text-slate-600 dark:text-slate-400 py-8 text-center">
                        Trends need at least two months of attendance history — this installation
                        has {trends.length}. The chart appears as months accumulate.
                    </p>
                ) : (
                    <div className="h-64">
                        <ResponsiveContainer>
                            <LineChart data={trends} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                                <XAxis dataKey="month" fontSize={12} />
                                <YAxis fontSize={12} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="late_hours" name="Late (hours)"
                                      stroke="#DC2626" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="overtime_hours" name="Overtime (hours)"
                                      stroke="#2563EB" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="days_absent" name="Days absent"
                                      stroke="#D97706" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </section>

            {/* Band 3: department summary */}
            <section>
                <div className="px-4 sm:px-6 pt-5 pb-3 flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Department summary</h2>
                    <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{month}</span>
                    {hasTable && pager.isFiltered && (
                        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">· {pager.matched} of {pager.total}</span>
                    )}
                </div>
                {loading ? (
                    <div className="px-4 sm:px-6 pb-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                ) : !departments ? (
                    <div className="py-16 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load the department summary</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'Try another month or reload the page.'}</p>
                    </div>
                ) : departments.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <Building size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No department figures for this month</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Department totals appear here once attendance for the month has been processed. Try another month.
                        </p>
                    </div>
                ) : pager.matched === 0 ? (
                    <div className="py-16 text-center px-6">
                        <Building size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No matching departments</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Nothing matches the current search. Clear it to see every department.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-700">
                                <tr>{columns.map((c, i) => (
                                    <th key={c.key} className={`${LIST_TH} ${c.key === 'department' ? LIST_EDGE_FIRST : '!text-right'} ${i === columns.length - 1 ? LIST_EDGE_LAST : ''}`}>{c.label}</th>
                                ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map(row => (
                                    <tr key={row.department} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className={`${LIST_EDGE_FIRST} pr-4 py-2.5 font-medium text-slate-800 dark:text-slate-100`}>{row.department}</td>
                                        {columns.slice(1).map((c, i, rest) => (
                                            <td key={c.key} className={`px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300 ${i === rest.length - 1 ? LIST_EDGE_LAST : ''}`}>{row[c.key]}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </ListPage>
    );
}
