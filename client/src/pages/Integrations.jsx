/**
 * HRMS Integrations Page
 * 
 * Manage integrations with external HR systems:
 * - View all configured integrations
 * - Add new integrations (ERPNext, Odoo, Horilla, Webhooks)
 * - Test connections
 * - Trigger manual sync
 * - View sync logs
 */

import React, { useState, useEffect } from 'react';
import {
    Plus, Edit2, Trash2, RefreshCw, Check, FileText, Network, Loader2, AlertCircle, CheckCircle, Info
} from 'lucide-react';
import Modal from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';
import { integrationsAPI } from '../api';
import { Button, useToast, ListPage } from '../components';
import { confirm } from '../components/ConfirmDialog';

const Integrations = () => {
    const toast = useToast();
    const [integrations, setIntegrations] = useState([]);
    const [integrationTypes, setIntegrationTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [logsDialogOpen, setLogsDialogOpen] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState(null);
    const [syncLogs, setSyncLogs] = useState([]);
    const [testing, setTesting] = useState(null);
    const [syncing, setSyncing] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const [error, setError] = useState(null);
    const [tabValue, setTabValue] = useState(0);

    const [formData, setFormData] = useState({
        name: '',
        type: '',
        base_url: '',
        api_key: '',
        api_secret: '',
        username: '',
        password: '',
        database_name: '',
        sync_employees: true,
        sync_attendance: true,
        sync_leaves: false,
        sync_interval_minutes: 30,
        is_active: true,
        config: {}
    });

    useEffect(() => {
        fetchIntegrations();
        fetchIntegrationTypes();
    }, []);

    // Set default type when integration types are loaded
    useEffect(() => {
        if (integrationTypes.length > 0 && !formData.type) {
            setFormData(prev => ({ ...prev, type: integrationTypes[0].type }));
        }
    }, [integrationTypes]);

    const fetchIntegrations = async () => {
        try {
            setLoading(true);
            const response = await integrationsAPI.getAll();
            setIntegrations(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchIntegrationTypes = async () => {
        try {
            const response = await integrationsAPI.getTypes();
            setIntegrationTypes(response.data);
        } catch (err) {
            console.error('Failed to fetch integration types:', err);
        }
    };

    const handleOpenDialog = (integration = null) => {
        if (integration) {
            // Parse config if it's a string
            let config = {};
            if (integration.config) {
                try {
                    config = typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config;
                } catch (e) {
                    config = {};
                }
            }
            setFormData({
                ...integration,
                api_key: integration.api_key || '',
                api_secret: integration.api_secret || '',
                password: integration.password || '',
                config: config
            });
            setSelectedIntegration(integration);
        } else {
            // Set default type to first available type
            const defaultType = integrationTypes.length > 0 ? integrationTypes[0].type : '';
            setFormData({
                name: '',
                type: defaultType,
                base_url: '',
                api_key: '',
                api_secret: '',
                username: '',
                password: '',
                database_name: '',
                sync_employees: true,
                sync_attendance: true,
                sync_leaves: false,
                sync_interval_minutes: 30,
                is_active: true,
                config: {}
            });
            setSelectedIntegration(null);
        }
        setTestResult(null);
        setDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setDialogOpen(false);
        setSelectedIntegration(null);
        setTestResult(null);
    };

    const handleSave = async () => {
        try {
            // Validate required fields
            const typeInfo = integrationTypes.find(t => t.type === formData.type);
            if (typeInfo) {
                const requiredFields = typeInfo.required_fields || [];
                const missingFields = requiredFields.filter(field => {
                    if (field === 'base_url') return !formData.base_url;
                    if (field === 'api_key') return !formData.api_key;
                    if (field === 'api_secret') return !formData.api_secret;
                    if (field === 'username') return !formData.username;
                    if (field === 'password') return !formData.password;
                    if (field === 'database_name') return !formData.database_name;
                    return false;
                });

                if (missingFields.length > 0) {
                    setError(`Missing required fields: ${missingFields.join(', ')}`);
                    return;
                }
            }

            // Prepare data with config as JSON string
            const saveData = {
                ...formData,
                config: typeof formData.config === 'object' ? JSON.stringify(formData.config) : formData.config
            };

            if (selectedIntegration) {
                await integrationsAPI.update(selectedIntegration.id, saveData);
            } else {
                await integrationsAPI.create(saveData);
            }
            fetchIntegrations();
            handleCloseDialog();
            setError(null);
        } catch (err) {
            setError(err.message || 'Failed to save integration');
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this integration?' }))) return;
        try {
            await integrationsAPI.delete(id);
            fetchIntegrations();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleTest = async (id) => {
        setTesting(id);
        setTestResult(null);
        try {
            const response = await integrationsAPI.test(id);
            setTestResult(response.data);
        } catch (err) {
            setTestResult({ success: false, message: err.message });
        } finally {
            setTesting(null);
        }
    };

    const handleSync = async (id, type) => {
        setSyncing(`${id}-${type}`);
        try {
            let response;
            if (type === 'full') {
                response = await integrationsAPI.syncFull(id);
            } else if (type === 'employees') {
                response = await integrationsAPI.syncEmployees(id);
            } else {
                response = await integrationsAPI.syncAttendance(id);
            }
            toast.success(`Sync completed: ${JSON.stringify(response.data.stats || response.data.results)}`);
            fetchIntegrations();
        } catch (err) {
            toast.error(`Sync failed: ${err.message}`);
        } finally {
            setSyncing(null);
        }
    };

    const handleViewLogs = async (integration) => {
        setSelectedIntegration(integration);
        try {
            const response = await integrationsAPI.getLogs(integration.id);
            setSyncLogs(response.data);
            setLogsDialogOpen(true);
        } catch (err) {
            setError(err.message);
        }
    };

    const getTypeInfo = (type) => {
        return integrationTypes.find(t => t.type === type) || {
            type: 'webhook',
            name: 'Generic Webhook / API',
            icon: '🔗',
            color: '#FF9800'
        };
    };

    const renderIntegrationCard = (integration) => {
        const typeInfo = getTypeInfo(integration.type);
        const busySync = syncing?.startsWith(integration.id);

        return (
            <div key={integration.id} className={`card-base flex flex-col ${integration.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl leading-none" aria-hidden="true">{typeInfo.icon}</span>
                        <div className="min-w-0">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{integration.name}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{typeInfo.name}</p>
                        </div>
                    </div>
                    <Pill tone={integration.is_active ? 'good' : 'neutral'}>
                        {integration.is_active ? 'Active' : 'Inactive'}
                    </Pill>
                </div>

                {integration.base_url && (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 break-all">{integration.base_url}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                    {integration.sync_employees && <Pill>Employees</Pill>}
                    {integration.sync_attendance && <Pill>Attendance</Pill>}
                    {integration.sync_leaves && <Pill>Leaves</Pill>}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        Last sync: {integration.last_sync_at ? formatDateTime(integration.last_sync_at) : 'Never'}
                    </span>
                    {integration.last_sync_status && (
                        <Pill tone={integration.last_sync_status === 'success' ? 'good' : 'bad'}>{integration.last_sync_status}</Pill>
                    )}
                </div>

                <div className="mt-3 flex justify-end gap-1">
                    <IconAction label="View logs" icon={FileText} onClick={() => handleViewLogs(integration)} />
                    <IconAction label="Test connection" icon={testing === integration.id ? Loader2 : Check}
                        spin={testing === integration.id} disabled={testing === integration.id}
                        onClick={() => handleTest(integration.id)} />
                    <IconAction label="Sync now" icon={busySync ? Loader2 : RefreshCw} spin={busySync}
                        disabled={busySync} onClick={() => handleSync(integration.id, 'full')} />
                    <IconAction label="Edit" icon={Edit2} onClick={() => handleOpenDialog(integration)} />
                    <IconAction label="Delete" icon={Trash2} danger onClick={() => handleDelete(integration.id)} />
                </div>
            </div>
        );
    };

    // Shorthand for the many config text fields: value lives under formData.config.
    const configField = (key, label, helper, extra = {}) => (
        <Field
            id={`int-config-${key}`}
            label={label}
            helper={helper}
            value={formData.config?.[key] || ''}
            onChange={(v) => setFormData({ ...formData, config: { ...formData.config, [key]: v } })}
            {...extra}
        />
    );

    const TABS = ['Basic Info', 'Authentication', 'Sync Settings'];

    return (
        <>
        <ListPage
            title="HRMS Integrations"
            count={loading ? undefined : integrations.length}
            actions={<Button mutating variant="primary" size="toolbar" icon={Plus} onClick={() => handleOpenDialog()}>Add Integration</Button>}
            bodyClassName="p-4 sm:p-6"
        >
            <div className="space-y-4">
            {error && (
                <div role="alert" className="flex items-start gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => setError(null)} className="text-xs font-semibold underline underline-offset-2">Dismiss</button>
                </div>
            )}

            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-52 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            ) : integrations.length === 0 ? (
                <div className="py-20 text-center">
                    <Network size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">No integrations configured</h3>
                    <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">Connect your attendance system with an external HRMS</p>
                    <Button mutating variant="primary" icon={Plus} onClick={() => handleOpenDialog()}>Add your first integration</Button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {integrations.map(renderIntegrationCard)}
                </div>
            )}
            </div>
        </ListPage>

            {/* Add/Edit */}
            <Modal
                open={dialogOpen}
                onClose={handleCloseDialog}
                title={selectedIntegration ? 'Edit Integration' : 'Add New Integration'}
                size="lg"
                footer={
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={handleCloseDialog}>Cancel</Button>
                        <Button variant="primary" onClick={handleSave}>{selectedIntegration ? 'Update' : 'Create'}</Button>
                    </div>
                }
            >
                <div role="tablist" aria-label="Integration settings" className="inline-flex p-1 mb-5 rounded-lg bg-slate-100 dark:bg-slate-800 gap-1">
                    {TABS.map((t, i) => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={tabValue === i}
                            onClick={() => setTabValue(i)}
                            className={`px-3 h-8 rounded-md text-sm font-medium transition-colors ${tabValue === i
                                ? 'bg-app-surface text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {tabValue === 0 && (
                    <div className="space-y-4">
                        <Field id="int-name" label="Integration Name" value={formData.name}
                            onChange={(v) => setFormData({ ...formData, name: v })}
                            placeholder="e.g., My Company greytHR" />
                        <div>
                            <label htmlFor="int-type" className={LABEL}>Integration Type</label>
                            <select
                                id="int-type"
                                className="field"
                                value={formData.type}
                                disabled={integrationTypes.length === 0}
                                onChange={(e) => {
                                    // Reset form data when type changes
                                    setFormData({
                                        ...formData,
                                        type: e.target.value,
                                        base_url: '',
                                        api_key: '',
                                        api_secret: '',
                                        username: '',
                                        password: '',
                                        database_name: '',
                                        config: {}
                                    });
                                }}
                            >
                                {integrationTypes.length > 0
                                    ? integrationTypes.map(t => <option key={t.type} value={t.type}>{t.icon} {t.name}</option>)
                                    : <option>Loading integration types…</option>}
                            </select>
                            {formData.type && (() => {
                                const typeInfo = integrationTypes.find(t => t.type === formData.type);
                                if (!typeInfo) return null;

                                // What this integration will and will not sync, read off
                                // the adapter class by the server. Shown before saving
                                // because the gaps are not obvious and not cosmetic: an
                                // integration without holidays counts every public
                                // holiday as an absence, and without shifts everyone is
                                // measured against one fallback start time. That
                                // combination produced 409 absences in a month here.
                                const LABELS = {
                                    employees: 'Employees',
                                    shifts: 'Shifts',
                                    holidays: 'Holidays',
                                    leave: 'Leave',
                                    push_attendance: 'Attendance push',
                                    push_leave: 'Leave push'
                                };
                                const has = typeInfo.capabilities || [];
                                const missing = Object.keys(LABELS).filter(
                                    k => !has.includes(k) && k !== 'push_leave'
                                );

                                return (
                                    <div className="mt-2">
                                        <p className="text-xs text-slate-600 dark:text-slate-400">{typeInfo.description}</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {has.map(c => <Pill key={c} tone="good">{LABELS[c] || c}</Pill>)}
                                            {missing.map(c => <Pill key={c}>{`No ${(LABELS[c] || c).toLowerCase()}`}</Pill>)}
                                        </div>
                                        {missing.includes('holidays') && (
                                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                                This integration does not sync holidays or leave. Public holidays and
                                                approved days off will be counted as absences unless they are entered
                                                here directly.
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <Field id="int-base-url" label="Base URL" value={formData.base_url}
                            onChange={(v) => setFormData({ ...formData, base_url: v })}
                            placeholder="https://your-erp-instance.com"
                            helper="The base URL of your HRMS instance" />
                        {formData.type === 'odoo' && (
                            <Field id="int-db-basic" label="Database Name" value={formData.database_name}
                                onChange={(v) => setFormData({ ...formData, database_name: v })}
                                helper="Required for Odoo - the database name to connect to" />
                        )}
                    </div>
                )}

                {tabValue === 1 && (() => {
                    const typeInfo = integrationTypes.find(t => t.type === formData.type);
                    if (!typeInfo) return <Loader2 size={20} className="animate-spin text-slate-500" />;

                    const requiredFields = typeInfo.required_fields || [];
                    const optionalFields = typeInfo.optional_fields || [];
                    const configFields = typeInfo.config_fields || [];
                    const allFields = [...requiredFields, ...optionalFields];
                    const req = (f) => requiredFields.includes(f);

                    return (
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Dynamic fields based on integration type */}
                            {allFields.includes('api_key') && (
                                <Field id="int-api-key" label="API Key" type="password" required={req('api_key')}
                                    value={formData.api_key || ''} onChange={(v) => setFormData({ ...formData, api_key: v })}
                                    helper={req('api_key') ? 'Required' : 'Optional'} />
                            )}
                            {allFields.includes('api_secret') && (
                                <Field id="int-api-secret" label="API Secret" type="password" required={req('api_secret')}
                                    value={formData.api_secret || ''} onChange={(v) => setFormData({ ...formData, api_secret: v })}
                                    helper={req('api_secret') ? 'Required' : 'Optional'} />
                            )}
                            {allFields.includes('username') && (
                                <Field id="int-username" label="Username" required={req('username')}
                                    value={formData.username || ''} onChange={(v) => setFormData({ ...formData, username: v })}
                                    helper={req('username') ? 'Required' : 'Optional'} />
                            )}
                            {allFields.includes('password') && (
                                <Field id="int-password" label="Password" type="password" required={req('password')}
                                    value={formData.password || ''} onChange={(v) => setFormData({ ...formData, password: v })}
                                    helper={req('password') ? 'Required' : 'Optional'} />
                            )}
                            {allFields.includes('database_name') && (
                                <div className="md:col-span-2">
                                    <Field id="int-db" label="Database Name" required={req('database_name')}
                                        value={formData.database_name || ''} onChange={(v) => setFormData({ ...formData, database_name: v })}
                                        helper={req('database_name') ? 'Required for Odoo' : 'Optional'} />
                                </div>
                            )}

                            {/* Config fields for specific integrations */}
                            {configFields.length > 0 && (
                                <>
                                    <h4 className="md:col-span-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                        Additional Configuration
                                    </h4>
                                    {configFields.includes('domain') && configField('domain', 'greytHR Domain',
                                        'Company subdomain, builds https://<domain>.greythr.com (leave blank if Base URL is set)')}
                                    {configFields.includes('api_id') && configField('api_id', 'API ID',
                                        'greytHR API ID (from the API Details page)')}
                                    {configFields.includes('private_key') && (
                                        <div className="md:col-span-2">
                                            {configField('private_key', 'RSA Private Key (PEM)',
                                                'Paste the full .pem including the BEGIN/END lines. Signs each swipe batch; greytHR holds the matching public key.',
                                                { multiline: true })}
                                        </div>
                                    )}
                                    {configFields.includes('subdomain') && configField('subdomain', 'Subdomain',
                                        "BambooHR subdomain (e.g., 'company' for company.bamboohr.com)")}
                                    {configFields.includes('tenant') && configField('tenant', 'Tenant', 'Workday tenant identifier')}
                                    {configFields.includes('company_id') && configField('company_id', 'Company ID', 'SAP SuccessFactors company identifier')}
                                    {configFields.includes('api_version') && configField('api_version', 'API Version', 'SAP SuccessFactors API version')}
                                    {configFields.includes('refresh_token') && configField('refresh_token', 'Refresh Token',
                                        'Zoho People OAuth refresh token', { type: 'password' })}
                                    {configFields.includes('accounts_url') && configField('accounts_url', 'Accounts URL', 'Zoho People accounts URL')}
                                </>
                            )}

                            {/* Test Connection */}
                            {selectedIntegration && (
                                <div className="md:col-span-2 space-y-3">
                                    <Button
                                        variant="secondary"
                                        icon={testing ? Loader2 : Check}
                                        onClick={() => handleTest(selectedIntegration.id)}
                                        disabled={Boolean(testing)}
                                    >
                                        Test Connection
                                    </Button>
                                    {testResult && (
                                        <div role="status" className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${testResult.success
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                                            : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}>
                                            {testResult.success ? <CheckCircle size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                                            <span className="break-words">{testResult.message}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Documentation Link */}
                            {typeInfo.documentation && (
                                <div className="md:col-span-2 flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                                    <Info size={16} className="shrink-0 mt-0.5" />
                                    <span>
                                        <strong>Documentation:</strong>{' '}
                                        <a href={typeInfo.documentation} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
                                            {typeInfo.documentation}
                                        </a>
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {tabValue === 2 && (
                    <div className="space-y-4">
                        <Toggle id="int-active" label="Active" checked={formData.is_active}
                            onChange={(v) => setFormData({ ...formData, is_active: v })} />
                        <Toggle id="int-sync-emp" label="Sync Employees (Pull from HRMS)" checked={formData.sync_employees}
                            onChange={(v) => setFormData({ ...formData, sync_employees: v })} />
                        <Toggle id="int-sync-att" label="Sync Attendance (Push to HRMS)" checked={formData.sync_attendance}
                            onChange={(v) => setFormData({ ...formData, sync_attendance: v })} />
                        <Toggle id="int-sync-leave" label="Sync Leaves" checked={formData.sync_leaves}
                            onChange={(v) => setFormData({ ...formData, sync_leaves: v })} />
                        <div className="max-w-xs">
                            <Field
                                id="int-interval"
                                label="Sync Interval (minutes)"
                                type="number"
                                min={1}
                                value={formData.sync_interval_minutes || ''}
                                onChange={(value) => {
                                    const numValue = value === '' ? 30 : parseInt(value, 10);
                                    if (!isNaN(numValue) && numValue > 0) {
                                        setFormData({ ...formData, sync_interval_minutes: numValue });
                                    }
                                }}
                                helper="How often to automatically sync"
                            />
                        </div>
                    </div>
                )}
            </Modal>

            {/* Sync Logs */}
            <Modal
                open={logsDialogOpen}
                onClose={() => setLogsDialogOpen(false)}
                title={`Sync Logs - ${selectedIntegration?.name || ''}`}
                size="xl"
                footer={
                    <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setLogsDialogOpen(false)}>Close</Button>
                    </div>
                }
            >
                {syncLogs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">No sync runs recorded yet.</p>
                ) : (
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[11px] uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400">
                                <tr>
                                    {['Time', 'Type', 'Direction', 'Status', 'Processed', 'Success', 'Failed', 'Message'].map(h => (
                                        <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {syncLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">{formatDateTime(log.started_at)}</td>
                                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{log.sync_type}</td>
                                        <td className="px-3 py-2.5"><Pill>{log.direction}</Pill></td>
                                        <td className="px-3 py-2.5">
                                            <Pill tone={log.status === 'success' ? 'good' : log.status === 'partial' ? 'warn' : 'bad'}>{log.status}</Pill>
                                        </td>
                                        <td className="px-3 py-2.5 tabular-nums">{log.records_processed}</td>
                                        <td className="px-3 py-2.5 tabular-nums">{log.records_success}</td>
                                        <td className="px-3 py-2.5 tabular-nums">{log.records_failed}</td>
                                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-[320px] break-words">{log.error_message || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>
        </>
    );
};

// ── Small local building blocks (replacing the MUI set this page used) ──────

const LABEL = 'block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300';

const PILL_TONES = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    warn: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    bad: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
};

function Pill({ tone = 'neutral', icon: Icon, children }) {
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${PILL_TONES[tone]}`}>
            {Icon && <Icon size={12} aria-hidden="true" />}
            {children}
        </span>
    );
}

function IconAction({ label, icon: Icon, onClick, disabled, spin, danger }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            className={`grid place-items-center w-9 h-9 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${danger
                ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}
        >
            <Icon size={17} className={spin ? 'animate-spin' : ''} />
        </button>
    );
}

function Field({ id, label, helper, value, onChange, multiline, required, ...rest }) {
    const helperId = helper ? `${id}-help` : undefined;
    return (
        <div>
            <label htmlFor={id} className={LABEL}>
                {label}{required && <span className="text-rose-500"> *</span>}
            </label>
            {multiline ? (
                <textarea
                    id={id}
                    className="field font-mono text-xs"
                    rows={6}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-describedby={helperId}
                    spellCheck={false}
                    {...rest}
                />
            ) : (
                <input
                    id={id}
                    className="field"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-describedby={helperId}
                    required={required}
                    {...rest}
                />
            )}
            {helper && <p id={helperId} className="mt-1 text-xs text-slate-600 dark:text-slate-400">{helper}</p>}
        </div>
    );
}

function Toggle({ id, label, checked, onChange }) {
    return (
        <label htmlFor={id} className="flex items-center gap-3 cursor-pointer select-none">
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={Boolean(checked)}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[rgb(var(--brand))]' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
        </label>
    );
}

export default Integrations;
