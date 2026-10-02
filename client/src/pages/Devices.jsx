import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import io from 'socket.io-client';
import {
    RefreshCw, Plus, Edit2, Trash2,
    Wifi, WifiOff,
    Upload, FileText,
    Database, FileSpreadsheet, Inbox, ShieldAlert, TabletSmartphone, Settings2
} from 'lucide-react';
import { TableSkeleton } from '../components/SkeletonLoader';
import { useToast, Button, ListPage, ListSearch, ListSelection, ListMenu, ListMenuItem, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import Modal from '../components/Modal';
import { exportToExcel, exportToCSV } from '../utils/excelExport';
import { formatDate, toLocalDateString, formatDateTime } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

// ==========================================
// Sub-Components for Data Views
// ==========================================

const DataView = ({ title, endpoint, columns }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(null);

    // Display-only search and paging; exports still use the full list.
    const pager = useTableControls(data, {
        searchKeys: columns.map(c => c.key),
        pageSize: 50
    });

    useEffect(() => {
        fetchData();
    }, [endpoint]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(endpoint);
            setData(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        setExporting('csv');
        try {
            await exportToCSV({
                data,
                filename: `${title.replace(/\s+/g, '_').toLowerCase()}_${toLocalDateString()}`,
                headers: columns.map(col => ({ key: col.key, label: col.label })),
                onSuccess: () => setExporting(null),
                onError: () => setExporting(null)
            });
        } catch (err) {
            console.error(err);
        } finally {
            setExporting(null);
        }
    };

    const handleExportXLSX = async () => {
        setExporting('xlsx');
        try {
            await exportToExcel({
                data,
                filename: `${title.replace(/\s+/g, '_').toLowerCase()}_${toLocalDateString()}`,
                sheetName: title,
                headers: columns.map(col => ({ key: col.key, label: col.label })),
                onSuccess: () => setExporting(null),
                onError: () => setExporting(null)
            });
        } catch (err) {
            console.error(err);
        } finally {
            setExporting(null);
        }
    };

    // Cell renderer with styling
    const renderCell = (col, row, colIndex) => {
        const value = col.render ? col.render(row) : row[col.key];

        // Apply styling based on column type or index
        if (colIndex === 0 && typeof value === 'number') {
            return <span className="cell-id">{value}</span>;
        }

        if (col.key === 'employee_code' || col.key === 'emp_code') {
            return <span className="cell-code">{value || '-'}</span>;
        }

        if (col.key === 'employee_name' || col.key === 'emp_name' || col.key === 'name') {
            return <span className="cell-name">{value || '-'}</span>;
        }

        if (col.key === 'type' || col.key === 'type_name') {
            const typeClass = String(value).toLowerCase().includes('finger') ? 'fingerprint' :
                String(value).toLowerCase().includes('face') ? 'face' : '';
            return <span className={`cell-type ${typeClass}`}>{value || '-'}</span>;
        }

        if (col.key === 'source_device' || col.key === 'device_name' || col.key === 'device_serial') {
            return <span className="cell-device">{value || '-'}</span>;
        }

        if (col.key === 'template_no') {
            return <span className="cell-number">{value || '-'}</span>;
        }

        if (col.key === 'punch_state' || col.key === 'state') {
            return value || '-';
        }

        // Default rendering with timestamp detection
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
            const date = new Date(value);
            return (
                <div className="cell-timestamp">
                    <span className="cell-timestamp-date">{formatDate(date)}</span>
                    <span className="cell-timestamp-time"> {date.toLocaleTimeString()}</span>
                </div>
            );
        }

        return value || '-';
    };

    return (
        <ListPage
            title={title}
            count={loading ? undefined : data.length}
            actions={data.length > 0 && (
                <>
                    <Button
                        variant="tonal"
                        size="toolbar"
                        onClick={handleExportCSV}
                        disabled={exporting === 'csv'}
                    >
                        {exporting === 'csv' ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <FileText size={14} />
                        )}
                        CSV
                    </Button>
                    <Button
                        variant="tonal"
                        size="toolbar"
                        onClick={handleExportXLSX}
                        disabled={exporting === 'xlsx'}
                    >
                        {exporting === 'xlsx' ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <FileSpreadsheet size={14} />
                        )}
                        Excel
                    </Button>
                </>
            )}
            toolbar={
                <>
                    <ListSearch label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} value={pager.query} onChange={pager.setQuery} />
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton
                            label="Refresh"
                            icon={RefreshCw}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchData();
                            }}
                            disabled={loading}
                            spin={loading}
                        />
                    </div>
                </>
            }
            footer={loading ? null : <TablePager controls={pager} noun="record" />}
        >
                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={10} cols={columns.length} />
                    </div>
                ) : pager.matched === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <Inbox size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records found</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            There are no {title.toLowerCase()} to display at this time.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className={LIST_THEAD}>
                            <tr>
                                {columns.map((col, i) => (
                                    <th key={i} className={`${LIST_TH} ${i === 0 ? LIST_EDGE_FIRST : ''} ${i === columns.length - 1 ? LIST_EDGE_LAST : ''}`}>{col.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pager.view.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    {columns.map((col, j) => (
                                        <td key={j} className={`py-3 text-slate-600 dark:text-slate-300 ${j === 0 ? LIST_EDGE_FIRST : 'pl-4'} ${j === columns.length - 1 ? LIST_EDGE_LAST : 'pr-4'}`}>
                                            {renderCell(col, row, j)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </ListPage>
    );
};

// ==========================================
// Main Devices Component (Layout)
// ==========================================

export default function Devices() {
    const toastApi = useToast();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const activeView = searchParams.get('view') || 'devices';

    // Original Device State
    const [devices, setDevices] = useState([]);
    const [areas, setAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingDevice, setEditingDevice] = useState(null);
    const [syncing, setSyncing] = useState({});
    const [approving, setApproving] = useState({});

    // A first-seen serial arrives as pending; approving it is what makes its
    // punches trusted once require_device_approval is enabled.
    const approveDevice = async (serial) => {
        setApproving(prev => ({ ...prev, [serial]: true }));
        try {
            await api.post(`/api/devices/${serial}/approve`, { approved: true });
            showToast(`${serial} approved`, 'success');
            fetchDevices();
        } catch (err) {
            showToast(err.response?.data?.error || 'Could not approve device', 'error');
        } finally {
            setApproving(prev => ({ ...prev, [serial]: false }));
        }
    };

    const [selectedDevices, setSelectedDevices] = useState([]);
    // The device shown in the detail pane.
    const [activeSerial, setActiveSerial] = useState(null);
    const navigate = useNavigate();
    const [syncingAll, setSyncingAll] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [confirmation, setConfirmation] = useState({ show: false, action: null, title: '', message: '', target: null });
    const socketRef = useRef(null);

    // Toast notification state
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);
    const showToast = (message, type = 'info') => {
        // Clear any existing timeout
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ message, type });
        // Show toast for 8 seconds for better visibility
        toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
            toastTimeoutRef.current = null;
        }, 8000);
    };

    const defaultForm = {
        serial_number: '', device_name: '', ip_address: '', port: 4370, area_id: '',
        transfer_mode: 'realtime', timezone: 'Etc/GMT+5:30', is_registration_device: true,
        is_attendance_device: true, connection_interval: 10, device_direction: 'both', enable_access_control: false
    };
    const [form, setForm] = useState(defaultForm);

    useEffect(() => {
        if (activeView === 'devices') {
            fetchDevices();
            fetchAreas();

            // Setup socket for real-time device status updates
            // Disconnect existing socket if any (prevents duplicates in React StrictMode)
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            // Use relative path to work with Vite proxy
            const socketUrl = window.location.origin.includes('5173')
                ? 'http://localhost:3001'  // Direct connection in dev
                : window.location.origin;   // Use proxy in production

            socketRef.current = io(socketUrl, {
                // The live feed needs a staff token, like the API.
                auth: (cb) => cb({ token: localStorage.getItem('token') }),
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                timeout: 20000,
                forceNew: true  // Force new connection to avoid reusing old connections
            });

            socketRef.current.on('connect', () => {
                console.log('[Devices] Socket connected for real-time updates');
            });

            socketRef.current.on('disconnect', (reason) => {
                // In development, React StrictMode causes disconnects - this is normal
                if (reason === 'io client disconnect') {
                    console.log('[Devices] Socket disconnected (likely React StrictMode in dev)');
                } else {
                    console.log('[Devices] Socket disconnected:', reason);
                }
                // Socket will auto-reconnect if reconnection is enabled
            });

            socketRef.current.on('reconnect', (attemptNumber) => {
                console.log(`[Devices] Socket reconnected after ${attemptNumber} attempts`);
            });

            socketRef.current.on('connect_error', (error) => {
                console.error('[Devices] Socket connection error:', error.message);
            });

            socketRef.current.on('device_status', (data) => {
                // Update device status in real-time when socket event is received
                setDevices(prevDevices =>
                    prevDevices.map(device =>
                        device.serial_number === data.serial
                            ? { ...device, status: data.status }
                            : device
                    )
                );
            });

            const interval = setInterval(fetchDevices, 10000);
            return () => {
                clearInterval(interval);
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.disconnect();
                    socketRef.current = null;
                }
            };
        }
    }, [activeView]);

    const fetchDevices = async () => {
        try {
            const res = await api.get('/api/devices');
            setDevices(res.data || []);
        } catch (err) {
            console.error('Failed to fetch devices:', err);
            showToast('Failed to refresh devices', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchAreas = async () => {
        try {
            const res = await api.get('/api/areas');
            setAreas(res.data || []);
        } catch (err) { console.error(err); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingDevice) await api.put(`/api/devices/${editingDevice.serial_number}`, form);
            else await api.post('/api/devices', form);
            fetchDevices();
            closeModal();
        } catch (err) { toastApi.error(err.response?.data?.error); }
    };

    const handleDelete = (serial) => {
        setConfirmation({
            show: true,
            action: 'delete',
            title: 'Retire Device',
            message: 'The device is removed from the active fleet and stops accepting commands. Its attendance history is kept.',
            target: serial
        });
    };

    const processDataTransfer = async () => {
        const { action, target } = confirmation;

        try {
            if (action === 'delete') {
                if (!target) {
                    showToast('Error: No device selected for deletion', 'error');
                    return;
                }
                const res = await api.delete(`/api/devices/${target}`);
                const kept = res.data?.preserved_logs;
                showToast(
                    kept ? `Device retired — ${kept.toLocaleString()} punch records kept` : 'Device retired',
                    'success'
                );
            } else {
                const endpointMap = {
                    'download-users': '/api/devices/sync/download-users',
                    'download-logs': '/api/devices/sync/download-logs',
                    'upload-users': '/api/devices/sync/upload-users',
                    'reboot': '/api/devices/sync/reboot'
                };
                const res = await api.post(endpointMap[action], { device_serials: selectedDevices });
                showToast(res.data.message, 'success');
                setSelectedDevices([]);
            }
        } catch (err) {
            showToast('Operation failed: ' + err.message, 'error');
        } finally {
            setConfirmation({ show: false, action: null, title: '', message: '', target: null });
            fetchDevices();
        }
    };

    // Sync All Devices Handler
    const syncAllDevices = async (action) => {
        setSyncingAll(true);
        try {
            const endpointMap = {
                'upload-users': '/api/devices/sync/all/upload-users',
                'download-users': '/api/devices/sync/all/download-users',
                'download-logs': '/api/devices/sync/all/download-logs',
                'upload-biometrics': '/api/devices/sync/all/upload-biometrics',
                'download-biometrics': '/api/devices/sync/all/download-biometrics'
            };
            const res = await api.post(endpointMap[action]);
            showToast(res.data.message, 'success');
        } catch (err) {
            showToast(err.response?.data?.error || err.message, 'error');
        } finally {
            setSyncingAll(false);
            fetchDevices();
        }
    };

    const closeModal = () => { setShowModal(false); setEditingDevice(null); setForm(defaultForm); };
    const syncDevice = async (sn, cmd) => {
        setSyncing(prev => ({ ...prev, [sn]: cmd }));
        try { await api.post('/api/device-commands', { device_serial: sn, command: cmd }); setTimeout(() => { fetchDevices(); setSyncing(p => ({ ...p, [sn]: null })); }, 2000); } catch (e) { showToast(`Could not queue ${cmd} for ${sn}: ${e.response?.data?.error || e.message}`, 'error'); setSyncing(p => ({ ...p, [sn]: null })); }
    };

    // Helper functions
    const timeSince = (d) => d ? Math.floor((new Date() - new Date(d)) / 60000) + 'm ago' : 'Never';
    const getDirectionLabel = (d) => d === 'in' ? 'IN' : d === 'out' ? 'OUT' : 'IN/OUT';

    // Readers a human still has to accept. Worth a banner and not only the row
    // badge: once require_device_approval is on, punches from an unapproved
    // reader are refused — and because the reader is still ACKed and clears its
    // buffer, they are gone. Approving later does not backfill them.
    // Online first, then by name, so the list reads as fleet health.
    const orderedDevices = [...devices].sort((a, b) =>
        (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1)
        || String(a.device_name || '').localeCompare(String(b.device_name || '')));
    const onlineCount = devices.filter(d => d.status === 'online').length;
    const activeDevice = orderedDevices.find(d => d.serial_number === activeSerial) || orderedDevices[0] || null;

    const testConnection = async (sn) => {
        try {
            showToast('Testing connection...', 'info');
            const res = await api.post(`/api/devices/${sn}/test-connection`);
            showToast(`${res.data.message}: ${res.data.details}`, res.data.success ? 'success' : 'error');
        } catch (err) {
            showToast('Test failed to run', 'error');
        }
    };
    const forceOnline = async (sn) => {
        try {
            await api.post(`/api/devices/${sn}/force-online`);
            showToast('Device marked as online', 'success');
            fetchDevices();
        } catch (err) {
            showToast('Failed to force online', 'error');
        }
    };

    const awaitingApproval = devices.filter(
        d => d.approval_status === 'pending' && d.status !== 'retired'
    );

    const renderContent = () => {
        switch (activeView) {
            case 'devices':
                return (
                    <ListPage
                        title="Connected Devices"
                        count={devices.length}
                        actions={
                            <>
                                <ListMenu
                                    label={syncingAll ? 'Syncing…' : 'Sync All Devices'}
                                    icon={syncingAll ? RefreshCw : Upload}
                                    width="w-72"
                                    emptyHint={syncingAll ? 'A sync is already running.' : null}
                                >
                                    <ListMenuItem onClick={() => syncAllDevices('upload-users')}>Push Users to All Devices</ListMenuItem>
                                    <ListMenuItem onClick={() => syncAllDevices('download-users')}>Pull Users from All Devices</ListMenuItem>
                                    <ListMenuItem onClick={() => syncAllDevices('upload-biometrics')}>Push Biometrics to All Devices</ListMenuItem>
                                    <ListMenuItem onClick={() => syncAllDevices('download-biometrics')}>Pull Biometrics from All Devices</ListMenuItem>
                                    <ListMenuItem onClick={() => syncAllDevices('download-logs')}>Pull Logs from All Devices</ListMenuItem>
                                </ListMenu>
                                <Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => setShowModal(true)}>
                                    Add Device
                                </Button>
                            </>
                        }
                        toolbarActive={selectedDevices.length > 0}
                        toolbar={
                            <>
                                <ListSelection count={selectedDevices.length} onClear={() => setSelectedDevices([])} />
                                <div className="ml-auto flex items-center gap-2 flex-wrap">
                                    <ListMenu
                                        label="Selected Devices"
                                        width="w-64"
                                        emptyHint={selectedDevices.length ? null : 'Tick one or more devices first.'}
                                    >
                                        {['download-users', 'download-logs', 'upload-users', 'reboot'].map(action => (
                                            <ListMenuItem key={action} onClick={() => initiateDataTransfer(action)}>
                                                <span className="capitalize">{action.replace('-', ' ')}</span>
                                            </ListMenuItem>
                                        ))}
                                    </ListMenu>
                                    <ListIconButton
                                        label="Refresh"
                                        icon={RefreshCw}
                                        onClick={async (e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setRefreshing(true);
                                            try {
                                                await Promise.all([fetchDevices(), fetchAreas()]);
                                                showToast('Devices refreshed successfully', 'success');
                                            } catch (err) {
                                                console.error('Refresh error:', err);
                                                showToast('Failed to refresh devices', 'error');
                                            } finally {
                                                setRefreshing(false);
                                            }
                                        }}
                                        disabled={refreshing}
                                        spin={refreshing}
                                    />
                                </div>
                            </>
                        }
                        bodyClassName="!overflow-hidden"
                    >
                    <div className="flex flex-col h-full min-h-0">
                        {awaitingApproval.length > 0 && (
                            <div role="alert" className="flex items-start gap-3 px-4 sm:px-6 py-3 border-b border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40">
                                <ShieldAlert size={18} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0 text-sm">
                                    <p className="font-semibold text-rose-900 dark:text-rose-200">
                                        {awaitingApproval.length} device{awaitingApproval.length === 1 ? '' : 's'} awaiting approval:{' '}
                                        <span className="font-mono font-normal">{awaitingApproval.map(d => d.serial_number).join(', ')}</span>
                                    </p>
                                    <p className="text-[13px] text-rose-800 dark:text-rose-300">
                                        While device approval is enforced, punches from an unapproved reader are refused and cannot be
                                        recovered afterwards. Approve it, or retire it if you do not recognise the serial.
                                    </p>
                                </div>
                            </div>
                        )}
                        {devices.length === 0 ? (
                            <div className="py-20 text-center px-6">
                                <TabletSmartphone size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">No devices yet</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                                    Set the device's Cloud Server address to this server and it appears here on its first connection. You can also add it by serial number.
                                </p>
                            </div>
                        ) : (
                        <div className="grid md:grid-cols-[300px_minmax(0,1fr)] flex-1 min-h-0">
                            {/* Device list */}
                            <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
                                <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                    <input
                                        type="checkbox"
                                        aria-label="Select all devices"
                                        checked={devices.length > 0 && devices.every(d => selectedDevices.includes(d.serial_number))}
                                        onChange={e => setSelectedDevices(e.target.checked ? devices.map(d => d.serial_number) : [])}
                                    />
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400">
                                        {onlineCount} online · {devices.length - onlineCount} offline
                                    </span>
                                </div>
                                <ul>
                                    {orderedDevices.map(device => {
                                        const isOnline = device.status === 'online';
                                        const on = activeDevice?.serial_number === device.serial_number;
                                        return (
                                            <li key={device.serial_number} className="relative">
                                                {on && <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[rgb(var(--brand))]" />}
                                                <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800/70 ${on ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Select ${device.device_name}`}
                                                        checked={selectedDevices.includes(device.serial_number)}
                                                        onChange={() => setSelectedDevices(prev => prev.includes(device.serial_number)
                                                            ? prev.filter(s => s !== device.serial_number)
                                                            : [...prev, device.serial_number])}
                                                    />
                                                    <button type="button" onClick={() => setActiveSerial(device.serial_number)} className="flex-1 min-w-0 text-left">
                                                        <span className="flex items-center gap-2">
                                                            <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{device.device_name || device.serial_number}</span>
                                                            {device.approval_status === 'pending' && (
                                                                <span className="px-1.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">New</span>
                                                            )}
                                                        </span>
                                                        <span className="block pl-4 text-xs text-slate-600 dark:text-slate-400 truncate">
                                                            <span className="font-mono">{device.serial_number}</span> · {isOnline ? 'Online' : `Seen ${timeSince(device.last_activity)}`}
                                                        </span>
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>

                            {/* Selected device */}
                            {activeDevice && (() => {
                                const device = activeDevice;
                                const isOnline = device.status === 'online';
                                const sn = device.serial_number;
                                const yes = (v) => (v ? 'Yes' : 'No');
                                const details = [
                                    ['Serial number', <span key="s" className="font-mono">{sn}</span>],
                                    ['IP address', device.ip_address ? <span key="i" className="font-mono">{device.ip_address}{device.port ? `:${device.port}` : ''}</span> : '—'],
                                    ['Area', device.area_name || 'Unassigned'],
                                    ['Direction', getDirectionLabel(device.device_direction)],
                                    ['Model', device.detected_model || device.device_model || '—'],
                                    ['Firmware', device.detected_firmware || device.firmware_version || '—'],
                                    ['Vendor', device.vendor || '—'],
                                    ['Transfer mode', device.transfer_mode || '—'],
                                    ['Last activity', device.last_activity ? formatDateTime(device.last_activity) : 'Never'],
                                    ['Last sync', device.last_sync ? formatDateTime(device.last_sync) : 'Never'],
                                    ['First seen', device.first_seen_at ? formatDateTime(device.first_seen_at) : '—'],
                                    ['Supports', [device.finger_supported && 'Fingerprint', device.face_supported && 'Face', device.palm_supported && 'Palm', device.card_supported && 'Card'].filter(Boolean).join(', ') || '—'],
                                    ['Attendance device', yes(device.is_attendance_device)],
                                    ['Registration device', yes(device.is_registration_device)],
                                    ['Access control', yes(device.enable_access_control)]
                                ];
                                return (
                                    <div className="min-h-0 overflow-y-auto">
                                        <div className="flex items-start justify-between gap-4 px-4 sm:px-6 pt-5 pb-4 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${isOnline ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                    {isOnline ? <Wifi size={19} /> : <WifiOff size={19} />}
                                                </span>
                                                <div className="min-w-0">
                                                    <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate">{device.device_name || sn}</h2>
                                                    <p className="text-[13px] text-slate-600 dark:text-slate-400">
                                                        <span className={`font-medium ${isOnline ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{isOnline ? 'Online' : 'Offline'}</span>
                                                        {' · '}{isOnline ? 'connected now' : `last seen ${timeSince(device.last_activity)}`}
                                                        {' · '}{getDirectionLabel(device.device_direction)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Button variant="tonal" size="toolbar" icon={RefreshCw}
                                                    onClick={() => syncDevice(sn, 'INFO')} disabled={Boolean(syncing[sn])}>
                                                    {syncing[sn] ? 'Syncing…' : 'Sync'}
                                                </Button>
                                                <ListMenu label="More" icon={Settings2} width="w-56">
                                                    <ListMenuItem onClick={() => navigate('/device-commands')}>Send a command…</ListMenuItem>
                                                    {!isOnline && <ListMenuItem onClick={() => testConnection(sn)}>Test network connection</ListMenuItem>}
                                                    {!isOnline && <ListMenuItem onClick={() => forceOnline(sn)}>Mark as online</ListMenuItem>}
                                                </ListMenu>
                                                <Button variant="tonal" size="toolbar" icon={Edit2}
                                                    onClick={() => { setEditingDevice(device); setForm({ ...defaultForm, ...device }); setShowModal(true); }}>
                                                    Edit
                                                </Button>
                                                <Button variant="danger" size="toolbar" icon={Trash2} onClick={() => handleDelete(sn)}>Retire</Button>
                                            </div>
                                        </div>

                                        {device.approval_status === 'pending' && (
                                            <div className="mx-4 sm:mx-6 mb-4 flex items-center gap-3 flex-wrap px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
                                                <ShieldAlert size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
                                                <span className="flex-1 min-w-0 text-sm text-amber-900 dark:text-amber-200">New device — not yet approved.</span>
                                                <Button mutating variant="primary" size="toolbar" onClick={() => approveDevice(sn)} disabled={approving[sn]}>
                                                    {approving[sn] ? 'Approving…' : 'Approve'}
                                                </Button>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800">
                                            {[
                                                ['Users', device.user_count],
                                                ['Fingerprints', device.fingerprint_count],
                                                ['Faces', device.face_count],
                                                ['Transactions', device.transaction_count]
                                            ].map(([label, value]) => (
                                                <div key={label} className="px-4 sm:px-6 py-3">
                                                    <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                                    <span className="block mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{Number(value || 0).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Label above value, left-aligned, in the same four columns
                                            as the counts above so everything lines up vertically. */}
                                        <dl className="grid grid-cols-2 sm:grid-cols-4">
                                            {details.map(([label, value]) => (
                                                <div key={label} className="min-w-0 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                                                    <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
                                                    <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 truncate" title={typeof value === 'string' ? value : undefined}>{value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                );
                            })()}
                        </div>
                        )}
                    </div>
                    </ListPage>
                );

            case 'transaction':
                return <DataView title="Transactions" endpoint="/api/devices/data/transaction" columns={[
                    { label: 'Device', key: 'device_name' },
                    { label: 'Employee', key: 'emp_name' },
                    { label: 'Time', render: r => formatDateTime(r.punch_time) },
                    { label: 'State', key: 'punch_state' },
                    { label: 'Verify', key: 'verification_mode' }
                ]} />;

            case 'work-code':
                return <DataView title="Work Codes" endpoint="/api/devices/data/work-code" columns={[
                    { label: 'ID', key: 'id' },
                    { label: 'Details', key: 'details' },
                    { label: 'Timestamp', render: r => formatDateTime(r.timestamp) }
                ]} />;

            case 'bio-template':
                return <DataView title="Bio-Templates" endpoint="/api/devices/data/bio-template" columns={[
                    { label: 'ID', key: 'id' },
                    { label: 'Emp Code', key: 'employee_code' },
                    { label: 'Name', key: 'employee_name' },
                    { label: 'Type', key: 'type_name' },
                    { label: 'Template No', key: 'template_no' },
                    { label: 'Source Device', key: 'source_device' },
                    { label: 'Created', render: r => r.created_at ? formatDateTime(r.created_at) : '' }
                ]} />;

            case 'bio-photo':
                return <DataView title="Bio-Photos" endpoint="/api/devices/data/bio-photo" columns={[{ label: 'ID', key: 'id' }]} />;

            case 'unregistered':
                return <DataView title="Unregistered Transactions" endpoint="/api/devices/data/unregistered" columns={[{ label: 'ID', key: 'id' }]} />;

            case 'operation-log':
                return <DataView title="Operation Logs" endpoint="/api/devices/data/operation-log" columns={[
                    { label: 'Device', key: 'device_name' },
                    { label: 'Operator', key: 'operator' },
                    { label: 'Op Code', key: 'operation_type' },
                    { label: 'Time', render: r => formatDateTime(r.log_time) },
                    { label: 'Details', key: 'details' }
                ]} />;

            case 'error-log':
                return <DataView title="Error Logs" endpoint="/api/devices/data/error-log" columns={[
                    { label: 'Device', key: 'device_name' },
                    { label: 'Error Code', key: 'error_code' },
                    { label: 'Time', render: r => formatDateTime(r.log_time) },
                    { label: 'Details', key: 'details' }
                ]} />;

            case 'upload-log':
                return <DataView title="Upload Logs" endpoint="/api/devices/data/upload-log" columns={[{ label: 'ID', key: 'id' }]} />;

            default:
                return (
                    <div className="flex flex-col items-center justify-center h-full text-slate-grey dark:text-slate-400">
                        <Database size={48} className="mb-4 text-slate-200" />
                        <p>Selected View: {activeView}</p>
                    </div>
                );
        }
    };

    const initiateDataTransfer = (action) => {
        if (selectedDevices.length === 0) return toastApi.warning('Select devices first');
        setConfirmation({ show: true, action, title: 'Confirm Action', message: `Proceed with ${action}?` });
    };

    return (
        <>
            {renderContent()}

            <Modal
                open={showModal}
                onClose={closeModal}
                title={`${editingDevice ? 'Edit' : 'Add'} Device`}
                size="lg"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {!editingDevice && (() => {
                        // ADMS devices push to the server; nothing here dials the
                        // device. What the installer needs is the address to type
                        // into the device's Cloud Server screen — shown up front.
                        const host = window.location.hostname;
                        const local = host === 'localhost' || host === '127.0.0.1';
                        return (
                            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                                <p className="font-semibold text-slate-900 dark:text-slate-100">On the device: Comm. → Cloud Server Setting</p>
                                <p className="mt-1">
                                    Server address <span className="font-mono font-semibold">{local ? 'this server\'s LAN IP' : host}</span>,
                                    port <span className="font-mono font-semibold">80</span>, HTTPS off.
                                    Once it connects it appears here for approval; adding it below first is optional.
                                </p>
                            </div>
                        );
                    })()}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="dev-name" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Name</label>
                            <input id="dev-name" className="input-base" placeholder="e.g. Main gate IN" value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="dev-serial" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Serial number</label>
                            <input id="dev-serial" className="input-base font-mono" placeholder="From the device's System Info screen" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} disabled={!!editingDevice} />
                        </div>
                        <div>
                            <label htmlFor="dev-ip" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Device IP <span className="font-normal text-slate-500">(optional)</span></label>
                            <input id="dev-ip" className="input-base font-mono" placeholder="e.g. 10.20.0.8" value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="dev-area" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Area</label>
                            <select id="dev-area" className="input-base" value={form.area_id} onChange={e => setForm({ ...form, area_id: e.target.value })}>
                                <option value="">Select Area</option>
                                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="dev-direction" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Direction</label>
                            <select id="dev-direction" className="input-base" value={form.device_direction} onChange={e => setForm({ ...form, device_direction: e.target.value })}>
                                <option value="in">IN</option>
                                <option value="out">OUT</option>
                                <option value="both">Both</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
                        <Button variant="primary" type="submit">Save</Button>
                    </div>
                </form>
            </Modal>
            <Modal
                open={confirmation.show}
                onClose={() => setConfirmation({ show: false, action: null })}
                size="sm"
                hideClose
                label={confirmation.title}
            >
                <div className="text-center">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">{confirmation.title}</h3>
                    <p className="my-2 text-sm text-slate-600 dark:text-slate-400">{confirmation.message}</p>
                    <div className="flex justify-center gap-2 mt-4">
                        <Button variant="secondary" onClick={() => setConfirmation({ show: false, action: null })}>Cancel</Button>
                        {/* Named for the action, not "Confirm": the dialog has no other place that says what happens. */}
                        <Button variant={confirmation.action === 'delete' ? 'dangerSolid' : 'primary'} onClick={processDataTransfer}>
                            {confirmation.action ? confirmation.action.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase()) : 'Continue'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Toast UI */}
            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}>
                    <span className="flex-1 pr-3">{toast.message}</span>
                    <button type="button" aria-label="Dismiss"
                        onClick={() => {
                            if (toastTimeoutRef.current) {
                                clearTimeout(toastTimeoutRef.current);
                                toastTimeoutRef.current = null;
                            }
                            setToast(null);
                        }}
                        className="text-white hover:text-slate-200 focus:outline-none font-bold text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    );
}
