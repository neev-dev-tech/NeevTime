import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Button, IconButton, Chip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, FormControl,
    InputLabel, Select, MenuItem, Switch, FormControlLabel, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Tooltip, Divider, Card, CardContent, LinearProgress} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
    PlayArrow as RunIcon, History as HistoryIcon, 
    Schedule as ScheduleIcon, Email as EmailIcon,
    Description as ReportIcon, CheckCircle as SuccessIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import api from '../api';

const ScheduledReports = () => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);
    const [running, setRunning] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        report_type: 'daily-attendance',
        frequency: 'daily',
        run_time: '08:00',
        recipient_emails: '',
        format: 'pdf',
        is_active: true,
        filters: {}
    });

    useEffect(() => {
        fetchSchedules();
    }, []);

    const fetchSchedules = async () => {
        try {
            setLoading(true);
            const response = await api.get('/api/reports/scheduled');
            setSchedules(response.data);
        } catch (err) {
            setError('Failed to fetch schedules: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (schedule = null) => {
        if (schedule) {
            setFormData({
                ...schedule,
                recipient_emails: Array.isArray(schedule.recipient_emails) ? schedule.recipient_emails.join(', ') : schedule.recipient_emails
            });
            setSelectedSchedule(schedule);
        } else {
            setFormData({
                name: '',
                report_type: 'daily-attendance',
                frequency: 'daily',
                run_time: '08:00',
                recipient_emails: '',
                format: 'pdf',
                is_active: true,
                filters: {}
            });
            setSelectedSchedule(null);
        }
        setDialogOpen(true);
    };

    const handleSave = async () => {
        try {
            const data = {
                ...formData,
                recipient_emails: formData.recipient_emails.split(',').map(e => e.trim()).filter(e => e)
            };

            if (selectedSchedule) {
                await api.put(`/api/reports/scheduled/${selectedSchedule.id}`, data);
            } else {
                await api.post('/api/reports/scheduled', data);
            }
            fetchSchedules();
            setDialogOpen(false);
        } catch (err) {
            setError('Save failed: ' + err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this schedule?')) return;
        try {
            await api.delete(`/api/reports/scheduled/${id}`);
            fetchSchedules();
        } catch (err) {
            setError('Delete failed: ' + err.message);
        }
    };

    const handleRunNow = async (id) => {
        setRunning(id);
        try {
            const res = await api.post(`/api/reports/scheduled/${id}/run`);
            alert('Report triggered: ' + res.data.message);
        } catch (err) {
            alert('Run failed: ' + err.message);
        } finally {
            setRunning(null);
        }
    };

    const handleViewHistory = async (schedule) => {
        setSelectedSchedule(schedule);
        try {
            // This endpoint might need to be verified in the backend
            const res = await api.get(`/api/reports/scheduled/${schedule.id}/history`);
            setHistory(res.data);
            setHistoryDialogOpen(true);
        } catch (err) {
            setError('Failed to fetch history: ' + err.message);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1E293B' }}>
                        <ScheduleIcon sx={{ mr: 1, verticalAlign: 'bottom', color: '#F97316' }} />
                        Scheduled Reports
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Automate your reporting workflow. Reports will be sent via email on the configured schedule.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
                        boxShadow: '0 4px 12px rgba(249, 115, 22, 0.2)',
                        px: 3
                    }}
                >
                    Add Schedule
                </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

            {loading ? (
                <LinearProgress />
            ) : schedules.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', borderRadius: '16px' }}>
                    <ReportIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 2 }} />
                    <Typography variant="h6">No scheduled reports</Typography>
                    <Typography color="text.secondary">Create a schedule to automatically receive reports in your inbox.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {schedules.map(s => (
                        <Grid item xs={12} md={6} lg={4} key={s.id}>
                            <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', position: 'relative', overflow: 'visible' }}>
                                {!s.is_active && (
                                    <Chip 
                                        label="Paused" 
                                        size="small" 
                                        sx={{ position: 'absolute', top: -10, right: 10, bgcolor: '#94A3B8', color: 'white' }} 
                                    />
                                )}
                                <CardContent>
                                    <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{s.name}</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                                                {s.report_type.replace('-', ' ')} • {s.frequency}
                                            </Typography>
                                        </Box>
                                        <ReportIcon sx={{ color: '#F97316' }} />
                                    </Box>

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <ScheduleIcon size={16} sx={{ color: '#64748B', fontSize: 16 }} />
                                            <Typography variant="body2">{s.run_time} ({s.frequency})</Typography>
                                        </Box>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <EmailIcon size={16} sx={{ color: '#64748B', fontSize: 16 }} />
                                            <Typography variant="body2" noWrap sx={{ maxWidth: '200px' }}>
                                                {Array.isArray(s.recipient_emails) ? s.recipient_emails.join(', ') : s.recipient_emails}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                        <Tooltip title="Run Now">
                                            <IconButton size="small" onClick={() => handleRunNow(s.id)} disabled={running === s.id}>
                                                {running === s.id ? <CircularProgress size={20} /> : <RunIcon sx={{ color: '#10B981' }} />}
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="History">
                                            <IconButton size="small" onClick={() => handleViewHistory(s)}>
                                                <HistoryIcon sx={{ color: '#3B82F6' }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Edit">
                                            <IconButton size="small" onClick={() => handleOpenDialog(s)}>
                                                <EditIcon sx={{ color: '#F97316' }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton size="small" onClick={() => handleDelete(s.id)}>
                                                <DeleteIcon sx={{ color: '#EF4444' }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{selectedSchedule ? 'Edit Schedule' : 'New Scheduled Report'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="Schedule Name"
                            fullWidth
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Report Type</InputLabel>
                            <Select
                                value={formData.report_type}
                                label="Report Type"
                                onChange={e => setFormData({ ...formData, report_type: e.target.value })}
                            >
                                <MenuItem value="daily-attendance">Daily Attendance</MenuItem>
                                <MenuItem value="monthly-summary">Monthly Summary</MenuItem>
                                <MenuItem value="late-early">Late/Early Report</MenuItem>
                                <MenuItem value="absent">Absent Report</MenuItem>
                            </Select>
                        </FormControl>
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Frequency</InputLabel>
                                    <Select
                                        value={formData.frequency}
                                        label="Frequency"
                                        onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                                    >
                                        <MenuItem value="daily">Daily</MenuItem>
                                        <MenuItem value="weekly">Weekly</MenuItem>
                                        <MenuItem value="monthly">Monthly</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Run Time"
                                    type="time"
                                    fullWidth
                                    value={formData.run_time}
                                    onChange={e => setFormData({ ...formData, run_time: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                        </Grid>
                        <TextField
                            label="Recipient Emails"
                            fullWidth
                            multiline
                            rows={2}
                            value={formData.recipient_emails}
                            onChange={e => setFormData({ ...formData, recipient_emails: e.target.value })}
                            placeholder="email1@example.com, email2@example.com"
                            helperText="Comma-separated email addresses"
                        />
                        <FormControl fullWidth>
                            <InputLabel>Format</InputLabel>
                            <Select
                                value={formData.format}
                                label="Format"
                                onChange={e => setFormData({ ...formData, format: e.target.value })}
                            >
                                <MenuItem value="pdf">PDF Document</MenuItem>
                                <MenuItem value="xlsx">Excel Spreadsheet</MenuItem>
                                <MenuItem value="csv">CSV File</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                />
                            }
                            label="Active"
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#F97316', '&:hover': { bgcolor: '#EA580C' } }}>
                        Save Schedule
                    </Button>
                </DialogActions>
            </Dialog>

            {/* History Dialog */}
            <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Report History: {selectedSchedule?.name}</DialogTitle>
                <DialogContent>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Run Date</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Recipients</TableCell>
                                    <TableCell>Details</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {history.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">No history available</TableCell>
                                    </TableRow>
                                ) : (
                                    history.map((h, i) => (
                                        <TableRow key={i}>
                                            <TableCell>{new Date(h.run_at).toLocaleString()}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    icon={h.status === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                                                    label={h.status}
                                                    color={h.status === 'success' ? 'success' : 'error'}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>{h.recipients_count} sent</TableCell>
                                            <TableCell>{h.message || '-'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 3 }}>
                    <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ScheduledReports;
