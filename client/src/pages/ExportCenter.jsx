import React, { useState } from 'react';
import api from '../api';
import { Download, FileText, FileSpreadsheet, Loader, FileDown } from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { useToast, Button, PageHeader } from '../components';

const EXPORT_TYPES = [
    { id: 'employees', label: 'Employee Master', endpoint: '/api/employees' },
    { id: 'attendance_summary', label: 'Attendance Summary', endpoint: '/api/attendance/summary' },
    { id: 'raw_logs', label: 'Raw Biometric Logs', endpoint: '/api/logs' },
    { id: 'holidays', label: 'Holidays', endpoint: '/api/holidays' },
];

export default function ExportCenter() {
    const toast = useToast();
    const [exportType, setExportType] = useState('employees');
    const [format, setFormat] = useState('csv');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [exporting, setExporting] = useState(false);
    const [exportData, setExportData] = useState(null);

    const handleExport = async () => {
        setExporting(true);
        try {
            const type = EXPORT_TYPES.find(t => t.id === exportType);
            let url = type.endpoint;
            if (dateRange.start) url += `?start=${dateRange.start}&end=${dateRange.end || dateRange.start}`;

            const res = await api.get(url);
            const data = res.data;
            setExportData(data);

            if (format === 'csv') {
                downloadCSV(data, `${exportType}_export.csv`);
            } else if (format === 'json') {
                downloadJSON(data, `${exportType}_export.json`);
            } else if (format === 'pdf') {
                downloadPDF(data, type.label);
            }
        } catch (err) {
            toast.error('Export failed: ' + (err.response?.data?.error || err.message));
        }
        setExporting(false);
    };

    const downloadPDF = (data, label) => {
        if (!Array.isArray(data) || data.length === 0) {
            toast.warning('No data to export');
            return;
        }

        const dateRangeText = dateRange.start 
            ? (dateRange.end ? `${dateRange.start} to ${dateRange.end}` : dateRange.start)
            : 'All Time';

        exportToPDF({
            data,
            filename: `${exportType}_export_${dateRange.start || 'all'}.pdf`,
            title: label || 'Export Report',
            subtitle: `Data Export: ${EXPORT_TYPES.find(t => t.id === exportType)?.label}`,
            dateRange: dateRangeText
        });
    };

    const downloadCSV = (data, filename) => {
        if (!Array.isArray(data) || data.length === 0) {
            toast.warning('No data to export');
            return;
        }
        const headers = Object.keys(data[0]);
        const csv = [headers.join(','), ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    };

    const downloadJSON = (data, filename) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <PageHeader
                icon={Download}
                title="Export Center"
                subtitle="Download your data as CSV, JSON or PDF"
            />

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border dark:border-slate-700 space-y-6">
                {/* Export Type */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Data Type</label>
                    <div className="grid grid-cols-2 gap-3">
                        {EXPORT_TYPES.map(type => (
                            <button key={type.id} onClick={() => setExportType(type.id)}
                                className={`p-4 border dark:border-slate-700 rounded-lg text-left transition-colors ${exportType === type.id ? 'border-orange-500 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                                <FileSpreadsheet className={`mb-1 ${exportType === type.id ? 'text-orange-500' : 'text-slate-400'}`} size={20} />
                                <div className="font-medium text-sm">{type.label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date Range (Optional) */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date Range (Optional)</label>
                    <div className="flex gap-4">
                        <input type="date" className="flex-1 border dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 rounded-lg px-3 py-2" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                        <span className="self-center text-slate-400">to</span>
                        <input type="date" className="flex-1 border dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 rounded-lg px-3 py-2" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                    </div>
                </div>

                {/* Format */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Format</label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="format" value="csv" checked={format === 'csv'} onChange={() => setFormat('csv')} className="w-4 h-4" />
                            <FileSpreadsheet size={18} className="text-green-600" /> CSV
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="format" value="json" checked={format === 'json'} onChange={() => setFormat('json')} className="w-4 h-4" />
                            <FileText size={18} className="text-blue-600" /> JSON
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="format" value="pdf" checked={format === 'pdf'} onChange={() => setFormat('pdf')} className="w-4 h-4" />
                            <FileDown size={18} className="text-red-600" /> PDF
                        </label>
                    </div>
                </div>

                {/* Export Button */}
                <Button size="lg" onClick={handleExport} disabled={exporting} className="w-full">
                    {exporting ? <Loader className="animate-spin" size={18} /> : <Download size={18} />}
                    {exporting ? 'Exporting...' : 'Export Data'}
                </Button>
            </div>
        </div>
    );
}
