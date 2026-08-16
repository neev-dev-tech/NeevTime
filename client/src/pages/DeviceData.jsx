import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Database, FileCode, Image, ArrowRightLeft, FileX, Activity, AlertCircle,
    Upload as UploadIcon, RefreshCw
} from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu } from '../components';
import { formatDate } from '../utils/dateFormat';

const fmtTime = (v) => (v ? new Date(v).toLocaleString() : '—');
const fmtDate = (v) => formatDate(v);

/**
 * Each device-data endpoint returns a different row shape, so every view
 * declares its own columns. `render` receives the row; `key` is a plain field.
 */
const VIEWS = {
    'work-code': {
        label: 'Work Code',
        icon: FileCode,
        group: 'Data',
        blurb: 'Job and department codes stored on the devices',
        columns: [
            { label: 'Code', key: 'id', mono: true, accent: true },
            { label: 'Description', key: 'details' },
            { label: 'Updated', render: r => fmtTime(r.timestamp) }
        ]
    },
    'bio-template': {
        label: 'Bio-Template',
        icon: Database,
        group: 'Data',
        blurb: 'Enrolled fingerprint and face templates',
        columns: [
            { label: 'Employee', render: r => r.employee_name || '—', strong: true },
            { label: 'Code', key: 'employee_code', mono: true, accent: true },
            { label: 'Type', render: r => r.type_name || '—', badge: true },
            { label: 'Template #', key: 'template_no', mono: true },
            { label: 'Valid', render: r => (r.valid ? 'Yes' : 'No') },
            { label: 'Device', key: 'source_device', mono: true },
            { label: 'Enrolled', render: r => fmtDate(r.created_at) }
        ]
    },
    'bio-photo': {
        label: 'Bio-Photo',
        icon: Image,
        group: 'Data',
        blurb: 'Face photos captured during enrolment',
        columns: [
            { label: 'Employee', render: r => r.employee_name || r.employee_code || '—', strong: true },
            { label: 'Device', key: 'device_serial', mono: true },
            { label: 'Captured', render: r => fmtTime(r.created_at || r.timestamp) }
        ]
    },
    transaction: {
        label: 'Transaction',
        icon: ArrowRightLeft,
        group: 'Data',
        blurb: 'Raw punches received from the devices',
        columns: [
            { label: 'Employee', render: r => r.emp_name || '—', strong: true },
            { label: 'Code', key: 'employee_code', mono: true, accent: true },
            { label: 'Punch Time', render: r => fmtTime(r.punch_time) },
            { label: 'Direction', render: r => ([0, 3, 4, 8].includes(Number(r.punch_state)) ? 'IN' : 'OUT'), badge: true },
            { label: 'Device', render: r => r.device_name || r.device_serial || '—' },
            { label: 'Verify', key: 'verification_mode', mono: true }
        ]
    },
    unregistered: {
        label: 'Unregistered Transactions',
        icon: FileX,
        group: 'Data',
        blurb: 'Punches from IDs that do not match any employee',
        columns: [
            { label: 'Device Code', key: 'employee_code', mono: true, accent: true },
            { label: 'Punch Time', render: r => fmtTime(r.punch_time) },
            { label: 'Device', render: r => r.device_name || r.device_serial || '—' }
        ]
    },
    'operation-log': {
        label: 'Operation Log',
        icon: Activity,
        group: 'Log',
        blurb: 'Administrative actions performed on the devices',
        columns: [
            { label: 'Device', render: r => r.device_name || r.device_serial || '—', strong: true },
            { label: 'Operation', key: 'operation_type', badge: true },
            { label: 'Operator', key: 'operator', mono: true },
            { label: 'Detail', render: r => r.object_value || r.details || '—' },
            { label: 'Time', render: r => fmtTime(r.log_time) }
        ]
    },
    'error-log': {
        label: 'Error Log',
        icon: AlertCircle,
        group: 'Log',
        blurb: 'Errors reported by the devices',
        columns: [
            { label: 'Device', render: r => r.device_name || r.device_serial || '—', strong: true },
            { label: 'Error', render: r => r.error_code || r.error_type || '—', badge: true },
            { label: 'Message', render: r => r.error_message || r.details || '—' },
            { label: 'Time', render: r => fmtTime(r.log_time) }
        ]
    },
    'upload-log': {
        label: 'Upload Log',
        icon: UploadIcon,
        group: 'Log',
        blurb: 'Batches uploaded by the devices',
        columns: [
            { label: 'Device', render: r => r.device_name || r.device_serial || '—', strong: true },
            { label: 'Type', key: 'upload_type', badge: true },
            { label: 'Records', key: 'record_count', mono: true },
            { label: 'Time', render: r => fmtTime(r.log_time || r.created_at) }
        ]
    }
};

