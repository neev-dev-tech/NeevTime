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
import { exportToExcel as exportToExcelUtil, exportToCSV as exportToCSVUtil } from '../utils/excelExport';
import { formatTimestamp } from '../utils/dateFormat';

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
    const [exporting, setExporting] = useState('');
    const [generated, setGenerated] = useState(false);
    const transactionReportTypes = ['transaction_log', 'mobile_trans', 'transaction', 'total_punches'];

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
        if (typeof log.punch_type === 'string' && log.punch_type.trim()) {
            return log.punch_type.toUpperCase() === 'OUT' ? 'OUT' : 'IN';
        }
        const state = parseInt(log.punch_state);
        if ([0, 3, 4, 8].includes(state)) return 'IN';
        if ([1, 2, 5, 9].includes(state)) return 'OUT';
        return 'IN';
    };

    // --- Stats Calculation ---
    const getStats = () => {
        const total = reportData.length;
        // Transaction & Log Reports
        if (transactionReportTypes.includes(reportType)) {
            const uniqueUsers = new Set(reportData.map(r => r.employee_code)).size;
            const locations = new Set(reportData.map(r => r.device_serial)).size;
            const latestPunchTime = reportData[0]?.punch_time
                ? formatTimestamp(reportData[0].punch_time).time.replace(/:\d{2}\s/, ' ')
                : '-';
            return [
                { label: 'Total Punches', value: total, icon: Hash, color: 'blue' },
                { label: 'Unique Users', value: uniqueUsers, icon: Users, color: 'emerald' },
                { label: 'Locations', value: locations, icon: MapPin, color: 'rose' },
                { label: 'Latest', value: latestPunchTime, icon: Clock, color: 'amber' }
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
                        render: (row) => {
                            const ts = formatTimestamp(row.punch_time);
                            return (
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-slate-800">{ts.time}</span>
                                    <span className="text-xs text-slate-500">{ts.date}</span>
                                </div>
                            );
                        }
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

            default:
                return null;
        }
    };

    const generateReport = async () => {
        setLoading(true);
        setGenerated(false);
        try {
            let data = [];

            if (transactionReportTypes.includes(reportType)) {
                const logsRes = await api.get('/api/logs', {
                    params: {
                        start_date: dateFrom,
                        end_date: dateTo,
                        ...(department ? { department_id: department } : {})
                    }
                });
                data = logsRes.data || [];
            } else if (['daily_attendance', 'scheduled_log', 'daily_details', 'daily_summary'].includes(reportType)) {
                const summaryRes = await api.get('/api/attendance/summary', { params: { date: dateFrom } });
                data = summaryRes.data || [];
            } else {
                const emps = department ? employees.filter(e => e.department_id === parseInt(department)) : employees;
                data = emps.map(emp => ({
                    employee_name: emp.name,
                    employee_code: emp.employee_code,
                    department: emp.department_name,
                    date: dateFrom,
                    status: Math.random() > 0.2 ? 'Present' : 'Absent',
                    in_time: '09:00',
                    out_time: '18:00',
                    total_hours: '9.0',
                    scheduled_in: '09:00',
                    actual_in: Math.random() > 0.1 ? '09:05' : '09:30',
                    late_minutes: 15,
                    scheduled_out: '18:00',
                    actual_out: '17:45',
                    early_minutes: 15,
                    present_days: 22,
                    absent_days: 2,
                    late_count: 3,
                    overtime_hours: 5,
                    remarks: 'N/A'
                }));
            }

            if (department && !transactionReportTypes.includes(reportType)) {
                // Filter by department for non-transaction reports
                const deptName = departments.find(d => d.id === parseInt(department))?.name;
                data = data.filter(item => item.department === deptName);
            }

            setReportData(data);
            setGenerated(true);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getReportTitle = () => {
        const typeObj = reportTypes.find(t => t.id === reportType);
        return typeObj ? typeObj.name : 'Report';
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

    const getExportData = () => {
        if (!reportData.length) return [];

        if (transactionReportTypes.includes(reportType)) {
            return reportData.map(row => ({
                Employee: row.emp_name || 'Unknown',
                'Employee Code': row.employee_code || '-',
                Department: row.department_name || '-',
                Date: row.punch_time ? formatTimestamp(row.punch_time).date : '-',
                Time: row.punch_time ? formatTimestamp(row.punch_time).time : '-',
                Type: getDirection(row),
                Device: row.device_serial || '-',
                Mode: row.verification_mode || '15'
            }));
        }

        if (!columns || !columns.length) return reportData;

        return reportData.map((row) => {
            const mappedRow = {};

            columns.forEach((col) => {
                if (col.key) {
                    mappedRow[col.label || col.key] = row[col.key] ?? '-';
                } else if (col.label === 'Employee') {
                    mappedRow.Employee = row.employee_name || row.emp_name || 'Unknown';
                    mappedRow['Employee Code'] = row.employee_code || '-';
                }
            });

            if (!mappedRow.Employee && (row.employee_name || row.emp_name)) {
                mappedRow.Employee = row.employee_name || row.emp_name;
            }
            if (!mappedRow['Employee Code'] && row.employee_code) {
                mappedRow['Employee Code'] = row.employee_code;
            }

            return mappedRow;
        });
    };

    const getExportFilename = () => `${reportType}_${dateFrom}_to_${dateTo}`;

    const handleExportCSV = async () => {
        if (!reportData.length) return;
        setExporting('csv');
        try {
            await exportToCSVUtil({
                data: getExportData(),
                filename: getExportFilename()
            });
        } finally {
            setExporting('');
        }
    };

    const handleExportXLS = async () => {
        if (!reportData.length) return;
        setExporting('xls');
        try {
            await exportToExcelUtil({
                data: getExportData(),
                filename: getExportFilename(),
                sheetName: 'Report'
            });
        } finally {
            setExporting('');
        }
    };

    const handleExportPDF = () => {
        if (!reportData.length) return;
        setExporting('pdf');
        try {
            const selectedDepartment = department
                ? departments.find(d => d.id === parseInt(department))?.name || department
                : 'All Departments';
            exportToPDF({
                data: getExportData(),
                filename: `${getExportFilename()}.pdf`,
                title: getReportTitle(),
                subtitle: 'Comprehensive data view and analysis',
                dateRange: `${dateFrom} to ${dateTo}`,
                filters: { Department: selectedDepartment },
                orientation: 'landscape'
            });
        } finally {
            setExporting('');
        }
    };

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
    const canExport = generated && reportData.length > 0;

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
                        <button
                            onClick={handleExportCSV}
                            disabled={!canExport || loading || !!exporting}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting === 'csv' ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
                            CSV
                        </button>
                        <button
                            onClick={handleExportXLS}
                            disabled={!canExport || loading || !!exporting}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting === 'xls' ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                            XLS
                        </button>
                        <button
                            onClick={handleExportPDF}
                            disabled={!canExport || loading || !!exporting}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting === 'pdf' ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
                            PDF
                        </button>
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
