import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Database, FileCode, Image, ArrowRightLeft, FileX, Activity, AlertCircle,
    Upload as UploadIcon, RefreshCw
} from 'lucide-react';
import api from '../api';
import { Button, ExportMenu, ListPage, ListTabs, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

const fmtTime = (v) => (v ? formatDateTime(v) : '—');
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

    const pager = useTableControls(data, {
        searchKeys: view.columns.map(col => col.key).filter(Boolean),
        pageSize: 50
    });

    const switchView = (id) => {
        setActiveSection(id);
        setSearchParams({ view: id }, { replace: true });
        pager.reset();
    };

    const groups = ['Data', 'Log'];

    return (
        <ListPage
            title={view.label}
            count={loading ? undefined : data.length}
            tabs={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {groups.map(group => (
                        <div key={group} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{group}</span>
                            <ListTabs
                                label={`${group} views`}
                                value={activeSection}
                                onChange={switchView}
                                items={VALID_VIEWS.filter(id => VIEWS[id].group === group).map(id => ({ key: id, label: VIEWS[id].label }))}
                            />
                        </div>
                    ))}
                </div>
            }
            actions={
                <ExportMenu
                    rows={exportRows}
                    filename={`device_${activeSection}`}
                    title={view.label}
                />
            }
            toolbar={
                <>
                    <ListSearch label="Search records" placeholder="Search records…" value={pager.query} onChange={pager.setQuery} />
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchData} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            footer={!loading && !error && data.length > 0 ? <TablePager controls={pager} noun="record" /> : null}
        >
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 px-6 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load records</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <view.icon size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No records yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nothing has been reported for {view.label.toLowerCase()}.
                        </p>
                    </div>
                ) : (
                        <table className="w-full text-sm text-left">
                            <thead className={LIST_THEAD}>
                                <tr>
                                    <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                    {view.columns.map((col, ci) => (
                                        <th key={col.label} className={`${LIST_TH} ${ci === view.columns.length - 1 ? LIST_EDGE_LAST : ''}`}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {pager.view.map((row, idx) => (
                                    <tr key={row.id ?? idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-400 tabular-nums`}>{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                        {view.columns.map((col, ci) => {
                                            const value = col.render ? col.render(row) : (row[col.key] ?? '—');
                                            return (
                                                <td key={col.label} className={`pl-4 py-3 whitespace-nowrap ${ci === view.columns.length - 1 ? LIST_EDGE_LAST : 'pr-4'}`}>
                                                    {col.badge ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                            {value || '—'}
                                                        </span>
                                                    ) : (
                                                        <span className={[
                                                            col.mono ? 'font-mono text-xs tabular-nums' : '',
                                                            col.accent ? 'text-slate-600 dark:text-slate-400 font-semibold' : '',
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
                )}
        </ListPage>
    );
}
