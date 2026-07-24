import { useState } from 'react';
import axios from 'axios';
import { Search, Calculator, ArrowLeft, Printer, FileSpreadsheet, RefreshCw, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToPDF } from '../../utils/pdfExport';
import { exportToExcel as exportToExcelUtil } from '../../utils/excelExport';
import { Button, useToast } from '../../components';

function FirstLastReport() {
    const navigate = useNavigate();
    const toast = useToast();
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0].substring(0, 8) + '01'); // First of month
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [employeeId, setEmployeeId] = useState('');
    const [firstName, setFirstName] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [calculated, setCalculated] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const calculate = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/reports/first-last', {
                params: { startDate, endDate, employeeId, firstName }
            });
            setData(res.data);
            setCalculated(true);
        } catch (err) {
            console.error(err);
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

    return (
        <div className="flex flex-col h-full bg-[#FAFBFC] dark:bg-slate-900">
            {/* Premium Header Container */}
            <div className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 sticky top-0 z-30 shadow-sm">
                {/* Top Bar */}
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" icon={ArrowLeft} iconSize={20} onClick={() => navigate('/reports')} aria-label="Back to reports" />
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <span className="p-2 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 rounded-lg">
                                    <Search size={20} />
                                </span>
                                First & Last Punch
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Daily punch analysis report</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="primary"
                            onClick={calculate}
                            disabled={loading}
                        >
                            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Calculator size={18} />}
                            {loading ? 'Calculating...' : 'Calculate'}
                        </Button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t dark:border-slate-700 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-1 rounded-lg border dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-r dark:border-slate-700 h-full">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Date Range</span>
                        </div>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 dark:text-slate-100 bg-transparent border-none focus:ring-0 px-2 outline-none h-8"
                        />
                        <span className="text-slate-300">→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 dark:text-slate-100 bg-transparent border-none focus:ring-0 px-2 outline-none h-8"
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-1 rounded-lg border dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-r dark:border-slate-700 h-full">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Employee</span>
                        </div>
                        <input
                            type="text"
                            placeholder="ID..."
                            value={employeeId}
                            onChange={e => setEmployeeId(e.target.value)}
                            className="text-sm font-medium text-slate-700 dark:text-slate-100 bg-transparent border-none focus:ring-0 px-2 outline-none w-24 h-8"
                        />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>
                        <input
                            type="text"
                            placeholder="Name..."
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className="text-sm font-medium text-slate-700 dark:text-slate-100 bg-transparent border-none focus:ring-0 px-2 outline-none w-32 h-8"
                        />
                    </div>
                </div>
            </div>

            {/* Data Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border dark:border-slate-700 overflow-hidden min-h-[400px]">
                    {data.length === 0 && calculated ? (
                        <div className="table-empty-state">
                            <div className="table-empty-icon"><Search size={48} /></div>
                            <div className="table-empty-title">No Records Found</div>
                            <div className="table-empty-description">Try adjusting your filters.</div>
                        </div>
                    ) : !calculated ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center h-96">
                            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 rounded-full mb-6">
                                <Calculator size={48} className="text-slate-300" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-400">No Data Generated</h3>
                            <p className="text-sm text-slate-400 max-w-xs mt-2">Use the filters above and click Calculate to generate the report.</p>
                        </div>
                    ) : (
                        <div className="table-premium-wrapper">
                            <table className="table-premium">
                                <thead>
                                    <tr>
                                        <th>Employee ID</th>
                                        <th>Name</th>
                                        <th>Department</th>
                                        <th>Date</th>
                                        <th>Weekday</th>
                                        <th>First Punch</th>
                                        <th>Last Punch</th>
                                        <th>Total Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((row, i) => (
                                        <tr key={i}>
                                            <td><span className="cell-code">{row.employee_code}</span></td>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{row.first_name} {row.last_name}</span>
                                                </div>
                                            </td>
                                            <td><span className="text-slate-600 dark:text-slate-400 font-medium text-sm">{row.department}</span></td>
                                            <td><span className="text-slate-600 dark:text-slate-400 font-medium text-sm">{row.date}</span></td>
                                            <td><span className="text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wide">{row.weekday}</span></td>
                                            <td><span className="font-mono text-sm text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">{row.first_punch || '-'}</span></td>
                                            <td><span className="font-mono text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded">{row.last_punch || '-'}</span></td>
                                            <td><span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">{row.total_time}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            {data.length > 0 && (
                <div className="bg-white dark:bg-slate-800 border-t dark:border-slate-700 p-4 flex justify-between items-center sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                    <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Total {data.length} Records
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="danger"
                            onClick={handleExportPDF}
                            disabled={exporting || data.length === 0}
                        >
                            {exporting ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                            {exporting ? 'Exporting...' : 'PDF Export'}
                        </Button>
                        <Button
                            variant="success"
                            onClick={exportToExcel}
                            disabled={exporting || data.length === 0}
                        >
                            {exporting ? (
                                <>
                                    <Loader size={16} className="animate-spin" />
                                    {exportProgress > 0 && `${exportProgress}%`}
                                </>
                            ) : (
                                <FileSpreadsheet size={16} />
                            )}
                            {exporting ? 'Exporting...' : 'Excel Export'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FirstLastReport;
