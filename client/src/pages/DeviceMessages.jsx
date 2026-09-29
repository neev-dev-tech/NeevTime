import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, RefreshCw } from 'lucide-react';
import api from '../api';
import { Button, useToast, ListPage, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';
import { formatDateTime } from '../utils/dateFormat';

export default function DeviceMessages() {
    const toast = useToast();
    const [messages, setMessages] = useState([]);
    const [devices, setDevices] = useState([]);
    const [form, setForm] = useState({ device_serial: '', message: '' });
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);

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
        } finally {
            setLoading(false);
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

    const pager = useTableControls(messages, {
        searchKeys: ['device_name', 'device_serial', 'message', 'status'],
        pageSize: 50
    });

    return (
        <ListPage
            title="Device Messages"
            count={messages.length}
            toolbar={
                <>
                    <ListSearch label="Search messages" placeholder="Search by device, message or status…" value={pager.query} onChange={pager.setQuery} />
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchData} />
                    </div>
                </>
            }
            footer={!loading && messages.length > 0 ? <TablePager controls={pager} noun="message" /> : null}
        >
                <form onSubmit={handleSend} className="flex flex-wrap gap-2 items-center px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800">
                    <select aria-label="Device" value={form.device_serial} onChange={e => setForm(f => ({ ...f, device_serial: e.target.value }))} className="field-sm !h-8 !py-0 !w-auto min-w-[220px]" required>
                        <option value="">Select device</option>
                        {devices.map(d => <option key={d.serial_number} value={d.serial_number}>{d.device_name || d.serial_number}</option>)}
                    </select>
                    <input type="text" aria-label="Message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} maxLength={200} placeholder="e.g. Office closes early today at 4 PM" className="field-sm !h-8 !py-0 !w-auto flex-1 min-w-[260px]" required />
                    <Button type="submit" variant="primary" size="toolbar" icon={Send} disabled={sending}>{sending ? 'Sending...' : 'Send'}</Button>
                </form>

                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <MessageSquare size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No messages sent yet</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Messages you push to a device appear here with their delivery status.
                        </p>
                    </div>
                ) : pager.matched === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <MessageSquare size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No matching messages</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Nothing matches the current search. Clear it to see every message.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Device</th>
                                <th className={LIST_TH}>Message</th>
                                <th className={LIST_TH}>Status</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}>Sent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pager.view.map((m, i) => (
                                <tr key={m.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3 font-mono text-xs`}>{m.device_name || m.device_serial}</td>
                                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{m.message}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize ${m.status === 'sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'}`}>
                                            {m.status || 'pending'}
                                        </span>
                                    </td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3 text-xs text-slate-600 dark:text-slate-400`}>{m.created_at ? formatDateTime(m.created_at) : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </ListPage>
    );
}
