import { useState } from 'react';
import axios from 'axios';
import { Search, Calculator, ArrowLeft, Download, RefreshCw, Loader, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToPDF } from '../../utils/pdfExport';
import { exportToExcel as exportToExcelUtil } from '../../utils/excelExport';
import {
    Button, useToast, ListPage, ListMenu, ListMenuItem,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../../components';
import { toLocalDateString, formatDateTime } from '../../utils/dateFormat';

function FirstLastReport() {
    const navigate = useNavigate();
    const toast = useToast();
    const [startDate, setStartDate] = useState(toLocalDateString().substring(0, 8) + '01'); // First of month
    const [endDate, setEndDate] = useState(toLocalDateString());
    const [employeeId, setEmployeeId] = useState('');
    const [firstName, setFirstName] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [calculated, setCalculated] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [error, setError] = useState(null);

    const calculate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/reports/first-last', {
                params: { startDate, endDate, employeeId, firstName }
            });
            setData(res.data);
            setCalculated(true);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Error generating report');
            toast.error('Error generating report');
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = () => {
        if (data.length === 0) {
            toast.warning('No data to export');
            return;
        }

        const filters = {};
        if (employeeId) filters['Employee ID'] = employeeId;
        if (firstName) filters['First Name'] = firstName;

        exportToPDF({
            data: data.map(r => ({
                'Employee Id': r.employee_code,
                'First Name': r.first_name,
                'Last Name': r.last_name || '',
                'Department': r.department,
                'Date': r.date,
                'Weekday': r.weekday,
                'First Punch': r.first_punch || '-',
                'Last Punch': r.last_punch || '-',
                'Total Time': r.total_time
            })),
            filename: `First_Last_Report_${startDate}_${endDate}.pdf`,
            title: 'First & Last Punch Report',
            subtitle: 'Daily punch time report',
            dateRange: `${startDate} to ${endDate}`,
            filters,
            orientation: 'landscape'
        });
    };

    const handleExportExcel = async () => {
        if (data.length === 0) {
            toast.warning('No data to export. Please generate the report first.');
            return;
        }

        setExporting(true);
        setExportProgress(0);

        try {
            await exportToExcelUtil({
                data: data.map(r => ({
                    'Employee Id': r.employee_code,
                    'First Name': r.first_name,
                    'Last Name': r.last_name || '',
                    'Department': r.department,
                    'Date': r.date,
                    'Weekday': r.weekday,
                    'First Punch': r.first_punch || '-',
                    'Last Punch': r.last_punch || '-',
                    'Total Time': r.total_time
                })),
                filename: `First_Last_Report_${startDate}_${endDate}.xlsx`,
                sheetName: 'First & Last Punch',
                metadata: {
                    'Report Type': 'First & Last Punch Report',
                    'Date Range': `${startDate} to ${endDate}`,
                    'Total Records': data.length,
                    'Generated At': formatDateTime(new Date())
                },
                onProgress: (progress) => setExportProgress(progress),
                onSuccess: ({ filename, recordCount }) => {
                    console.log(`✅ Export successful: ${filename} (${recordCount} records)`);
                },
                onError: (err) => {
                    toast.error(`❌ Export failed: ${err.message}`);
                }
            });
        } catch (err) {
            console.error('Excel export error:', err);
            toast.error(`Failed to export Excel: ${err.message}`);
        } finally {
            setExporting(false);
            setExportProgress(0);
        }
    };

    const exportToExcel = () => {
        handleExportExcel();
    };

    const CODE_CELL = 'font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold';
    const NAME_CELL = 'font-semibold text-slate-800 dark:text-slate-100';
    const SECONDARY_CELL = 'text-slate-600 dark:text-slate-300';

    const TIME_CELL = 'font-mono text-xs tabular-nums font-semibold text-slate-800 dark:text-slate-100';
    const FIELD = 'field-sm !h-8 !py-0';
    const TD = 'px-4 py-2.5 whitespace-nowrap';

    return (
        <ListPage
            title="First & Last Punch"
            count={calculated && !error ? data.length : undefined}
            actions={
                <>
                    <Button variant="tonal" size="toolbar" icon={ArrowLeft} onClick={() => navigate('/reports')}>All reports</Button>
                    {exporting ? (
                        <Button variant="tonal" size="toolbar" disabled>
                            <Loader size={15} className="animate-spin" />
                            {exportProgress > 0 ? `${exportProgress}%` : 'Exporting…'}
                        </Button>
                    ) : (
                        <ListMenu
                            label="Export"
                            icon={Download}
                            width="w-44"
                            emptyHint={data.length > 0 ? null : 'Calculate the report to export it.'}
                        >
                            <ListMenuItem onClick={handleExportPDF}>PDF</ListMenuItem>
                            <ListMenuItem onClick={exportToExcel}>Excel (.xlsx)</ListMenuItem>
                        </ListMenu>
                    )}
                    <Button variant="primary" size="toolbar" onClick={calculate} disabled={loading}>
                        {loading ? <RefreshCw size={15} className="animate-spin" /> : <Calculator size={15} />}
                        {loading ? 'Calculating…' : 'Calculate'}
                    </Button>
                </>
            }
            toolbar={
                <>
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] text-slate-600 dark:text-slate-400">Range</span>
                        <input
                            type="date"
                            aria-label="Start date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className={`${FIELD} !w-auto tabular-nums`}
                        />
                        <span className="text-slate-500 dark:text-slate-400" aria-hidden="true">→</span>
                        <input
                            type="date"
                            aria-label="End date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className={`${FIELD} !w-auto tabular-nums`}
                        />
                    </div>
                    <input
                        type="text"
                        aria-label="Employee ID"
                        placeholder="Employee ID…"
                        value={employeeId}
                        onChange={e => setEmployeeId(e.target.value)}
                        className={`${FIELD} !w-32`}
                    />
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" aria-hidden="true" />
                        <input
                            type="text"
                            aria-label="First name"
                            placeholder="First name…"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className={`${FIELD} !w-48 pl-9`}
                        />
                    </div>
                </>
            }
            footer={!loading && !error && data.length > 0 ? (
                <div className="px-4 sm:px-6 py-2.5 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    {data.length} record{data.length === 1 ? '' : 's'}
                </div>
            ) : null}
        >
            {loading ? (
                <div className="p-4 sm:p-6 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="py-20 text-center px-6">
                    <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not generate the report</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                    <Button variant="secondary" icon={RefreshCw} onClick={calculate}>Try again</Button>
                </div>
            ) : !calculated ? (
                <div className="py-20 text-center px-6">
                    <Calculator size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No report yet</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Pick a date range above and press Calculate.
                    </p>
                </div>
            ) : data.length === 0 ? (
                <div className="py-20 text-center px-6">
                    <Search size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records found</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        No punches between {startDate} and {endDate} match these filters.
                    </p>
                </div>
            ) : (
                <table className="w-full text-sm text-left">
                    <thead className={LIST_THEAD}>
                        <tr>
                            <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                            <th className={LIST_TH}>Employee ID</th>
                            <th className={LIST_TH}>Name</th>
                            <th className={LIST_TH}>Department</th>
                            <th className={LIST_TH}>Date</th>
                            <th className={LIST_TH}>Weekday</th>
                            <th className={LIST_TH}>First Punch</th>
                            <th className={LIST_TH}>Last Punch</th>
                            <th className={`${LIST_TH} ${LIST_EDGE_LAST}`}>Total Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className={`${LIST_EDGE_FIRST} pr-4 py-2.5 text-slate-500 dark:text-slate-400 tabular-nums`}>{i + 1}</td>
                                <td className={TD}>
                                    <span className={CODE_CELL}>{row.employee_code || '—'}</span>
                                </td>
                                <td className={TD}>
                                    <span className={NAME_CELL}>
                                        {[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}
                                    </span>
                                </td>
                                <td className={TD}>
                                    <span className={SECONDARY_CELL}>{row.department || '—'}</span>
                                </td>
                                <td className={TD}>
                                    <span className={`${SECONDARY_CELL} tabular-nums`}>{row.date || '—'}</span>
                                </td>
                                <td className={TD}>
                                    <span className={SECONDARY_CELL}>{row.weekday || '—'}</span>
                                </td>
                                <td className={TD}>
                                    <span className={TIME_CELL}>{row.first_punch || '—'}</span>
                                </td>
                                <td className={TD}>
                                    <span className={TIME_CELL}>{row.last_punch || '—'}</span>
                                </td>
                                <td className={`${TD} ${LIST_EDGE_LAST}`}>
                                    <span className={TIME_CELL}>{row.total_time || '—'}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </ListPage>
    );
}


export default FirstLastReport;
