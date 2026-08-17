import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import io from 'socket.io-client';
import { RefreshCw, Inbox, Fingerprint, Clock, LogIn, LogOut, AlertCircle } from 'lucide-react';
import { Button, PageHeader, ExportMenu } from '../components';
import { formatTimestamp } from '../utils/dateFormat';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

/**
 * A punch photo, fetched rather than linked.
 *
 * /api/mobile requires an admin token, and the token lives in memory for the
 * API client to attach — an <img src> sends no Authorization header, so every
 * thumbnail came back 401 and the browser drew the alt text. Fetching through
 * the same client and handing the bytes to the tag as a blob keeps the route
 * authenticated, which is the point: these are photographs of employees and
 * must not be readable by anyone who guesses a filename.
 *
 * The object URL is revoked on unmount; a table of these would otherwise hold
 * every image it ever showed.
 */
const PunchPhoto = ({ name, alt, className }) => {
    const [src, setSrc] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let url = null;
        let cancelled = false;
        api.get(`/api/mobile/punch-photo/${name}`, { responseType: 'blob' })
            .then((res) => {
                if (cancelled) return;
                url = URL.createObjectURL(res.data);
                setSrc(url);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [name]);

    // Retention deletes the file and clears photo_path, so a missing image
    // usually means the row is mid-purge rather than that anything is broken.
    if (failed) return <span className="text-xs text-slate-400 dark:text-slate-500">gone</span>;
    if (!src) return <span className={`${className} block animate-pulse bg-slate-100 dark:bg-slate-700`} />;
    return <img src={src} alt={alt} className={className} />;
};

export default function Logs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [deviceMap, setDeviceMap] = useState({});
    const [photo, setPhoto] = useState(null);   // the log whose photo is being reviewed
    const socketRef = useRef(null);

    const fetchLogs = async () => {
        try {
            if (logs.length === 0) setLoading(true);
            const res = await api.get('/api/logs?limit=100');
            setLogs(res.data || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching logs:', err);
            setError(err.response?.data?.error || 'Could not load attendance logs');
        } finally {
            setLoading(false);
        }
    };

    const fetchDevices = async () => {
        try {
            const res = await api.get('/api/devices');
            // Create a map for quick lookup: normalized serial -> device object
            const map = (res.data || []).reduce((acc, dev) => {
                if (dev.serial_number) {
                    acc[dev.serial_number.trim()] = dev;
                }
                return acc;
            }, {});
            console.log('Devices loaded:', map);
            setDeviceMap(map);
        } catch (err) {
            console.error('Error fetching devices:', err);
        }
    };

    useEffect(() => {
        fetchDevices();
        fetchLogs();

        const socketUrl = window.location.origin.includes('5173')
            ? 'http://localhost:3001'
            : window.location.origin;

        socketRef.current = io(socketUrl, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            timeout: 20000,
        });

        socketRef.current.on('new_punch', () => {
            fetchLogs();
            fetchDevices(); // Refresh devices strategies
        });

        const interval = setInterval(() => {
            fetchLogs();
            fetchDevices(); // Periodically ensure device config is up to date
        }, 30000);

        return () => {
            clearInterval(interval);
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const getDirection = (log) => {
        if (!log) return 'IN';

        const state = parseInt(log.punch_state);

        // 1. Explicit State Logic (Standard ZK)
        // IN States: 0 (CheckIn), 4 (OT-In), 8 (Meal-In), 3 (Break-In)
        if ([0, 3, 4, 8].includes(state)) return 'IN';

        // OUT States: 1 (CheckOut), 5 (OT-Out), 9 (Meal-Out), 2 (Break-Out)
        if ([1, 2, 5, 9].includes(state)) return 'OUT';

        // 2. Fallback to Device Logic (for state 255/Undefined)
        const serial = log.device_serial ? log.device_serial.trim() : '';
        const device = deviceMap[serial];

        if (device && device.device_direction) {
            const dir = String(device.device_direction ?? '').toLowerCase();
            if (dir === 'out') return 'OUT';
            if (dir === 'in') return 'IN';
            // If 'both' or 'none', stick to default
        }

        // 3. Default fallback
        return 'IN';
    };

    const renderDirection = (log) => {
        const dir = getDirection(log);
        const isOut = dir === 'OUT';
        return (
            <span className={`${BADGE_BASE} gap-1 ${isOut
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                {isOut ? <LogOut size={10} /> : <LogIn size={10} />}
                {dir}
            </span>
        );
    };

    const refresh = () => { setLoading(true); fetchLogs(); fetchDevices(); };

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={Clock}
                title="Attendance Logs"
                subtitle={`${logs.length} records`}
                actions={(
                    <>
                        <ExportMenu
                            rows={logs}
                            columns={[
                                { key: 'employee_code', label: 'Employee Code' },
                                { key: 'emp_name', label: 'Employee Name' },
                                { key: 'punch_time', label: 'Time' },
                                { key: 'direction', label: 'Direction' },
                                { key: 'punch_state', label: 'State Code' },
                                { key: 'device_serial', label: 'Device' },
                                { key: 'verification_mode', label: 'Verification' }
                            ]}
                            filename="attendance_logs"
                            title="Attendance Logs"
                            mapRow={(log) => ({ ...log, direction: getDirection(log) })}
                        />
                        <Button
                            variant="secondary"
                            onClick={refresh}
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                        </Button>
                    </>
                )}
            />

            <div className="card-base !p-0 overflow-hidden">
                {loading && logs.length === 0 ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error && logs.length === 0 ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load logs</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Try again</Button>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-16 text-center">
                        <Inbox size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No logs found</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            No attendance records are available at the moment.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Code</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Time</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Log Type</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">State</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Device</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Verification</th>
                                    {/* The whole point of capturing a photo is that somebody can
                                        look at it. Stored and served since this morning, and
                                        displayed nowhere — which reduces buddy punching not at
                                        all. */}
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Photo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {logs.map((log, i) => (
                                    <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {log.emp_name || 'Unknown'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {log.employee_code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                {formatTimestamp(log.punch_time).date}
                                            </span>
                                            <span className="font-mono text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200 ml-2">
                                                {formatTimestamp(log.punch_time).time}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            {renderDirection(log)}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`${BADGE_BASE} tabular-nums font-mono bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300`}>
                                                {log.punch_state || '255'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                {log.device_serial || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded-md">
                                                    <Fingerprint size={14} className="text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <span className="text-xs uppercase tracking-wide font-medium text-slate-600 dark:text-slate-300">
                                                    {log.verification_mode || 'Unknown'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            {log.photo_path ? (
                                                <button
                                                    onClick={() => setPhoto(log)}
                                                    className="block"
                                                    title="Taken at the moment of this punch"
                                                >
                                                    <PunchPhoto
                                                        name={log.photo_path}
                                                        alt={`Punch by ${log.emp_name || log.employee_code}`}
                                                        className="h-10 w-10 rounded-md object-cover border border-slate-200 dark:border-slate-700"
                                                    />
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Full size, with who and when beside it — a thumbnail is enough to
                    see that a photo exists and not enough to tell who it is, and
                    telling who it is is the reason the photo was taken. */}
                {photo && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                        onClick={() => setPhoto(null)}
                    >
                        <div
                            className="max-w-lg w-full rounded-2xl bg-white dark:bg-slate-800 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <PunchPhoto
                                name={photo.photo_path}
                                alt={`Punch by ${photo.emp_name || photo.employee_code}`}
                                className="w-full"
                            />
                            <div className="p-4 space-y-1">
                                <p className="font-semibold text-slate-800 dark:text-slate-100">
                                    {photo.emp_name || 'Unknown'}{' '}
                                    <span className="font-mono text-xs text-slate-500">{photo.employee_code}</span>
                                </p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                                    {formatTimestamp(photo.punch_time).datetime}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {photo.is_geofence_verified
                                        ? 'Inside an approved work location'
                                        : 'Location was not verified'}
                                </p>
                                <button
                                    onClick={() => setPhoto(null)}
                                    className="mt-2 text-sm underline text-slate-600 dark:text-slate-300"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!loading && logs.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {logs.length} record{logs.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>
        </div>
    );
}
