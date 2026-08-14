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

const FORMATS = [
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, tint: 'text-emerald-600 dark:text-emerald-400' },
    { id: 'json', label: 'JSON', icon: FileText, tint: 'text-blue-600 dark:text-blue-400' },
    { id: 'pdf', label: 'PDF', icon: FileDown, tint: 'text-rose-600 dark:text-rose-400' },
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

            <div className="card-base !p-6 space-y-6">
                {/* Export Type */}
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-2">Data Type</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {EXPORT_TYPES.map(type => {
                            const active = exportType === type.id;
                            return (
                                <button
                                    key={type.id}
                                    onClick={() => setExportType(type.id)}
                                    className={`p-4 rounded-xl text-left border transition-colors ${active
                                        ? 'border-orange-400 dark:border-orange-500 bg-orange-50/70 dark:bg-orange-900/30 shadow-sm'
                                        : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 hover:border-orange-300 dark:hover:border-orange-500/60 hover:bg-orange-50/40 dark:hover:bg-slate-700/50'
                                        }`}
                                >
                                    <FileSpreadsheet
                                        className={`mb-1.5 ${active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}
                                        size={20}
                                    />
                                    <div className={`text-sm ${active ? 'font-semibold text-slate-800 dark:text-slate-100' : 'font-medium text-slate-600 dark:text-slate-300'}`}>
                                        {type.label}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Date Range (Optional) */}
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-2">Date Range (Optional)</label>
                    <div className="flex gap-4">
                        <input
                            type="date"
                            className="field flex-1"
                            value={dateRange.start}
                            onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                        />
                        <span className="self-center text-sm text-slate-500 dark:text-slate-400">to</span>
                        <input
                            type="date"
                            className="field flex-1"
                            value={dateRange.end}
                            onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                        />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Leave both blank to export everything.
                    </p>
                </div>

                {/* Format */}
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-2">Format</label>
                    <div className="flex flex-wrap gap-1.5">
                        {FORMATS.map(f => {
                            const Icon = f.icon;
                            const active = format === f.id;
                            return (
                                <label
                                    key={f.id}
                                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${active
                                        ? 'bg-orange-600 text-white border-transparent shadow-sm'
                                        : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="format"
                                        value={f.id}
                                        checked={format === f.id}
                                        onChange={() => setFormat(f.id)}
                                        className="sr-only"
                                    />
                                    <Icon size={15} className={active ? 'text-white' : f.tint} />
                                    {f.label}
                                </label>
                            );
                        })}
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
