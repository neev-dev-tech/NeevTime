import React, { useEffect, useState } from 'react';
import api from '../api';
import { useToast, Button, PageHeader } from '../components';
import Modal from '../components/Modal';
import { Plus, RefreshCw, Trash2, Shield, Check } from 'lucide-react';

const KNOWN_SCOPES = ['attendance:read', 'employees:read'];

/**
 * Export API access — issue, rotate and revoke the keys an external HRMS (e.g.
 * greytHR) uses to PULL attendance from NeevTime. Mirrors scripts/api_client.js.
 * The secret is shown exactly once, on issue/rotate.
 */
export default function ApiAccess() {
    const { showToast } = useToast();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ name: '', scopes: [...KNOWN_SCOPES], allowed_ips: '', rate_limit_per_minute: 120 });
    const [issued, setIssued] = useState(null); // { token, name, note } — shown once
    const [copied, setCopied] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/api-clients');
            setClients(res.data || []);
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not load API clients', 'error');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const toggleScope = (s) => setForm(f => ({
        ...f,
        scopes: f.scopes.includes(s) ? f.scopes.filter(x => x !== s) : [...f.scopes, s],
    }));

    const openForm = () => {
        setForm({ name: '', scopes: [...KNOWN_SCOPES], allowed_ips: '', rate_limit_per_minute: 120 });
        setShowForm(true);
    };

    const issue = async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!form.name.trim()) { showToast('Name is required', 'error'); return; }
        setBusy(true);
        try {
            const res = await api.post('/api/api-clients', {
                name: form.name.trim(),
                scopes: form.scopes,
                allowed_ips: form.allowed_ips.trim() ? form.allowed_ips.split(',').map(s => s.trim()).filter(Boolean) : null,
                rate_limit_per_minute: Number(form.rate_limit_per_minute) || 120,
            });
            setShowForm(false);
            setIssued({ token: res.data.token, name: form.name.trim(), note: res.data.note, unrestricted: res.data.unrestricted });
            setCopied(false);
            load();
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not issue key', 'error');
        } finally {
            setBusy(false);
        }
    };

    const rotate = async (c) => {
        if (!window.confirm(`Rotate "${c.name}"? The current key stops working immediately.`)) return;
        try {
            const res = await api.post(`/api/api-clients/${c.id}/rotate`);
            setIssued({ token: res.data.token, name: c.name, note: res.data.note });
            setCopied(false);
            load();
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not rotate key', 'error');
        }
    };

    const revoke = async (c) => {
        if (!window.confirm(`Revoke "${c.name}"? Calls with that key will answer 401.`)) return;
        try {
            await api.post(`/api/api-clients/${c.id}/revoke`);
            showToast(`Revoked "${c.name}"`, 'success');
            load();
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not revoke key', 'error');
        }
    };

    const copyToken = async () => {
        try { await navigator.clipboard.writeText(issued.token); setCopied(true); }
        catch { /* clipboard blocked — user can select manually */ }
    };

    const fmt = (t) => t ? new Date(t).toLocaleString() : '—';

    return (
        <div className="p-6">
            <PageHeader
                icon={Shield}
                title="Export API Access"
                subtitle="Keys an external HRMS uses to pull attendance from NeevTime"
                actions={<Button variant="successSolid" icon={Plus} onClick={openForm}>Issue Key</Button>}
            />

            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Key</th>
                                <th className="px-4 py-3 font-medium">Scopes</th>
                                <th className="px-4 py-3 font-medium">Allowed addresses</th>
                                <th className="px-4 py-3 font-medium">Rate</th>
                                <th className="px-4 py-3 font-medium">Last used</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
                            ) : clients.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                                    No API keys yet. Click <b>Issue Key</b> to create one for greytHR or another puller.
                                </td></tr>
                            ) : clients.map(c => (
                                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.token_prefix}…</td>
                                    <td className="px-4 py-3 text-xs">{(c.scopes || []).join(', ') || '—'}</td>
                                    <td className="px-4 py-3 text-xs font-mono">
                                        {(c.allowed_ips && c.allowed_ips.length)
                                            ? c.allowed_ips.join(', ')
                                            : <span className="text-amber-600 dark:text-amber-400">ANY — unrestricted</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{c.rate_limit_per_minute}/min</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">
                                        {c.last_used_at ? <>{fmt(c.last_used_at)}<div className="text-slate-400">{c.last_used_ip}</div></> : 'never'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {c.is_active
                                            ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" />Active</span>
                                            : <span className="text-slate-400">Revoked</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => rotate(c)}>Rotate</Button>
                                        {c.is_active && (
                                            <Button variant="dangerSolid" size="sm" icon={Trash2} onClick={() => revoke(c)} className="ml-2">Revoke</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Issue form */}
            <Modal open={showForm} onClose={() => setShowForm(false)} title="Issue API key" size="md">
                <form onSubmit={issue} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Name</label>
                        <input className="input-base mt-1" placeholder="e.g. greytHR production"
                            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Scopes</label>
                        <div className="mt-1 flex flex-wrap gap-3">
                            {KNOWN_SCOPES.map(s => (
                                <label key={s} className="inline-flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.scopes.includes(s)} onChange={() => toggleScope(s)} />
                                    <span className="font-mono text-xs">{s}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Allowed addresses (CIDR, comma-separated)</label>
                        <input className="input-base mt-1 font-mono" placeholder="103.21.58.0/24  (blank = any — not recommended)"
                            value={form.allowed_ips} onChange={e => setForm({ ...form, allowed_ips: e.target.value })} />
                        <p className="mt-1 text-xs text-slate-400 flex items-center gap-1"><Shield className="w-3 h-3" />Restrict to the puller's egress IPs. Blank leaves the key usable from anywhere.</p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Rate limit (per minute)</label>
                        <input type="number" min="1" className="input-base mt-1 w-32"
                            value={form.rate_limit_per_minute} onChange={e => setForm({ ...form, rate_limit_per_minute: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setShowForm(false)} disabled={busy}>Cancel</Button>
                        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Issuing…' : 'Issue key'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Show-once key */}
            <Modal open={!!issued} onClose={() => setIssued(null)} title="Copy this key now" size="md" hideClose>
                {issued && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Key for <b>{issued.name}</b>. {issued.note}
                        </p>
                        <div className="rounded-lg bg-slate-900 text-emerald-300 font-mono text-xs p-3 break-all select-all">
                            {issued.token}
                        </div>
                        {issued.unrestricted && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                No address restriction set — this key works from anywhere. Add a CIDR by rotating once the puller confirms their IPs.
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={copyToken}>{copied ? 'Copied ✓' : 'Copy'}</Button>
                            <Button variant="primary" onClick={() => setIssued(null)}>Done</Button>
                        </div>
                        <p className="text-xs text-slate-400">Send it over a channel the recipient controls, not email. It cannot be shown again.</p>
                    </div>
                )}
            </Modal>
        </div>
    );
}
