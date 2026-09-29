import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    Activity, RefreshCw, Filter, Download, User,
    Database, Users, ChevronDown, Monitor, AlertCircle
} from 'lucide-react';
import { Button, ListPage, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { formatDate, toLocalDateString, formatDateTime, formatTime } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide';
const CELL_MONO = 'font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const CELL_SOFT = 'text-slate-600 dark:text-slate-300';

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
            CREATE: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
            UPDATE: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            DELETE: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            EXPORT: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
            IMPORT: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
            SYNC: 'bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
        };
        return styles[action] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    };

    const exportLogs = () => {
        const csv = [
            ['Time', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address'].join(','),
            ...logs.map(log => [
                formatDateTime(log.created_at),
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

    const pager = useTableControls(filteredLogs, {
        searchKeys: ['username', 'action', 'entity_type', 'entity_id', 'ip_address'],
        pageSize: 50
    });

    const hasActiveFilters = Boolean(
        filters.action || filters.entity_type || filters.user_id || filters.dateFrom || filters.dateTo
    );

    const KPIS = [
        { label: 'Total Logs', value: filteredLogs.length, icon: Activity, tint: 'text-slate-600 dark:text-slate-400', ring: 'bg-slate-50 dark:bg-slate-900/30' },
        { label: 'Logins', value: filteredLogs.filter(l => l.action === 'LOGIN').length, icon: User, tint: 'text-emerald-700 dark:text-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-900/30' },
        { label: 'Data Changes', value: filteredLogs.filter(l => ['CREATE', 'UPDATE', 'DELETE'].includes(l.action)).length, icon: Database, tint: 'text-slate-600 dark:text-slate-400', ring: 'bg-slate-50 dark:bg-slate-900/30' },
        { label: 'Active Users', value: uniqueUsers.length, icon: Users, tint: 'text-amber-700 dark:text-amber-400', ring: 'bg-amber-50 dark:bg-amber-900/30' }
    ];

    return (
        <>
        <ListPage
            title="System Logs"
            count={logs.length}
            actions={(
                <Button variant="tonal" size="toolbar" icon={Download} onClick={exportLogs}>
                    Export
                </Button>
            )}
            toolbar={(
                <>
                    <ListSearch label="Search system logs" placeholder="Search by user, action, entity or IP…" value={pager.query} onChange={pager.setQuery} />
                    <Button
                        variant="tonal"
                        size="toolbar"
                        icon={Filter}
                        aria-expanded={showFilters}
                        onClick={() => setShowFilters(!showFilters)}
                        className={showFilters || hasActiveFilters ? 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-900' : ''}
                    >
                        Filters
                        <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                    </Button>
                    {showFilters && (
                        <>
                            <select
                                className="field-sm !h-8 !py-0 w-auto"
                                aria-label="Action"
                                value={filters.action}
                                onChange={e => setFilters({ ...filters, action: e.target.value })}
                            >
                                <option value="">All Actions</option>
                                {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                            <select
                                className="field-sm !h-8 !py-0 w-auto"
                                aria-label="Entity"
                                value={filters.entity_type}
                                onChange={e => setFilters({ ...filters, entity_type: e.target.value })}
                            >
                                <option value="">All Entities</option>
                                {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                            <select
                                className="field-sm !h-8 !py-0 w-auto"
                                aria-label="User"
                                value={filters.user_id}
                                onChange={e => setFilters({ ...filters, user_id: e.target.value })}
                            >
                                <option value="">All Users</option>
                                {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <label className="text-xs text-slate-600 dark:text-slate-400">From</label>
                            <input
                                type="date"
                                aria-label="From Date"
                                className="field-sm !h-8 !py-0 w-auto"
                                value={filters.dateFrom}
                                onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                            />
                            <label className="text-xs text-slate-600 dark:text-slate-400">to</label>
                            <input
                                type="date"
                                aria-label="To Date"
                                className="field-sm !h-8 !py-0 w-auto"
                                value={filters.dateTo}
                                onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                            />
                        </>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchLogs} disabled={loading} spin={loading} />
                    </div>
                </>
            )}
            footer={!loading && !error && filteredLogs.length > 0 ? <TablePager controls={pager} noun="log" /> : null}
        >
                {/* KPI strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                    {KPIS.map(kpi => {
                        const Icon = kpi.icon;
                        return (
                            <div
                                key={kpi.label}
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-app-surface p-3 flex items-center gap-3"
                            >
                                <div className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${kpi.ring} ${kpi.tint}`}>
                                    <Icon size={16} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-600 dark:text-slate-400">
                                        {kpi.label}
                                    </div>
                                    <div className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{kpi.value}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Table */}
                {loading ? (
                    <div className="px-4 sm:px-6 py-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load system logs</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchLogs}>Try again</Button>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Activity size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {hasActiveFilters ? 'No logs match these filters' : 'No system logs yet'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {hasActiveFilters
                                ? 'Widen the date range or clear a filter to see more activity.'
                                : 'Actions taken in the app will be recorded here.'}
                        </p>
                    </div>
                ) : (
                        <table className="w-full text-sm text-left">
                            <thead className={LIST_THEAD}>
                                <tr>
                                    <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                    <th className={LIST_TH}>Result</th>
                                    <th className={LIST_TH}>Action</th>
                                    <th className={LIST_TH}>Entity</th>
                                    <th className={LIST_TH}>User</th>
                                    <th className={LIST_TH}>IP Address</th>
                                    <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}>Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map((log, idx) => (
                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums`}>{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                                                    <Monitor size={14} className="text-slate-600 dark:text-slate-400" />
                                                </div>
                                                <span className={CELL_SOFT}>Success</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`${BADGE} ${getActionStyle(log.action)}`}>
                                                {dash(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col">
                                                <span className={CELL_STRONG}>{dash(log.entity_type)}</span>
                                                {log.entity_id && (
                                                    <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                                                        ID: {log.entity_id}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span
                                                    aria-hidden="true"
                                                    className="w-8 h-8 shrink-0 rounded-full grid place-items-center font-bold text-xs bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800/70"
                                                >
                                                    {(String(log.username || '').trim().charAt(0) || '?').toUpperCase()}
                                                </span>
                                                <span className={`${CELL_STRONG} truncate`}>{dash(log.username)}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={CELL_MONO}>{dash(log.ip_address)}</span>
                                        </td>
                                        <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                            <div className="flex flex-col">
                                                <span className={CELL_STRONG}>
                                                    {formatDate(log.created_at)}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                                    {log.created_at ? formatTime(log.created_at) : ''}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                )}
        </ListPage>
        </>
    );
}
