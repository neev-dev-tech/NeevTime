import React, { useEffect, useState } from 'react';
import api from '../api';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, User, Filter, Download, FileDown, FileSpreadsheet, Table2, RefreshCw } from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import SkeletonLoader from '../components/SkeletonLoader';
import { useToast, Button, PageHeader } from '../components';

export default function AttendanceRegister() {
    const toast = useToast();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [filters, setFilters] = useState({ status: '', department: '' });

    useEffect(() => { fetchData(); }, [date, filters]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/attendance/summary', { params: { date } });
            let filtered = res.data;
            if (filters.status) filtered = filtered.filter(r => r.status === filters.status);
            if (filters.department) filtered = filtered.filter(r => r.department === filters.department);
            setData(filtered);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const getStatusStyle = (status) => {
        const styles = {
            'Present': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Absent': 'bg-rose-50 text-rose-700 border-rose-200',
            'Late': 'bg-amber-50 text-amber-700 border-amber-200',
            'Half Day': 'bg-orange-50 text-orange-700 border-orange-200',
            'Miss Punch': 'bg-purple-50 text-purple-700 border-purple-200',
            'Weekly Off': 'bg-blue-50 text-blue-700 border-blue-200',
            'Holiday': 'bg-pink-50 text-pink-700 border-pink-200',
        };
        return styles[status] || 'bg-slate-50 text-slate-700 border-slate-200';
    };

    const summary = {
        present: data.filter(r => r.status === 'Present').length,
        absent: data.filter(r => r.status === 'Absent').length,
        late: data.filter(r => (r.late_minutes || 0) > 0).length,
        missPunch: data.filter(r => r.status === 'Miss Punch').length,
    };

    const handleExportPDF = () => {
        if (data.length === 0) return toast.warning('No data to export');
        const filterObj = {};
        if (filters.status) filterObj.status = filters.status;
        if (filters.department) filterObj.department = filters.department;

        exportToPDF({
            data: data.map(row => ({
                employee: row.name,
                employee_code: row.employee_code || '-',
                department: row.department || '-',
                in_time: row.in_time ? new Date(row.in_time).toLocaleTimeString() : '-',
                out_time: row.out_time ? new Date(row.out_time).toLocaleTimeString() : '-',
                duration: row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '-',
                late_minutes: row.late_minutes > 0 ? row.late_minutes : '-',
                status: row.status
            })),
            filename: `attendance_register_${date}.pdf`,
            title: 'Attendance Register',
            subtitle: `Daily Attendance Report`,
            dateRange: date,
            filters: filterObj
        });
    };

    const handleExportXLSX = () => {
        if (data.length === 0) return toast.warning('No data to export');
        const filterObj = {};
        if (filters.status) filterObj.status = filters.status;
        if (filters.department) filterObj.department = filters.department;

        const metadata = {
            'Report Type': 'Attendance Register',
            'Date': date,
            'Generated At': new Date().toLocaleString()
        };
        if (filterObj.status) metadata['Status Filter'] = filterObj.status;
        if (filterObj.department) metadata['Department Filter'] = filterObj.department;

        exportToExcel({
            data: data.map(row => ({
                'Employee Name': row.name,
                'Employee Code': row.employee_code || '-',
                'Department': row.department || '-',
                'In Time': row.in_time ? new Date(row.in_time).toLocaleTimeString() : '-',
                'Out Time': row.out_time ? new Date(row.out_time).toLocaleTimeString() : '-',
                'Duration': row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '-',
                'Late (min)': row.late_minutes > 0 ? row.late_minutes : '-',
                'Status': row.status
            })),
            filename: `attendance_register_${date}.xlsx`,
            sheetName: 'Attendance Register',
            metadata
        });
    };

    return (
        <div className="space-y-6">
            <div className="report-container">
                {/* Header */}
                <div className="px-6 pt-6 border-b border-slate-100">
                    <PageHeader
                        icon={Calendar}
                        title="Attendance Register"
                        subtitle="Daily attendance summary"
                        actions={
                            <>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="input-premium py-1.5 px-3 bg-white/50 border-slate-200 text-sm"
                                />
                                <Button variant="secondary" icon={Filter}>Filters</Button>
                                <Button variant="danger" size="sm" icon={FileDown} onClick={handleExportPDF} title="Export PDF">PDF</Button>
                                <Button variant="success" size="sm" icon={FileSpreadsheet} onClick={handleExportXLSX} title="Export Excel">XLSX</Button>
                            </>
                        }
                    />
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b border-slate-100 bg-slate-50/30">
                    <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-1">Present</div>
                            <div className="text-3xl font-bold text-slate-800">{summary.present}</div>
                        </div>
                        <CheckCircle className="absolute bottom-3 right-3 text-emerald-100 z-0" size={32} />
                    </div>

                    <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-rose-600 text-xs font-bold uppercase tracking-wider mb-1">Absent</div>
                            <div className="text-3xl font-bold text-slate-800">{summary.absent}</div>
                        </div>
                        <XCircle className="absolute bottom-3 right-3 text-rose-100 z-0" size={32} />
                    </div>

                    <div className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Late Arrival</div>
                            <div className="text-3xl font-bold text-slate-800">{summary.late}</div>
                        </div>
                        <Clock className="absolute bottom-3 right-3 text-amber-100 z-0" size={32} />
                    </div>

                    <div className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="text-purple-600 text-xs font-bold uppercase tracking-wider mb-1">Miss Punch</div>
                            <div className="text-3xl font-bold text-slate-800">{summary.missPunch}</div>
                        </div>
                        <AlertTriangle className="absolute bottom-3 right-3 text-purple-100 z-0" size={32} />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="p-6">
                        <SkeletonLoader rows={10} columns={7} />
                    </div>
                ) : (
                    <div className="table-premium-wrapper">
                        <table className="table-premium">
                            <thead>
                                <tr>
                                    <th>Employee</th>
                                    <th>Department</th>
                                    <th>In Time</th>
                                    <th>Out Time</th>
                                    <th>Duration</th>
                                    <th>Late (min)</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className="table-empty-state">
                                                <div className="table-empty-icon"><Calendar size={40} /></div>
                                                <div className="table-empty-title">No attendance records</div>
                                                <div className="table-empty-description">Change the date or check your shifts configuration.</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.map(row => (
                                        <tr key={row.id}>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-800">{row.name}</span>
                                                    <span className="cell-code mt-0.5 w-fit">{row.employee_code}</span>
                                                </div>
                                            </td>
                                            <td><span className="text-slate-600 font-medium text-xs uppercase tracking-wide">{row.department || '-'}</span></td>
                                            <td><span className="font-mono text-xs text-slate-600">{row.in_time ? new Date(row.in_time).toLocaleTimeString() : '-'}</span></td>
                                            <td><span className="font-mono text-xs text-slate-600">{row.out_time ? new Date(row.out_time).toLocaleTimeString() : '-'}</span></td>
                                            <td><span className="font-mono text-xs font-semibold text-slate-700">{row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '-'}</span></td>
                                            <td>
                                                {row.late_minutes > 0 ? (
                                                    <span className="text-amber-600 font-bold text-xs bg-amber-50 px-2 py-1 rounded-full border border-amber-100">{row.late_minutes} min</span>
                                                ) : <span className="text-slate-400">-</span>}
                                            </td>
                                            <td>
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusStyle(row.status)}`}>
                                                    {row.status}
                                                </span>
                                            </td>
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
