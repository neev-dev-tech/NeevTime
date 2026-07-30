import React, { useEffect, useState } from 'react';
import { PieChart, RefreshCw, PlayCircle, AlertCircle } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu, useToast } from '../components';

export default function LeaveBalances() {
    const toast = useToast();
    const [balances, setBalances] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [initializing, setInitializing] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [balRes, empRes] = await Promise.all([
                api.get('/api/leave-balances', { params: { year } }),
                api.get('/api/employees')
            ]);
            setBalances(balRes.data || []);
            setEmployees(empRes.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load leave balances');
            toast.error('Failed to load balances');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [year]);

    // Create current-year balances from leave-type quotas for every active employee
    const initializeAll = async () => {
        if (!window.confirm(`Initialize ${new Date().getFullYear()} leave balances for all ${employees.length} employees? Existing balances are kept.`)) return;
        setInitializing(true);
        let ok = 0, fail = 0;
        for (const emp of employees) {
            try {
                await api.post('/api/leave-balances/init', { employee_code: emp.employee_code });
                ok++;
            } catch { fail++; }
        }
        setInitializing(false);
        toast[fail ? 'warning' : 'success'](`Initialized for ${ok} employees${fail ? `, ${fail} failed` : ''}`);
        fetchData();
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={PieChart}
                title="Leave Balances"
                subtitle="Per-employee leave entitlements and usage"
                actions={
                    <>
                        <select
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value))}
                            className="text-sm font-semibold tabular-nums rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 px-3 py-2 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500"
                        >
                            {[0, 1, 2].map(off => {
                                const y = new Date().getFullYear() - off;
                                return <option key={y} value={y}>{y}</option>;
                            })}
                        </select>
                        <ExportMenu
                            rows={balances}
                            columns={[
                                { key: 'employee_name', label: 'Employee' },
                                { key: 'employee_code', label: 'Code' },
                                { key: 'leave_type_name', label: 'Leave Type' },
                                { key: 'opening_balance', label: 'Opening' },
                                { key: 'used', label: 'Used' },
                                { key: 'balance', label: 'Balance' }
                            ]}
                            filename={`leave_balances_${year}`}
                            title="Leave Balances"
                        />
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData} disabled={loading}>Refresh</Button>
                        <Button variant="successSolid" icon={PlayCircle} onClick={initializeAll} disabled={initializing}>
                            {initializing ? 'Initializing...' : 'Initialize Year'}
                        </Button>
                    </>
                }
            />

            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load leave balances</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : balances.length === 0 ? (
                    <div className="py-16 text-center">
                        <PieChart size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No balances for {year}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Use “Initialize Year” to create them from leave-type quotas, or pick a different year.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Code</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Leave Type</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Opening</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Used</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {balances.map((b, idx) => (
                                    <tr key={b.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {b.employee_name || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {b.employee_code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
                                                    style={{ backgroundColor: b.color || '#94a3b8' }}
                                                />
                                                {b.leave_type_name || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                                            {b.opening_balance ?? '—'}
                                        </td>
                                        <td className="px-5 py-3 font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                                            {b.used ?? 0}
                                        </td>
                                        <td className="px-5 py-3 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {b.balance ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && balances.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {balances.length} record{balances.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>
        </div>
    );
}
