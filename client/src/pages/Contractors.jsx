import React, { useEffect, useState } from 'react';
import { Building2, Plus, Users, Trash2, Edit2, FileText } from 'lucide-react';
import api from '../api';
import { Button, PageHeader } from '../components';
import { formatDate } from '../utils/dateFormat';

/**
 * The companies whose people work here and who invoice for it.
 *
 * A contractor is an entity you bill against, not a label on a person. The
 * question this page exists to answer is "what do I owe this agency for August",
 * which the employment_type field could never express.
 */
export default function Contractors() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);      // contractor being added or edited
    const [summary, setSummary] = useState(null);      // { contractor, employees, totals }
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

    const load = async () => {
        try {
            const res = await api.get('/api/contractors');
            setRows(res.data);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load contractors');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const save = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editing.id) await api.put(`/api/contractors/${editing.id}`, editing);
            else await api.post('/api/contractors', editing);
            setEditing(null);
            load();
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save');
        }
    };

    const remove = async (row) => {
        setError('');
        try {
            await api.delete(`/api/contractors/${row.id}`);
            load();
        } catch (err) {
            // The server refuses when people are still billed to it, and says
            // how many. Surfacing that verbatim is the whole point — the fix is
            // to move them or deactivate, and the message says so.
            setError(err.response?.data?.error || 'Could not delete');
        }
    };

    const openSummary = async (row) => {
        setSummary({ loading: true, contractor: row });
        try {
            const res = await api.get(`/api/contractors/${row.id}/summary?month=${month}`);
            setSummary(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load the summary');
            setSummary(null);
        }
    };

    const field = (label, key, type = 'text', placeholder = '') => (
        <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</label>
            <input type={type} className="field" placeholder={placeholder}
                   value={editing?.[key] ?? ''}
                   onChange={e => setEditing({ ...editing, [key]: e.target.value })} />
        </div>
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Contractors"
                subtitle="Agencies whose people work here, and what they are owed"
                icon={Building2}
                actions={
                    <Button variant="primary" icon={Plus} onClick={() => setEditing({ is_active: true })}>
                        Add contractor
                    </Button>
                }
            />

            {error && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-10 text-center">
                        <Building2 size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">No contractors yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Add the agencies that supply staff here — drivers, security, housekeeping —
                            then set each person's contractor on their profile.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-5 py-3">Contractor</th>
                                <th className="px-5 py-3">Contact</th>
                                <th className="px-5 py-3">GST</th>
                                <th className="px-5 py-3 text-right">People</th>
                                <th className="px-5 py-3 text-right">Rate/hr</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {rows.map(row => (
                                <tr key={row.id} className={row.is_active ? '' : 'opacity-50'}>
                                    <td className="px-5 py-3">
                                        <p className="font-semibold text-slate-800 dark:text-slate-100">{row.name}</p>
                                        {row.code && <p className="text-xs font-mono text-slate-500">{row.code}</p>}
                                        {!row.is_active && <span className="text-[10px] uppercase font-bold text-slate-400">Inactive</span>}
                                    </td>
                                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        {row.contact_person || '—'}
                                        {row.phone && <span className="block text-xs font-mono">{row.phone}</span>}
                                    </td>
                                    <td className="px-5 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{row.gst_number || '—'}</td>
                                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">{row.employee_count}</td>
                                    <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                                        {row.hourly_rate ? Number(row.hourly_rate).toFixed(2) : '—'}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex gap-1 justify-end">
                                            <button onClick={() => openSummary(row)} title="Hours this month"
                                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                                                <FileText size={15} />
                                            </button>
                                            <button onClick={() => setEditing(row)} title="Edit"
                                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                                                <Edit2 size={15} />
                                            </button>
                                            <button onClick={() => remove(row)} title="Delete"
                                                    className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add / edit */}
            {editing && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
                    <form onSubmit={save} onClick={e => e.stopPropagation()}
                          className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100">
                            {editing.id ? 'Edit contractor' : 'Add contractor'}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">{field('Name', 'name', 'text', 'e.g. Sharma Facility Services')}</div>
                            {field('Code', 'code')}
                            {field('GST number', 'gst_number')}
                            {field('Contact person', 'contact_person')}
                            {field('Phone', 'phone')}
                            {field('Email', 'email', 'email')}
                            {/* Left blank on purpose when an agency bills a
                                fixed monthly amount per head. A rate invented
                                to fill the box ends up in a total somebody
                                quotes. */}
                            {field('Hourly rate', 'hourly_rate', 'number', 'optional')}
                            <div className="col-span-2">{field('Address', 'address')}</div>
                            <div className="col-span-2">{field('Notes', 'notes')}</div>
                        </div>
                        {editing.id && (
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={editing.is_active !== false}
                                       onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                                Active
                            </label>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button variant="primary" type="submit">Save</Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Hours for a month — the invoice question */}
            {summary && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onClick={() => setSummary(null)}>
                    <div onClick={e => e.stopPropagation()}
                         className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100">
                                {summary.contractor?.name}
                            </h3>
                            <input type="month" className="field w-auto" value={month}
                                   onChange={e => { setMonth(e.target.value); }}
                                   onBlur={() => openSummary(summary.contractor)} />
                        </div>

                        {summary.loading ? (
                            <div className="h-24 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        ['People', summary.totals.headcount],
                                        ['Hours', summary.totals.hours_worked],
                                        ['Overtime (min)', summary.totals.overtime_minutes],
                                    ].map(([label, value]) => (
                                        <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                                            <p className="text-[10px] uppercase tracking-wide font-bold text-slate-500">{label}</p>
                                            <p className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Shown only when a rate exists. A total computed
                                    from an invented rate would be quoted at an
                                    agency. */}
                                {summary.totals.billable !== null ? (
                                    <p className="text-sm text-slate-700 dark:text-slate-200">
                                        At {Number(summary.contractor.hourly_rate).toFixed(2)}/hour:
                                        <span className="font-bold tabular-nums"> {summary.totals.billable.toLocaleString()}</span>
                                    </p>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        No hourly rate set, so no amount is shown. Hours are what this reports.
                                    </p>
                                )}

                                {/* Headers with no rows read as a rendering
                                    fault, not as an empty month. Say which it is. */}
                                {summary.employees.length === 0 ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                                        Nobody is billed to this contractor yet. Set an employee's
                                        contractor on their profile and they appear here.
                                    </p>
                                ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500">
                                        <tr>
                                            <th className="py-2">Employee</th>
                                            <th className="py-2 text-right">Days</th>
                                            <th className="py-2 text-right">Hours</th>
                                            <th className="py-2 text-right">OT (min)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {summary.employees.map(e => (
                                            <tr key={e.employee_code}>
                                                <td className="py-2">
                                                    <span className="font-semibold text-slate-800 dark:text-slate-100">{e.name}</span>
                                                    <span className="ml-2 font-mono text-xs text-slate-500">{e.employee_code}</span>
                                                </td>
                                                <td className="py-2 text-right tabular-nums">{e.days_present}</td>
                                                <td className="py-2 text-right tabular-nums">{(Number(e.minutes_worked) / 60).toFixed(1)}</td>
                                                <td className="py-2 text-right tabular-nums">{e.overtime_minutes}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                )}

                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Hours come from the same daily attendance the registers and payroll use.
                                </p>
                            </>
                        )}

                        <div className="flex justify-end">
                            <Button variant="secondary" onClick={() => setSummary(null)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
