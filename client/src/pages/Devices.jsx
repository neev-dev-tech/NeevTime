import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api';
import io from 'socket.io-client';
import {
    TabletSmartphone, RefreshCw, Power, Plus, Edit2, Trash2, X, Save,
    Wifi, WifiOff, Users, Fingerprint, Clock, Activity, Settings, Check,
    Upload, Download, ChevronDown, AlertTriangle, Briefcase, Camera, FileText,
    FileQuestion, Database, AlertCircle, FileSpreadsheet, Table2, Inbox
} from 'lucide-react';
import SkeletonLoader from '../components/SkeletonLoader';
import { useToast } from '../components';
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
                                <button
                                    onClick={handleExportCSV}
                                    disabled={exporting === 'csv'}
                                    className="btn-export btn-export-csv"
                                >
                                    {exporting === 'csv' ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <FileText size={14} />
                                    )}
                                    CSV
                                </button>
                                <button
                                    onClick={handleExportXLSX}
                                    disabled={exporting === 'xlsx'}
                                    className="btn-export btn-export-xlsx"
                                >
                                    {exporting === 'xlsx' ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <FileSpreadsheet size={14} />
                                    )}
                                    Excel
                                </button>
                            </div>
                        )}

                        {/* Refresh Button */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                fetchData();
                            }}
                            className="btn-header-secondary"
                            type="button"
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Table Content */}
                {loading ? (
                    <div className="p-6">
                        <SkeletonLoader rows={10} columns={columns.length} showHeader={true} />
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
        setConfirmation({ show: true, action: 'delete', title: 'Remove Device', message: 'Irreversible action.', target: serial });
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
                await api.delete(`/api/devices/${target}`);
                showToast('Device deleted successfully', 'success');
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

    const renderContent = () => {
        switch (activeView) {
            case 'devices':
                return (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-semibold" style={{ color: '#1E293B', fontWeight: 600 }}>Connected Devices</h2>
                            <div className="flex gap-3">
                                <button
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
                                    className={`btn-header-secondary ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                                </button>

                                {/* Sync All Devices Button */}
                                <div className="relative" ref={syncAllMenuRef}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowSyncAllMenu(!showSyncAllMenu);
                                            setShowTransferMenu(false);
                                        }}
                                        disabled={syncingAll}
                                        className={`btn-header-success ${syncingAll ? 'opacity-70' : ''}`}
                                    >
                                        {syncingAll ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                                        Sync All Devices
                                        <ChevronDown size={14} className={`transition-transform duration-200 ${showSyncAllMenu ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showSyncAllMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowSyncAllMenu(false)}></div>
                                            <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-100 shadow-xl rounded-xl z-20 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('upload-users');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-green-50 text-sm text-slate-grey hover:text-charcoal border-b border-gray-50"
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
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-blue-50 text-sm text-slate-grey hover:text-charcoal border-b border-gray-50"
                                                >
                                                    <Download size={16} className="text-blue-600" />
                                                    Pull Users from All Devices
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        syncAllDevices('upload-biometrics');
                                                    }}
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-purple-50 text-sm text-slate-grey hover:text-charcoal border-b border-gray-50"
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
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-pink-50 text-sm text-slate-grey hover:text-charcoal border-b border-gray-50"
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
                                                    className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-orange-50 text-sm text-slate-grey hover:text-charcoal"
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
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setShowTransferMenu(!showTransferMenu);
                                            setShowSyncAllMenu(false);
                                        }}
                                        className="btn-header-purple"
                                    >
                                        Selected Devices <ChevronDown size={14} className={`transition-transform duration-200 ${showTransferMenu ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showTransferMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowTransferMenu(false)}></div>
                                            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-100 shadow-xl rounded-xl z-20 overflow-hidden">
                                                <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">Selected: {selectedDevices.length} device(s)</div>
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
                                                        className="block w-full text-left px-4 py-3 hover:bg-orange-50 text-sm text-slate-grey hover:text-charcoal capitalize border-b border-gray-50 last:border-0"
                                                    >
                                                        {action.replace('-', ' ')}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="btn-header-primary"
                                >
                                    <Plus size={16} /> Add Device
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {devices.map(device => (
                                <div
                                    key={device.serial_number}
                                    className={`device-card ${device.status === 'online' ? 'online' : 'offline'} ${selectedDevices.includes(device.serial_number) ? 'selected' : ''} group`}
                                >
                                    {/* Premium Checkbox */}
                                    <div className="absolute top-5 right-5 z-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedDevices.includes(device.serial_number)}
                                            onChange={() => {
                                                if (selectedDevices.includes(device.serial_number))
                                                    setSelectedDevices(selectedDevices.filter(s => s !== device.serial_number));
                                                else
                                                    setSelectedDevices([...selectedDevices, device.serial_number]);
                                            }}
                                            className="checkbox-premium"
                                        />
                                    </div>

                                    {/* Device Header */}
                                    <div className="flex items-center gap-4 mb-5">
                                        <div className={`device-icon-container ${device.status === 'offline' ? 'offline' : ''}`}>
                                            {device.status === 'online'
                                                ? <Wifi className="text-emerald-600" size={22} />
                                                : <WifiOff className="text-gray-400" size={22} />
                                            }
                                            <div className={`device-status-indicator ${device.status === 'online' ? 'online' : 'offline'}`}></div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-lg text-slate-800 truncate">{device.device_name}</h3>
                                            <p className="text-xs font-mono text-slate-500 tracking-wide">{device.serial_number}</p>
                                        </div>
                                    </div>

                                    {/* Status Badges */}
                                    <div className="flex gap-2 mb-5">
                                        <span className={`badge-premium ${device.status === 'online' ? 'badge-online' : 'badge-offline'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                                            {device.status}
                                        </span>
                                        <span className="badge-premium badge-direction">
                                            {getDirectionLabel(device.device_direction)}
                                        </span>
                                    </div>

                                    {/* Device Info Grid */}
                                    <div className="device-info-grid mb-5">
                                        <div className="device-info-item">
                                            <span className="device-info-label">IP Address</span>
                                            <span className="device-info-value">{device.ip_address}</span>
                                        </div>
                                        <div className="device-info-item">
                                            <span className="device-info-label">Area</span>
                                            <span className="device-info-value" style={{ fontFamily: 'inherit' }}>{device.area_name || 'Unassigned'}</span>
                                        </div>
                                        <div className="device-info-item col-span-2">
                                            <span className="device-info-label">Last Activity</span>
                                            <span className="device-info-value" style={{ fontFamily: 'inherit' }}>{timeSince(device.last_activity)}</span>
                                        </div>
                                    </div>

                                    {/* Action Button Bar */}
                                    <div className="action-button-bar">
                                        <button
                                            onClick={() => syncDevice(device.serial_number, 'INFO')}
                                            disabled={syncing[device.serial_number]}
                                            className="btn-sync"
                                        >
                                            {syncing[device.serial_number]
                                                ? <RefreshCw className="animate-spin" size={16} />
                                                : <RefreshCw size={16} />
                                            }
                                            {syncing[device.serial_number] ? 'Syncing...' : 'Sync'}
                                        </button>

                                        {/* Diagnostic Tools for Offline Devices */}
                                        {device.status === 'offline' && (
                                            <>
                                                <button
                                                    title="Test Network Connection"
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
                                                    className="btn-icon-premium diagnostic"
                                                    id={`test-${device.serial_number}`}
                                                >
                                                    <Activity size={18} className="text-purple-500" />
                                                </button>

                                                <button
                                                    title="Force Online"
                                                    onClick={async () => {
                                                        try {
                                                            await api.post(`/api/devices/${device.serial_number}/force-online`);
                                                            showToast('Device marked as online', 'success');
                                                            fetchDevices();
                                                        } catch (err) {
                                                            showToast('Failed to force online', 'error');
                                                        }
                                                    }}
                                                    className="btn-icon-premium power"
                                                >
                                                    <Power size={18} className="text-emerald-500" />
                                                </button>
                                            </>
                                        )}

                                        <button
                                            onClick={() => { setEditingDevice(device); setForm({ ...defaultForm, ...device }); setShowModal(true); }}
                                            className="btn-icon-premium edit"
                                        >
                                            <Edit2 size={18} className="text-slate-500" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(device.serial_number)}
                                            className="btn-icon-premium delete"
                                        >
                                            <Trash2 size={18} className="text-red-400" />
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                    <div className="flex flex-col items-center justify-center h-full text-slate-grey">
                        <Database size={48} className="mb-4 text-gray-200" />
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
                    <div className="p-6 rounded-2xl w-full max-w-lg border" style={{
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBF5 100%)',
                        borderColor: '#FED7AA'
                    }}>
                        <h3 className="font-semibold mb-4" style={{ color: '#1E293B', fontWeight: 600 }}>{editingDevice ? 'Edit' : 'Add'} Device</h3>
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
                                <button type="button" onClick={closeModal} className="btn-secondary rounded-full">Cancel</button>
                                <button type="submit" className="btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {confirmation.show && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="p-6 rounded-2xl text-center border" style={{
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBF5 100%)',
                        borderColor: '#FED7AA'
                    }}>
                        <h3 className="font-semibold" style={{ color: '#1E293B', fontWeight: 600 }}>{confirmation.title}</h3>
                        <p className="my-2 text-sm text-gray-500">{confirmation.message}</p>
                        <div className="flex justify-center gap-2 mt-4">
                            <button onClick={() => setConfirmation({ show: false, action: null })} className="btn-secondary rounded-full">Cancel</button>
                            <button onClick={processDataTransfer} className="btn-primary">Confirm</button>
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
                        className="text-white hover:text-gray-200 focus:outline-none font-bold text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    );
}
