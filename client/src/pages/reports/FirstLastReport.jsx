import { useState } from 'react';
import axios from 'axios';
import { Search, Calculator, ArrowLeft, Printer, FileSpreadsheet, RefreshCw, Loader, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToPDF } from '../../utils/pdfExport';
import { exportToExcel as exportToExcelUtil } from '../../utils/excelExport';
import { Button, useToast } from '../../components';
import { toLocalDateString } from '../../utils/dateFormat';

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
                    'Generated At': new Date().toLocaleString()
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

    const CODE_CELL = 'font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold';
    const NAME_CELL = 'font-semibold text-slate-800 dark:text-slate-100';
    const SECONDARY_CELL = 'text-slate-600 dark:text-slate-300';

    return (
        <div className="space-y-6">
            {/* Header — icon chip + title, matching PageHeader */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="ghost" size="sm" icon={ArrowLeft} iconSize={18} onClick={() => navigate('/reports')} aria-label="Back to reports" />
                    <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600 shrink-0 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400">
                        <Search size={22} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-800 truncate dark:text-slate-100">First &amp; Last Punch</h1>
                        <p className="text-sm text-slate-500 truncate dark:text-slate-400">Daily punch analysis report</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {data.length > 0 && (
                        <>
                            <Button variant="danger" onClick={handleExportPDF} disabled={exporting}>
                                {exporting ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                                {exporting ? 'Exporting…' : 'PDF'}
                            </Button>
                            <Button variant="success" onClick={exportToExcel} disabled={exporting}>
                                {exporting ? <Loader size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                                {exporting ? (exportProgress > 0 ? `${exportProgress}%` : 'Exporting…') : 'Excel'}
                            </Button>
                        </>
                    )}
                    <Button variant="primary" onClick={calculate} disabled={loading}>
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : <Calculator size={16} />}
                        {loading ? 'Calculating…' : 'Calculate'}
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="card-base !p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Date range</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="input-base !py-1.5 !w-auto text-sm tabular-nums"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="input-base !py-1.5 !w-auto text-sm tabular-nums"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Employee</span>
                    <input
                        type="text"
                        placeholder="ID…"
                        value={employeeId}
                        onChange={e => setEmployeeId(e.target.value)}
                        className="input-base !py-1.5 !w-24 text-sm"
                    />
                    <input
                        type="text"
                        placeholder="Name…"
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        className="input-base !py-1.5 !w-36 text-sm"
                    />
                </div>
            </div>

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
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not generate the report</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={calculate}>Try again</Button>
                    </div>
                ) : !calculated ? (
                    <div className="py-16 text-center">
                        <Calculator size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No report yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Pick a date range above and press Calculate.
                        </p>
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-16 text-center">
                        <Search size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records found</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            No punches between {startDate} and {endDate} match these filters.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee ID</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Name</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Date</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Weekday</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">First Punch</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Last Punch</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Total Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.map((row, i) => (
                                    <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={CODE_CELL}>{row.employee_code || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={NAME_CELL}>
                                                {[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={SECONDARY_CELL}>{row.department || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`${SECONDARY_CELL} tabular-nums`}>{row.date || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                                {row.weekday || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                                                {row.first_punch || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                                                {row.last_punch || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                                                {row.total_time || '—'}
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


export default FirstLastReport;
