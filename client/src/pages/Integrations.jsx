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
    Box, Typography, Paper, Grid, IconButton, Chip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, FormControl,
    InputLabel, Select, MenuItem, Switch, FormControlLabel, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Tabs, Tab, Card, CardContent, Tooltip,
    LinearProgress, Divider
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    PlayArrow as SyncIcon, Check as CheckIcon, Close as CloseIcon,
    Refresh as RefreshIcon, Settings as SettingsIcon, History as HistoryIcon,
    CloudSync as CloudSyncIcon, Link as LinkIcon, LinkOff as LinkOffIcon
} from '@mui/icons-material';
import { integrationsAPI } from '../api';
import { Button, useToast } from '../components';

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
        if (!window.confirm('Are you sure you want to delete this integration?')) return;
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
        const isOnline = integration.last_sync_status === 'success';

        return (
            <Card
                key={integration.id}
                sx={{
                    height: '100%',
                    borderLeft: `4px solid ${typeInfo.color}`,
                    opacity: integration.is_active ? 1 : 0.6
                }}
            >
                <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="h5">{typeInfo.icon}</Typography>
                            <Box>
                                <Typography variant="h6">{integration.name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {typeInfo.name}
                                </Typography>
                            </Box>
                        </Box>
                        <Chip
                            icon={integration.is_active ? <LinkIcon /> : <LinkOffIcon />}
                            label={integration.is_active ? 'Active' : 'Inactive'}
                            color={integration.is_active ? 'success' : 'default'}
                            size="small"
                        />
                    </Box>

                    <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                        {integration.base_url}
                    </Typography>

                    <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {integration.sync_employees && <Chip label="Employees" size="small" variant="outlined" />}
                        {integration.sync_attendance && <Chip label="Attendance" size="small" variant="outlined" />}
                        {integration.sync_leaves && <Chip label="Leaves" size="small" variant="outlined" />}
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="caption" color="text.secondary">
                            Last sync: {integration.last_sync_at
                                ? new Date(integration.last_sync_at).toLocaleString()
                                : 'Never'}
                        </Typography>
                        {integration.last_sync_status && (
                            <Chip
                                label={integration.last_sync_status}
                                size="small"
                                color={integration.last_sync_status === 'success' ? 'success' : 'error'}
                            />
                        )}
                    </Box>

                    <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title="View Logs">
                            <IconButton
                                size="small"
                                onClick={() => handleViewLogs(integration)}
                                sx={{
                                    color: '#2563EB',
                                    '&:hover': { backgroundColor: '#DBEAFE', color: '#1D4ED8' }
                                }}
                            >
                                <HistoryIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Test Connection">
                            <IconButton
                                size="small"
                                onClick={() => handleTest(integration.id)}
                                disabled={testing === integration.id}
                                sx={{
                                    color: '#059669',
                                    '&:hover': { backgroundColor: '#D1FAE5', color: '#047857' },
                                    '&.Mui-disabled': { color: '#9CA3AF' }
                                }}
                            >
                                {testing === integration.id ? <CircularProgress size={20} /> : <CheckIcon />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Sync Now">
                            <IconButton
                                size="small"
                                onClick={() => handleSync(integration.id, 'full')}
                                disabled={syncing?.startsWith(integration.id)}
                                sx={{
                                    color: '#9333EA',
                                    '&:hover': { backgroundColor: '#F3E8FF', color: '#7E22CE' },
                                    '&.Mui-disabled': { color: '#9CA3AF' }
                                }}
                            >
                                {syncing?.startsWith(integration.id) ? <CircularProgress size={20} /> : <SyncIcon />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={() => handleOpenDialog(integration)}
                                sx={{
                                    color: '#475569',
                                    '&:hover': { backgroundColor: '#F1F5F9', color: '#334155' }
                                }}
                            >
                                <EditIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={() => handleDelete(integration.id)}
                                sx={{
                                    color: '#DC2626',
                                    '&:hover': { backgroundColor: '#FEE2E2', color: '#B91C1C' }
                                }}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </CardContent>
            </Card>
        );
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        <CloudSyncIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        HRMS Integrations
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Connect with external HR systems: ERPNext, Odoo, Horilla, SAP SuccessFactors, Workday, BambooHR, Zoho People, and Webhooks
                    </Typography>
                </Box>
                <Button type="button" variant="successSolid" onClick={() => handleOpenDialog()}>
                    <AddIcon sx={{ fontSize: 18 }} /> Add Integration
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {loading ? (
                <Box display="flex" justifyContent="center" p={5}>
                    <CircularProgress />
                </Box>
            ) : integrations.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center' }}>
                    <CloudSyncIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        No integrations configured
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Connect your attendance system with external HRMS
                    </Typography>
                    <Button type="button" variant="primary" className="mx-auto" onClick={() => handleOpenDialog()}>
                        <AddIcon sx={{ fontSize: 18 }} /> Add Your First Integration
                    </Button>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {integrations.map(integration => (
                        <Grid size={{ xs: 12, md: 6, lg: 4 }} key={integration.id}>
                            {renderIntegrationCard(integration)}
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>
                    {selectedIntegration ? 'Edit Integration' : 'Add New Integration'}
                </DialogTitle>
                <DialogContent>
                    <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 3 }}>
                        <Tab label="Basic Info" />
                        <Tab label="Authentication" />
                        <Tab label="Sync Settings" />
                    </Tabs>

                    {tabValue === 0 && (
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    label="Integration Name"
                                    fullWidth
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., My Company ERPNext"
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Integration Type</InputLabel>
                                    <Select
                                        value={formData.type}
                                        label="Integration Type"
                                        onChange={(e) => {
                                            const selectedType = integrationTypes.find(t => t.type === e.target.value);
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
                                        {integrationTypes.length > 0 ? (
                                            integrationTypes.map(t => (
                                                <MenuItem key={t.type} value={t.type}>
                                                    <span style={{ marginRight: 8 }}>{t.icon}</span> {t.name}
                                                </MenuItem>
                                            ))
                                        ) : (
                                            <MenuItem disabled>Loading integration types...</MenuItem>
                                        )}
                                    </Select>
                                </FormControl>
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
                                        <Box sx={{ mt: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                {typeInfo.description}
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                                                {has.map(c => (
                                                    <Chip key={c} size="small" color="success" variant="outlined"
                                                        label={LABELS[c] || c} />
                                                ))}
                                                {missing.map(c => (
                                                    <Chip key={c} size="small" variant="outlined"
                                                        label={`No ${(LABELS[c] || c).toLowerCase()}`} />
                                                ))}
                                            </Box>
                                            {missing.includes('holidays') && (
                                                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                                                    This integration does not sync holidays or leave. Public holidays and
                                                    approved days off will be counted as absences unless they are entered
                                                    here directly.
                                                </Typography>
                                            )}
                                        </Box>
                                    );
                                })()}
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <TextField
                                    label="Base URL"
                                    fullWidth
                                    value={formData.base_url}
                                    onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                                    placeholder="https://your-erp-instance.com"
                                    helperText="The base URL of your HRMS instance"
                                />
                            </Grid>
                            {formData.type === 'odoo' && (
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        label="Database Name"
                                        fullWidth
                                        value={formData.database_name}
                                        onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                                        helperText="Required for Odoo - the database name to connect to"
                                    />
                                </Grid>
                            )}
                        </Grid>
                    )}

                    {tabValue === 1 && (() => {
                        const typeInfo = integrationTypes.find(t => t.type === formData.type);
                        if (!typeInfo) return <CircularProgress />;

                        const requiredFields = typeInfo.required_fields || [];
                        const optionalFields = typeInfo.optional_fields || [];
                        const configFields = typeInfo.config_fields || [];
                        const allFields = [...requiredFields, ...optionalFields];

                        return (
                            <Grid container spacing={2}>
                                {/* Dynamic fields based on integration type */}
                                {allFields.includes('api_key') && (
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            label="API Key"
                                            fullWidth
                                            required={requiredFields.includes('api_key')}
                                            value={formData.api_key || ''}
                                            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                                            type="password"
                                            helperText={requiredFields.includes('api_key') ? 'Required' : 'Optional'}
                                        />
                                    </Grid>
                                )}
                                {allFields.includes('api_secret') && (
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            label="API Secret"
                                            fullWidth
                                            required={requiredFields.includes('api_secret')}
                                            value={formData.api_secret || ''}
                                            onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                                            type="password"
                                            helperText={requiredFields.includes('api_secret') ? 'Required' : 'Optional'}
                                        />
                                    </Grid>
                                )}
                                {allFields.includes('username') && (
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            label="Username"
                                            fullWidth
                                            required={requiredFields.includes('username')}
                                            value={formData.username || ''}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                            helperText={requiredFields.includes('username') ? 'Required' : 'Optional'}
                                        />
                                    </Grid>
                                )}
                                {allFields.includes('password') && (
                                    <Grid size={{ xs: 12, md: 6 }}>
                                        <TextField
                                            label="Password"
                                            fullWidth
                                            required={requiredFields.includes('password')}
                                            value={formData.password || ''}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            type="password"
                                            helperText={requiredFields.includes('password') ? 'Required' : 'Optional'}
                                        />
                                    </Grid>
                                )}
                                {allFields.includes('database_name') && (
                                    <Grid size={{ xs: 12 }}>
                                        <TextField
                                            label="Database Name"
                                            fullWidth
                                            required={requiredFields.includes('database_name')}
                                            value={formData.database_name || ''}
                                            onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                                            helperText={requiredFields.includes('database_name') ? 'Required for Odoo' : 'Optional'}
                                        />
                                    </Grid>
                                )}

                                {/* Config fields for specific integrations */}
                                {configFields.length > 0 && (
                                    <>
                                        <Grid size={{ xs: 12 }}>
                                            <Divider sx={{ my: 1 }} />
                                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                                Additional Configuration
                                            </Typography>
                                        </Grid>
                                        {configFields.includes('subdomain') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="Subdomain"
                                                    fullWidth
                                                    value={formData.config?.subdomain || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, subdomain: e.target.value }
                                                    })}
                                                    helperText="BambooHR subdomain (e.g., 'company' for company.bamboohr.com)"
                                                />
                                            </Grid>
                                        )}
                                        {configFields.includes('tenant') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="Tenant"
                                                    fullWidth
                                                    value={formData.config?.tenant || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, tenant: e.target.value }
                                                    })}
                                                    helperText="Workday tenant identifier"
                                                />
                                            </Grid>
                                        )}
                                        {configFields.includes('company_id') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="Company ID"
                                                    fullWidth
                                                    value={formData.config?.company_id || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, company_id: e.target.value }
                                                    })}
                                                    helperText="SAP SuccessFactors company identifier"
                                                />
                                            </Grid>
                                        )}
                                        {configFields.includes('api_version') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="API Version"
                                                    fullWidth
                                                    value={formData.config?.api_version || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, api_version: e.target.value }
                                                    })}
                                                    helperText="SAP SuccessFactors API version"
                                                />
                                            </Grid>
                                        )}
                                        {configFields.includes('refresh_token') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="Refresh Token"
                                                    fullWidth
                                                    value={formData.config?.refresh_token || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, refresh_token: e.target.value }
                                                    })}
                                                    type="password"
                                                    helperText="Zoho People OAuth refresh token"
                                                />
                                            </Grid>
                                        )}
                                        {configFields.includes('accounts_url') && (
                                            <Grid size={{ xs: 12, md: 6 }}>
                                                <TextField
                                                    label="Accounts URL"
                                                    fullWidth
                                                    value={formData.config?.accounts_url || ''}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        config: { ...formData.config, accounts_url: e.target.value }
                                                    })}
                                                    helperText="Zoho People accounts URL"
                                                />
                                            </Grid>
                                        )}
                                    </>
                                )}

                                {/* Test Connection Button */}
                                {selectedIntegration && (
                                    <Grid size={{ xs: 12 }}>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => handleTest(selectedIntegration.id)}
                                            disabled={testing}
                                        >
                                            {testing ? <CircularProgress size={16} /> : <CheckIcon sx={{ fontSize: 16 }} />}
                                            Test Connection
                                        </Button>
                                        {testResult && (
                                            <Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
                                                {testResult.message}
                                            </Alert>
                                        )}
                                    </Grid>
                                )}

                                {/* Documentation Link */}
                                {typeInfo.documentation && (
                                    <Grid size={{ xs: 12 }}>
                                        <Alert severity="info" sx={{ mt: 1 }}>
                                            <Typography variant="body2">
                                                <strong>Documentation:</strong>{' '}
                                                <a href={typeInfo.documentation} target="_blank" rel="noopener noreferrer">
                                                    {typeInfo.documentation}
                                                </a>
                                            </Typography>
                                        </Alert>
                                    </Grid>
                                )}
                            </Grid>
                        );
                    })()}

                    {tabValue === 2 && (
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.is_active}
                                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        />
                                    }
                                    label="Active"
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.sync_employees}
                                            onChange={(e) => setFormData({ ...formData, sync_employees: e.target.checked })}
                                        />
                                    }
                                    label="Sync Employees (Pull from HRMS)"
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.sync_attendance}
                                            onChange={(e) => setFormData({ ...formData, sync_attendance: e.target.checked })}
                                        />
                                    }
                                    label="Sync Attendance (Push to HRMS)"
                                />
                            </Grid>
                            <Grid size={{ xs: 12 }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formData.sync_leaves}
                                            onChange={(e) => setFormData({ ...formData, sync_leaves: e.target.checked })}
                                        />
                                    }
                                    label="Sync Leaves"
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 6 }}>
                                <TextField
                                    label="Sync Interval (minutes)"
                                    type="number"
                                    fullWidth
                                    value={formData.sync_interval_minutes || ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        const numValue = value === '' ? 30 : parseInt(value, 10);
                                        if (!isNaN(numValue) && numValue > 0) {
                                            setFormData({ ...formData, sync_interval_minutes: numValue });
                                        }
                                    }}
                                    helperText="How often to automatically sync"
                                    inputProps={{ min: 1 }}
                                />
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button type="button" variant="secondary" onClick={handleCloseDialog}>
                        Cancel
                    </Button>
                    <Button type="button" variant="primary" onClick={handleSave}>
                        {selectedIntegration ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Sync Logs Dialog */}
            <Dialog open={logsDialogOpen} onClose={() => setLogsDialogOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    Sync Logs - {selectedIntegration?.name}
                </DialogTitle>
                <DialogContent>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Direction</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Processed</TableCell>
                                    <TableCell>Success</TableCell>
                                    <TableCell>Failed</TableCell>
                                    <TableCell>Message</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {syncLogs.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                                        <TableCell>{log.sync_type}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={log.direction}
                                                size="small"
                                                color={log.direction === 'push' ? 'primary' : 'secondary'}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={log.status}
                                                size="small"
                                                color={log.status === 'success' ? 'success' : log.status === 'partial' ? 'warning' : 'error'}
                                            />
                                        </TableCell>
                                        <TableCell>{log.records_processed}</TableCell>
                                        <TableCell>{log.records_success}</TableCell>
                                        <TableCell>{log.records_failed}</TableCell>
                                        <TableCell>{log.error_message || '-'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions>
                    <Button type="button" variant="secondary" onClick={() => setLogsDialogOpen(false)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Integrations;
