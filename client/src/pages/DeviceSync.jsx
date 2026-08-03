import { useEffect, useState } from 'react';
import api from '../api';
import {
    RefreshCw, AlertTriangle, CheckCircle, Clock, Send, Trash2,
    Fingerprint, Upload, Download, AlertCircle, Inbox
} from 'lucide-react';
import { confirm } from '../components/ConfirmDialog';
import { Button, PageHeader, useToast } from '../components';
import { usePermissions } from '../hooks/usePermissions';

/**
 * Device Sync & Command Queue.
 *
 * The queue drives every instruction sent to a reader — user pushes, biometric
 * templates, reboots — and had no interface at all. Commands that exhausted
 * their retries landed in the dead-letter state and stayed there unseen; this
 * install had 39 failed and 28 dead-lettered before anyone could look.
 *
 * Everything here rides the ADMS command channel, which the devices poll. That
 * matters on this network: direct TCP to the readers is filtered, but the
 * command queue works — 36,000+ commands have been delivered through it.
 */

const CELL_MONO = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const BADGE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

const STAT_TONES = {
    pending: { chip: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', icon: Clock },
    sent: { chip: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300', icon: Send },
    success: { chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle },
    failed: { chip: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300', icon: AlertCircle },
    dead_letter: { chip: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300', icon: AlertTriangle }
};

const LABELS = {
    pending: 'Pending', sent: 'Sent', success: 'Delivered',
    failed: 'Failed', dead_letter: 'Given up'
};

export default function DeviceSync() {
    const toast = useToast();
    const { canEdit, canAdminister } = usePermissions();

    const [stats, setStats] = useState(null);
    const [deadLetter, setDeadLetter] = useState([]);
    const [biometrics, setBiometrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [s, d] = await Promise.all([
                api.get('/api/devices/queue/stats'),
                api.get('/api/devices/queue/dead-letter', { params: { limit: 50 } })
            ]);
            setStats(s.data || {});
            setDeadLetter(Array.isArray(d.data) ? d.data : []);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load the command queue');
        }
        // The biometric summary reads devices over TCP, which is filtered on this
        // network — it must not take the rest of the page down with it.
        try {
            const b = await api.get('/api/devices/biometrics/summary');
            setBiometrics(b.data);
        } catch {
            setBiometrics(null);
        }
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);

    // Backing out of a confirmation is not a failure; only real errors get a toast.
    const CANCELLED = Symbol('cancelled');

    const run = async (key, label, fn) => {
        setBusy(key);
        try {
            const res = await fn();
            if (res === CANCELLED) return;
            const d = res?.data || {};
            toast.success(d.message || `${label} queued`);
            fetchAll();
        } catch (err) {
            toast.error(err.response?.data?.error || `${label} failed`);
        } finally {
            setBusy(null);
        }
    };

    const fleetAction = (key, label, url) => run(key, label, async () => {
        const ok = await confirm({
            title: label,
            message: `Queue "${label}" for every online device? Readers pick commands up on their next poll.`,
            confirmText: 'Queue it',
            type: 'warning'
        });
        if (!ok) return CANCELLED;
        return api.post(url);
    });

    const retryOne = (id) => run(`retry-${id}`, 'Retry', () =>
        api.post(`/api/devices/queue/dead-letter/${id}/retry`));

    // Deletes rows for good, and not only the delivered ones — the server clears
    // 'success' *and* 'dead_letter' older than the cutoff, so anything given up on
    // more than 30 days ago loses its error text with it. Say that plainly.
    const purge = () => run('purge', 'Purge', async () => {
        const ok = await confirm({
            title: 'Purge command history',
            message: 'Permanently deletes delivered commands AND given-up commands older than 30 days, '
                + 'including their error messages. Pending, sent and failed commands are kept. This cannot be undone.',
            confirmText: 'Delete them',
            type: 'danger'
        });
        if (!ok) return CANCELLED;
        return api.post('/api/devices/queue/purge', { days: 30 });
    });

    const FLEET = [
        { key: 'push-users', label: 'Push users to devices', url: '/api/devices/sync/all/upload-users', icon: Upload },
        { key: 'pull-users', label: 'Pull users from devices', url: '/api/devices/sync/all/download-users', icon: Download },
        { key: 'pull-logs', label: 'Pull attendance logs', url: '/api/devices/sync/all/download-logs', icon: Inbox },
        { key: 'push-bio', label: 'Push biometrics', url: '/api/devices/sync/all/upload-biometrics', icon: Fingerprint },
        { key: 'pull-bio', label: 'Pull biometrics', url: '/api/devices/sync/all/download-biometrics', icon: Fingerprint }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={RefreshCw}
                title="Device Sync"
                subtitle="Command queue and fleet-wide sync actions"
                actions={
                    <Button variant="secondary" icon={RefreshCw} onClick={fetchAll} disabled={loading}>
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </Button>
                }
            />

            {error && (
                <div className="card-base !p-4 flex items-center gap-3 border-l-4 border-rose-500">
                    <AlertCircle size={18} className="text-rose-500 shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-200 flex-1">{error}</p>
                    <Button variant="secondary" size="sm" onClick={fetchAll}>Try again</Button>
                </div>
            )}

            {/* Queue health */}
            {loading && !stats ? (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />)}
                </div>
            ) : stats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {['pending', 'sent', 'success', 'failed', 'dead_letter'].map(key => {
                        const tone = STAT_TONES[key];
                        const Icon = tone.icon;
                        const value = stats[key] ?? 0;
                        return (
                            <div key={key} className="card-base !p-4 flex items-center gap-3">
                                <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${tone.chip}`}>
                                    <Icon size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500 dark:text-slate-400 leading-tight">
                                        {LABELS[key]}
                                    </p>
                                    <p className="text-[26px] leading-tight font-bold tabular-nums text-slate-900 dark:text-slate-50">
                                        {Number(value).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Fleet actions */}
            <div className="card-base">
                <div className="mb-1 flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-semibold text-base text-slate-800 dark:text-slate-100">Fleet actions</h2>
                    {canAdminister && (
                        <Button variant="danger" size="sm" icon={Trash2} onClick={purge} disabled={busy === 'purge'}>
                            {busy === 'purge' ? 'Purging…' : 'Purge history > 30 days'}
                        </Button>
                    )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Commands are queued, not sent immediately — each reader collects them on its next poll.
                </p>
                {canEdit ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {FLEET.map(a => (
                            <Button
                                key={a.key}
                                variant="secondary"
                                icon={a.icon}
                                className="justify-start"
                                onClick={() => fleetAction(a.key, a.label, a.url)}
                                disabled={busy === a.key}
                            >
                                {busy === a.key ? 'Queueing…' : a.label}
                            </Button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Your account has read-only access, so sync actions are disabled.
                    </p>
                )}
            </div>

            {/* Dead letter — the reason this page exists */}
            <div className="card-base !p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
                    <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-rose-500" />
                        Commands the devices never accepted
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        These exhausted their retries. Until now nothing surfaced them.
                    </p>
                </div>

                {loading ? (
                    <div className="p-5 space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/40 animate-pulse" />)}
                    </div>
                ) : deadLetter.length === 0 ? (
                    <div className="py-14 text-center">
                        <CheckCircle size={30} className="mx-auto text-emerald-500 mb-2" />
                        <p className="font-semibold text-slate-800 dark:text-slate-100">Nothing stuck</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Every command has been delivered or is still in flight.</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="text-left font-bold px-5 py-3">#</th>
                                        <th className="text-left font-bold px-5 py-3">Device</th>
                                        <th className="text-left font-bold px-5 py-3">Command</th>
                                        <th className="text-left font-bold px-5 py-3">Last error</th>
                                        <th className="text-left font-bold px-5 py-3">Tries</th>
                                        <th className="text-right font-bold px-5 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {deadLetter.map((row, i) => (
                                        <tr key={row.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                            <td className="px-5 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                                            <td className={`px-5 py-3 ${CELL_MONO}`}>{row.device_serial || '—'}</td>
                                            <td className="px-5 py-3 max-w-[280px]">
                                                <span className="font-mono text-xs text-slate-700 dark:text-slate-200 break-all">
                                                    {(row.command || '—').slice(0, 90)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={row.last_error || ''}>
                                                {row.last_error || '—'}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`${BADGE} bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300`}>
                                                    {row.retry_count ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {canEdit && (
                                                    <div className="dv-quiet inline-flex">
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            icon={RefreshCw}
                                                            onClick={() => retryOne(row.id)}
                                                            disabled={busy === `retry-${row.id}`}
                                                        >
                                                            {busy === `retry-${row.id}` ? 'Retrying…' : 'Retry'}
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700">
                            {deadLetter.length} command{deadLetter.length === 1 ? '' : 's'} given up on
                        </div>
                    </>
                )}
            </div>

            {biometrics && (
                <div className="card-base">
                    <h2 className="font-semibold text-base text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                        <Fingerprint size={18} className="text-cyan-500" /> Biometric templates
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {Object.entries(biometrics).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                            <div key={k} className="rounded-xl bg-slate-50/70 dark:bg-slate-900/50 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-slate-500 dark:text-slate-400">
                                    {k.replace(/_/g, ' ')}
                                </p>
                                <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{v}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
