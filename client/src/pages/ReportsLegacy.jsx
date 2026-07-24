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
    const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
    const [department, setDepartment] = useState('');
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);

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
                { label: 'Total Punches', value: total, icon: Hash, color: 'blue' },
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
            { label: 'Total Records', value: total, icon: FileText, color: 'blue' },
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
                        <span className="font-semibold text-slate-800">{row.employee_name || row.emp_name || 'Unknown'}</span>
                        <span className="text-xs text-slate-500 font-mono">{row.employee_code}</span>
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
                                <span className="font-semibold text-slate-800">{row.emp_name || 'Unknown'}</span>
                                <span className="text-xs text-slate-500 font-mono">{row.employee_code}</span>
                            </div>
                        )
                    },
                    {
                        label: 'Time',
                        render: (row) => (
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-slate-800">{new Date(row.punch_time).toLocaleTimeString()}</span>
                                <span className="text-xs text-slate-500">{new Date(row.punch_time).toLocaleDateString()}</span>
                            </div>
                        )
                    },
                    {
                        label: 'Type',
                        render: (row) => {
                            const dir = getDirection(row);
                            return (
                                <span className={`badge-premium ${dir === 'OUT' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'} inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase`}>
                                    {dir === 'OUT' ? <LogOut size={10} /> : <LogIn size={10} />} {dir}
                                </span>
                            );
                        }
                    },
                    { label: 'Device', key: 'device_serial', type: 'code' },
                    {
                        label: 'Mode',
                        render: (row) => (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <Fingerprint size={12} className="text-purple-500" />
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
                    { key: 'upcoming', label: 'Upcoming Birthday', type: 'date', className: 'text-purple-600 font-bold' }
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
                    { key: 'remarks', label: 'Remarks', className: 'text-slate-500 italic' },
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
        try {
            let data = [];
            const range = { start_date: dateFrom, end_date: dateTo };

            if (['transaction_log', 'mobile_trans', 'total_punches', 'transaction'].includes(reportType)) {
                const logsRes = await api.get('/api/logs', { params: { limit: 500 } });
                data = (logsRes.data || []).filter(log => {
                    const punchDate = new Date(log.punch_time).toISOString().split('T')[0];
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
                        upcoming: next.toISOString().split('T')[0]
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
        device_health: 'Device Health Report', biometric_summary: 'Biometric Summary'
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
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${val === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                    val === 'Absent' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                        val === 'Late' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}>
                    {val === 'Present' ? <CheckCircle size={10} /> :
                        val === 'Absent' ? <XCircle size={10} /> :
                            val === 'Late' ? <AlertTriangle size={10} /> : null
                    }
                    {val}
                </span>
            );
        }
        if (col.type === 'time' || col.key.includes('time')) {
            return <span className="font-mono text-xs text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{val || '-'}</span>;
        }
        if (col.type === 'code') {
            return <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{val}</code>;
        }

        return <span className={`text-sm text-slate-700 ${col.className || ''}`}>{val || '-'}</span>;
    };

    const columns = getColumnDefs(reportType);

    return (
        <div className="flex flex-col h-full bg-[#FAFBFC]">
            {/* Premium Header */}
            <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100 text-blue-600 shadow-sm">
                                    <FileBarChart size={20} />
                                </div>
                                {getReportTitle()}
                            </h1>
                            <p className="text-xs text-slate-500 mt-0.5 ml-1">Comprehensive data view and analysis</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {generated && reportData.length > 0 && (
                            <>
                                <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 bg-white border rounded-lg shadow-sm hover:bg-slate-50 transition-colors">
                                    <Download size={15} /> CSV
                                </button>
                                <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm hover:bg-emerald-100 transition-colors">
                                    <Download size={15} /> Excel
                                </button>
                                <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg shadow-sm hover:bg-rose-100 transition-colors">
                                    <Download size={15} /> PDF
                                </button>
                            </>
                        )}
                        <button onClick={generateReport} disabled={loading} className="btn-primary shadow-lg shadow-blue-200/50">
                            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Calculator size={18} />}
                            {loading ? 'Processing...' : 'Generate Report'}
                        </button>
                    </div>
                </div>
                {/* Filters */}
                <div className="px-6 py-3 bg-slate-50 border-t flex items-center gap-4 overflow-x-auto">
                    <div className="flex items-center gap-2 bg-white p-1 rounded-md border shadow-sm">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 border-r">Range</span>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm font-medium border-none focus:ring-0 py-1" />
                        <span className="text-slate-300">→</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm font-medium border-none focus:ring-0 py-1" />
                    </div>

                    <div className="flex items-center gap-2 bg-white p-1 rounded-md border shadow-sm min-w-[200px]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 border-r">Dept</span>
                        <select value={department} onChange={e => setDepartment(e.target.value)} className="text-sm font-medium border-none focus:ring-0 w-full py-1">
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">

                {/* Stats Section */}
                {generated && stats.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {stats.map((stat, i) => (
                            <div key={i} className="bg-white p-4 rounded-xl border shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                                <div className={`p-3 rounded-lg bg-${stat.color}-50 text-${stat.color}-600`}>
                                    <stat.icon size={24} />
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
                                    <p className="text-xl font-bold text-slate-800">{stat.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!generated ? (
                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 m-4">
                        <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                            <FileBarChart className="text-slate-300" size={32} />
                        </div>
                        <p className="text-slate-500 font-medium">Select filters and generate report</p>
                    </div>
                ) : (
                    <div className="table-premium-wrapper shadow-sm border rounded-xl overflow-hidden bg-white animate-in fade-in slide-in-from-bottom-6 duration-700">
                        <table className="table-premium w-full text-left">
                            <thead>
                                <tr>
                                    {columns ? columns.map((col, i) => (
                                        <th key={i} className="whitespace-nowrap">{col.label}</th>
                                    )) : Object.keys(reportData[0] || {}).map(k => <th key={k} className="capitalize">{k.replace(/_/g, ' ')}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.length === 0 ? (
                                    <tr>
                                        <td colSpan="100%" className="text-center py-12 text-slate-400">
                                            No records found
                                        </td>
                                    </tr>
                                ) : (
                                    reportData.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            {columns ? columns.map((col, j) => (
                                                <td key={j} className="py-3 px-4 border-b border-slate-100">
                                                    {renderCell(row, col)}
                                                </td>
                                            )) : Object.keys(row).map(k => <td key={k} className="py-3 px-4 border-b border-slate-100 text-sm text-slate-600">{row[k]}</td>)}
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
}
