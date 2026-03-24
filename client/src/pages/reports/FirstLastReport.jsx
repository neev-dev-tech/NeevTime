import React, { useState } from 'react';
import axios from 'axios';
import { Search, Calculator, ArrowLeft, Printer, FileSpreadsheet, RefreshCw, Filter, Calendar, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToPDF } from '../../utils/pdfExport';
import { exportToExcel } from '../../utils/excelExport';
import ReportErrorBoundary from '../../components/ReportErrorBoundary';
import * as XLSX from 'xlsx';

function FirstLastReport() {
    const navigate = useNavigate();
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
            alert('Error generating report');
        } finally {
            setLoading(false);
        }
    };

    const handleExportPDF = () => {
        if (data.length === 0) {
            alert('No data to export');
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
            alert('No data to export. Please generate the report first.');
            return;
        }

        setExporting(true);
        setExportProgress(0);

        try {
            await exportToExcel({
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
                    alert(`❌ Export failed: ${err.message}`);
                }
            });
        } catch (err) {
            console.error('Excel export error:', err);
            alert(`Failed to export Excel: ${err.message}`);
        } finally {
            setExporting(false);
            setExportProgress(0);
        }
    };

    const exportToExcel = () => {
        handleExportExcel();
    };

    return (
        <div className="flex flex-col h-full bg-[#FAFBFC]">
            {/* Premium Header Container */}
            <div className="bg-white border-b sticky top-0 z-30 shadow-sm">
                {/* Top Bar */}
                <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/reports')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <Search size={20} />
                                </span>
                                First & Last Punch
                            </h1>
                            <p className="text-xs text-slate-500 mt-0.5">Daily punch analysis report</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={calculate}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm shadow-blue-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Calculator size={18} />}
                            {loading ? 'Calculating...' : 'Calculate'}
                        </button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="px-6 py-3 bg-slate-50 border-t flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 bg-white p-1 rounded-lg border shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-r h-full">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Date Range</span>
                        </div>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 px-2 outline-none h-8"
                        />
                        <span className="text-slate-300">→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 px-2 outline-none h-8"
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-white p-1 rounded-lg border shadow-sm">
                        <div className="flex items-center gap-2 px-3 border-r h-full">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Employee</span>
                        </div>
                        <input
                            type="text"
                            placeholder="ID..."
                            value={employeeId}
                            onChange={e => setEmployeeId(e.target.value)}
                            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 px-2 outline-none w-24 h-8"
                        />
                        <div className="w-px h-6 bg-slate-200"></div>
                        <input
                            type="text"
                            placeholder="Name..."
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 px-2 outline-none w-32 h-8"
                        />
                    </div>
                </div>
            </div>

            {/* Data Area */}
            <div className="flex-1 overflow-auto p-6">
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden min-h-[400px]">
                    {data.length === 0 && calculated ? (
                        <div className="table-empty-state">
                            <div className="table-empty-icon"><Search size={48} /></div>
                            <div className="table-empty-title">No Records Found</div>
                            <div className="table-empty-description">Try adjusting your filters.</div>
                        </div>
                    ) : !calculated ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center h-96">
                            <div className="p-6 bg-slate-50 rounded-full mb-6">
                                <Calculator size={48} className="text-slate-300" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-600">No Data Generated</h3>
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
                                                    <span className="font-semibold text-slate-700">{row.first_name} {row.last_name}</span>
                                                </div>
                                            </td>
                                            <td><span className="text-slate-600 font-medium text-sm">{row.department}</span></td>
                                            <td><span className="text-slate-600 font-medium text-sm">{row.date}</span></td>
                                            <td><span className="text-slate-500 text-xs uppercase font-bold tracking-wide">{row.weekday}</span></td>
                                            <td><span className="font-mono text-sm text-emerald-600 bg-emerald-50 px-2 py-1 rounded">{row.first_punch || '-'}</span></td>
                                            <td><span className="font-mono text-sm text-rose-600 bg-rose-50 px-2 py-1 rounded">{row.last_punch || '-'}</span></td>
                                            <td><span className="font-mono text-sm font-bold text-slate-700">{row.total_time}</span></td>
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
                <div className="bg-white border-t p-4 flex justify-between items-center sticky bottom-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                    <div className="text-sm font-medium text-slate-500">
                        Total {data.length} Records
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleExportPDF}
                            disabled={exporting || data.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting ? <Loader size={16} className="animate-spin" /> : <Printer size={16} />}
                            {exporting ? 'Exporting...' : 'PDF Export'}
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={exporting || data.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FirstLastReport;
