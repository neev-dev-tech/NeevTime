import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    Database, Download, Upload, RefreshCw, Trash2, Clock,
    HardDrive, CheckCircle, AlertTriangle, Calendar, FileText, Server, Save
} from 'lucide-react';
import { toast } from '../components/ToastContainer';
import { confirm } from '../components/ConfirmDialog';
import { Button, PageHeader } from '../components';

export default function DatabaseTools() {
    const [backups, setBackups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [dbStats, setDbStats] = useState(null);

    useEffect(() => {
        fetchData();
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
        } catch (err) {
            console.error('Error fetching data:', err);
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
                toast.success('Backup created successfully!');
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Server}
                title="Database Tools"
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
            <div className="report-container">
                {/* Database Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-6 border-b border-slate-100 bg-slate-50/30">
                    <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">DB Size</div>
                        <div className="text-2xl font-bold text-slate-800 break-all">{dbStats?.database_size || '-'}</div>
                        <Database className="absolute bottom-2 right-2 text-blue-50 opacity-50 -z-0" size={40} />
                    </div>
                    <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-1">Employees</div>
                        <div className="text-2xl font-bold text-slate-800">{dbStats?.total_employees || 0}</div>
                        <FileText className="absolute bottom-2 right-2 text-emerald-50 opacity-50 -z-0" size={40} />
                    </div>
                    <div className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="text-purple-600 text-xs font-bold uppercase tracking-wider mb-1">Departments</div>
                        <div className="text-2xl font-bold text-slate-800">{dbStats?.total_departments || 0}</div>
                        <HardDrive className="absolute bottom-2 right-2 text-purple-50 opacity-50 -z-0" size={40} />
                    </div>
                    <div className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Logs</div>
                        <div className="text-2xl font-bold text-slate-800">{dbStats?.total_attendance_logs || 0}</div>
                        <Clock className="absolute bottom-2 right-2 text-amber-50 opacity-50 -z-0" size={40} />
                    </div>
                    <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="text-rose-600 text-xs font-bold uppercase tracking-wider mb-1">Holidays</div>
                        <div className="text-2xl font-bold text-slate-800">{dbStats?.total_holidays || 0}</div>
                        <Calendar className="absolute bottom-2 right-2 text-rose-50 opacity-50 -z-0" size={40} />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden group bg-gradient-to-br from-slate-50 to-white">
                        <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Last Backup</div>
                        <div className="text-sm font-semibold text-slate-700">
                            {dbStats?.last_backup ? new Date(dbStats.last_backup).toLocaleDateString() : 'Never'}
                        </div>
                        <CheckCircle className="absolute bottom-2 right-2 text-slate-200 opacity-50 -z-0" size={40} />
                    </div>
                </div>

                {/* Warning */}
                <div className="mx-6 mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600 flex-shrink-0">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-amber-800">Important Safety Notice</h4>
                        <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                            Always create a comprehensive backup before performing any restore operation. Restoring a backup is a destructive action that will replace all current data.
                        </p>
                    </div>
                </div>

                {/* Backups Table */}
                <div className="p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Clock size={20} className="text-slate-400" />
                        Backup History
                    </h3>
                    <div className="table-premium-wrapper border rounded-xl overflow-hidden">
                        <table className="table-premium">
                            <thead>
                                <tr>
                                    <th>Backup Name</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Created On</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading backups...</td></tr>
                                ) : backups.length === 0 ? (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="table-empty-state">
                                                <div className="table-empty-icon"><Database size={40} /></div>
                                                <div className="table-empty-title">No backups available</div>
                                                <div className="table-empty-description">Create your first backup to secure your data.</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    backups.map(backup => (
                                        <tr key={backup.id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded bg-orange-50 text-orange-600">
                                                        <Database size={16} />
                                                    </div>
                                                    <span className="font-semibold text-slate-700 text-sm">{backup.name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${backup.type === 'auto'
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    }`}>
                                                    {backup.type === 'auto' ? 'Automatic' : 'Manual'}
                                                </span>
                                            </td>
                                            <td><span className="font-mono text-sm text-slate-600">{backup.size}</span></td>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-slate-700">{new Date(backup.created_at).toLocaleDateString()}</span>
                                                    <span className="text-xs text-slate-400">{new Date(backup.created_at).toLocaleTimeString()}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center justify-end gap-2">
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
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Auto Backup Settings */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <RefreshCw size={18} className="text-orange-500" />
                        Automatic Backup Settings
                    </h3>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Frequency</label>
                            <select className="input-premium w-full bg-slate-50">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Preferred Time</label>
                            <input type="time" defaultValue="02:00" className="input-premium w-full bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Retention (Count)</label>
                            <input type="number" defaultValue="7" className="input-premium w-full bg-slate-50" />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <Button variant="dark" icon={Save}>
                            Save Settings
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
