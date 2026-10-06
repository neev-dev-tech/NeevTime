import { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../api';
import {
    Download, FileText, FileSpreadsheet, Loader, FileDown, Users, CalendarDays,
    Fingerprint, Plane, CheckCircle, AlertTriangle
} from 'lucide-react';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';
import { toLocalDateString, toDateOnly } from '../utils/dateFormat';
import { useToast, Button, ListPage } from '../components';

/**
 * Bulk data export: pick a dataset, a period where it has one, and a format.
 *
 * Each dataset states what it contains and how its period is passed to the
 * API. The period used to be sent as ?start=&end= to every endpoint, which none
 * of them read: the attendance summary quietly exported today only, and raw
 * logs exported the latest 50 punches whatever range was chosen.
 */
const DATASETS = [
    {
        id: 'employees', label: 'Employee master', icon: Users, endpoint: '/api/employees',
        about: 'One row per employee: code, name, department, position, area, status, joining date and contact details.',
        period: null
    },
    {
        id: 'attendance_summary', label: 'Attendance summary', icon: CalendarDays, endpoint: '/api/attendance/summary',
        about: 'One row per employee per day: first in, last out, hours, late and early minutes, status.',
        period: (from, to) => ({ start_date: from, end_date: to })
    },
    {
        id: 'raw_logs', label: 'Raw biometric logs', icon: Fingerprint, endpoint: '/api/logs',
        about: 'Every punch as the devices sent it: employee, time, device, verification type.',
        period: (from, to) => ({ from, to, limit: LOG_CAP }),
        cap: true
    },
    {
        id: 'holidays', label: 'Holidays', icon: Plane, endpoint: '/api/holidays',
        about: 'The holiday calendar: date, name, type and whether it is optional.',
        period: null
    }
];

// The logs endpoint returns at most this many rows per request.
const LOG_CAP = 5000;

const FORMATS = [
    { id: 'csv', label: 'CSV', icon: FileSpreadsheet, hint: 'Opens in Excel or Google Sheets' },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, hint: 'A formatted .xlsx workbook' },
    { id: 'pdf', label: 'PDF', icon: FileDown, hint: 'A printable table' },
    { id: 'json', label: 'JSON', icon: FileText, hint: 'For importing into other systems' }
];

// Spreadsheet-friendly values. The API serialises DATE columns as the UTC
// instant of local midnight (5 Aug arrives as '2026-08-04T18:30:00.000Z') and
// timestamps in UTC; written raw, a CSV shows the wrong day and UTC times.
// Date fields become YYYY-MM-DD, other timestamps local 'YYYY-MM-DD HH:mm:ss'.
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const pad = (n) => String(n).padStart(2, '0');
const readable = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => {
    if (typeof v !== 'string' || !ISO_TS.test(v)) return [k, v];
    if (/(^|_)date$|^dob$/.test(k)) return [k, toDateOnly(v)];
    const d = new Date(v);
    return [k, `${toLocalDateString(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`];
}));

const shift = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };
const PRESETS = [
    { id: 'this-month', label: 'This month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), n]; } },
    { id: 'last-month', label: 'Last month', range: () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; } },
    { id: 'last-7', label: 'Last 7 days', range: () => [shift(new Date(), -6), new Date()] },
    { id: 'today', label: 'Today', range: () => [new Date(), new Date()] }
];

