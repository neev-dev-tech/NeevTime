import React, { useEffect, useState } from 'react';
import { TrendingUp, Building } from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import api from '../api';
import { PageHeader, ExportMenu } from '../components';

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

    useEffect(() => {
        const [y, m] = month.split('-');
        api.get(`/api/reports/department-monthly?year=${y}&month=${m}`)
            .then(r => setDepartments(r.data.data))
            .catch(e => setError(e.response?.data?.error || 'Could not load the department summary'));
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

    return (
        <div className="space-y-5">
            <PageHeader
                title="Insights"
                subtitle="Department totals and six-month trends, from the same figures payroll uses"
                icon={TrendingUp}
            />

            {error && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                    Late and overtime, last six months
                </h3>
                {!trends ? (
                    <div className="h-56 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                ) : trends.length < 2 ? (
                    /* One month of history draws a dot, not a trend. Say so
                       instead of rendering a chart that looks broken. */
                    <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
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
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Building size={14} /> Department summary
                    </h3>
                    <div className="flex items-center gap-2">
                        <input type="month" className="field w-auto" value={month}
                               onChange={e => setMonth(e.target.value)} />
                        <ExportMenu rows={departments || []} columns={columns}
                                    filename={`departments-${month}`} title={`Department summary ${month}`} />
                    </div>
                </div>
                {!departments ? (
                    <div className="p-4"><div className="h-32 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">
                                <tr>{columns.map(c => (
                                    <th key={c.key} className={`px-4 py-3 ${c.key === 'department' ? '' : 'text-right'}`}>{c.label}</th>
                                ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {departments.map(row => (
                                    <tr key={row.department}>
                                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{row.department}</td>
                                        {columns.slice(1).map(c => (
                                            <td key={c.key} className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{row[c.key]}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
