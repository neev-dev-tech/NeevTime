import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import {
    FileBarChart, Download, Filter, Calendar, Users, Clock,
    AlertTriangle, CheckCircle, XCircle, FileSpreadsheet, Printer, ArrowLeft,
    Smartphone, List, FileText, Activity, PieChart, ClipboardList, Timer, CheckSquare,
    Search, Calculator, UserCheck, UserX, BarChart3, ChevronDown, RefreshCw,
    Fingerprint, LogIn, LogOut, MapPin, Hash, User
} from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel as exportToExcelUtil } from '../utils/excelExport';
import { Button } from '../components';
import { formatDate, toLocalDateString } from '../utils/dateFormat';

// Stat tile tones — written out in full so Tailwind's scanner keeps the classes
const STAT_TONES = {
    orange: 'bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400',
    rose: 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400',
    amber: 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400'
};

const CODE_CELL = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
const SECONDARY_CELL = 'text-slate-600 dark:text-slate-300';

export default function ReportsLegacy({ type: propType, hideSidebar = false }) {
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();

    // Determine initial report type
    const getInitialReportType = () => {
        if (propType) return propType;
        const typeParam = searchParams.get('type');
        if (typeParam) return typeParam;
        if (location.pathname === '/reports/transactions') return 'transaction_log';
        if (location.pathname === '/reports/mobile-transactions') return 'mobile_trans';
        if (location.pathname === '/reports/total-punches') return 'total_punches';
        return 'daily_attendance';
    };

    const [reportType, setReportType] = useState(getInitialReportType());
    const [dateFrom, setDateFrom] = useState(toLocalDateString());
    const [dateTo, setDateTo] = useState(toLocalDateString());
    const [department, setDepartment] = useState('');
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchFilters();
    }, []);

    useEffect(() => {
        const type = searchParams.get('type');
        if (type) {
            setReportType(type);
            setGenerated(false);
            setReportData([]);
        }
    }, [searchParams]);

    // Route-level type prop (e.g. /reports/late-coming) changes without a remount
    useEffect(() => {
        if (propType) {
            setReportType(propType);
            setGenerated(false);
            setReportData([]);
        }
    }, [propType]);

    const fetchFilters = async () => {
        try {
            const [deptRes, empRes] = await Promise.all([
                api.get('/api/departments'),
                api.get('/api/employees')
            ]);
            setDepartments(deptRes.data || []);
            setEmployees(empRes.data || []);
        } catch (err) {
            console.error('Error fetching filters:', err);
        }
    };

    const getDirection = (log) => {
        if (!log) return 'IN';
        const state = parseInt(log.punch_state);
        if ([0, 3, 4, 8].includes(state)) return 'IN';
        if ([1, 2, 5, 9].includes(state)) return 'OUT';
        return 'IN';
    };

    // --- Stats Calculation ---
    const getStats = () => {
        const total = reportData.length;
        // Transaction & Log Reports
        if (['transaction_log', 'mobile_trans', 'transaction', 'total_punches'].includes(reportType)) {
            const uniqueUsers = new Set(reportData.map(r => r.employee_code)).size;
            const locations = new Set(reportData.map(r => r.device_serial)).size;
            return [
                { label: 'Total Punches', value: total, icon: Hash, color: 'orange' },
                { label: 'Unique Users', value: uniqueUsers, icon: Users, color: 'emerald' },
                { label: 'Locations', value: locations, icon: MapPin, color: 'rose' },
                { label: 'Latest', value: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), icon: Clock, color: 'amber' }
            ];
        }

        // Attendance & Status Reports
        const present = reportData.filter(r => r.status === 'Present' || r.present_days > 0).length; // Handle daily and monthly
        const absent = reportData.filter(r => r.status === 'Absent' || r.absent_days > 0).length;
        const late = reportData.filter(r => r.status === 'Late' || r.late_minutes > 0 || r.late_count > 0).length;

        return [
            { label: 'Total Records', value: total, icon: FileText, color: 'orange' },
            { label: 'Present', value: present, icon: UserCheck, color: 'emerald' },
            { label: 'Absent', value: absent, icon: UserX, color: 'rose' },
            { label: 'Late', value: late, icon: AlertTriangle, color: 'amber' }
        ];
    };

    const stats = useMemo(() => generated ? getStats() : [], [reportData, generated, reportType]);

    // --- Column Definitions ---
    const getColumnDefs = (type) => {
        const commonEmployeeCols = [
            {
                label: 'Employee',
                render: (row) => (
                    <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{row.employee_name || row.emp_name || '—'}</span>
                        <span className={CODE_CELL}>{row.employee_code || '—'}</span>
                    </div>
                )
            },
            { key: 'department', label: 'Department' }
        ];

        const dateCol = { key: 'date', label: 'Date', type: 'date' };
        const statusCol = { key: 'status', label: 'Status', type: 'status' };

        switch (type) {
            case 'transaction_log':
            case 'mobile_trans':
            case 'transaction':
            case 'total_punches':
                return [
                    {
                        label: 'Employee',
                        render: (row) => (
                            <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{row.emp_name || '—'}</span>
                                <span className={CODE_CELL}>{row.employee_code || '—'}</span>
                            </div>
                        )
                    },
                    {
                        label: 'Time',
                        render: (row) => (
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                    {row.punch_time ? new Date(row.punch_time).toLocaleTimeString() : '—'}
                                </span>
                                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                    {formatDate(row.punch_time)}
                                </span>
                            </div>
                        )
                    },
                    {
                        label: 'Type',
                        render: (row) => {
                            const dir = getDirection(row);
                            return (
                                <span className={`badge-premium ${dir === 'OUT' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'} inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase`}>
                                    {dir === 'OUT' ? <LogOut size={10} /> : <LogIn size={10} />} {dir}
                                </span>
                            );
                        }
                    },
                    { label: 'Device', key: 'device_serial', type: 'code' },
                    {
                        label: 'Mode',
                        render: (row) => (
                            <div className="flex items-center gap-1.5 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                <Fingerprint size={12} className="text-orange-500" />
                                {row.verification_mode || '15'}
                            </div>
                        )
                    }
                ];

            case 'daily_attendance':
            case 'daily_details':
            case 'daily_summary':
            case 'daily_status':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'in_time', label: 'In Time', type: 'time' },
                    { key: 'out_time', label: 'Out Time', type: 'time' },
                    { key: 'total_hours', label: 'Work Hrs', type: 'duration' },
                    statusCol
                ];

            case 'late_coming':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'scheduled_in', label: 'Shift Start', type: 'time' },
                    { key: 'actual_in', label: 'Actual In', type: 'time' },
                    { key: 'late_minutes', label: 'Late (Min)', type: 'number', className: 'text-amber-600 font-bold' },
                    statusCol
                ];

            // ... (Other cases same as before)
            case 'scheduled_log':
            case 'time_card':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'shift', label: 'Shift' },
                    { key: 'scheduled_in', label: 'Sched In', type: 'time' },
                    { key: 'scheduled_out', label: 'Sched Out', type: 'time' },
                    { key: 'in_time', label: 'Actual In', type: 'time', className: 'font-bold' },
                    { key: 'out_time', label: 'Actual Out', type: 'time', className: 'font-bold' },
                    statusCol
                ];

            case 'birthday':
                return [
                    ...commonEmployeeCols,
                    { key: 'dob', label: 'Date of Birth', type: 'date' },
                    { key: 'age', label: 'Age', type: 'number' },
                    { key: 'upcoming', label: 'Upcoming Birthday', type: 'date', className: 'text-orange-600 font-bold' }
                ];

            case 'half_day':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'shift', label: 'Shift' },
                    { key: 'total_hours', label: 'Hours Worked', type: 'duration' },
                    { key: 'required_hours', label: 'Required', type: 'duration' },
                    statusCol
                ];

            case 'early_leaving':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'scheduled_out', label: 'Shift End', type: 'time' },
                    { key: 'actual_out', label: 'Actual Out', type: 'time' },
                    { key: 'early_minutes', label: 'Early (Min)', type: 'number', className: 'text-rose-600 font-bold' },
                    statusCol
                ];

            case 'absent_report':
            case 'missed_punch':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'shift', label: 'Shift' },
                    { key: 'remarks', label: 'Remarks', className: 'text-slate-500 dark:text-slate-400 italic' },
                    statusCol
                ];

            case 'overtime_report':
            case 'ot_summary':
            case 'work_duration':
            case 'work_detailed':
                return [
                    dateCol,
                    ...commonEmployeeCols,
                    { key: 'regular_hours', label: 'Regular Hrs' },
                    { key: 'overtime_hours', label: 'OT Hrs', className: 'text-emerald-600 font-bold' },
                    { key: 'total_hours', label: 'Total Hrs', font: 'bold' }
                ];

            case 'monthly_summary':
            case 'basic_status':
            case 'status_summary':
            case 'att_summary':
            case 'att_sheet':
            case 'att_status':
                return [
                    ...commonEmployeeCols, // monthly doesn't show single date normally, or has range
                    { key: 'present_days', label: 'Present', className: 'text-emerald-600 font-bold' },
                    { key: 'absent_days', label: 'Absent', className: 'text-rose-600 font-bold' },
                    { key: 'late_count', label: 'Late', className: 'text-amber-600' },
                    { key: 'total_hours', label: 'Total Hrs' },
                    { key: 'overtime_hours', label: 'OT Hrs' }
                ];

            case 'payroll':
                return [
                    ...commonEmployeeCols,
                    { key: 'designation', label: 'Designation' },
                    { key: 'present_days', label: 'Present', type: 'number', className: 'text-emerald-600 font-bold' },
                    { key: 'absent_days', label: 'Absent', type: 'number', className: 'text-rose-600 font-bold' },
                    { key: 'leave_days', label: 'Leave', type: 'number' },
                    { key: 'late_count', label: 'Late', type: 'number', className: 'text-amber-600' },
                    { key: 'late_minutes', label: 'Late (Min)', type: 'number' },
                    { key: 'total_hours', label: 'Hours', type: 'number' },
                    { key: 'overtime_hours', label: 'OT Hrs', type: 'number', className: 'text-emerald-600 font-bold' }
                ];

            case 'device_health':
                return [
                    { key: 'device_name', label: 'Device' },
                    { key: 'serial_number', label: 'Serial', type: 'code' },
                    { key: 'device_model', label: 'Model' },
                    { key: 'status', label: 'Status', type: 'status' },
                    { key: 'health_score', label: 'Health', type: 'number' },
                    { key: 'log_count_7d', label: 'Punches (7d)', type: 'number' },
                    { key: 'unique_users_7d', label: 'Users (7d)', type: 'number' },
                    { key: 'cmd_failed', label: 'Failed Cmds', type: 'number', className: 'text-rose-600 font-bold' }
                ];

            case 'biometric_summary':
                return [
                    ...commonEmployeeCols,
                    { key: 'face_count', label: 'Face Templates', type: 'number' },
                    { key: 'fingerprint_count', label: 'Fingerprints', type: 'number' },
                    { key: 'last_updated', label: 'Last Updated', type: 'date' }
                ];

            default:
                return null;
        }
    };

    // Report endpoints return {summary, data: rows}; older ones return bare arrays
    const rowsOf = (res) => (Array.isArray(res.data) ? res.data : (res.data?.data || []));

    // Accepts '09:05:00' strings and full timestamps, returns 'HH:MM'
    const toHHMM = (v) => {
        if (!v) return null;
        if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
        const d = new Date(v);
        return isNaN(d) ? null : d.toTimeString().slice(0, 5);
    };

    const minutesToHours = (mins) => (mins == null ? null : (mins / 60).toFixed(1));

    const fetchDailySummary = async () => {
        const res = await api.get('/api/attendance/summary', { params: { date: dateFrom } });
        return rowsOf(res).map(row => ({
            ...row,
            employee_name: row.name,
            date: row.date ? String(row.date).split('T')[0] : dateFrom,
            in_time: toHHMM(row.in_time),
            out_time: toHHMM(row.out_time),
            total_hours: minutesToHours(row.duration_minutes),
            status: row.status || (row.in_time ? 'Present' : 'Absent')
        }));
    };

    const generateReport = async () => {
        setLoading(true);
        setGenerated(false);
        setError(null);
        try {
            let data = [];
            const range = { start_date: dateFrom, end_date: dateTo };

            if (['transaction_log', 'mobile_trans', 'total_punches', 'transaction'].includes(reportType)) {
                const logsRes = await api.get('/api/logs', { params: { limit: 500 } });
                data = (logsRes.data || []).filter(log => {
                    const punchDate = toLocalDateString(log.punch_time);
                    return punchDate >= dateFrom && punchDate <= dateTo;
                });
            } else if (['daily_attendance', 'scheduled_log', 'time_card', 'daily_details', 'daily_summary', 'daily_status'].includes(reportType)) {
                data = await fetchDailySummary();
            } else if (['late_coming', 'early_leaving'].includes(reportType)) {
                const res = await api.get('/api/reports/late-early', { params: range });
                data = rowsOf(res).map(row => ({
                    employee_name: row.employee_name,
                    employee_code: row.employee_code,
                    department: row.department_name,
                    date: row.attendance_date ? String(row.attendance_date).split('T')[0] : null,
                    scheduled_in: '09:00',
                    scheduled_out: '18:00',
                    actual_in: toHHMM(row.first_in),
                    actual_out: toHHMM(row.last_out),
                    late_minutes: row.late_minutes,
                    early_minutes: row.early_minutes,
                    status: reportType === 'late_coming' ? row.in_status : row.out_status
                })).filter(row => reportType === 'late_coming' ? row.late_minutes > 0 : row.early_minutes > 0);
            } else if (['absent_report'].includes(reportType)) {
                const res = await api.get('/api/reports/absent', { params: range });
                data = rowsOf(res).map(row => ({
                    employee_name: row.employee_name,
                    employee_code: row.employee_code,
                    department: row.department_name,
                    date: row.absent_date ? String(row.absent_date).split('T')[0] : null,
                    status: 'Absent'
                }));
            } else if (['missed_punch'].includes(reportType)) {
                data = (await fetchDailySummary()).filter(row => !row.in_time || !row.out_time);
            } else if (['half_day'].includes(reportType)) {
                data = (await fetchDailySummary()).filter(row =>
                    row.duration_minutes != null && row.duration_minutes > 0 && row.duration_minutes < 300
                ).map(row => ({ ...row, required_hours: '8.0' }));
            } else if (['overtime_report', 'ot_summary', 'work_duration', 'work_detailed'].includes(reportType)) {
                const res = await api.get('/api/reports/overtime', { params: range });
                data = rowsOf(res).map(row => ({
                    employee_name: row.employee_name,
                    employee_code: row.employee_code,
                    department: row.department_name,
                    date: row.work_date ? String(row.work_date).split('T')[0] : null,
                    regular_hours: '8.0',
                    total_hours: row.total_hours != null ? Number(row.total_hours).toFixed(1) : null,
                    overtime_hours: row.overtime_hours != null ? Number(row.overtime_hours).toFixed(1) : null
                }));
            } else if (['monthly_summary', 'basic_status', 'status_summary', 'att_summary', 'att_sheet', 'att_status'].includes(reportType)) {
                const from = new Date(dateFrom);
                const res = await api.get('/api/reports/monthly-summary', {
                    params: { year: from.getFullYear(), month: from.getMonth() + 1 }
                });
                data = rowsOf(res).map(row => ({
                    employee_name: row.employee_name,
                    employee_code: row.employee_code,
                    department: row.department_name,
                    present_days: row.days_present,
                    avg_check_in_time: toHHMM(row.avg_check_in_time),
                    avg_check_out_time: toHHMM(row.avg_check_out_time)
                }));
            } else if (reportType === 'payroll') {
                const from = new Date(dateFrom);
                const res = await api.get('/api/reports/payroll', {
                    params: {
                        year: from.getFullYear(),
                        month: from.getMonth() + 1,
                        department_id: department || undefined
                    }
                });
                data = rowsOf(res).map(row => ({ ...row, department: row.department_name }));
            } else if (reportType === 'device_health') {
                const res = await api.get('/api/reports/device-health');
                data = rowsOf(res);
            } else if (reportType === 'biometric_summary') {
                const res = await api.get('/api/reports/biometric-summary');
                data = rowsOf(res).map(row => ({
                    ...row,
                    department: row.department_name,
                    last_updated: row.last_updated ? String(row.last_updated).split('T')[0] : null
                }));
            } else if (reportType === 'birthday') {
                const today = new Date();
                data = employees.filter(e => e.dob).map(emp => {
                    const dob = new Date(emp.dob);
                    const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
                    if (next < today) next.setFullYear(next.getFullYear() + 1);
                    return {
                        employee_name: emp.name,
                        employee_code: emp.employee_code,
                        department: emp.department_name,
                        dob: String(emp.dob).split('T')[0],
                        age: today.getFullYear() - dob.getFullYear(),
                        upcoming: toLocalDateString(next)
                    };
                }).sort((a, b) => a.upcoming.localeCompare(b.upcoming));
            } else {
                data = await fetchDailySummary();
            }

            if (department) {
                // Filter by department for ALL reports
                // For logs, we need to lookup employee department if not present
                const deptName = departments.find(d => d.id === parseInt(department))?.name;

                if (['transaction_log', 'mobile_trans', 'total_punches'].includes(reportType)) {
                    // Need to map employee code to department
                    const empMap = employees.reduce((acc, emp) => {
                        acc[emp.employee_code] = emp.department_name;
                        return acc;
                    }, {});
                    data = data.filter(log => empMap[log.employee_code] === deptName);
                } else {
                    data = data.filter(item => item.department === deptName);
                }
            }

            setReportData(data);
            setGenerated(true);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || err.message || 'Could not generate the report');
        } finally {
            setLoading(false);
        }
    };

    const EXTRA_TITLES = {
        total_punches: 'Total Punches', scheduled_log: 'Scheduled Log', time_card: 'Total Time Card',
        missed_punch: 'Missed Punch Report', birthday: 'Birthday Report', overtime_report: 'Overtime Report',
        half_day: 'Half Day Report', daily_details: 'Daily Details', daily_summary: 'Daily Summary',
        daily_status: 'Daily Status', basic_status: 'Basic Status', status_summary: 'Status Summary',
        ot_summary: 'OT Summary', work_duration: 'Work Duration', work_detailed: 'Work Detailed',
        att_sheet: 'ATT Sheet Summary', att_status: 'Attendance Status', att_summary: 'Attendance Summary',
        device_health: 'Device Health Report', biometric_summary: 'Biometric Summary',
        payroll: 'Monthly Payroll Report'
    };

    const getReportTitle = () => {
        const typeObj = reportTypes.find(t => t.id === reportType);
        return typeObj ? typeObj.name : (EXTRA_TITLES[reportType] || 'Report');
    };

    // Flatten current rows into {Label: value} objects for CSV/Excel/PDF export
    const buildExportRows = () => {
        const cols = getColumnDefs(reportType) || [];
        return reportData.map(row => {
            const out = {};
            cols.forEach(col => {
                if (col.key) {
                    out[col.label] = row[col.key] ?? '';
                } else if (col.label === 'Employee') {
                    const name = row.employee_name || row.emp_name || 'Unknown';
                    out['Employee'] = `${name} (${row.employee_code || ''})`;
                } else if (col.label === 'Time') {
                    out['Time'] = row.punch_time ? new Date(row.punch_time).toLocaleString() : '';
                } else if (col.label === 'Type') {
                    out['Type'] = getDirection(row);
                }
            });
            return out;
        });
    };

    const exportFilename = () => `${getReportTitle().replace(/\s+/g, '_')}_${dateFrom}_${dateTo}`;

    const handleExportCSV = () => {
        const rows = buildExportRows();
        if (rows.length === 0) return;
        const headers = Object.keys(rows[0]);
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${exportFilename()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const handleExportExcel = () => {
        const rows = buildExportRows();
        if (rows.length === 0) return;
        exportToExcelUtil({ data: rows, filename: exportFilename(), sheetName: getReportTitle().slice(0, 31) });
    };

    const handleExportPDF = () => {
        const rows = buildExportRows();
        if (rows.length === 0) return;
        exportToPDF({
            data: rows,
            filename: `${exportFilename()}.pdf`,
            title: getReportTitle(),
            dateRange: { from: dateFrom, to: dateTo }
        });
    };

    const reportTypes = [
        { id: 'daily_attendance', name: 'Daily Attendance Report', icon: Calendar },
        { id: 'transaction_log', name: 'Transaction Log', icon: Clock },
        { id: 'monthly_summary', name: 'Monthly Summary', icon: FileSpreadsheet },
        { id: 'late_coming', name: 'Late Coming Report', icon: AlertTriangle },
        { id: 'early_leaving', name: 'Early Leaving Report', icon: XCircle },
        { id: 'absent_report', name: 'Absent Report', icon: UserX },
        { id: 'mobile_trans', name: 'Mobile Transaction', icon: Smartphone }
    ];

    const renderCell = (row, col) => {
        if (col.render) return col.render(row);

        const val = row[col.key];

        if (col.type === 'status') {
            return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${val === 'Present' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800' :
                    val === 'Absent' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-800' :
                        val === 'Late' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800' :
                            'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}>
                    {val === 'Present' ? <CheckCircle size={10} /> :
                        val === 'Absent' ? <XCircle size={10} /> :
                            val === 'Late' ? <AlertTriangle size={10} /> : null
                    }
                    {val}
                </span>
            );
        }
        if (col.type === 'time' || (col.key && col.key.includes('time'))) {
            return <span className={`font-mono text-xs tabular-nums ${SECONDARY_CELL}`}>{val || '—'}</span>;
        }
        if (col.type === 'code') {
            return <span className={CODE_CELL}>{val || '—'}</span>;
        }
        if (col.type === 'number' || col.type === 'duration') {
            return <span className={`text-sm tabular-nums ${SECONDARY_CELL} ${col.className || ''}`}>{val ?? '—'}</span>;
        }
        if (col.type === 'date') {
            return <span className={`text-sm tabular-nums ${SECONDARY_CELL} ${col.className || ''}`}>{val || '—'}</span>;
        }

        return <span className={`text-sm ${SECONDARY_CELL} ${col.className || ''}`}>{val || '—'}</span>;
    };

    const columns = getColumnDefs(reportType);


    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="sm" icon={ArrowLeft} iconSize={18} onClick={() => navigate('/reports')} aria-label="Back to reports" />
                    <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600 shrink-0 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400">
                        <FileBarChart size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-800 truncate dark:text-slate-100">{getReportTitle()}</h1>
                        <p className="text-sm text-slate-500 truncate dark:text-slate-400">Comprehensive data view and analysis</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {generated && reportData.length > 0 && (
                        <>
                            <Button variant="secondary" icon={Download} iconSize={15} onClick={handleExportCSV}>CSV</Button>
                            <Button variant="success" icon={Download} iconSize={15} onClick={handleExportExcel}>Excel</Button>
                            <Button variant="danger" icon={Download} iconSize={15} onClick={handleExportPDF}>PDF</Button>
                        </>
                    )}
                    <Button variant="primary" onClick={generateReport} disabled={loading}>
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <Calculator size={16} />}
                        {loading ? 'Processing…' : 'Generate Report'}
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="card-base !p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Range</span>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="input-base !py-1.5 !w-auto text-sm tabular-nums"
                    />
                    <span className="text-slate-400">&rarr;</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="input-base !py-1.5 !w-auto text-sm tabular-nums"
                    />
                </div>
                <div className="flex items-center gap-2 min-w-[220px]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Dept</span>
                    <select
                        value={department}
                        onChange={e => setDepartment(e.target.value)}
                        className="input-base !py-1.5 text-sm"
                    >
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Stat tiles — glass cards with icon chips */}
            {generated && !error && stats.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((stat, i) => (
                        <div key={i} className="card-base !p-4 flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl border shrink-0 ${STAT_TONES[stat.color] || STAT_TONES.orange}`}>
                                <stat.icon size={20} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 truncate">{stat.label}</p>
                                <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 truncate">{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Results */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertTriangle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not generate the report</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={generateReport}>Try again</Button>
                    </div>
                ) : !generated ? (
                    <div className="py-16 text-center">
                        <FileBarChart size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No report yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Choose a range and department, then press Generate Report.
                        </p>
                    </div>
                ) : reportData.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records found</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nothing matched {dateFrom} to {dateTo} for this report.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    {columns
                                        ? columns.map((col, i) => (
                                            <th key={i} className="px-5 py-3 font-bold whitespace-nowrap">{col.label}</th>
                                        ))
                                        : Object.keys(reportData[0] || {}).map(k => (
                                            <th key={k} className="px-5 py-3 font-bold whitespace-nowrap capitalize">{k.replace(/_/g, ' ')}</th>
                                        ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {reportData.map((row, i) => (
                                    <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                                        {columns
                                            ? columns.map((col, j) => (
                                                <td key={j} className="px-5 py-3 whitespace-nowrap">
                                                    {renderCell(row, col)}
                                                </td>
                                            ))
                                            : Object.keys(row).map(k => (
                                                <td key={k} className="px-5 py-3 whitespace-nowrap">
                                                    <span className={SECONDARY_CELL}>{row[k] || '—'}</span>
                                                </td>
                                            ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && generated && reportData.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {reportData.length} record{reportData.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>
        </div>
    );
}
