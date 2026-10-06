import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Button, IconButton, Chip, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Tooltip, Divider, Card, CardContent,
    LinearProgress
} from '@mui/material';
import {
    Sync as SyncIcon, Error as ErrorIcon, CheckCircle as SuccessIcon,
    Refresh as RefreshIcon, History as HistoryIcon, 
    CloudOff as OfflineIcon, Warning as WarningIcon
} from '@mui/icons-material';
import api from '../api';

const SyncDashboard = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retrying, setRetrying] = useState(null);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/integrations/logs');
            setLogs(response.data);
        } catch (err) {
            setError('Failed to fetch sync logs: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async (logId) => {
        setRetrying(logId);
        try {
            // This is a placeholder for a retry endpoint if it exists
            await api.post(`/api/integrations/logs/${logId}/retry`);
            alert('Retry triggered');
            fetchLogs();
        } catch (err) {
            alert('Retry failed: ' + err.message);
        } finally {
            setRetrying(null);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1E293B' }}>
                        <SyncIcon sx={{ mr: 1, verticalAlign: 'bottom', color: '#3B82F6' }} />
                        Sync Monitoring
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Monitor HRMS integration health and troubleshoot failed data transfers.
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchLogs}
                    sx={{ borderRadius: '20px' }}
                >
                    Refresh
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#EEF2FF', border: '1px solid #C3DAFE' }}>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom variant="overline" sx={{ fontWeight: 700 }}>Total Syncs</Typography>
                            <Typography variant="h3" sx={{ color: '#312E81', fontWeight: 800 }}>{logs.length}</Typography>
                            <Typography variant="body2" sx={{ color: '#4338CA' }}>Last 24 hours</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom variant="overline" sx={{ fontWeight: 700 }}>Success Rate</Typography>
                            <Typography variant="h3" sx={{ color: '#065F46', fontWeight: 800 }}>
                                {logs.length > 0 
                                    ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) 
                                    : 100}%
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#047857' }}>All integrations</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#FEF2F2', border: '1px solid #FECACA' }}>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom variant="overline" sx={{ fontWeight: 700 }}>Failed Syncs</Typography>
                            <Typography variant="h3" sx={{ color: '#991B1B', fontWeight: 800 }}>
                                {logs.filter(l => l.status === 'failed' || l.status === 'error').length}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#B91C1C' }}>Action required</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <TableContainer component={Paper} sx={{ borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#F8FAFC' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Integration</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Records</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 10 }}>
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 10 }}>
                                    <Typography color="text.secondary">No sync logs found</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{log.integration_name || 'ERPNext'}</Typography>
                                        <Typography variant="caption" color="text.secondary">{log.sync_type}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={log.direction || 'Push'} size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#10B981' }}>{log.records_success}</Typography>
                                            <Typography variant="body2">/</Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: log.records_failed > 0 ? '#EF4444' : '#64748B' }}>{log.records_processed}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            label={log.status} 
                                            color={log.status === 'success' ? 'success' : 'error'} 
                                            size="small"
                                            icon={log.status === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{new Date(log.started_at).toLocaleString()}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {log.completed_at ? `${Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000)}s duration` : 'In progress'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: '250px' }}>
                                        <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.error_message || 'Successfully synced records to HRMS'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="View Details">
                                            <IconButton size="small">
                                                <HistoryIcon sx={{ color: '#64748B' }} />
                                            </IconButton>
                                        </Tooltip>
                                        {(log.status === 'failed' || log.status === 'error') && (
                                            <Tooltip title="Retry Sync">
                                                <IconButton size="small" onClick={() => handleRetry(log.id)} disabled={retrying === log.id}>
                                                    {retrying === log.id ? <CircularProgress size={20} /> : <SyncIcon sx={{ color: '#3B82F6' }} />}
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default SyncDashboard;
