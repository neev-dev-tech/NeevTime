import React, { useEffect, useState } from 'react';
import { PieChart, RefreshCw, PlayCircle } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu, useToast } from '../components';

export default function LeaveBalances() {
    const toast = useToast();
    const [balances, setBalances] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(false);
    const [initializing, setInitializing] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [balRes, empRes] = await Promise.all([
                api.get('/api/leave-balances', { params: { year } }),
                api.get('/api/employees')
            ]);
            setBalances(balRes.data || []);
            setEmployees(empRes.data || []);
        } catch (err) {
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
                        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="text-sm border dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-900 dark:text-slate-100">
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

            <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="px-6 py-3">Employee</th>
                            <th className="px-6 py-3">Leave Type</th>
                            <th className="px-6 py-3">Opening</th>
                            <th className="px-6 py-3">Used</th>
                            <th className="px-6 py-3">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                        {balances.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                                    {loading ? 'Loading...' : 'No balances for this year — use "Initialize Year" to create them from leave-type quotas.'}
                                </td>
                            </tr>
                        ) : balances.map(b => (
                            <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-3">
                                    <span className="font-medium text-slate-800 dark:text-slate-100">{b.employee_name}</span>
                                    <span className="text-xs text-slate-400 font-mono ml-2">{b.employee_code}</span>
                                </td>
                                <td className="px-6 py-3">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color || '#94a3b8' }} />
                                        {b.leave_type_name}
                                    </span>
                                </td>
                                <td className="px-6 py-3">{b.opening_balance}</td>
                                <td className="px-6 py-3 text-amber-600 font-medium">{b.used ?? 0}</td>
                                <td className="px-6 py-3 font-bold text-emerald-600">{b.balance}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
