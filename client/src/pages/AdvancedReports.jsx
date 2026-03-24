/**
 * Advanced Reports Page
 * 
 * Comprehensive reporting UI with:
 * - Report type selection
 * - Date range filters
 * - Department/Area filters
 * - Data visualization
 * - Export to CSV/PDF
 * - Scheduled reports
 */

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Button, TextField, FormControl,
    InputLabel, Select, MenuItem, Card, CardContent, CardActions,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Chip, Tabs, Tab, Divider, IconButton,
    Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
    LinearProgress, TablePagination
} from '@mui/material';
import {
    Assessment as ReportIcon, Download as DownloadIcon,
    PictureAsPdf as PdfIcon, TableChart as CsvIcon,
    Schedule as ScheduleIcon, Refresh as RefreshIcon,
    Today as TodayIcon, DateRange as DateRangeIcon,
    Person as PersonIcon, Groups as GroupsIcon,
    AccessTime as TimeIcon, EventBusy as AbsentIcon,
    Timer as OvertimeIcon, Devices as DevicesIcon,
    Fingerprint as BiometricIcon, TrendingUp as TrendIcon,
    GridOn as ExcelIcon
} from '@mui/icons-material';
import { reportsAPI, departmentsAPI, areasAPI } from '../api';
import { exportToPDF as exportPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import ReportErrorBoundary from '../components/ReportErrorBoundary';
import * as XLSX from 'xlsx';

const REPORT_CONFIGS = [
    {
        id: 'daily-attendance',
        name: 'Daily Attendance',
        icon: <TodayIcon />,
        description: 'View attendance for a specific date',
        color: '#2196F3'
    },
    {
        id: 'monthly-summary',
        name: 'Monthly Summary',
        icon: <DateRangeIcon />,
        description: 'Monthly attendance summary per employee',
        color: '#4CAF50'
    },
    {
        id: 'late-early',
        name: 'Late/Early Report',
        icon: <TimeIcon />,
        description: 'Late arrivals and early departures',
        color: '#FF9800'
    },
    {
        id: 'absent',
        name: 'Absent Report',
        icon: <AbsentIcon />,
        description: 'Absent employees by date',
        color: '#F44336'
    },
    {
        id: 'overtime',
        name: 'Overtime Report',
        icon: <OvertimeIcon />,
        description: 'Extra hours worked',
        color: '#9C27B0'
    },
    {
        id: 'device-health',
        name: 'Device Health',
        icon: <DevicesIcon />,
        description: 'Status of biometric devices',
        color: '#00BCD4'
    },
    {
        id: 'biometric-summary',
        name: 'Biometric Summary',
        icon: <BiometricIcon />,
        description: 'Enrolled biometrics overview',
        color: '#795548'
    }
];

const AdvancedReports = () => {
    const [selectedReport, setSelectedReport] = useState('daily-attendance');
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [areas, setAreas] = useState([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [dashboardData, setDashboardData] = useState(null);

    // Filters
    const [filters, setFilters] = useState({
        date: new Date().toISOString().split('T')[0],
        start_date: new Date(new Date().setDate(1)).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        department_id: '',
        area_id: '',
        shift_start: '09:00',
        shift_end: '18:00',
        grace_minutes: 15,
        regular_hours: 8
    });

    useEffect(() => {
        fetchDashboard();
        fetchDepartments();
        fetchAreas();
    }, []);

    const fetchDashboard = async () => {
        try {
            const response = await reportsAPI.getDashboard();
            setDashboardData(response.data);
        } catch (err) {
            console.error('Dashboard fetch error:', err);
        }
    };

    const fetchDepartments = async () => {
        try {
            const response = await departmentsAPI.getAll();
            setDepartments(response.data);
        } catch (err) {
            console.error('Departments fetch error:', err);
        }
    };

    const fetchAreas = async () => {
        try {
            const response = await areasAPI.getAll();
            setAreas(response.data);
        } catch (err) {
            console.error('Areas fetch error:', err);
        }
    };

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        try {
            let response;
            switch (selectedReport) {
                case 'daily-attendance':
                    response = await reportsAPI.getDailyAttendance(filters);
                    break;
                case 'monthly-summary':
                    response = await reportsAPI.getMonthlySummary(filters);
                    break;
                case 'late-early':
                    response = await reportsAPI.getLateEarly(filters);
                    break;
                case 'absent':
                    response = await reportsAPI.getAbsent(filters);
                    break;
                case 'overtime':
                    response = await reportsAPI.getOvertime(filters);
                    break;
                case 'device-health':
                    response = await reportsAPI.getDeviceHealth();
                    break;
                case 'biometric-summary':
                    response = await reportsAPI.getBiometricSummary();
                    break;
                default:
                    throw new Error('Unknown report type');
            }
            setReportData(response.data);
            setPage(0);
        } catch (err) {
            setError(err.message);
            setReportData(null);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = async () => {
        try {
            const params = new URLSearchParams(filters).toString();
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/reports/${selectedReport}/export/csv?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${selectedReport}_${filters.date || filters.year + '-' + filters.month}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError('Failed to export CSV: ' + err.message);
        }
    };

    const exportToPDF = () => {
        if (!reportData?.data || reportData.data.length === 0) {
            setError('No data to export. Please generate the report first.');
            return;
        }

        try {
            const config = getReportConfig(selectedReport);
            const dateRangeText = filters.date
                ? filters.date
                : filters.start_date && filters.end_date
                    ? `${filters.start_date} to ${filters.end_date}`
                    : `${filters.year}-${String(filters.month).padStart(2, '0')}`;

            const filterObj = {};
            if (filters.department_id) {
                const dept = departments.find(d => d.id === parseInt(filters.department_id));
                if (dept) filterObj.Department = dept.name;
            }
            if (filters.area_id) {
                const area = areas.find(a => a.id === parseInt(filters.area_id));
                if (area) filterObj.Area = area.name;
            }

            // Build summary cards from report summary data
            let summaryCards = null;
            if (reportData?.summary) {
                summaryCards = Object.entries(reportData.summary)
                    .filter(([key, value]) => typeof value !== 'object')
                    .slice(0, 5) // Max 5 cards
                    .map(([key, value]) => ({
                        label: key.replace(/_/g, ' '),
                        value: typeof value === 'number' ? value.toLocaleString() : value,
                        color: key.includes('present') || key.includes('success') ? 'success' :
                            key.includes('absent') || key.includes('error') ? 'error' :
                                key.includes('late') || key.includes('warning') ? 'warning' : 'primary'
                    }));
            }

            exportPDF({
                data: reportData.data,
                filename: `${selectedReport}_${dateRangeText.replace(/\s+/g, '_')}.pdf`,
                title: config?.name || 'Report',
                subtitle: config?.description || '',
                dateRange: dateRangeText,
                filters: filterObj,
                orientation: 'landscape',
                summaryData: summaryCards,
                showSignature: ['monthly-summary', 'overtime'].includes(selectedReport),
                signatureLabels: ['Prepared By', 'Verified By', 'HR Manager']
            });
        } catch (err) {
            const errorMsg = `Failed to export PDF: ${err.message}`;
            setError(errorMsg);
            console.error('PDF Export Error:', err);
            
            // Show user-friendly error dialog
            alert(
                '❌ PDF Export Failed\n\n' +
                'This could be due to:\n' +
                '• Dataset too large (try filtering or use Excel export)\n' +
                '• Browser memory limit reached\n' +
                '• Invalid data format\n\n' +
                'Recommendation: Use Excel or CSV export for large datasets.'
            );
        }
    };

    const exportToXLSX = () => {
        if (!reportData?.data || reportData.data.length === 0) {
            setError('No data to export. Please generate the report first.');
            return;
        }

        try {
            const config = getReportConfig(selectedReport);
            const dateRangeText = filters.date
                ? filters.date
                : filters.start_date && filters.end_date
                    ? `${filters.start_date} to ${filters.end_date}`
                    : `${filters.year}-${String(filters.month).padStart(2, '0')}`;

            const metadata = {
                'Report Type': config?.name || 'Report',
                'Description': config?.description || '',
                'Date Range': dateRangeText,
                'Generated At': new Date().toLocaleString()
            };

            if (filters.department_id) {
                const dept = departments.find(d => d.id === parseInt(filters.department_id));
                if (dept) metadata['Department'] = dept.name;
            }
            if (filters.area_id) {
                const area = areas.find(a => a.id === parseInt(filters.area_id));
                if (area) metadata['Area'] = area.name;
            }

            exportToExcel({
                data: reportData.data,
                filename: `${selectedReport}_${dateRangeText.replace(/\s+/g, '_')}.xlsx`,
                sheetName: config?.name || 'Report',
                metadata
            });
        } catch (err) {
            setError('Failed to export Excel: ' + err.message);
            console.error('Excel Export Error:', err);
        }
    };

    const getReportConfig = (id) => REPORT_CONFIGS.find(r => r.id === id);

    const renderFilters = () => {
        const config = getReportConfig(selectedReport);

        return (
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Report Filters
                </Typography>
                <Grid container spacing={2} alignItems="center">
                    {selectedReport === 'daily-attendance' && (
                        <>
                            <Grid size={{ xs: 12, md: 3 }}>
                                <TextField
                                    label="Date"
                                    type="date"
                                    fullWidth
                                    value={filters.date}
                                    onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Department</InputLabel>
                                    <Select
                                        value={filters.department_id}
                                        label="Department"
                                        onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                                    >
                                        <MenuItem value="">All Departments</MenuItem>
                                        {departments.map(d => (
                                            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </>
                    )}

                    {selectedReport === 'monthly-summary' && (
                        <>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Year</InputLabel>
                                    <Select
                                        value={filters.year}
                                        label="Year"
                                        onChange={(e) => setFilters({ ...filters, year: e.target.value })}
                                    >
                                        {[2023, 2024, 2025].map(y => (
                                            <MenuItem key={y} value={y}>{y}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Month</InputLabel>
                                    <Select
                                        value={filters.month}
                                        label="Month"
                                        onChange={(e) => setFilters({ ...filters, month: e.target.value })}
                                    >
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <MenuItem key={i + 1} value={i + 1}>
                                                {new Date(2024, i).toLocaleString('default', { month: 'long' })}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid size={{ xs: 12, md: 3 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Department</InputLabel>
                                    <Select
                                        value={filters.department_id}
                                        label="Department"
                                        onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}
                                    >
                                        <MenuItem value="">All Departments</MenuItem>
                                        {departments.map(d => (
                                            <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </>
                    )}

                    {['late-early', 'absent', 'overtime'].includes(selectedReport) && (
                        <>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField
                                    label="Start Date"
                                    type="date"
                                    fullWidth
                                    value={filters.start_date}
                                    onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField
                                    label="End Date"
                                    type="date"
                                    fullWidth
                                    value={filters.end_date}
                                    onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                        </>
                    )}

                    {selectedReport === 'late-early' && (
                        <>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField
                                    label="Shift Start"
                                    type="time"
                                    fullWidth
                                    value={filters.shift_start}
                                    onChange={(e) => setFilters({ ...filters, shift_start: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField
                                    label="Shift End"
                                    type="time"
                                    fullWidth
                                    value={filters.shift_end}
                                    onChange={(e) => setFilters({ ...filters, shift_end: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid size={{ xs: 12, md: 2 }}>
                                <TextField
                                    label="Grace (min)"
                                    type="number"
                                    fullWidth
                                    value={filters.grace_minutes}
                                    onChange={(e) => setFilters({ ...filters, grace_minutes: e.target.value })}
                                />
                            </Grid>
                        </>
                    )}

                    {selectedReport === 'overtime' && (
                        <Grid size={{ xs: 12, md: 2 }}>
                            <TextField
                                label="Regular Hours"
                                type="number"
                                fullWidth
                                value={filters.regular_hours}
                                onChange={(e) => setFilters({ ...filters, regular_hours: e.target.value })}
                            />
                        </Grid>
                    )}

                    <Grid size={{ xs: 12, md: 'auto' }}>
                        <Box display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
                            <Button
                                variant="contained"
                                onClick={generateReport}
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} /> : <ReportIcon />}
                                sx={{
                                    borderRadius: '10px',
                                    px: 3,
                                    py: 1.5,
                                    fontWeight: 600,
                                    textTransform: 'none',
                                    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                                    '&:hover': {
                                        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)'
                                    }
                                }}
                            >
                                Generate Report
                            </Button>
                            {reportData && (
                                <>
                                    <Button
                                        variant="outlined"
                                        startIcon={<CsvIcon />}
                                        onClick={exportCSV}
                                        sx={{
                                            borderRadius: '10px',
                                            px: 2.5,
                                            py: 1.5,
                                            fontWeight: 600,
                                            textTransform: 'none',
                                            borderColor: '#2563EB',
                                            color: '#2563EB',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            '&:hover': {
                                                borderColor: '#1E40AF',
                                                backgroundColor: '#EFF6FF',
                                                transform: 'translateY(-2px)',
                                                boxShadow: '0px 4px 8px rgba(37, 99, 235, 0.2)'
                                            }
                                        }}
                                    >
                                        Export CSV
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        startIcon={<PdfIcon />}
                                        onClick={exportToPDF}
                                        sx={{
                                            borderRadius: '10px',
                                            px: 2.5,
                                            py: 1.5,
                                            fontWeight: 600,
                                            textTransform: 'none',
                                            borderColor: '#DC2626',
                                            color: '#DC2626',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            '&:hover': {
                                                borderColor: '#B91C1C',
                                                backgroundColor: '#FEF2F2',
                                                transform: 'translateY(-2px)',
                                                boxShadow: '0px 4px 8px rgba(220, 38, 38, 0.2)'
                                            }
                                        }}
                                    >
                                        Export PDF
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        startIcon={<ExcelIcon />}
                                        onClick={exportToXLSX}
                                        sx={{
                                            borderRadius: '10px',
                                            px: 2.5,
                                            py: 1.5,
                                            fontWeight: 600,
                                            textTransform: 'none',
                                            borderColor: '#059669',
                                            color: '#059669',
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            '&:hover': {
                                                borderColor: '#047857',
                                                backgroundColor: '#ECFDF5',
                                                transform: 'translateY(-2px)',
                                                boxShadow: '0px 4px 8px rgba(5, 150, 105, 0.2)'
                                            }
                                        }}
                                    >
                                        Export XLSX
                                    </Button>
                                </>
                            )}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        );
    };

    const renderSummary = () => {
        if (!reportData?.summary) return null;

        return (
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {Object.entries(reportData.summary).map(([key, value]) => {
                    if (typeof value === 'object') return null;
                    return (
                        <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={key}>
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h4" color="primary">
                                    {typeof value === 'number' ? value.toLocaleString() : value}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </Typography>
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>
        );
    };

    const renderDataTable = () => {
        if (!reportData?.data || reportData.data.length === 0) {
            return (
                <Paper sx={{ p: 5, textAlign: 'center' }}>
                    <Typography color="text.secondary">No data for selected criteria</Typography>
                </Paper>
            );
        }

        const columns = Object.keys(reportData.data[0]).filter(
            col => !['id', 'created_at', 'updated_at', 'devices'].includes(col)
        );

        const paginatedData = reportData.data.slice(
            page * rowsPerPage,
            page * rowsPerPage + rowsPerPage
        );

        return (
            <Paper>
                <TableContainer sx={{ maxHeight: 500 }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                {columns.map(col => (
                                    <TableCell key={col}>
                                        {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginatedData.map((row, idx) => (
                                <TableRow key={idx} hover>
                                    {columns.map(col => (
                                        <TableCell key={col}>
                                            {formatCellValue(row[col], col)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={reportData.data.length}
                    page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                />
            </Paper>
        );
    };

    const formatCellValue = (value, column) => {
        if (value === null || value === undefined) return '-';

        if (column.includes('time') || column.includes('_at')) {
            const date = new Date(value);
            if (!isNaN(date)) {
                return date.toLocaleString();
            }
        }

        if (column.includes('date')) {
            const date = new Date(value);
            if (!isNaN(date)) {
                return date.toLocaleDateString();
            }
        }

        if (column.includes('hours') || column.includes('minutes')) {
            return typeof value === 'number' ? value.toFixed(2) : value;
        }

        if (column === 'status') {
            const colors = { Present: 'success', Absent: 'error', Late: 'warning', 'On Time': 'success' };
            return <Chip label={value} size="small" color={colors[value] || 'default'} />;
        }

        if (column.includes('percentage') || column.includes('rate') || column === 'health_score') {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                        variant="determinate"
                        value={Math.min(value, 100)}
                        sx={{ width: 60, height: 8, borderRadius: 4 }}
                        color={value >= 80 ? 'success' : value >= 50 ? 'warning' : 'error'}
                    />
                    <Typography variant="body2">{value}%</Typography>
                </Box>
            );
        }

        return String(value);
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                        <ReportIcon sx={{ mr: 1, verticalAlign: 'bottom' }} />
                        Advanced Reports
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                        Generate comprehensive attendance and device reports
                    </Typography>
                </Box>
            </Box>

            {/* Quick Stats - Premium Styled (Like Attendance Status Cards) */}
            {dashboardData && (
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Paper
                            sx={{
                                p: 3,
                                background: '#EAF7F0',
                                borderLeft: '4px solid #2EAD6D',
                                borderRadius: '16px',
                                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 20px rgba(0, 0, 0, 0.06)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.08)'
                                }
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    color: '#6B7280',
                                    fontSize: '13px',
                                    fontWeight: 400,
                                    mb: 1,
                                    letterSpacing: '-0.01em'
                                }}
                            >
                                Present Today
                            </Typography>
                            <Typography
                                variant="h3"
                                sx={{
                                    fontWeight: 600,
                                    color: '#111827',
                                    fontSize: '24px',
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                {dashboardData.today?.present || 0}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Paper
                            sx={{
                                p: 3,
                                background: '#FFF4E5',
                                borderLeft: '4px solid #E09B2D',
                                borderRadius: '16px',
                                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 20px rgba(0, 0, 0, 0.06)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.08)'
                                }
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    color: '#6B7280',
                                    fontSize: '13px',
                                    fontWeight: 400,
                                    mb: 1,
                                    letterSpacing: '-0.01em'
                                }}
                            >
                                Attendance Rate
                            </Typography>
                            <Typography
                                variant="h3"
                                sx={{
                                    fontWeight: 600,
                                    color: '#111827',
                                    fontSize: '24px',
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                {dashboardData.today?.attendance_rate || 0}%
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Paper
                            sx={{
                                p: 3,
                                background: '#EEF3FF',
                                borderLeft: '4px solid #4C6FFF',
                                borderRadius: '16px',
                                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 20px rgba(0, 0, 0, 0.06)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.08)'
                                }
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    color: '#6B7280',
                                    fontSize: '13px',
                                    fontWeight: 400,
                                    mb: 1,
                                    letterSpacing: '-0.01em'
                                }}
                            >
                                Devices Online
                            </Typography>
                            <Typography
                                variant="h3"
                                sx={{
                                    fontWeight: 600,
                                    color: '#111827',
                                    fontSize: '24px',
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                {dashboardData.devices?.online || 0}/{dashboardData.devices?.total || 0}
                            </Typography>
                        </Paper>
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                        <Paper
                            sx={{
                                p: 3,
                                background: '#EAF7F0',
                                borderLeft: '4px solid #2EAD6D',
                                borderRadius: '16px',
                                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 20px rgba(0, 0, 0, 0.06)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.08)'
                                }
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    color: '#6B7280',
                                    fontSize: '13px',
                                    fontWeight: 400,
                                    mb: 1,
                                    letterSpacing: '-0.01em'
                                }}
                            >
                                Punches This Month
                            </Typography>
                            <Typography
                                variant="h3"
                                sx={{
                                    fontWeight: 600,
                                    color: '#111827',
                                    fontSize: '24px',
                                    lineHeight: 1.1,
                                    letterSpacing: '-0.02em'
                                }}
                            >
                                {dashboardData.month?.total_punches || 0}
                            </Typography>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* Report Type Selection - Premium Styled */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    borderRadius: '16px',
                    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 16px rgba(0, 0, 0, 0.06)'
                }}
            >
                <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{
                        fontWeight: 700,
                        mb: 2,
                        color: '#111827',
                        letterSpacing: '-0.01em'
                    }}
                >
                    Select Report Type
                </Typography>
                <Grid container spacing={2}>
                    {REPORT_CONFIGS.map(report => {
                        const isSelected = selectedReport === report.id;
                        return (
                            <Grid size={{ xs: 6, sm: 4, md: 3, lg: 12 / 7 }} key={report.id}>
                                <Card
                                    sx={{
                                        cursor: 'pointer',
                                        border: isSelected ? `2px solid ${report.color}` : '1px solid rgba(0, 0, 0, 0.08)',
                                        borderRadius: '14px',
                                        background: '#FFFFFF',
                                        boxShadow: isSelected
                                            ? `0px 2px 4px rgba(0, 0, 0, 0.06), 0px 8px 24px ${report.color}20`
                                            : '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 4px 12px rgba(0, 0, 0, 0.05)',
                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:hover': {
                                            transform: 'translateY(-4px) scale(1.02)',
                                            boxShadow: `0px 4px 12px rgba(0, 0, 0, 0.08), 0px 16px 40px ${report.color}30`
                                        }
                                    }}
                                    onClick={() => {
                                        setSelectedReport(report.id);
                                        setReportData(null);
                                    }}
                                >
                                    <CardContent sx={{ textAlign: 'center', py: 2.5, px: 1.5 }}>
                                        {/* Icon Container with Gradient Background */}
                                        <Box
                                            sx={{
                                                mb: 1.5,
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                width: '52px',
                                                height: '52px',
                                                mx: 'auto',
                                                borderRadius: '12px',
                                                background: `linear-gradient(135deg, ${report.color}15 0%, ${report.color}25 100%)`,
                                                backdropFilter: 'blur(6px)',
                                                WebkitBackdropFilter: 'blur(6px)',
                                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                boxShadow: isSelected ? `0px 2px 8px ${report.color}30` : 'none',
                                                '&:hover': {
                                                    transform: 'scale(1.12)',
                                                    background: `linear-gradient(135deg, ${report.color}20 0%, ${report.color}30 100%)`
                                                }
                                            }}
                                        >
                                            {React.cloneElement(report.icon, {
                                                sx: {
                                                    fontSize: 24,
                                                    color: report.color,
                                                    strokeWidth: 2.5
                                                }
                                            })}
                                        </Box>
                                        <Typography
                                            variant="body2"
                                            noWrap
                                            sx={{
                                                fontWeight: isSelected ? 700 : 600,
                                                color: '#1E293B',
                                                fontSize: '13px',
                                                mb: 0.5
                                            }}
                                        >
                                            {report.name}
                                        </Typography>
                                        {report.description && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: '#9CA3AF',
                                                    fontSize: '10px',
                                                    opacity: 0.9,
                                                    fontWeight: 400,
                                                    display: 'block',
                                                    lineHeight: 1.3,
                                                    mt: 0.5
                                                }}
                                            >
                                                {report.description}
                                            </Typography>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        );
                    })}
                </Grid>
            </Paper>

            {/* Filters */}
            {renderFilters()}

            {/* Error */}
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Loading */}
            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {/* Report Results */}
            {reportData && (
                <>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6">
                            {getReportConfig(selectedReport)?.name} Results
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Generated: {new Date(reportData.generated_at).toLocaleString()}
                            {reportData.period && ` | Period: ${reportData.period}`}
                        </Typography>
                    </Box>

                    {renderSummary()}
                    {renderDataTable()}
                </>
            )}
        </Box>
    );
};

const AdvancedReportsWithErrorBoundary = () => {
    return (
        <ReportErrorBoundary>
            <AdvancedReports />
        </ReportErrorBoundary>
    );
};

export default AdvancedReportsWithErrorBoundary;

