import { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../api';
import { Download, FileText, FileSpreadsheet, Loader, FileDown } from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { useToast, Button, ListPage } from '../components';

const EXPORT_TYPES = [
    { id: 'employees', label: 'Employee Master', endpoint: '/api/employees' },
    { id: 'attendance_summary', label: 'Attendance Summary', endpoint: '/api/attendance/summary' },
    { id: 'raw_logs', label: 'Raw Biometric Logs', endpoint: '/api/logs' },
    { id: 'holidays', label: 'Holidays', endpoint: '/api/holidays' },
];

const FORMATS = [
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, hint: 'Opens in Excel or Sheets' },
    { id: 'json', label: 'JSON', icon: FileText, hint: 'For other systems' },
    { id: 'pdf', label: 'PDF', icon: FileDown, hint: 'Printable table' },
];

/** Radio dot for the option rows; the real <input> beside it is visually hidden. */
function Radio({ active }) {
    return (
        <span aria-hidden="true" className={`grid place-items-center w-4 h-4 rounded-full border shrink-0 ${active
            ? 'border-slate-800 dark:border-slate-100'
            : 'border-slate-300 dark:border-slate-600'}`}>
            {active && <span className="w-2 h-2 rounded-full bg-slate-800 dark:bg-slate-100" />}
        </span>
    );
}

Radio.propTypes = { active: PropTypes.bool };

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

    const BAND = 'grid md:grid-cols-[220px_minmax(0,1fr)] gap-x-8 gap-y-3 px-4 sm:px-6 py-5 border-b border-slate-200 dark:border-slate-800';
    const BAND_TITLE = 'text-sm font-semibold text-slate-900 dark:text-slate-100';
    const BAND_HINT = 'mt-0.5 text-xs text-slate-600 dark:text-slate-400';
    // Selectable row: hairline list item, a radio dot carries the state.
    const optionClass = (active) => `flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-slate-400 ${active
        ? 'bg-slate-50 dark:bg-slate-800'
        : 'bg-app-surface hover:bg-slate-50 dark:hover:bg-slate-800/60'}`;
    // Options sit in a hairline grid: 1px gaps over the border colour.
    const OPTION_GRID = 'max-w-2xl grid gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden';

    const selectedType = EXPORT_TYPES.find(t => t.id === exportType);
    const selectedFormat = FORMATS.find(f => f.id === format);

    return (
        <ListPage
            title="Export Center"
            actions={
                <>
                    <span className="hidden sm:inline text-[13px] text-slate-600 dark:text-slate-400">
                        {selectedType?.label} · {selectedFormat?.label}
                    </span>
                    <Button variant="primary" size="toolbar" onClick={handleExport} disabled={exporting}>
                        {exporting ? <Loader className="animate-spin" size={15} /> : <Download size={15} />}
                        {exporting ? 'Exporting...' : 'Export Data'}
                    </Button>
                </>
            }
        >
            {/* Band 1: what to export */}
            <fieldset className={BAND}>
                <legend className="sr-only">Data type</legend>
                <div>
                    <h2 className={BAND_TITLE}>Data</h2>
                    <p className={BAND_HINT}>What to download.</p>
                </div>
                <div className={`${OPTION_GRID} sm:grid-cols-2`}>
                    {EXPORT_TYPES.map(type => {
                        const active = exportType === type.id;
                        return (
                            <label key={type.id} className={optionClass(active)}>
                                <input
                                    type="radio"
                                    name="exportType"
                                    value={type.id}
                                    checked={active}
                                    onChange={() => setExportType(type.id)}
                                    className="sr-only"
                                />
                                <Radio active={active} />
                                <FileSpreadsheet size={16} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                                <span className={`text-sm ${active ? 'font-semibold text-slate-900 dark:text-slate-50' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                                    {type.label}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            {/* Band 2: optional date range */}
            <div className={BAND}>
                <div>
                    <h2 className={BAND_TITLE}>Date range</h2>
                    <p className={BAND_HINT}>Optional. Leave both blank to export everything.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        type="date"
                        aria-label="Start date"
                        className="field-sm !h-8 !py-0 !w-auto tabular-nums"
                        value={dateRange.start}
                        onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                    <span className="text-[13px] text-slate-600 dark:text-slate-400">to</span>
                    <input
                        type="date"
                        aria-label="End date"
                        className="field-sm !h-8 !py-0 !w-auto tabular-nums"
                        value={dateRange.end}
                        onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                </div>
            </div>

            {/* Band 3: file format */}
            <fieldset className={BAND}>
                <legend className="sr-only">Format</legend>
                <div>
                    <h2 className={BAND_TITLE}>Format</h2>
                    <p className={BAND_HINT}>The file you get.</p>
                </div>
                <div className={`${OPTION_GRID} sm:grid-cols-3`}>
                    {FORMATS.map(f => {
                        const Icon = f.icon;
                        const active = format === f.id;
                        return (
                            <label key={f.id} className={optionClass(active)}>
                                <input
                                    type="radio"
                                    name="format"
                                    value={f.id}
                                    checked={active}
                                    onChange={() => setFormat(f.id)}
                                    className="sr-only"
                                />
                                <Radio active={active} />
                                <Icon size={16} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className={`block text-sm ${active ? 'font-semibold text-slate-900 dark:text-slate-50' : 'font-medium text-slate-700 dark:text-slate-200'}`}>{f.label}</span>
                                    <span className="block text-xs text-slate-600 dark:text-slate-400 truncate">{f.hint}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        </ListPage>
    );
}
