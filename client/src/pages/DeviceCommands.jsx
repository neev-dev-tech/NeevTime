import { useState, useEffect } from 'react';
import api from '../api';
import {
    TabletSmartphone, Send, RefreshCw, Users, Fingerprint, Database,
    Power, Trash2, Download, AlertTriangle, Wifi, WifiOff
} from 'lucide-react';
import { useToast, ExportMenu, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { confirm } from '../components/ConfirmDialog';
import { formatDateTime } from '../utils/dateFormat';

const HAIRLINE = 'border-slate-200 dark:border-slate-800';

// Status colour only on the dot; the word always sits beside it.
const STATUS_DOT = {
    success: 'bg-emerald-500',
    pending: 'bg-amber-400',
    sent: 'bg-slate-400',
    fail: 'bg-rose-500',
    failed: 'bg-rose-500'
};

export default function DeviceCommands() {
    const toast = useToast();
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [commands, setCommands] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sending, setSending] = useState({});

    useEffect(() => {
        fetchDevices();
        fetchCommandHistory();
    }, []);

    const fetchDevices = async () => {
        try {
            const res = await api.get('/api/devices');
            setDevices(res.data || []);
            if (res.data?.length > 0 && !selectedDevice) {
                setSelectedDevice(res.data[0]);
            }
        } catch (err) {
            console.error('Error fetching devices:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCommandHistory = async () => {
        try {
            const res = await api.get('/api/device-commands');
            setCommands(res.data || []);
        } catch (err) {
            console.error('Error fetching command history:', err);
        }
    };

    const commandList = [
        { id: 'INFO', label: 'Get Info', icon: TabletSmartphone, description: 'Get device information' },
        { id: 'CHECK', label: 'Check Connection', icon: Wifi, description: 'Check device connection' },
        { id: 'REBOOT', label: 'Restart Device', icon: Power, description: 'Reboot the device', destructive: true },
        { id: 'CLEAR LOG', label: 'Clear Logs', icon: Trash2, description: 'Clear attendance logs from device', destructive: true },
        { id: 'DATA QUERY USERINFO', label: 'Get Users', icon: Users, description: 'Download user list from device' },
        { id: 'DATA QUERY FINGERTMP', label: 'Get FP Templates', icon: Fingerprint, description: 'Download fingerprint templates' },
        { id: 'DATA QUERY ATTLOG', label: 'Get Logs', icon: Download, description: 'Fetch attendance logs' },
        { id: 'CLEAR DATA', label: 'Clear All Data', icon: Database, description: 'Factory reset device data', destructive: true },
    ];

    const sendCommand = async (commandId) => {
        if (!selectedDevice) {
            toast.warning('Please select a device');
            return;
        }

        const confirmCommands = ['CLEAR LOG', 'CLEAR DATA', 'REBOOT'];
        if (confirmCommands.includes(commandId)) {
            const cmdLabel = commandList.find(c => c.id === commandId)?.label;
            if (!(await confirm({ title: 'Run device command', confirmText: 'Run', type: 'danger', message: `Are you sure you want to execute "${cmdLabel}" on ${selectedDevice.device_name || selectedDevice.serial_number}?` }))) {
                return;
            }
        }

        setSending(prev => ({ ...prev, [commandId]: true }));
        try {
            await api.post('/api/device-commands', {
                device_serial: selectedDevice.serial_number,
                command: commandId,
                status: 'pending'
            });

            // Refresh command history
            fetchCommandHistory();

            // If fetching data commands, also refresh devices after delay
            if (['DATA QUERY USERINFO', 'DATA QUERY ATTLOG', 'INFO'].includes(commandId)) {
                setTimeout(fetchDevices, 3000);
            }

        } catch (err) {
            console.error('Error sending command:', err);
            toast.error('Error sending command: ' + (err.response?.data?.error || err.message));
        } finally {
            setSending(prev => ({ ...prev, [commandId]: false }));
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '-';
        return formatDateTime(timestamp);
    };

    // Filter commands for selected device
    const deviceCommands = selectedDevice
        ? commands.filter(c => c.device_serial === selectedDevice.serial_number)
        : commands;

    const onlineCount = devices.filter(d => d.status === 'online').length;

    return (
        <div className="-m-4 sm:-m-6 min-h-[calc(100%+2rem)] sm:min-h-[calc(100%+3rem)] flex flex-col bg-app-surface">
            {/* Title bar */}
            <div className={`flex items-center gap-x-4 gap-y-2 px-4 sm:px-6 min-h-14 py-2.5 border-b ${HAIRLINE} flex-wrap`}>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">Device Commands</h1>
                {!loading && devices.length > 0 && (
                    <span className="text-[13px] text-slate-600 dark:text-slate-400 tabular-nums">
                        {devices.length} device{devices.length === 1 ? '' : 's'} · {onlineCount} online
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <ExportMenu
                        rows={deviceCommands}
                        columns={[
                            { key: 'device_serial', label: 'Device' },
                            { key: 'command', label: 'Command' },
                            { key: 'status', label: 'Status' },
                            { key: 'created_at', label: 'Time' }
                        ]}
                        filename="device_commands"
                        title="Device Commands"
                    />
                    <ListIconButton
                        label="Refresh"
                        icon={RefreshCw}
                        spin={refreshing}
                        disabled={refreshing}
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setRefreshing(true);
                            try {
                                await Promise.all([fetchDevices(), fetchCommandHistory()]);
                            } catch (err) {
                                console.error('Refresh error:', err);
                            } finally {
                                setRefreshing(false);
                            }
                        }}
                    />
                </div>
            </div>

            <div className="flex-1 grid md:grid-cols-[300px_minmax(0,1fr)] min-h-0">
                {/* Devices */}
                <div className={`min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r ${HAIRLINE}`}>
                    <div className={`sticky top-0 z-10 px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b ${HAIRLINE}`}>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400">
                            Devices
                        </span>
                    </div>
                    {loading ? (
                        <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading devices">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                            ))}
                        </div>
                    ) : devices.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <WifiOff className="mx-auto mb-2 text-slate-300 dark:text-slate-600" size={28} />
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">No devices registered</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Add devices in Device Management</p>
                        </div>
                    ) : (
                        <ul>
                            {devices.map(device => {
                                const on = selectedDevice?.serial_number === device.serial_number;
                                const online = device.status === 'online';
                                return (
                                    <li key={device.serial_number} className="relative">
                                        {on && <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[rgb(var(--brand))]" />}
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDevice(device)}
                                            aria-current={on ? 'true' : undefined}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-100 dark:border-slate-800/70 ${on ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                                        >
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                                    {device.device_name || 'Unnamed Device'}
                                                </span>
                                                <span className="block font-mono text-xs text-slate-600 dark:text-slate-400 truncate">
                                                    {device.serial_number}
                                                </span>
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 shrink-0 text-xs text-slate-600 dark:text-slate-400">
                                                <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                                {online ? 'Online' : 'Offline'}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Selected device */}
                <div className="min-h-0 overflow-y-auto">
                    {selectedDevice && (
                        <>
                            <div className="px-4 sm:px-6 pt-5 pb-4">
                                <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate">
                                    {selectedDevice.device_name || 'Unnamed Device'}
                                </h2>
                                <p className="mt-0.5 flex items-center gap-x-2 gap-y-1 flex-wrap text-[13px] text-slate-600 dark:text-slate-400">
                                    <span className="font-mono">{selectedDevice.serial_number}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums">IP {selectedDevice.ip_address || 'N/A'}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-1.5 capitalize">
                                        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${selectedDevice.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                        {selectedDevice.status || 'Unknown'}
                                    </span>
                                </p>
                            </div>

                            <div className={`grid grid-cols-2 sm:grid-cols-4 border-y ${HAIRLINE} divide-x divide-slate-200 dark:divide-slate-800`}>
                                {[
                                    ['Users', selectedDevice.user_count],
                                    ['Fingerprints', selectedDevice.fingerprint_count],
                                    ['Faces', selectedDevice.face_count],
                                    ['Transactions', selectedDevice.transaction_count]
                                ].map(([label, value]) => (
                                    <div key={label} className="px-4 sm:px-6 py-3">
                                        <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                        <span className="block mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                                            {Number(value || 0).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Commands */}
                    <section className={`border-b ${HAIRLINE}`}>
                        <h3 className="px-4 sm:px-6 pt-5 pb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Commands</h3>
                        <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border-t ${HAIRLINE}`}>
                            {commandList.map(cmd => (
                                <button
                                    key={cmd.id}
                                    type="button"
                                    onClick={() => sendCommand(cmd.id)}
                                    disabled={sending[cmd.id] || !selectedDevice}
                                    title={cmd.description}
                                    className="flex items-start gap-3 px-4 sm:px-6 py-3.5 text-left bg-app-surface hover:bg-slate-50 dark:hover:bg-slate-800/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${cmd.destructive
                                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {sending[cmd.id]
                                            ? <RefreshCw size={16} className="animate-spin" />
                                            : <cmd.icon size={16} />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block text-sm font-medium ${cmd.destructive ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                            {sending[cmd.id] ? 'Sending…' : cmd.label}
                                        </span>
                                        <span className="block text-xs text-slate-600 dark:text-slate-400">{cmd.description}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                        <p className={`flex items-start gap-2 px-4 sm:px-6 py-2.5 border-t ${HAIRLINE} bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300`}>
                            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden="true" />
                            <span>
                                <strong className="font-semibold">Irreversible:</strong> Clear Logs, Clear All Data and Restart Device
                                cannot be undone. Make sure the device is connected and use with caution.
                            </span>
                        </p>
                    </section>

                    {/* Command history */}
                    <section className="pb-6">
                        <div className="px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Command history
                                {deviceCommands.length > 0 && (
                                    <span className="ml-2 text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums">{deviceCommands.length}</span>
                                )}
                            </h3>
                            <ListIconButton
                                label="Refresh command history"
                                icon={RefreshCw}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    await fetchCommandHistory();
                                }}
                            />
                        </div>
                        {deviceCommands.length === 0 ? (
                            <div className={`px-4 sm:px-6 py-10 text-center border-t ${HAIRLINE}`}>
                                <Send size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">No commands sent yet</p>
                                <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
                                    Select a device, then send it a command to see the history here.
                                </p>
                            </div>
                        ) : (
                            <div className="max-h-96 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className={`${LIST_THEAD} border-t`}>
                                        <tr>
                                            <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Command</th>
                                            {!selectedDevice && <th className={LIST_TH}>Device</th>}
                                            <th className={LIST_TH}>Status</th>
                                            <th className={`${LIST_TH} ${LIST_EDGE_LAST} !text-right`}>Sent</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {deviceCommands.slice(0, 20).map(cmd => (
                                            <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className={`${LIST_EDGE_FIRST} px-4 py-2.5 font-mono text-xs text-slate-800 dark:text-slate-200 break-all`}>
                                                    {cmd.command}
                                                </td>
                                                {!selectedDevice && (
                                                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{cmd.device_serial}</td>
                                                )}
                                                <td className="px-4 py-2.5 whitespace-nowrap">
                                                    <span className="inline-flex items-center gap-1.5 text-[13px] capitalize text-slate-700 dark:text-slate-300">
                                                        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[cmd.status] || 'bg-slate-400'}`} />
                                                        {cmd.status}
                                                    </span>
                                                </td>
                                                <td className={`${LIST_EDGE_LAST} px-4 py-2.5 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap`}>
                                                    {formatTime(cmd.created_at)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