const VALID_VIEWS = Object.keys(VIEWS);

export default function DeviceData() {
    const [searchParams, setSearchParams] = useSearchParams();
    const viewParam = searchParams.get('view');
    const [activeSection, setActiveSection] = useState(
        VALID_VIEWS.includes(viewParam) ? viewParam : 'work-code'
    );
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Sidebar deep-links (/devices/data?view=…) change without a remount
    useEffect(() => {
        if (VALID_VIEWS.includes(viewParam) && viewParam !== activeSection) {
            setActiveSection(viewParam);
        }
    }, [viewParam]);

    const view = VIEWS[activeSection];

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/api/devices/data/${activeSection}`);
            setData(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load records');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [activeSection]);

    const exportRows = useMemo(() => data.map(row => {
        const out = {};
        view.columns.forEach(col => {
            out[col.label] = col.render ? col.render(row) : (row[col.key] ?? '');
        });
        return out;
    }), [data, activeSection]);

    const switchView = (id) => {
        setActiveSection(id);
        setSearchParams({ view: id }, { replace: true });
    };

    const groups = ['Data', 'Log'];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={view.icon}
                title={view.label}
                subtitle={view.blurb}
                actions={
                    <>
                        <ExportMenu
                            rows={exportRows}
                            filename={`device_${activeSection}`}
                            title={view.label}
                        />
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData} disabled={loading}>
                            Refresh
                        </Button>
                    </>
                }
            />

            {/* view switcher — segmented, replaces the old dark duplicate sidebar */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {groups.map(group => (
                    <div key={group} className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400">{group}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {VALID_VIEWS.filter(id => VIEWS[id].group === group).map(id => {
                                const Icon = VIEWS[id].icon;
                                const active = id === activeSection;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => switchView(id)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${active
                                            ? 'bg-orange-600 text-white border-transparent shadow-sm'
                                            : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
                                            }`}
                                    >
                                        <Icon size={13} />
                                        {VIEWS[id].label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load records</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-16 text-center">
                        <view.icon size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nothing has been reported for {view.label.toLowerCase()}.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    {view.columns.map(col => (
                                        <th key={col.label} className="px-5 py-3 font-bold whitespace-nowrap">{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {data.map((row, idx) => (
                                    <tr key={row.id ?? idx} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 tabular-nums">{idx + 1}</td>
                                        {view.columns.map(col => {
                                            const value = col.render ? col.render(row) : (row[col.key] ?? '—');
                                            return (
                                                <td key={col.label} className="px-5 py-3 whitespace-nowrap">
                                                    {col.badge ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                            {value || '—'}
                                                        </span>
                                                    ) : (
                                                        <span className={[
                                                            col.mono ? 'font-mono text-xs tabular-nums' : '',
                                                            col.accent ? 'text-orange-600 dark:text-orange-400 font-semibold' : '',
                                                            col.strong ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
                                                        ].join(' ')}>
                                                            {value === '' || value === null || value === undefined ? '—' : value}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
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
