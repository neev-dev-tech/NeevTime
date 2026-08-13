import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import io from 'socket.io-client';
import {
    TabletSmartphone, RefreshCw, Power, Plus, Edit2, Trash2, X, Save,
    Wifi, WifiOff, Users, Fingerprint, Clock, Activity, Settings, Check,
    Upload, Download, ChevronDown, AlertTriangle, Briefcase, Camera, FileText,
    FileQuestion, Database, AlertCircle, FileSpreadsheet, Table2, Inbox, ShieldAlert
} from 'lucide-react';
import { TableSkeleton } from '../components/SkeletonLoader';
import { useToast, Button, PageHeader } from '../components';
import { exportToExcel, exportToCSV } from '../utils/excelExport';

// ==========================================
// Sub-Components for Data Views
// ==========================================

const DataView = ({ title, endpoint, columns, icon: Icon = Database }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(null);

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
                filename: `${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}`,
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
                filename: `${title.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}`,
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
                    <span className="cell-timestamp-date">{date.toLocaleDateString()}</span>
                    <span className="cell-timestamp-time"> {date.toLocaleTimeString()}</span>
                </div>
            );
        }

        return value || '-';
    };

    return (
        <div className="space-y-6">
            {/* Premium Report Container */}
            <div className="report-container">
                {/* Report Header */}
                <div className="report-header">
                    <div className="report-title">
                        <div className="report-title-icon">
                            <Icon size={24} />
                        </div>
                        {title}
                    </div>

                    <div className="report-meta">
                        {/* Record Count Badge */}
                        {!loading && (
                            <div className="report-count">
                                <Table2 size={14} />
                                <span className="report-count-number">{data.length}</span>
                                records
                            </div>
                        )}

                        {/* Export Buttons */}
                        {data.length > 0 && (
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
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
                                    variant="success"
                                    size="sm"
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
                            </div>
                        )}

                        {/* Refresh Button */}
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchData();
                            }}
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Table Content */}
                {loading ? (
                    <div className="p-6">
                        <TableSkeleton rows={10} cols={columns.length} />
                    </div>
                ) : (
                    <div className="table-premium-wrapper">
                        <table className="table-premium">
                            <thead>
                                <tr>
                                    {columns.map((col, i) => (
                                        <th key={i}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length}>
                                            <div className="table-empty-state">
                                                <div className="table-empty-icon">
                                                    <Inbox size={40} />
                                                </div>
                                                <div className="table-empty-title">No records found</div>
                                                <div className="table-empty-description">
                                                    There are no {title.toLowerCase()} to display at this time.
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((row, i) => (
                                        <tr key={i}>
                                            {columns.map((col, j) => (
                                                <td key={j}>
                                                    {renderCell(col, row, j)}
                                                </td>
                                            ))}
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
    const [showTransferMenu, setShowTransferMenu] = useState(false);
    const [showSyncAllMenu, setShowSyncAllMenu] = useState(false);
    const [syncingAll, setSyncingAll] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [confirmation, setConfirmation] = useState({ show: false, action: null, title: '', message: '', target: null });
    const socketRef = useRef(null);
    const syncAllMenuRef = useRef(null);
    const transferMenuRef = useRef(null);

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

    // Mock Form State (retained from original)
    const defaultForm = {
        serial_number: '', device_name: '', ip_address: '', port: 4370, area_id: '',
        transfer_mode: 'realtime', timezone: 'Etc/GMT+5:30', is_registration_device: true,
        is_attendance_device: true, connection_interval: 10, device_direction: 'both', enable_access_control: false
    };
    const [form, setForm] = useState(defaultForm);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside dropdown containers
            if (syncAllMenuRef.current && !syncAllMenuRef.current.contains(event.target)) {
                setShowSyncAllMenu(false);
            }
            if (transferMenuRef.current && !transferMenuRef.current.contains(event.target)) {
                setShowTransferMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                console.log('[Devices] Device status update:', data);
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
        console.log('[Devices] handleDelete called with serial:', serial);
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
        console.log('[Devices] processDataTransfer:', { action, target, confirmation });

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
        setShowSyncAllMenu(false);
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
        try { await api.post('/api/device-commands', { device_serial: sn, command: cmd }); setTimeout(() => { fetchDevices(); setSyncing(p => ({ ...p, [sn]: null })); }, 2000); } catch (e) { console.error(e); setSyncing(p => ({ ...p, [sn]: null })); }
    };

    // Helper functions
    const timeSince = (d) => d ? Math.floor((new Date() - new Date(d)) / 60000) + 'm ago' : 'Never';
    const getDirectionLabel = (d) => d === 'in' ? 'IN' : d === 'out' ? 'OUT' : 'IN/OUT';

    // Readers a human still has to accept. Worth a banner and not only the row
    // badge: once require_device_approval is on, punches from an unapproved
    // reader are refused — and because the reader is still ACKed and clears its
    // buffer, they are gone. Approving later does not backfill them.
    const awaitingApproval = devices.filter(
        d => d.approval_status === 'pending' && d.status !== 'retired'
    );

    const renderContent = () => {
        switch (activeView) {
            case 'devices':
                return (
                    <div className="space-y-6">
                        {awaitingApproval.length > 0 && (
                            <div className="card-base !p-4 border-l-4 border-rose-500 flex items-start gap-3">
                                <ShieldAlert size={20} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                                        {awaitingApproval.length} device{awaitingApproval.length === 1 ? '' : 's'} awaiting approval
                                    </p>
                                    <p className="text-sm font-mono text-slate-600 dark:text-slate-300 mt-0.5 break-all">
                                        {awaitingApproval.map(d => d.serial_number).join(', ')}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        While device approval is enforced, punches from an unapproved reader are
                                        refused and cannot be recovered afterwards. Approve it below, or retire it
                                        if you do not recognise the serial.
                                    </p>
                                </div>
                            </div>
                        )}
                        <PageHeader
                            icon={TabletSmartphone}
                            title="Connected Devices"
                            actions={(
                                <>
                                <Button
                                    variant="secondary"
                                    type="button"
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
                                >
                                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                                </Button>

                                {/* Sync All Devices Button */}
                                <div className="relative" ref={syncAllMenuRef}>
                                    <Button
                                        variant="success"
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowSyncAllMenu(!showSyncAllMenu);
                                            setShowTransferMenu(false);
                                        }}
                                        disabled={syncingAll}
                                    >
                                        {syncingAll ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                                        Sync All Devices
                                        <ChevronDown size={14} className={`transition-transform duration-200 ${showSyncAllMenu ? 'rotate-180' : ''}`} />
                                    </Button>
                                    {showSyncAllMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowSyncAllMenu(false)}></div>
                                            <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-xl z-20 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('upload-users');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-green-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100 border-b border-slate-50 dark:border-slate-700"
                                                >
                                                    <Upload size={16} className="text-green-600" />
                                                    Push Users to All Devices
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('download-users');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100 border-b border-slate-50 dark:border-slate-700"
                                                >
                                                    <Download size={16} className="text-orange-600" />
                                                    Pull Users from All Devices
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('upload-biometrics');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-purple-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100 border-b border-slate-50 dark:border-slate-700"
                                                >
                                                    <Fingerprint size={16} className="text-purple-600" />
                                                    Push Biometrics to All Devices
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('download-biometrics');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-pink-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100 border-b border-slate-50 dark:border-slate-700"
                                                >
                                                    <Fingerprint size={16} className="text-pink-600" />
                                                    Pull Biometrics from All Devices
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('download-logs');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100"
                                                >
                                                    <Clock size={16} className="text-orange-600" />
                                                    Pull Logs from All Devices
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Per-Device Data Transfer */}
                                <div className="relative" ref={transferMenuRef}>
                                    <Button
                                        variant="secondary"
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowTransferMenu(!showTransferMenu);
                                            setShowSyncAllMenu(false);
                                        }}
                                    >
                                        Selected Devices <ChevronDown size={14} className={`transition-transform duration-200 ${showTransferMenu ? 'rotate-180' : ''}`} />
                                    </Button>
                                    {showTransferMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowTransferMenu(false)}></div>
                                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-xl rounded-xl z-20 overflow-hidden">
                                                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Selected: {selectedDevices.length} device(s)</div>
                                                {['download-users', 'download-logs', 'upload-users', 'reboot'].map(action => (
                                                    <button
                                                        key={action}
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            initiateDataTransfer(action);
                                                            setShowTransferMenu(false);
                                                        }}
                                                        className="block w-full text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-slate-700 text-sm text-slate-grey dark:text-slate-400 hover:text-charcoal dark:hover:text-slate-100 capitalize border-b border-slate-50 dark:border-slate-700 last:border-0"
                                                    >
                                                        {action.replace('-', ' ')}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <Button variant="successSolid" icon={Plus} onClick={() => setShowModal(true)}>
                                    Add Device
                                </Button>
                                </>
                            )}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                            {devices.map(device => {
                                const isOnline = device.status === 'online';
                                const isSelected = selectedDevices.includes(device.serial_number);
                                const direction = getDirectionLabel(device.device_direction);
                                return (
                                <div
                                    key={device.serial_number}
                                    className={`dv-card group ${isOnline ? 'is-online' : 'is-offline'} ${isSelected ? 'is-selected' : ''}`}
                                >
                                    {/* status rail */}
                                    <span className="dv-rail" />

                                    {/* header */}
                                    <div className="dv-head">
                                        <div className="dv-avatar">
                                            {isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                            {isOnline && <span className="dv-ping" />}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="dv-name">{device.device_name}</h3>
                                                <span className={`dv-dir dv-dir--${direction.toLowerCase()}`}>{direction}</span>
                                            </div>
                                            <p className="dv-serial">{device.serial_number}</p>
                                        </div>

                                        <label className="dv-check" title={isSelected ? 'Deselect device' : 'Select device'}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {
                                                    if (isSelected)
                                                        setSelectedDevices(selectedDevices.filter(s => s !== device.serial_number));
                                                    else
                                                        setSelectedDevices([...selectedDevices, device.serial_number]);
                                                }}
                                            />
                                            <span />
                                        </label>
                                    </div>

                                    {/* live status line */}
                                    <div className="dv-status">
                                        <span className={`dv-dot ${isOnline ? 'on' : 'off'}`} />
                                        <span className="dv-status-text">{isOnline ? 'Online' : 'Offline'}</span>
                                        <span className="dv-sep" />
                                        <Clock size={12} className="opacity-60" />
                                        <span>{timeSince(device.last_activity)}</span>
                                    </div>

                                    {/* A serial seen for the first time registers as pending. Its
                                        punches are still accepted unless Settings → Security →
                                        require_device_approval is on, but it is called out here so a
                                        reader nobody installed does not blend into the fleet. */}
                                    {device.approval_status === 'pending' && (
                                        <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                            <ShieldAlert size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                                            <span className="text-xs text-amber-800 dark:text-amber-300 flex-1 min-w-0">
                                                New device — not yet approved
                                            </span>
                                            <Button
                                                variant="successSolid"
                                                size="sm"
                                                onClick={() => approveDevice(device.serial_number)}
                                                disabled={approving[device.serial_number]}
                                            >
                                                {approving[device.serial_number] ? 'Approving…' : 'Approve'}
                                            </Button>
                                        </div>
                                    )}

                                    {/* metrics */}
                                    <div className="dv-metrics">
                                        <div>
                                            <span className="dv-label">IP Address</span>
                                            <span className="dv-value font-mono">{device.ip_address || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="dv-label">Area</span>
                                            <span className="dv-value">{device.area_name || 'Unassigned'}</span>
                                        </div>
                                    </div>

                                    {/* actions */}
                                    <div className="dv-actions">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => syncDevice(device.serial_number, 'INFO')}
                                            disabled={syncing[device.serial_number]}
                                        >
                                            <RefreshCw size={15} className={syncing[device.serial_number] ? 'animate-spin' : ''} />
                                            {syncing[device.serial_number] ? 'Syncing...' : 'Sync'}
                                        </Button>

                                        {!isOnline && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={Activity}
                                                    title="Test Network Connection"
                                                    aria-label="Test Network Connection"
                                                    onClick={async () => {
                                                        const btn = document.getElementById(`test-${device.serial_number}`);
                                                        try {
                                                            if (btn) btn.classList.add('animate-pulse');
                                                            showToast('Testing connection...', 'info');
                                                            const res = await api.post(`/api/devices/${device.serial_number}/test-connection`);
                                                            showToast(`${res.data.message}: ${res.data.details}`, res.data.success ? 'success' : 'error');
                                                        } catch (err) {
                                                            showToast('Test failed to run', 'error');
                                                        } finally {
                                                            if (btn) btn.classList.remove('animate-pulse');
                                                        }
                                                    }}
                                                    id={`test-${device.serial_number}`}
                                                />

                                                <Button
                                                    variant="success"
                                                    size="sm"
                                                    icon={Power}
                                                    title="Force Online"
                                                    aria-label="Force Online"
                                                    onClick={async () => {
                                                        try {
                                                            await api.post(`/api/devices/${device.serial_number}/force-online`);
                                                            showToast('Device marked as online', 'success');
                                                            fetchDevices();
                                                        } catch (err) {
                                                            showToast('Failed to force online', 'error');
                                                        }
                                                    }}
                                                />
                                            </>
                                        )}

                                        <div className="dv-quiet">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={Edit2}
                                                aria-label="Edit"
                                                title="Edit device"
                                                onClick={() => { setEditingDevice(device); setForm({ ...defaultForm, ...device }); setShowModal(true); }}
                                            />
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                icon={Trash2}
                                                aria-label="Delete"
                                                title="Delete device"
                                                onClick={() => handleDelete(device.serial_number)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div >
                );

            case 'transaction':
                return <DataView title="Transactions" endpoint="/api/devices/data/transaction" columns={[
                    { label: 'Device', key: 'device_name' },
                    { label: 'Employee', key: 'emp_name' },
                    { label: 'Time', render: r => new Date(r.punch_time).toLocaleString() },
                    { label: 'State', key: 'punch_state' },
                    { label: 'Verify', key: 'verification_mode' }
                ]} />;

            case 'work-code':
                return <DataView title="Work Codes" endpoint="/api/devices/data/work-code" columns={[
                    { label: 'ID', key: 'id' },
                    { label: 'Details', key: 'details' },
                    { label: 'Timestamp', render: r => new Date(r.timestamp).toLocaleString() }
                ]} />;

            case 'bio-template':
                return <DataView title="Bio-Templates" endpoint="/api/devices/data/bio-template" columns={[
                    { label: 'ID', key: 'id' },
                    { label: 'Emp Code', key: 'employee_code' },
                    { label: 'Name', key: 'employee_name' },
                    { label: 'Type', key: 'type_name' },
                    { label: 'Template No', key: 'template_no' },
                    { label: 'Source Device', key: 'source_device' },
                    { label: 'Created', render: r => r.created_at ? new Date(r.created_at).toLocaleString() : '' }
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
                    { label: 'Time', render: r => new Date(r.log_time).toLocaleString() },
                    { label: 'Details', key: 'details' }
                ]} />;

            case 'error-log':
                return <DataView title="Error Logs" endpoint="/api/devices/data/error-log" columns={[
                    { label: 'Device', key: 'device_name' },
                    { label: 'Error Code', key: 'error_code' },
                    { label: 'Time', render: r => new Date(r.log_time).toLocaleString() },
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

            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="p-6 rounded-2xl w-full max-w-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" style={{ borderRadius: '16px' }}>
                        <h3 className="font-semibold mb-4 text-slate-800 dark:text-slate-100">{editingDevice ? 'Edit' : 'Add'} Device</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input className="input-base" placeholder="Name" value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} />
                            <input className="input-base" placeholder="Serial" value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} disabled={!!editingDevice} />
                            <input className="input-base" placeholder="IP" value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} />
                            <select className="input-base" value={form.area_id} onChange={e => setForm({ ...form, area_id: e.target.value })}>
                                <option value="">Select Area</option>
                                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <select className="input-base" value={form.device_direction} onChange={e => setForm({ ...form, device_direction: e.target.value })}>
                                <option value="in">IN</option>
                                <option value="out">OUT</option>
                                <option value="both">Both</option>
                            </select>
                            <div className="flex justify-end gap-2 mt-4">
                                <Button variant="secondary" type="button" onClick={closeModal}>Cancel</Button>
                                <Button variant="primary" type="submit">Save</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {confirmation.show && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="p-6 rounded-2xl text-center border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700" style={{ borderRadius: '16px' }}>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">{confirmation.title}</h3>
                        <p className="my-2 text-sm text-slate-500 dark:text-slate-400">{confirmation.message}</p>
                        <div className="flex justify-center gap-2 mt-4">
                            <Button variant="secondary" onClick={() => setConfirmation({ show: false, action: null })}>Cancel</Button>
                            <Button variant={confirmation.action === 'delete' ? 'dangerSolid' : 'primary'} onClick={processDataTransfer}>Confirm</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast UI */}
            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
                    <span className="flex-1 pr-3">{toast.message}</span>
                    <button
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
