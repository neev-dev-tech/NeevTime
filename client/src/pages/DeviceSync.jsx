import { useEffect, useState } from 'react';
import api from '../api';
import {
    RefreshCw, CheckCircle, Trash2, Fingerprint, Upload, Download, AlertCircle, Inbox
} from 'lucide-react';
import { confirm } from '../components/ConfirmDialog';
import { Button, useToast, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
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

const HAIRLINE = 'border-slate-200 dark:border-slate-800';

// Status colour lives only on a small dot; the word always sits beside it.
const QUEUE = [
    { key: 'pending', dot: 'bg-amber-400' },
    { key: 'sent', dot: 'bg-slate-400' },
    { key: 'success', dot: 'bg-emerald-500' },
    { key: 'failed', dot: 'bg-rose-500' },
    { key: 'dead_letter', dot: 'bg-rose-500' }
];

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
        <div className="-m-4 sm:-m-6 min-h-[calc(100%+2rem)] sm:min-h-[calc(100%+3rem)] bg-app-surface">
            {/* Title bar */}
            <div className={`flex items-center gap-x-4 gap-y-1 px-4 sm:px-6 min-h-14 py-2.5 border-b ${HAIRLINE} flex-wrap`}>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">Device Sync</h1>
                <span className="text-[13px] text-slate-600 dark:text-slate-400">Command queue and fleet-wide sync actions</span>
                <div className="ml-auto">
                    <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchAll} disabled={loading} spin={loading} />
                </div>
            </div>

            {error && (
                <div role="alert" className={`flex items-center gap-3 flex-wrap px-4 sm:px-6 py-2.5 border-b ${HAIRLINE} bg-rose-50/60 dark:bg-rose-950/20`}>
                    <AlertCircle size={15} className="text-rose-600 dark:text-rose-400 shrink-0" />
                    <p className="text-sm text-rose-800 dark:text-rose-200 flex-1 min-w-0">{error}</p>
                    <Button variant="tonal" size="toolbar" onClick={fetchAll}>Try again</Button>
                </div>
            )}

            {/* Band 1: queue health */}
            <section aria-label="Command queue" className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b ${HAIRLINE} divide-x divide-y lg:divide-y-0 divide-slate-200 dark:divide-slate-800`}>
                {QUEUE.map(({ key, dot }) => (
                    <div key={key} className="px-4 sm:px-6 py-4">
                        <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                            {LABELS[key]}
                        </span>
                        {loading && !stats ? (
                            <span className="mt-1.5 block h-7 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ) : (
                            <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                                {stats ? Number(stats[key] ?? 0).toLocaleString() : '–'}
                            </span>
                        )}
                    </div>
                ))}
            </section>

            {/* Band 2: fleet actions */}
            <section className={`px-4 sm:px-6 py-5 border-b ${HAIRLINE}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fleet actions</h2>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            Commands are queued, not sent immediately — each reader collects them on its next poll.
                        </p>
                    </div>
                    {canAdminister && (
                        <Button variant="danger" size="toolbar" icon={Trash2} onClick={purge} disabled={busy === 'purge'}>
                            {busy === 'purge' ? 'Purging…' : 'Purge history > 30 days'}
                        </Button>
                    )}
                </div>
                {canEdit ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {FLEET.map(a => (
                            <Button
                                key={a.key}
                                variant="tonal"
                                size="toolbar"
                                icon={a.icon}
                                onClick={() => fleetAction(a.key, a.label, a.url)}
                                disabled={busy === a.key}
                            >
                                {busy === a.key ? 'Queueing…' : a.label}
                            </Button>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                        Your account has read-only access, so sync actions are disabled.
                    </p>
                )}
            </section>

            {/* Band 3: dead letter — the reason this page exists */}
            <section className={`border-b ${HAIRLINE}`}>
                <div className="px-4 sm:px-6 pt-5 pb-3 flex items-baseline justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Commands the devices never accepted</h2>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            These exhausted their retries. Until now nothing surfaced them.
                        </p>
                    </div>
                    {!loading && !error && deadLetter.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {deadLetter.length} command{deadLetter.length === 1 ? '' : 's'} given up on
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="px-4 sm:px-6 pb-5 space-y-2">
                        {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
                    </div>
                ) : error ? (
                    <div className={`px-4 sm:px-6 py-12 text-center border-t ${HAIRLINE}`}>
                        <AlertCircle size={28} className="mx-auto mb-2 text-rose-500 dark:text-rose-400" />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Could not load stuck commands</p>
                        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">{error}</p>
                    </div>
                ) : deadLetter.length === 0 ? (
                    <div className={`px-4 sm:px-6 py-12 text-center border-t ${HAIRLINE}`}>
                        <CheckCircle size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Nothing stuck</p>
                        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
                            Commands that run out of retries will appear here. Every command so far has been delivered or is still in flight.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className={`${LIST_THEAD} border-t`}>
                                <tr>
                                    <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                    <th className={LIST_TH}>Device</th>
                                    <th className={LIST_TH}>Command</th>
                                    <th className={LIST_TH}>Last error</th>
                                    <th className={`${LIST_TH} !text-right`}>Tries</th>
                                    <th className={`${LIST_TH} ${LIST_EDGE_LAST} !text-right`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {deadLetter.map((row, i) => (
                                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className={`${LIST_EDGE_FIRST} px-4 py-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-400`}>{i + 1}</td>
                                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">{row.device_serial || '—'}</td>
                                        <td className="px-4 py-2.5 max-w-[280px]">
                                            <span className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                                                {(row.command || '—').slice(0, 90)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-[13px] text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={row.last_error || ''}>
                                            {row.last_error || '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-[13px] font-medium text-rose-700 dark:text-rose-400">
                                            {row.retry_count ?? 0}
                                        </td>
                                        <td className={`${LIST_EDGE_LAST} px-4 py-2 text-right`}>
                                            {canEdit && (
                                                <Button
                                                    variant="tonal"
                                                    size="toolbar"
                                                    icon={RefreshCw}
                                                    onClick={() => retryOne(row.id)}
                                                    disabled={busy === `retry-${row.id}`}
                                                >
                                                    {busy === `retry-${row.id}` ? 'Retrying…' : 'Retry'}
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Band 4: biometric totals */}
            {biometrics && (
                <section className="pb-6">
                    <h2 className="px-4 sm:px-6 pt-5 pb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Biometric templates</h2>
                    {/* The endpoint returns one row per enrolled employee, with counts
                        as strings; the band shows totals across them. */}
                    {(() => {
                        const rows = Array.isArray(biometrics) ? biometrics : [];
                        const sum = (k) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
                        if (rows.length === 0) {
                            return (
                                <p className={`px-4 sm:px-6 pb-5 text-sm text-slate-600 dark:text-slate-400`}>
                                    No templates collected yet. They arrive as employees enrol on a device, or with Pull biometrics above.
                                </p>
                            );
                        }
                        return (
                            <div className={`grid grid-cols-3 border-y ${HAIRLINE} divide-x divide-slate-200 dark:divide-slate-800`}>
                                {[
                                    ['Employees enrolled', rows.length],
                                    ['Fingerprint templates', sum('fingerprint_count')],
                                    ['Face templates', sum('face_count')]
                                ].map(([label, v]) => (
                                    <div key={label} className="px-4 sm:px-6 py-3">
                                        <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                        <span className="mt-0.5 block text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{v.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </section>
            )}
        </div>
    );
}
