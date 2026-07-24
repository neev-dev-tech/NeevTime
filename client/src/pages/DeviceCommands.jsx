import React, { useState, useEffect } from 'react';
import api from '../api';
import {
    TabletSmartphone, Send, RefreshCw, Users, Fingerprint, Database,
    Clock, Power, Trash2, Download, Upload, AlertTriangle, Wifi, WifiOff
} from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

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
        { id: 'INFO', label: 'Get Info', icon: TabletSmartphone, description: 'Get device information', color: 'blue' },
        { id: 'CHECK', label: 'Check Connection', icon: Wifi, description: 'Check device connection', color: 'green' },
        { id: 'REBOOT', label: 'Restart Device', icon: Power, description: 'Reboot the device', color: 'amber' },
        { id: 'CLEAR LOG', label: 'Clear Logs', icon: Trash2, description: 'Clear attendance logs from device', color: 'red' },
        { id: 'DATA QUERY USERINFO', label: 'Get Users', icon: Users, description: 'Download user list from device', color: 'green' },
        { id: 'DATA QUERY FINGERTMP', label: 'Get FP Templates', icon: Fingerprint, description: 'Download fingerprint templates', color: 'purple' },
        { id: 'DATA QUERY ATTLOG', label: 'Get Logs', icon: Download, description: 'Fetch attendance logs', color: 'blue' },
        { id: 'CLEAR DATA', label: 'Clear All Data', icon: Database, description: 'Factory reset device data', color: 'red' },
    ];

    const sendCommand = async (commandId) => {
        if (!selectedDevice) {
            toast.warning('Please select a device');
            return;
        }

        const confirmCommands = ['CLEAR LOG', 'CLEAR DATA', 'REBOOT'];
        if (confirmCommands.includes(commandId)) {
            const cmdLabel = commandList.find(c => c.id === commandId)?.label;
            if (!confirm(`Are you sure you want to execute "${cmdLabel}" on ${selectedDevice.device_name || selectedDevice.serial_number}?`)) {
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

    const getStatusColor = (status) => {
        switch (status) {
            case 'success': return 'bg-green-100 text-green-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'sent': return 'bg-blue-100 text-blue-800';
            case 'fail': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getCommandColor = (color) => {
        const colors = {
            blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200',
            green: 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200',
            amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200',
            red: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200',
            purple: 'bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-200'
        };
        return colors[color] || colors.blue;
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '-';
        return new Date(timestamp).toLocaleString();
    };

    // Filter commands for selected device
    const deviceCommands = selectedDevice
        ? commands.filter(c => c.device_serial === selectedDevice.serial_number)
        : commands;

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={TabletSmartphone}
                title="Device Commands"
                actions={(
                    <>
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
                        <Button
                            variant="secondary"
                            type="button"
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
                            disabled={refreshing}
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            Refresh
                        </Button>
                    </>
                )}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Device Selection */}
                <div className="lg:col-span-1">
                    <div className="card-base p-4">
                        <h3 className="font-semibold mb-3">Select Device</h3>
                        {loading ? (
                            <div className="text-center py-4 text-gray-500">Loading devices...</div>
                        ) : devices.length === 0 ? (
                            <div className="text-center py-4 text-gray-500">
                                <WifiOff className="mx-auto mb-2 text-gray-300" size={32} />
                                <p>No devices registered</p>
                                <p className="text-xs mt-1">Add devices in Device Management</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {devices.map(device => (
                                    <button
                                        key={device.serial_number}
                                        onClick={() => setSelectedDevice(device)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${selectedDevice?.serial_number === device.serial_number
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-50 hover:bg-gray-100'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-lg ${selectedDevice?.serial_number === device.serial_number
                                            ? 'bg-blue-500'
                                            : device.status === 'online' ? 'bg-green-100' : 'bg-gray-200'
                                            }`}>
                                            {device.status === 'online' ? (
                                                <Wifi size={18} className={
                                                    selectedDevice?.serial_number === device.serial_number
                                                        ? 'text-white'
                                                        : 'text-green-600'
                                                } />
                                            ) : (
                                                <WifiOff size={18} className={
                                                    selectedDevice?.serial_number === device.serial_number
                                                        ? 'text-white'
                                                        : 'text-gray-500'
                                                } />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">
                                                {device.device_name || 'Unnamed Device'}
                                            </div>
                                            <div className={`text-xs truncate ${selectedDevice?.serial_number === device.serial_number
                                                ? 'text-blue-200'
                                                : 'text-gray-500'
                                                }`}>
                                                {device.serial_number}
                                            </div>
                                        </div>
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${device.status === 'online' ? 'bg-green-400' : 'bg-gray-400'
                                            }`} />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Device Info */}
                        {selectedDevice && (
                            <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Serial:</span>
                                    <span className="font-medium">{selectedDevice.serial_number}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">IP:</span>
                                    <span className="font-medium">{selectedDevice.ip_address || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Status:</span>
                                    <span className={`px-2 py-0.5 rounded text-xs ${selectedDevice.status === 'online'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {selectedDevice.status || 'Unknown'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Users:</span>
                                    <span className="font-medium">{selectedDevice.user_count || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">FP Count:</span>
                                    <span className="font-medium">{selectedDevice.fingerprint_count || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Face Count:</span>
                                    <span className="font-medium">{selectedDevice.face_count || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Transactions:</span>
                                    <span className="font-medium">{selectedDevice.transaction_count || 0}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Commands Grid */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card-base p-4">
                        <h3 className="font-semibold mb-4">Available Commands</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {commandList.map(cmd => (
                                <button
                                    key={cmd.id}
                                    onClick={() => sendCommand(cmd.id)}
                                    disabled={sending[cmd.id] || !selectedDevice}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getCommandColor(cmd.color)}`}
                                >
                                    {sending[cmd.id] ? (
                                        <RefreshCw size={24} className="animate-spin" />
                                    ) : (
                                        <cmd.icon size={24} />
                                    )}
                                    <span className="text-sm font-medium text-center">{cmd.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={18} />
                        <div className="text-sm text-amber-800">
                            <strong>Warning:</strong> Commands like "Clear Logs", "Clear All Data", and "Restart"
                            are irreversible. Ensure the device is connected and use with caution.
                        </div>
                    </div>

                    {/* Command History */}
                    <div className="card-base p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold">Command History</h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={RefreshCw}
                                type="button"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    await fetchCommandHistory();
                                }}
                            >
                                Refresh
                            </Button>
                        </div>
                        {deviceCommands.length === 0 ? (
                            <div className="text-center py-6 text-gray-500">
                                No commands sent yet. Select a device and click a command to begin.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {deviceCommands.slice(0, 20).map(cmd => (
                                    <div key={cmd.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cmd.status === 'success' ? 'bg-green-500' :
                                                cmd.status === 'pending' ? 'bg-yellow-500' :
                                                    cmd.status === 'sent' ? 'bg-blue-500' :
                                                        'bg-red-500'
                                                }`} />
                                            <div className="min-w-0">
                                                <div className="font-medium text-sm truncate">{cmd.command}</div>
                                                <div className="text-xs text-gray-500">
                                                    {formatTime(cmd.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize flex-shrink-0 ${getStatusColor(cmd.status)}`}>
                                            {cmd.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
