import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    Database, Download, Upload, RefreshCw, Trash2, Clock,
    HardDrive, CheckCircle, AlertTriangle, AlertCircle, Calendar, FileText, Server, Save
} from 'lucide-react';

import { confirm } from '../components/ConfirmDialog';
import { Button, PageHeader, useToast } from '../components';
import { formatDate, toLocalDateString } from '../utils/dateFormat';

const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';
const BADGE_AUTO = 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
const BADGE_MANUAL = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';

const CELL_MONO = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const CELL_STRONG = 'font-semibold text-slate-800 dark:text-slate-100';
const FIELD ='text-sm rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500';
const FIELD_LABEL = 'block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-1';

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

export default function DatabaseTools() {
    const toast = useToast();
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [recomputeRange, setRecomputeRange] = useState(() => {
        const today = toLocalDateString();
        return { start: today, end: today };
    });
    const [recomputing, setRecomputing] = useState(false);

    // Automatic backup schedule (Settings → Database)
    const [autoBackup, setAutoBackup] = useState({
        backup_enabled: false,
        backup_frequency: 'daily',
        backup_time: '02:00',
        backup_retention_count: 7,
    });
    const [pathCheck, setPathCheck] = useState(null);

    // Where a second copy goes. Loaded from the server so the form is drawn
    // from the destinations this build actually supports, rather than a list
    // duplicated here that could drift from what the backend can do.
    const [destinations, setDestinations] = useState([]);
    const [destKey, setDestKey] = useState('');
    const [destConfig, setDestConfig] = useState({});
    const [savingDest, setSavingDest] = useState(false);
    const [savingSchedule, setSavingSchedule] = useState(false);

    const fetchAutoBackup = async () => {
        try {
            const res = await api.get('/api/settings');
            const db = res.data?.database || {};
            const val = (key, fallback) => {
                const entry = db[key];
                if (!entry) return fallback;
                return entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
            };
            setAutoBackup({
                backup_enabled: String(val('backup_enabled', false)) === 'true',
                backup_frequency: val('backup_frequency', 'daily'),
                backup_time: String(val('backup_time', '02:00')).slice(0, 5),
                backup_retention_count: Number(val('backup_retention_count', 7)),
            });
        } catch {
            // Leave the defaults in place; the panel still saves
        }
    };

    const fetchDestinations = async () => {
        try {
            const res = await api.get('/api/database/destinations');
            setDestinations(res.data.available || []);
            setDestKey(res.data.selected || '');
            setDestConfig(res.data.config || {});
        } catch {
            // The panel still renders; it just cannot offer the picker.
        }
    };

    /**
     * Prove the destination works before anyone relies on it.
     *
     * Every destination writes a probe, reads it back and deletes it — not a
     * directory listing. Read permission without write permission passes a
     * listing and then fails every backup afterwards, silently, which is the
     * failure this whole feature exists to prevent.
     */
    const handleTestDestination = async () => {
        setPathCheck({ checking: true });
        try {
            const res = await api.post('/api/database/destinations/test', {
                destination: destKey, config: destConfig,
            });
            setPathCheck({ ok: true, message: res.data.detail, mounted: !res.data.warn });
        } catch (err) {
            setPathCheck({ ok: false, error: err.response?.data?.error || err.message });
        }
    };

    const handleSaveDestination = async () => {
        setSavingDest(true);
        try {
            await api.put('/api/database/destinations', { destination: destKey, config: destConfig });
            toast.success(destKey ? 'Backup destination saved' : 'Second copy turned off');
            await fetchDestinations();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save destination');
        } finally {
            setSavingDest(false);
        }
    };

    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        try {
            await api.put('/api/settings/database', autoBackup);
            toast.success('Backup schedule saved');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save backup schedule');
        } finally {
            setSavingSchedule(false);
        }
    };

    const handleRecompute = async () => {
        const ok = await confirm({
            title: 'Recompute Attendance',
            message: `Rebuild attendance summaries from ${recomputeRange.start} to ${recomputeRange.end}? Manual corrections in this range may be overwritten by recalculated values.`,
            confirmText: 'Recompute',
            type: 'warning'
        });
        if (!ok) return;
        setRecomputing(true);
        try {
            const res = await api.post('/api/attendance/process', {
                startDate: recomputeRange.start,
                endDate: recomputeRange.end
            });
            toast.success(`Recomputed ${res.data.processed} attendance records`);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Recompute failed');
        } finally {
            setRecomputing(false);
        }
    };
    const [creating, setCreating] = useState(false);
    const [dbStats, setDbStats] = useState(null);

    useEffect(() => {
        fetchData();
        fetchAutoBackup();
        fetchDestinations();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch backup list
            const backupsRes = await api.get('/api/database/backups').catch(() => ({ data: [] }));
            const backupsData = (backupsRes.data || []).map(backup => ({
                id: backup.name, // Use name as ID for now
                name: backup.name,
                size: formatFileSize(backup.size),
                created_at: backup.created_at,
                type: backup.name.includes('_manual') ? 'manual' : 'auto'
            }));
            setBackups(backupsData);

            // Fetch DB stats from real API
            const statsRes = await api.get('/api/stats/database').catch(() => ({ data: null }));
            setDbStats(statsRes.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || err.message || 'Could not load database information');
        } finally {
            setLoading(false);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const createBackup = async () => {
        setCreating(true);
        try {
            const response = await api.post('/api/database/backups');
            if (response.data.success) {
                // Say what happened to the second copy, not just the local dump.
                // A backup that was written here and failed to reach the
                // configured destination is the case worth hearing about, and
                // it used to be visible only in the server log.
                const ext = response.data.backup?.external;
                if (!ext || ext.attempted === false) {
                    toast.success('Backup created. No second copy is configured.');
                } else if (ext.ok) {
                    toast.success(`Backup created and copied to ${ext.path || ext.destination}`);
                } else {
                    toast.error(`Backup created, but the copy to ${ext.destination || 'the destination'} `
                        + `failed: ${ext.error}`);
                }
                fetchData(); // Refresh the list to get the new backup
            }
        } catch (err) {
            console.error('Error creating backup:', err);
            toast.error('Error creating backup: ' + (err.response?.data?.error || err.message));
        } finally {
            setCreating(false);
        }
    };

    const restoreBackup = async (backup) => {
        try {
            const result = await confirm({
                title: 'Restore Backup',
                message: `Are you sure you want to restore from "${backup.name}"? This will overwrite all current data. This action cannot be undone!`,
                confirmText: 'Yes, Restore',
                cancelText: 'Cancel',
                type: 'danger',
                confirmButtonColor: 'bg-red-600 hover:bg-red-700'
            });

            if (!result) return;

            toast.info('Restoring database — this can take a few minutes...');
            const res = await api.post('/api/database/restore', {
                filename: backup.name,
                confirm: 'RESTORE'
            });
            toast.success(res.data.message || 'Database restored');
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.details || err.response?.data?.error || 'Restore failed');
        }
    };

    const deleteBackup = async (backup) => {
        try {
            const result = await confirm({
                title: 'Delete Backup',
                message: `Are you sure you want to delete "${backup.name}"? This action cannot be undone.`,
                confirmText: 'Delete',
                cancelText: 'Cancel',
                type: 'danger',
                confirmButtonColor: 'bg-red-600 hover:bg-red-700'
            });

            if (!result) return;

            await api.delete(`/api/database/backups/${encodeURIComponent(backup.name)}`);
            setBackups(prev => prev.filter(b => b.id !== backup.id));
            toast.success('Backup deleted successfully');
            fetchData(); // Refresh the list
        } catch (err) {
            console.error('Error deleting backup:', err);
            toast.error('Error deleting backup: ' + (err.response?.data?.error || err.message));
        }
    };

    const downloadBackup = async (backup) => {
        try {
            // Use axios with blob response type to download the file
            // Use query parameter to handle special characters in filename
            const response = await api.get(`/api/database/backups/download`, {
                params: { filename: backup.name },
                responseType: 'blob'
            });

            // Create a temporary URL and trigger download
            const blob = new Blob([response.data]);
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = backup.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(downloadUrl);

            toast.success(`Downloaded ${backup.name} successfully`);
        } catch (err) {
            console.error('Error downloading backup:', err);
            // Try to parse error message from blob if it's a JSON error response
            if (err.response && err.response.data instanceof Blob) {
                try {
                    const text = await err.response.data.text();
                    const errorData = JSON.parse(text);
                    toast.error('Error downloading backup: ' + (errorData.error || 'Download failed'));
                } catch {
                    toast.error('Error downloading backup: ' + (err.response?.statusText || 'Download failed'));
                }
            } else {
                toast.error('Error downloading backup: ' + (err.response?.data?.error || err.message || 'Unknown error'));
            }
        }
    };

    const STATS = [
        { label: 'DB Size', value: dbStats?.database_size || '—', icon: Database, tint: 'text-blue-600 dark:text-blue-400', ring: 'bg-blue-50 dark:bg-blue-900/30', breakAll: true },
        { label: 'Employees', value: dbStats?.total_employees ?? 0, icon: FileText, tint: 'text-emerald-600 dark:text-emerald-400', ring: 'bg-emerald-50 dark:bg-emerald-900/30' },
        { label: 'Departments', value: dbStats?.total_departments ?? 0, icon: HardDrive, tint: 'text-purple-600 dark:text-purple-400', ring: 'bg-purple-50 dark:bg-purple-900/30' },
        { label: 'Logs', value: dbStats?.total_attendance_logs ?? 0, icon: Clock, tint: 'text-amber-600 dark:text-amber-400', ring: 'bg-amber-50 dark:bg-amber-900/30' },
        { label: 'Holidays', value: dbStats?.total_holidays ?? 0, icon: Calendar, tint: 'text-rose-600 dark:text-rose-400', ring: 'bg-rose-50 dark:bg-rose-900/30' },
        {
            label: 'Last Backup',
            value: dbStats?.last_backup ? formatDate(dbStats.last_backup) : 'Never',
            icon: CheckCircle,
            tint: 'text-slate-500 dark:text-slate-400',
            ring: 'bg-slate-100 dark:bg-slate-700',
            small: true
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Server}
                title="Database Tools"
                subtitle="Backups, restores and attendance maintenance"
                actions={(
                    <>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>
                            Refresh Stats
                        </Button>
                        <Button variant="primary" onClick={createBackup} disabled={creating}>
                            {creating ? (
                                <RefreshCw size={16} className="animate-spin" />
                            ) : (
                                <Download size={16} />
                            )}
                            {creating ? 'Backing up...' : 'Create Backup'}
                        </Button>
                    </>
                )}
            />

            {/* Database Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {STATS.map(stat => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-4 shadow-sm"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className={`w-8 h-8 shrink-0 rounded-lg grid place-items-center ${stat.ring} ${stat.tint}`}>
                                    <Icon size={16} />
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                    {stat.label}
                                </div>
                            </div>
                            <div className={`font-bold text-slate-800 dark:text-slate-100 tabular-nums ${stat.small ? 'text-sm' : 'text-2xl'} ${stat.breakAll ? 'break-all' : ''}`}>
                                {stat.value}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Warning */}
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-600 dark:text-amber-400 flex-shrink-0">
                    <AlertTriangle size={20} />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-amber-800 dark:text-amber-200">Important Safety Notice</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                        Always create a comprehensive backup before performing any restore operation. Restoring a backup is a destructive action that will replace all current data.
                    </p>
                </div>
            </div>

            {/* Backups Table */}
            <div className="card-base !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Clock size={18} className="text-orange-500 dark:text-orange-400" />
                        Backup History
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Every snapshot stored on the server, newest first.
                    </p>
                </div>

                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load backups</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : backups.length === 0 ? (
                    <div className="py-16 text-center">
                        <Database size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No backups available</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Create your first backup to secure your data.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Backup Name</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Type</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Size</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Created On</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {backups.map((backup, idx) => (
                                    <tr key={backup.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span
                                                    aria-hidden="true"
                                                    className="w-8 h-8 shrink-0 rounded-lg grid place-items-center bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70"
                                                >
                                                    <Database size={15} />
                                                </span>
                                                <span className="font-mono text-xs text-slate-800 dark:text-slate-100 font-semibold truncate">
                                                    {dash(backup.name)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`${BADGE} ${backup.type === 'auto' ? BADGE_AUTO : BADGE_MANUAL}`}>
                                                {backup.type === 'auto' ? 'Automatic' : 'Manual'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={CELL_MONO}>{dash(backup.size)}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex flex-col">
                                                <span className={CELL_STRONG}>
                                                    {formatDate(backup.created_at)}
                                                </span>
                                                <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                                                    {backup.created_at ? new Date(backup.created_at).toLocaleTimeString() : ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <div className="dv-quiet">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        icon={Download}
                                                        aria-label="Download backup"
                                                        title="Download"
                                                        onClick={() => downloadBackup(backup)}
                                                    />
                                                    <Button
                                                        variant="success"
                                                        size="sm"
                                                        icon={Upload}
                                                        aria-label="Restore backup"
                                                        title="Restore"
                                                        onClick={() => restoreBackup(backup)}
                                                    />
                                                    <Button
                                                        variant="danger"
                                                        size="sm"
                                                        icon={Trash2}
                                                        aria-label="Delete backup"
                                                        title="Delete"
                                                        onClick={() => deleteBackup(backup)}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && backups.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {backups.length} backup{backups.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>

            {/* Attendance Maintenance */}
            <div className="card-base !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <RefreshCw size={18} className="text-orange-500 dark:text-orange-400" />
                        Recompute Attendance Summaries
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Rebuilds daily summaries from raw punches for a date range — run after imports, device re-syncs or rule changes. Manual entries and regularizations may be recalculated.
                    </p>
                </div>
                <div className="p-6 flex flex-wrap items-end gap-3">
                    <div>
                        <label className={FIELD_LABEL}>From</label>
                        <input
                            type="date"
                            value={recomputeRange.start}
                            onChange={e => setRecomputeRange(r => ({ ...r, start: e.target.value }))}
                            className={FIELD}
                        />
                    </div>
                    <div>
                        <label className={FIELD_LABEL}>To</label>
                        <input
                            type="date"
                            value={recomputeRange.end}
                            onChange={e => setRecomputeRange(r => ({ ...r, end: e.target.value }))}
                            className={FIELD}
                        />
                    </div>
                    <Button variant="primary" icon={RefreshCw} onClick={handleRecompute} disabled={recomputing}>
                        {recomputing ? 'Processing...' : 'Recompute'}
                    </Button>
                </div>
            </div>

            {/* Auto Backup Settings */}
            <div className="card-base !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Clock size={18} className="text-orange-500 dark:text-orange-400" />
                        Automatic Backup Settings
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Schedule for the unattended snapshots the server takes on its own.
                    </p>
                </div>
                <div className="p-6">
                    <label className="flex items-center gap-3 mb-6 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoBackup.backup_enabled}
                            onChange={(e) => setAutoBackup(p => ({ ...p, backup_enabled: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Take backups automatically
                        </span>
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className={FIELD_LABEL}>Frequency</label>
                            <select
                                value={autoBackup.backup_frequency}
                                onChange={(e) => setAutoBackup(p => ({ ...p, backup_frequency: e.target.value }))}
                                className={`${FIELD} w-full`}
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly (Mondays)</option>
                                <option value="monthly">Monthly (1st)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className={FIELD_LABEL}>Preferred Time</label>
                            <input
                                type="time"
                                value={autoBackup.backup_time}
                                onChange={(e) => setAutoBackup(p => ({ ...p, backup_time: e.target.value }))}
                                className={`${FIELD} w-full`}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className={FIELD_LABEL}>Retention (Count)</label>
                            <input
                                type="number"
                                min="1"
                                value={autoBackup.backup_retention_count}
                                onChange={(e) => setAutoBackup(p => ({ ...p, backup_retention_count: Number(e.target.value) }))}
                                className={`${FIELD} w-full`}
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Older automatic backups are deleted once this many exist.
                            </p>
                        </div>
                        <div className="space-y-3 md:col-span-2">
                            <label className={FIELD_LABEL}>Second copy — where backups also go</label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                A dump beside the database survives a bad migration. It does not survive the
                                disk, the machine, or the room. Pick somewhere else for a copy of every backup.
                            </p>

                            <select
                                className={`${FIELD} w-full`}
                                value={destKey}
                                onChange={(e) => { setDestKey(e.target.value); setDestConfig({}); setPathCheck(null); }}
                            >
                                <option value="">No second copy</option>
                                {destinations.map((d) => (
                                    <option key={d.key} value={d.key}>{d.name}</option>
                                ))}
                            </select>

                            {destinations.filter((d) => d.key === destKey).map((d) => (
                                <div key={d.key} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{d.description}</p>

                                    {d.fields.map((f) => (
                                        <div key={f.key} className="space-y-1">
                                            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                                {f.label}
                                            </label>
                                            <input
                                                type={f.type === 'password' ? 'password' : 'text'}
                                                className={`${FIELD} w-full`}
                                                placeholder={f.placeholder || ''}
                                                value={destConfig[f.key] ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setDestConfig((p) => ({ ...p, [f.key]: v }));
                                                    setPathCheck(null);
                                                }}
                                                autoComplete={f.secret ? 'new-password' : 'off'}
                                            />
                                            {f.help && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{f.help}</p>
                                            )}
                                            {f.secret && (
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    Stored encrypted. Leave the dots as they are to keep the saved value.
                                                </p>
                                            )}
                                        </div>
                                    ))}

                                    <div className="flex gap-2 pt-1">
                                        <Button
                                            variant="secondary"
                                            onClick={handleTestDestination}
                                            disabled={pathCheck?.checking}
                                        >
                                            {pathCheck?.checking ? 'Testing…' : 'Test'}
                                        </Button>
                                        <Button
                                            variant="dark"
                                            icon={Save}
                                            onClick={handleSaveDestination}
                                            disabled={savingDest}
                                        >
                                            {savingDest ? 'Saving…' : 'Save destination'}
                                        </Button>
                                    </div>

                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Test writes a small file, reads it back and deletes it. Listing a folder
                                        proves less: read access without write access passes a listing and then
                                        fails every backup.
                                    </p>
                                </div>
                            ))}

                            {!destKey && (
                                <Button variant="dark" icon={Save} onClick={handleSaveDestination} disabled={savingDest}>
                                    {savingDest ? 'Saving…' : 'Save destination'}
                                </Button>
                            )}

                            {pathCheck && !pathCheck.checking && (
                                <div className={`text-xs rounded-lg p-3 border ${
                                    pathCheck.ok && pathCheck.mounted
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
                                        : pathCheck.ok
                                        ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300'
                                        : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300'
                                }`}>
                                    {pathCheck.ok ? pathCheck.message : (pathCheck.error || 'Not reachable')}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button variant="dark" icon={Save} onClick={handleSaveSchedule} disabled={savingSchedule}>
                            {savingSchedule ? 'Saving…' : 'Save Settings'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
