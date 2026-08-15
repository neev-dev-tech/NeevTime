import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Filter, FileDown, FileSpreadsheet, RefreshCw, AlertCircle } from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import { useToast, Button, PageHeader } from '../components';
import { toLocalDateString } from '../utils/dateFormat';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

export default function AttendanceRegister() {
    const toast = useToast();
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [date, setDate] = useState(toLocalDateString());
    const [filters, setFilters] = useState({ status: '', department: '' });

    // Only the date needs a refetch — filtering is client-side, and the raw rows
    // are kept so the filter dropdowns can list every value, not just the ones
    // that survive the current filter.
    useEffect(() => { fetchData(); }, [date]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/attendance/summary', { params: { date } });
            setRawData(res.data || []);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load attendance records');
        }
        setLoading(false);
    };

    const data = useMemo(() => {
        let rows = rawData;
        if (filters.status) rows = rows.filter(r => r.status === filters.status);
        if (filters.department) rows = rows.filter(r => r.department === filters.department);
        return rows;
    }, [rawData, filters]);

    const statusOptions = useMemo(
        () => [...new Set(rawData.map(r => r.status).filter(Boolean))].sort(),
        [rawData]
    );
    const departmentOptions = useMemo(
        () => [...new Set(rawData.map(r => r.department).filter(Boolean))].sort(),
        [rawData]
    );

    const getStatusStyle = (status) => {
        const styles = {
            'Present': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            'Absent': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            'Late': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            'Half Day': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
            'Short Day': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            'Miss Punch': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
            'Weekly Off': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
            'Holiday': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
        };
        return styles[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
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

    const isFiltered = Boolean(filters.status || filters.department);

    const stats = [
        { label: 'Present', value: summary.present, icon: CheckCircle, tone: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Absent', value: summary.absent, icon: XCircle, tone: 'text-rose-600 dark:text-rose-400' },
        { label: 'Late Arrival', value: summary.late, icon: Clock, tone: 'text-amber-600 dark:text-amber-400' },
        { label: 'Miss Punch', value: summary.missPunch, icon: AlertTriangle, tone: 'text-purple-600 dark:text-purple-400' }
    ];

    return (
        <div className="space-y-6">
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
                            className="field-sm tabular-nums"
                        />
                        {/* The filter state and predicates already existed; this is the
                            UI that was missing, so the button did nothing. */}
                        <select
                            value={filters.status}
                            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                            className="field-sm"
                        >
                            <option value="">All statuses</option>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                            value={filters.department}
                            onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}
                            className="field-sm"
                        >
                            <option value="">All departments</option>
                            {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {isFiltered && (
                            <Button variant="ghost" size="sm" icon={Filter} onClick={() => setFilters({ status: '', department: '' })}>
                                Clear
                            </Button>
                        )}
                        <Button variant="danger" icon={FileDown} onClick={handleExportPDF} title="Export PDF">PDF</Button>
                        <Button variant="success" icon={FileSpreadsheet} onClick={handleExportXLSX} title="Export Excel">XLSX</Button>
                    </>
                }
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map(({ label, value, icon: Icon, tone }) => (
                    <div
                        key={label}
                        className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-start justify-between gap-3"
                    >
                        <div className="min-w-0">
                            <div className={`text-[10px] font-bold uppercase tracking-[0.09em] mb-1 ${tone}`}>{label}</div>
                            <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</div>
                        </div>
                        <Icon size={22} className={`shrink-0 opacity-40 ${tone}`} />
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load attendance</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-16 text-center">
                        <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {isFiltered ? 'No matching records' : 'No attendance records'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {isFiltered
                                ? 'Nothing matches the current filters. Clear them or pick another date.'
                                : 'Change the date or check your shifts configuration.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Code</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">In Time</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Out Time</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Duration</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Late (min)</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.map((row, idx) => (
                                    <tr key={row.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {row.name || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {row.employee_code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                            {row.department || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                {row.in_time ? new Date(row.in_time).toLocaleTimeString() : '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                {row.out_time ? new Date(row.out_time).toLocaleTimeString() : '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                                                {row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            {row.late_minutes > 0 ? (
                                                <span className={`${BADGE_BASE} tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`}>
                                                    {row.late_minutes} min
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`${BADGE_BASE} ${getStatusStyle(row.status)}`}>
                                                {row.status || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && data.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {data.length} record{data.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>
        </div>
    );
}
