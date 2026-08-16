import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    Activity, RefreshCw, Filter, Download, User,
    Database, Users, ChevronDown, Monitor, AlertCircle
} from 'lucide-react';
import { Button, PageHeader } from '../components';
import { formatDate, toLocalDateString } from '../utils/dateFormat';

const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';
const CELL_MONO = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const CELL_SOFT = 'text-slate-600 dark:text-slate-300';
const FIELD = 'w-full text-sm rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

export default function SystemLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        action: '',
        entity_type: '',
        user_id: '',
        dateFrom: '',
        dateTo: ''
    });
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = {};
            if (filters.action) params.action = filters.action;
            if (filters.entity_type) params.entity_type = filters.entity_type;
            if (filters.user_id) params.user_id = filters.user_id;

            // In a real scenario, date filters would also be sent
            // if (filters.dateFrom) params.fromDate = filters.dateFrom;
            // if (filters.dateTo) params.toDate = filters.dateTo;

            const res = await api.get('/api/system-logs', { params });
            setLogs(res.data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching logs:', err);
            setError(err.response?.data?.error || 'Could not load system logs');
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    const getActionStyle = (action) => {
        const styles = {
            LOGIN: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            LOGOUT: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
            CREATE: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
            UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            EXPORT: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
            IMPORT: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
            SYNC: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
        };
        return styles[action] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    };

    const exportLogs = () => {
        const csv = [
            ['Time', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address'].join(','),
            ...logs.map(log => [
                new Date(log.created_at).toLocaleString(),
                log.username,
                log.action,
                log.entity_type,
                log.entity_id,
                log.ip_address
            ].join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system_logs_${toLocalDateString()}.csv`;
        a.click();
    };

    const uniqueActions = [...new Set(logs.map(l => l.action))];
    const uniqueEntities = [...new Set(logs.map(l => l.entity_type))];
    const uniqueUsers = [...new Set(logs.map(l => l.username))];

    const filteredLogs = logs.filter(log => {
        if (filters.action && log.action !== filters.action) return false;
        if (filters.entity_type && log.entity_type !== filters.entity_type) return false;
        if (filters.user_id && log.username !== filters.user_id) return false;
        if (filters.dateFrom) {
            const logDate = toLocalDateString(log.created_at);
            if (logDate < filters.dateFrom) return false;
        }
        if (filters.dateTo) {
            const logDate = toLocalDateString(log.created_at);
            if (logDate > filters.dateTo) return false;
        }
        return true;
    });

    const hasActiveFilters = Boolean(
        filters.action || filters.entity_type || filters.user_id || filters.dateFrom || filters.dateTo
    );

    const KPIS = [
        { label: 'Total Logs', value: filteredLogs.length, icon: Activity, tint: 'text-purple-600 dark:text-purple-400', ring: 'bg-purple-50 dark:bg-purple-900/30' },
        { label: 'Logins', value: filteredLogs.filter(l => l.action === 'LOGIN').length, icon: User, tint: 'text-emerald-600 dark:text-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-900/30' },
        { label: 'Data Changes', value: filteredLogs.filter(l => ['CREATE', 'UPDATE', 'DELETE'].includes(l.action)).length, icon: Database, tint: 'text-blue-600 dark:text-blue-400', ring: 'bg-blue-50 dark:bg-blue-900/30' },
        { label: 'Active Users', value: uniqueUsers.length, icon: Users, tint: 'text-amber-600 dark:text-amber-400', ring: 'bg-amber-50 dark:bg-amber-900/30' }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Activity}
                title="System Logs"
                subtitle="Audit trail of every action taken in the system"
                actions={(
                    <>
                        <Button
                            variant="secondary"
                            icon={Filter}
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters ? 'ring-2 ring-orange-400 ring-offset-1 dark:ring-offset-slate-900' : ''}
                        >
                            Filters
                            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </Button>
                        <Button variant="secondary" icon={Download} onClick={exportLogs}>
                            Export
                        </Button>
                        <Button variant="primary" onClick={fetchLogs}>
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </Button>
                    </>
                )}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {KPIS.map(kpi => {
                    const Icon = kpi.icon;
                    return (
                        <div
                            key={kpi.label}
                            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-4 shadow-sm flex items-center gap-3"
                        >
                            <div className={`w-10 h-10 shrink-0 rounded-xl grid place-items-center ${kpi.ring} ${kpi.tint}`}>
                                <Icon size={18} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                    {kpi.label}
                                </div>
                                <div className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{kpi.value}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="card-base !p-0 overflow-hidden">
                {/* Filter Panel */}
                {showFilters && (
                    <div className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 p-4 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1 block">Action</label>
                                <select
                                    className={FIELD}
                                    value={filters.action}
                                    onChange={e => setFilters({ ...filters, action: e.target.value })}
                                >
                                    <option value="">All Actions</option>
                                    {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1 block">Entity</label>
                                <select
                                    className={FIELD}
                                    value={filters.entity_type}
                                    onChange={e => setFilters({ ...filters, entity_type: e.target.value })}
                                >
                                    <option value="">All Entities</option>
                                    {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1 block">User</label>
                                <select
                                    className={FIELD}
                                    value={filters.user_id}
                                    onChange={e => setFilters({ ...filters, user_id: e.target.value })}
                                >
                                    <option value="">All Users</option>
                                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1 block">From Date</label>
                                <input
                                    type="date"
                                    className={FIELD}
                                    value={filters.dateFrom}
                                    onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1 block">To Date</label>
                                <input
                                    type="date"
                                    className={FIELD}
                                    value={filters.dateTo}
                                    onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load system logs</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchLogs}>Try again</Button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="py-16 text-center">
                        <Activity size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {hasActiveFilters ? 'No logs match these filters' : 'No system logs yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {hasActiveFilters
                                ? 'Widen the date range or clear a filter to see more activity.'
                                : 'Actions taken in the app will be recorded here.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Result</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Action</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Entity</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">User</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">IP Address</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredLogs.map((log, idx) => (
                                    <tr key={log.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                                                    <Monitor size={14} className="text-slate-500 dark:text-slate-400" />
                                                </div>
                                                <span className={CELL_SOFT}>Success</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`${BADGE} ${getActionStyle(log.action)}`}>
                                                {dash(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col">
                                                <span className={CELL_STRONG}>{dash(log.entity_type)}</span>
                                                {log.entity_id && (
                                                    <span className="font-mono text-[11px] tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                        ID: {log.entity_id}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span
                                                    aria-hidden="true"
                                                    className="w-8 h-8 shrink-0 rounded-full grid place-items-center font-bold text-xs bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70"
                                                >
                                                    {(String(log.username || '').trim().charAt(0) || '?').toUpperCase()}
                                                </span>
                                                <span className={`${CELL_STRONG} truncate`}>{dash(log.username)}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={CELL_MONO}>{dash(log.ip_address)}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col">
                                                <span className={CELL_STRONG}>
                                                    {formatDate(log.created_at)}
                                                </span>
                                                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                                                    {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && filteredLogs.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {filteredLogs.length} record{filteredLogs.length === 1 ? '' : 's'}
                        {filteredLogs.length !== logs.length && ` of ${logs.length}`}
                    </div>
                )}
            </div>
        </div>
    );
}
