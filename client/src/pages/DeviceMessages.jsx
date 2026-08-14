import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, RefreshCw } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, useToast } from '../components';

export default function DeviceMessages() {
    const toast = useToast();
    const [messages, setMessages] = useState([]);
    const [devices, setDevices] = useState([]);
    const [form, setForm] = useState({ device_serial: '', message: '' });
    const [sending, setSending] = useState(false);

    const fetchData = async () => {
        try {
            const [msgRes, devRes] = await Promise.all([
                api.get('/api/devices/messages'),
                api.get('/api/devices')
            ]);
            setMessages(msgRes.data || []);
            setDevices(devRes.data || []);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to load messages');
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!form.device_serial || !form.message.trim()) {
            toast.warning('Select a device and enter a message');
            return;
        }
        setSending(true);
        try {
            await api.post('/api/devices/messages', form);
            setForm(f => ({ ...f, message: '' }));
            toast.success('Message queued for device');
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={MessageSquare}
                title="Device Messages"
                subtitle="Send short messages displayed on biometric devices"
                actions={<Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Refresh</Button>}
            />

            <form onSubmit={handleSend} className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm p-4 flex flex-wrap gap-3 items-end">
                <div className="min-w-[220px]">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Device</label>
                    <select value={form.device_serial} onChange={e => setForm(f => ({ ...f, device_serial: e.target.value }))} className="field" required>
                        <option value="">Select device</option>
                        {devices.map(d => <option key={d.serial_number} value={d.serial_number}>{d.device_name || d.serial_number}</option>)}
                    </select>
                </div>
                <div className="flex-1 min-w-[260px]">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Message</label>
                    <input type="text" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} maxLength={200} placeholder="e.g. Office closes early today at 4 PM" className="field" required />
                </div>
                <Button type="submit" variant="primary" icon={Send} disabled={sending}>{sending ? 'Sending...' : 'Send'}</Button>
            </form>

            <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                        <tr>
                            <th className="px-6 py-3">Device</th>
                            <th className="px-6 py-3">Message</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Sent</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-slate-700">
                        {messages.length === 0 ? (
                            <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center">
                                        <MessageSquare size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No messages sent yet</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            Messages you push to a device appear here with their delivery status.
                                        </p>
                                    </td>
                                </tr>
                        ) : messages.map((m, i) => (
                            <tr key={m.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-3 font-mono text-xs">{m.device_name || m.device_serial}</td>
                                <td className="px-6 py-3 text-slate-700 dark:text-slate-300">{m.message}</td>
                                <td className="px-6 py-3">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize ${m.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'}`}>
                                        {m.status || 'pending'}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{m.created_at ? new Date(m.created_at).toLocaleString() : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
