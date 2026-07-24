import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import io from 'socket.io-client';
import SkeletonLoader from '../components/SkeletonLoader';
import { RefreshCw, Inbox, Fingerprint, Clock, LogIn, LogOut } from 'lucide-react';
import { Button, PageHeader, ExportMenu } from '../components';
import { formatTimestamp } from '../utils/dateFormat';

export default function Logs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deviceMap, setDeviceMap] = useState({});
    const socketRef = useRef(null);

    const fetchLogs = async () => {
        try {
            if (logs.length === 0) setLoading(true);
            const res = await api.get('/api/logs?limit=100');
            setLogs(res.data || []);
        } catch (err) {
            console.error('Error fetching logs:', err);
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
            const dir = device.device_direction.toLowerCase();
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
            <span className={`badge-premium ${isOut ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'} inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-xs font-semibold`}>
                {isOut ? <LogOut size={12} /> : <LogIn size={12} />}
                {dir}
            </span>
        );
    };

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
                            onClick={() => { setLoading(true); fetchLogs(); fetchDevices(); }}
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                        </Button>
                    </>
                )}
            />
            <div className="report-container">
                {/* Content */}
                {loading && logs.length === 0 ? (
                    <div className="p-6">
                        <SkeletonLoader rows={10} columns={6} showHeader={true} />
                    </div>
                ) : (
                    <div className="table-premium-wrapper">
                        <table className="table-premium">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Time</th>
                                    <th>Log Type</th>
                                    <th>State</th>
                                    <th>Device</th>
                                    <th>Verification</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="table-empty-state">
                                                <div className="table-empty-icon"><Inbox size={40} /></div>
                                                <div className="table-empty-title">No logs found</div>
                                                <div className="table-empty-description">No attendance records are available at the moment.</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{log.emp_name || 'Unknown'}</span>
                                                    <span className="cell-code mt-1 w-fit">{log.employee_code}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="cell-timestamp">
                                                    <span className="cell-timestamp-date">{formatTimestamp(log.punch_time).date}</span>
                                                    <span className="cell-timestamp-time ml-2">{formatTimestamp(log.punch_time).time}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {renderDirection(log)}
                                            </td>
                                            <td>
                                                <span className="cell-status neutral font-mono text-xs">
                                                    {log.punch_state || '255'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="cell-device font-mono text-xs">{log.device_serial}</span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-purple-50 rounded-md">
                                                        <Fingerprint size={14} className="text-purple-600" />
                                                    </div>
                                                    <span className="text-sm text-slate-600 uppercase font-medium text-xs tracking-wider">{log.verification_mode || 'Unknown'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
