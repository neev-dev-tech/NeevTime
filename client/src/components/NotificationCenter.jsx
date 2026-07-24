import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Plane, FileCheck, WifiOff, AlertTriangle, LogIn, X } from 'lucide-react';
import io from 'socket.io-client';
import api from '../api';

const MAX_FEED = 30;

/**
 * Header bell: pending-work counts (leave, regularizations, offline devices)
 * plus a live feed from Socket.IO (device alerts, punches).
 */
export default function NotificationCenter() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [summary, setSummary] = useState({ pending_leave: 0, pending_regularizations: 0, devices_offline: 0 });
    const [feed, setFeed] = useState([]);
    const [unseen, setUnseen] = useState(0);
    const socketRef = useRef(null);

    const fetchSummary = async () => {
        try {
            const res = await api.get('/api/notifications/summary');
            setSummary(res.data);
        } catch { /* header widget — fail silent */ }
    };

    useEffect(() => {
        fetchSummary();
        const poll = setInterval(fetchSummary, 60 * 1000);

        const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
        socketRef.current = io(socketUrl, { transports: ['websocket', 'polling'], path: '/socket.io' });

        const push = (item) => {
            setFeed(prev => [{ ...item, at: new Date() }, ...prev.slice(0, MAX_FEED - 1)]);
            setUnseen(n => n + 1);
        };

        socketRef.current.on('device_alerts', (alerts) => {
            (alerts || []).forEach(a => push({
                type: 'alert',
                title: a.device_name || a.device_serial || 'Device alert',
                text: a.message || a.alert_type || 'Health alert'
            }));
            fetchSummary();
        });

        socketRef.current.on('new_punch', (data) => {
            push({
                type: 'punch',
                title: data.employee_name || data.employee_code,
                text: `Punch on ${data.device_name || data.device_serial}`
            });
        });

        socketRef.current.on('device_status', () => fetchSummary());

        return () => {
            clearInterval(poll);
            socketRef.current?.disconnect();
        };
    }, []);

    const pendingTotal = summary.pending_leave + summary.pending_regularizations + summary.devices_offline;
    const badge = pendingTotal + unseen;

    const openPanel = () => {
        setOpen(v => !v);
        setUnseen(0);
        fetchSummary();
    };

    const go = (path) => {
        setOpen(false);
        navigate(path);
    };

    const ICONS = { alert: AlertTriangle, punch: LogIn };

    return (
        <div className="relative">
            <button
                onClick={openPanel}
                className="relative p-2 rounded-full hover:bg-orange-50 dark:hover:bg-slate-700 text-slate-400 hover:text-orange-500 transition-colors"
                aria-label="Notifications"
            >
                <Bell size={20} />
                {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 shadow-xl rounded-2xl overflow-hidden z-40 border border-orange-100 dark:border-slate-700">
                        <div className="px-4 py-3 border-b border-orange-50 dark:border-slate-700 bg-orange-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</p>
                            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" aria-label="Close">
                                <X size={14} />
                            </button>
                        </div>

                        {/* Pending work */}
                        <div className="py-1 border-b border-slate-100 dark:border-slate-700">
                            <button onClick={() => go('/leaves')} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-orange-50 dark:hover:bg-slate-700 text-left">
                                <span className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300"><Plane size={15} className="text-emerald-600" /> Pending leave requests</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${summary.pending_leave > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{summary.pending_leave}</span>
                            </button>
                            <button onClick={() => go('/regularizations')} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-orange-50 dark:hover:bg-slate-700 text-left">
                                <span className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300"><FileCheck size={15} className="text-orange-600" /> Pending regularizations</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${summary.pending_regularizations > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{summary.pending_regularizations}</span>
                            </button>
                            <button onClick={() => go('/devices')} className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-orange-50 dark:hover:bg-slate-700 text-left">
                                <span className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300"><WifiOff size={15} className="text-rose-600" /> Devices offline</span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${summary.devices_offline > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>{summary.devices_offline}</span>
                            </button>
                        </div>

                        {/* Live feed */}
                        <div className="max-h-64 overflow-y-auto">
                            {feed.length === 0 ? (
                                <p className="px-4 py-6 text-center text-xs text-slate-400">No live events yet — device alerts and punches appear here in real time.</p>
                            ) : feed.map((item, i) => {
                                const Icon = ICONS[item.type] || Bell;
                                return (
                                    <div key={i} className="px-4 py-2.5 flex items-start gap-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                                        <Icon size={14} className={item.type === 'alert' ? 'text-amber-500 mt-0.5' : 'text-emerald-500 mt-0.5'} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{item.title}</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.text}</p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 shrink-0">{item.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
