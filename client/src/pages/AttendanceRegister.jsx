import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { Calendar, Clock, AlertTriangle, CheckCircle, XCircle, Filter, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import {
    useToast, Button, ListPage, ListSearch, ListMenu, ListMenuItem,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../components';
import { toLocalDateString, formatDateTime, formatTime } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide';

export default function AttendanceRegister() {
    const toast = useToast();
    const [rawData, setRawData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [date, setDate] = useState(toLocalDateString());
    // Seeded from the URL so dashboard cards can open the register already
    // filtered (?status=Absent, ?late=1).
    const [searchParams] = useSearchParams();
    const [filters, setFilters] = useState(() => ({
        status: searchParams.get('status') || '',
        department: '',
        late: searchParams.get('late') === '1'
    }));

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
        if (filters.late) rows = rows.filter(r => (r.late_minutes || 0) > 0);
        return rows;
    }, [rawData, filters]);

    const statusOptions = useMemo(
        () => [...new Set([...rawData.map(r => r.status), filters.status].filter(Boolean))].sort(),
        [rawData, filters.status]
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
            'Half Day': 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
            'Short Day': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            'Miss Punch': 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
            'Weekly Off': 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
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
                in_time: row.in_time ? formatTime(row.in_time) : '-',
                out_time: row.out_time ? formatTime(row.out_time) : '-',
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
            'Generated At': formatDateTime(new Date())
        };
        if (filterObj.status) metadata['Status Filter'] = filterObj.status;
        if (filterObj.department) metadata['Department Filter'] = filterObj.department;

        exportToExcel({
            data: data.map(row => ({
                'Employee Name': row.name,
                'Employee Code': row.employee_code || '-',
                'Department': row.department || '-',
                'In Time': row.in_time ? formatTime(row.in_time) : '-',
                'Out Time': row.out_time ? formatTime(row.out_time) : '-',
                'Duration': row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '-',
                'Late (min)': row.late_minutes > 0 ? row.late_minutes : '-',
                'Status': row.status
            })),
            filename: `attendance_register_${date}.xlsx`,
            sheetName: 'Attendance Register',
            metadata
        });
    };

    const pager = useTableControls(data, {
        searchKeys: ['name', 'employee_code', 'department'],
        pageSize: 50
    });

    const isFiltered = Boolean(filters.status || filters.department || filters.late);

    const stats = [
        { label: 'Present', value: summary.present, icon: CheckCircle, tone: 'text-emerald-700 dark:text-emerald-400' },
        { label: 'Absent', value: summary.absent, icon: XCircle, tone: 'text-rose-600 dark:text-rose-400' },
        { label: 'Late Arrival', value: summary.late, icon: Clock, tone: 'text-amber-700 dark:text-amber-400' },
        { label: 'Miss Punch', value: summary.missPunch, icon: AlertTriangle, tone: 'text-slate-600 dark:text-slate-400' }
    ];

    return (
        <>
            <ListPage
                title="Attendance Register"
                count={rawData.length}
                actions={
                    <ListMenu label="Export" icon={Download} width="w-44" emptyHint={data.length === 0 ? 'Nothing to export yet.' : null}>
                        <ListMenuItem onClick={handleExportPDF}>PDF</ListMenuItem>
                        <ListMenuItem onClick={handleExportXLSX}>Excel (.xlsx)</ListMenuItem>
                    </ListMenu>
                }
                toolbar={
                    <>
                        <ListSearch label="Search attendance" placeholder="Search by name, code or department…" value={pager.query} onChange={pager.setQuery} />
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            aria-label="Date"
                            className="field-sm !h-8 !py-0 w-auto tabular-nums"
                        />
                        {/* The filter state and predicates already existed; this is the
                            UI that was missing, so the button did nothing. */}
                        <select
                            value={filters.status}
                            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                            aria-label="Status"
                            className="field-sm !h-8 !py-0 w-auto"
                        >
                            <option value="">All statuses</option>
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                            value={filters.department}
                            onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}
                            aria-label="Department"
                            className="field-sm !h-8 !py-0 w-auto"
                        >
                            <option value="">All departments</option>
                            {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <label className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filters.late}
                                onChange={e => setFilters(f => ({ ...f, late: e.target.checked }))}
                                className="rounded border-slate-300"
                            />
                            Late only
                        </label>
                        {isFiltered && (
                            <Button variant="ghost" size="toolbar" icon={Filter} onClick={() => setFilters({ status: '', department: '', late: false })}>
                                Clear
                            </Button>
                        )}
                    </>
                }
                footer={!loading && !error && data.length > 0 ? <TablePager controls={pager} noun="record" /> : null}
            >
                {/* Summary Cards */}
                <div className="m-4 sm:mx-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map(({ label, value, icon: Icon, tone }) => (
                        <div
                            key={label}
                            className="bg-app-surface/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-start justify-between gap-3"
                        >
                            <div className="min-w-0">
                                <div className={`text-[11px] font-bold uppercase tracking-[0.09em] mb-1 ${tone}`}>{label}</div>
                                <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</div>
                            </div>
                            <Icon size={22} className={`shrink-0 opacity-40 ${tone}`} />
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="px-4 sm:px-6 pb-6 space-y-3">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load attendance</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {isFiltered ? 'No matching records' : 'No attendance records'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {isFiltered
                                ? 'Nothing matches the current filters. Clear them or pick another date.'
                                : 'Change the date or check your shifts configuration.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                <th className={LIST_TH}>Employee</th>
                                <th className={LIST_TH}>Code</th>
                                <th className={LIST_TH}>Department</th>
                                <th className={LIST_TH}>In Time</th>
                                <th className={LIST_TH}>Out Time</th>
                                <th className={LIST_TH}>Duration</th>
                                <th className={LIST_TH}>Late (min)</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}>Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {/* Keyed by code+date, not row.id: absentees have
                                no summary row, so id was null for every one of
                                them — dozens of identical keys, and React
                                recycling the wrong rows on filter changes. */}
                            {pager.view.map((row, idx) => (
                                <tr key={`${row.employee_code}-${row.date}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums`}>{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                        {row.name || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                                            {row.employee_code || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                        {row.department || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                            {row.in_time ? formatTime(row.in_time) : '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                            {row.out_time ? formatTime(row.out_time) : '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                                            {row.duration_minutes ? `${Math.floor(row.duration_minutes / 60)}h ${row.duration_minutes % 60}m` : '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {row.late_minutes > 0 ? (
                                            <span className={`${BADGE_BASE} tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`}>
                                                {row.late_minutes} min
                                            </span>
                                        ) : (
                                            <span className="text-slate-500 dark:text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3 whitespace-nowrap`}>
                                        <span className={`${BADGE_BASE} ${getStatusStyle(row.status)}`}>
                                            {row.status || '—'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPage>
        </>
    );
}
