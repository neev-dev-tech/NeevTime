import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    Activity, RefreshCw, Filter, Download, User, Calendar,
    Database, Settings, Users, Clock, FileText, Search, ChevronDown, Monitor
} from 'lucide-react';
import { Button, PageHeader } from '../components';

export default function SystemLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
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
        } catch (err) {
            console.error('Error fetching logs:', err);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    const getActionStyle = (action) => {
        const styles = {
            LOGIN: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
            LOGOUT: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800',
            CREATE: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
            UPDATE: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
            DELETE: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
            EXPORT: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
            IMPORT: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
            SYNC: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800'
        };
        return styles[action] || 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-800';
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
        a.download = `system_logs_${new Date().toISOString().split('T')[0]}.csv`;
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
            const logDate = new Date(log.created_at).toISOString().split('T')[0];
            if (logDate < filters.dateFrom) return false;
        }
        if (filters.dateTo) {
            const logDate = new Date(log.created_at).toISOString().split('T')[0];
            if (logDate > filters.dateTo) return false;
        }
        return true;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Activity}
                title="System Logs"
                actions={(
                    <>
                        <Button
                            variant="secondary"
                            icon={Filter}
                            onClick={() => setShowFilters(!showFilters)}
                            className={showFilters ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-300' : ''}
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
            <div className="report-container">
                {/* Filter Panel */}
                {showFilters && (
                    <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 p-4 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Action</label>
                                <select
                                    className="input-premium py-1.5 text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    value={filters.action}
                                    onChange={e => setFilters({ ...filters, action: e.target.value })}
                                >
                                    <option value="">All Actions</option>
                                    {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">Entity</label>
                                <select
                                    className="input-premium py-1.5 text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    value={filters.entity_type}
                                    onChange={e => setFilters({ ...filters, entity_type: e.target.value })}
                                >
                                    <option value="">All Entities</option>
                                    {uniqueEntities.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">User</label>
                                <select
                                    className="input-premium py-1.5 text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    value={filters.user_id}
                                    onChange={e => setFilters({ ...filters, user_id: e.target.value })}
                                >
                                    <option value="">All Users</option>
                                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">From Date</label>
                                <input
                                    type="date"
                                    className="input-premium py-1.5 text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    value={filters.dateFrom}
                                    onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1 block">To Date</label>
                                <input
                                    type="date"
                                    className="input-premium py-1.5 text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    value={filters.dateTo}
                                    onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/50">
                    <div className="bg-white dark:bg-slate-800 border border-purple-100 dark:border-slate-700 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 dark:bg-purple-900/30 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-purple-600 text-xs font-bold uppercase tracking-wider mb-1">Total Logs</div>
                            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{filteredLogs.length}</div>
                        </div>
                        <Activity className="absolute bottom-3 right-3 text-purple-100 z-0" size={32} />
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-1">Logins</div>
                            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{filteredLogs.filter(l => l.action === 'LOGIN').length}</div>
                        </div>
                        <User className="absolute bottom-3 right-3 text-emerald-100 z-0" size={32} />
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">Data Changes</div>
                            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{filteredLogs.filter(l => ['CREATE', 'UPDATE', 'DELETE'].includes(l.action)).length}</div>
                        </div>
                        <Database className="absolute bottom-3 right-3 text-blue-100 z-0" size={32} />
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-amber-100 dark:border-slate-700 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 dark:bg-amber-900/30 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Active Users</div>
                            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100">{uniqueUsers.length}</div>
                        </div>
                        <Users className="absolute bottom-3 right-3 text-amber-100 z-0" size={32} />
                    </div>
                </div>

                {/* Table */}
                <div className="table-premium-wrapper">
                    <table className="table-premium">
                        <thead>
                            <tr>
                                <th>Result</th>
                                <th>Action</th>
                                <th>Entity</th>
                                <th>User</th>
                                <th>IP Address</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center p-8 text-slate-400">Loading logs...</td></tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="table-empty-state">
                                            <div className="table-empty-icon"><Activity size={40} /></div>
                                            <div className="table-empty-title">No system logs found</div>
                                            <div className="table-empty-description">Try adjusting your filters or check back later.</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map(log => (
                                    <tr key={log.id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700">
                                                    <Monitor size={14} className="text-slate-500 dark:text-slate-400" />
                                                </div>
                                                <span className="font-medium text-slate-700 dark:text-slate-300">Success</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getActionStyle(log.action)}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{log.entity_type}</span>
                                                {log.entity_id && <span className="text-xs text-slate-400 font-mono">ID: {log.entity_id}</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                                    {log.username?.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">{log.username}</span>
                                            </div>
                                        </td>
                                        <td><span className="cell-code text-xs text-slate-500 dark:text-slate-400">{log.ip_address}</span></td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{new Date(log.created_at).toLocaleDateString()}</span>
                                                <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