function Choice({ name, value, checked, onChange, icon: Icon, title, hint }) {
    return (
        <label className={`relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-400 ${checked
            ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/70'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
            <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${checked ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                <Icon size={16} />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
                <span className="block mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-snug">{hint}</span>
            </span>
            {checked && <CheckCircle size={16} className="absolute top-3 right-3 text-slate-900 dark:text-slate-100" aria-hidden="true" />}
        </label>
    );
}

Choice.propTypes = {
    name: PropTypes.string, value: PropTypes.string, checked: PropTypes.bool, onChange: PropTypes.func,
    icon: PropTypes.elementType, title: PropTypes.node, hint: PropTypes.node
};

function Step({ n, title, hint, children }) {
    return (
        <section className="px-4 sm:px-6 py-5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{n}</span>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                {hint && <span className="text-xs text-slate-600 dark:text-slate-400">— {hint}</span>}
            </div>
            {children}
        </section>
    );
}

Step.propTypes = { n: PropTypes.number, title: PropTypes.string, hint: PropTypes.node, children: PropTypes.node };

export default function ExportCenter() {
    const toast = useToast();
    const [exportType, setExportType] = useState('employees');
    const [format, setFormat] = useState('csv');
    const [preset, setPreset] = useState('this-month');
    const [range, setRange] = useState(() => {
        const [a, b] = PRESETS[0].range();
        return { from: toLocalDateString(a), to: toLocalDateString(b) };
    });
    const [exporting, setExporting] = useState(false);
    const [lastRun, setLastRun] = useState(null); // { rows, dataset, format, at, capped }

    const dataset = DATASETS.find(d => d.id === exportType);
    const fmt = FORMATS.find(f => f.id === format);
    const periodText = dataset.period ? `${range.from} to ${range.to}` : 'All records';
    const fileBase = `${exportType}_${dataset.period ? `${range.from}_to_${range.to}` : toLocalDateString()}`;

    const applyPreset = (id) => {
        const p = PRESETS.find(x => x.id === id);
        const [a, b] = p.range();
        setPreset(id);
        setRange({ from: toLocalDateString(a), to: toLocalDateString(b) });
    };

    const saveBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExport = async () => {
        if (dataset.period && (!range.from || !range.to || range.from > range.to)) {
            toast.warning('Choose a valid period: the start must be on or before the end.');
            return;
        }
        setExporting(true);
        try {
            const params = dataset.period ? dataset.period(range.from, range.to) : {};
            const res = await api.get(dataset.endpoint, { params });
            const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            // JSON keeps the API's own values for systems that parse them.
            const data = format === 'json' ? raw : raw.map(readable);
            if (data.length === 0) {
                toast.warning('Nothing to export for this selection.');
                setLastRun({ rows: 0, dataset: dataset.label, format: fmt.label, at: new Date(), capped: false });
                return;
            }
            if (format === 'csv') {
                const headers = Object.keys(data[0]);
                const csv = [headers.join(','), ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
                saveBlob(new Blob([csv], { type: 'text/csv' }), `${fileBase}.csv`);
            } else if (format === 'xlsx') {
                await exportToExcel({ data, filename: fileBase, sheetName: dataset.label.slice(0, 31) });
            } else if (format === 'json') {
                saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${fileBase}.json`);
            } else if (format === 'pdf') {
                exportToPDF({
                    data,
                    filename: `${fileBase}.pdf`,
                    title: dataset.label,
                    subtitle: `Data export: ${dataset.label}`,
                    dateRange: periodText
                });
            }
            const capped = Boolean(dataset.cap && data.length >= LOG_CAP);
            setLastRun({ rows: data.length, dataset: dataset.label, format: fmt.label, at: new Date(), capped });
            toast.success(`Exported ${data.length.toLocaleString()} row${data.length === 1 ? '' : 's'}`);
        } catch (err) {
            toast.error('Export failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setExporting(false);
        }
    };

    return (
        <ListPage title="Export Center" bodyClassName="!overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] h-full min-h-0">
                {/* Choices */}
                <div className="min-h-0 overflow-y-auto">
                    <Step n={1} title="What to export">
                        <div role="radiogroup" aria-label="Dataset" className="grid sm:grid-cols-2 gap-2.5 max-w-3xl">
                            {DATASETS.map(d => (
                                <Choice
                                    key={d.id}
                                    name="dataset"
                                    value={d.id}
                                    checked={exportType === d.id}
                                    onChange={() => setExportType(d.id)}
                                    icon={d.icon}
                                    title={d.label}
                                    hint={<>{d.about}{!d.period && <span className="block mt-1 text-slate-500 dark:text-slate-400">No period — exports all records.</span>}</>}
                                />
                            ))}
                        </div>
                    </Step>

                    {dataset.period && (
                        <Step n={2} title="Period" hint={dataset.cap ? `up to ${LOG_CAP.toLocaleString()} punches per export` : undefined}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {PRESETS.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        aria-pressed={preset === p.id}
                                        onClick={() => applyPreset(p.id)}
                                        className={`h-8 px-3 rounded-lg text-[13px] font-medium transition-colors ${preset === p.id
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                                <input
                                    type="date"
                                    aria-label="From"
                                    className="field-sm !h-8 !py-0 !w-auto tabular-nums"
                                    value={range.from}
                                    onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })); }}
                                />
                                <span className="text-[13px] text-slate-600 dark:text-slate-400">to</span>
                                <input
                                    type="date"
                                    aria-label="To"
                                    className="field-sm !h-8 !py-0 !w-auto tabular-nums"
                                    value={range.to}
                                    onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })); }}
                                />
                            </div>
                        </Step>
                    )}

                    <Step n={dataset.period ? 3 : 2} title="Format">
                        <div role="radiogroup" aria-label="Format" className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 max-w-3xl">
                            {FORMATS.map(f => (
                                <Choice
                                    key={f.id}
                                    name="format"
                                    value={f.id}
                                    checked={format === f.id}
                                    onChange={() => setFormat(f.id)}
                                    icon={f.icon}
                                    title={f.label}
                                    hint={f.hint}
                                />
                            ))}
                        </div>
                    </Step>
                </div>

                {/* Summary + action */}
                <aside className="min-h-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="px-5 py-5">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your export</h2>
                        <dl className="mt-3 space-y-3">
                            {[
                                ['Data', dataset.label],
                                ['Period', periodText],
                                ['Format', fmt.label],
                                ['File', `${fileBase}.${format === 'xlsx' ? 'xlsx' : format}`]
                            ].map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-xs text-slate-600 dark:text-slate-400">{k}</dt>
                                    <dd className={`mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 break-all ${k === 'File' ? 'font-mono text-xs' : ''}`}>{v}</dd>
                                </div>
                            ))}
                        </dl>
                        <Button defaultAction variant="primary" className="w-full mt-5 h-10" onClick={handleExport} disabled={exporting}>
                            {exporting ? <Loader className="animate-spin" size={16} /> : <Download size={16} />}
                            {exporting ? 'Exporting…' : 'Export'}
                        </Button>

                        {lastRun && (
                            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-600 dark:text-slate-400">Last export</p>
                                <p className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
                                    <span className="font-semibold tabular-nums">{lastRun.rows.toLocaleString()}</span> row{lastRun.rows === 1 ? '' : 's'} · {lastRun.dataset} · {lastRun.format}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                    {lastRun.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                {lastRun.capped && (
                                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                                        <AlertTriangle size={14} className="shrink-0 mt-px" />
                                        Hit the {LOG_CAP.toLocaleString()}-punch limit — some punches were left out. Export a shorter period, or several.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </ListPage>
    );
}
