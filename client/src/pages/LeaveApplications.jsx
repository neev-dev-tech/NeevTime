import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';
import { Calendar, Plus, Check, X, Search, RefreshCw, ChevronDown, AlertCircle } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';
import Modal from '../components/Modal';
import { formatDate } from '../utils/dateFormat';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

export default function LeaveApplications() {
    const toast = useToast();
    const [applications, setApplications] = useState([]);
    const [filteredApps, setFilteredApps] = useState([]);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showApply, setShowApply] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState('');
    // The status filter lives in the URL so links (the notification bell)
    // can open straight onto the Pending queue.
    const STATUSES = ['All', 'Pending', 'Approved', 'Rejected'];
    const urlStatus = searchParams.get('status');
    const statusFilter = STATUSES.includes(urlStatus) ? urlStatus : 'All';
    const setStatusFilter = (v) => {
        const next = new URLSearchParams(searchParams);
        if (v === 'All') next.delete('status'); else next.set('status', v);
        setSearchParams(next, { replace: true });
    };
    // Review dialog: one application or a bulk selection, approve or reject.
    const [review, setReview] = useState(null); // { ids, status }
    const [rejectReason, setRejectReason] = useState('');
    const [acting, setActing] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [form, setForm] = useState({
        employee_code: '', leave_type_id: '', from_date: '', to_date: '', is_half_day: false, reason: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [apps, types, emps] = await Promise.all([
                api.get('/api/leave-applications'),
                api.get('/api/leave-types'),
                api.get('/api/employees')
            ]);
            setApplications(apps.data);
            setFilteredApps(apps.data);
            setLeaveTypes(types.data);
            setEmployees(emps.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load leave applications');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let res = applications;
        if (searchQuery) {
            res = res.filter(a => String(a.employee_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()));
        }
        if (statusFilter !== 'All') {
            res = res.filter(a => a.status === statusFilter);
        }
        setFilteredApps(res);
    }, [searchQuery, statusFilter, applications]);

    const handleApply = async (e) => {
        e.preventDefault();
        try {
            await api.post('/api/leave-applications', form);
            setShowApply(false);
            setForm({ employee_code: '', leave_type_id: '', from_date: '', to_date: '', is_half_day: false, reason: '' });
            fetchData();
        } catch (err) { toast.error(err.response?.data?.error || 'Failed to apply'); }
    };

    const openReview = (ids, status) => {
        setRejectReason('');
        setReview({ ids, status });
    };

    const confirmReview = async () => {
        if (!review) return;
        const { ids, status } = review;
        if (status === 'Rejected' && !rejectReason.trim()) {
            toast.warning('Give a reason so the employee knows why');
            return;
        }
        setActing(true);
        const failures = [];
        // Sequential on purpose: each call locks its row and adjusts the
        // balance in its own transaction on the server.
        for (const id of ids) {
            try {
                await api.put(`/api/leave-applications/${id}/status`, {
                    status,
                    rejection_reason: status === 'Rejected' ? rejectReason.trim() : null
                });
            } catch (err) {
                failures.push(err.response?.data?.error || 'Request failed');
            }
        }
        setActing(false);
        setReview(null);
        setSelected(new Set());
        const done = ids.length - failures.length;
        const verb = status === 'Approved' ? 'approved' : 'rejected';
        if (done > 0) toast.success(`${done} leave request${done === 1 ? '' : 's'} ${verb}`);
        if (failures.length > 0) toast.error(`${failures.length} could not be ${verb}: ${failures[0]}`);
        fetchData();
    };

    const pager = useTableControls(filteredApps, { pageSize: 50 });

    const pendingVisible = useMemo(
        () => filteredApps.filter(a => a.status === 'Pending').map(a => a.id),
        [filteredApps]
    );
    const allPendingSelected = pendingVisible.length > 0 && pendingVisible.every(id => selected.has(id));
    const toggleOne = (id) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleAll = () => setSelected(allPendingSelected ? new Set() : new Set(pendingVisible));
    const reviewApps = review ? applications.filter(a => review.ids.includes(a.id)) : [];

    const getStatusBadge = (status) => {
        const colors = {
            'Pending': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            'Approved': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            'Rejected': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
        };
        return (
            <span className={`${BADGE_BASE} ${colors[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                {status || '—'}
            </span>
        );
    };

    const exportColumns = [
        { key: 'employee_name', label: 'Employee' },
        { key: 'leave_type_name', label: 'Leave Type' },
        { key: 'from_date', label: 'From' },
        { key: 'to_date', label: 'To' },
        { key: 'total_days', label: 'Days' },
        { key: 'status', label: 'Status' }
    ];

    const isFiltered = Boolean(searchQuery) || statusFilter !== 'All';

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Calendar}
                title="Leave Applications"
                subtitle="Apply and review employee leave requests"
                actions={
                    <>
                        <ExportMenu
                            rows={filteredApps}
                            columns={exportColumns}
                            filename="leave_applications"
                            title="Leave Applications"
                            mapRow={app => ({
                                ...app,
                                from_date: formatDate(app.from_date),
                                to_date: formatDate(app.to_date)
                            })}
                        />
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Refresh</Button>
                        <Button variant="successSolid" icon={Plus} onClick={() => setShowApply(true)}>Apply Leave</Button>
                    </>
                }
            />

            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-app-surface/70 dark:bg-slate-800/70 text-sm flex-wrap">
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="field-sm appearance-none pl-3 pr-8 font-semibold cursor-pointer"
                    >
                        <option value="All">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                </div>

                {selected.size > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums">{selected.size} selected</span>
                        <Button variant="success" size="sm" icon={Check} onClick={() => openReview([...selected], 'Approved')}>Approve</Button>
                        <Button variant="danger" size="sm" icon={X} onClick={() => openReview([...selected], 'Rejected')}>Reject</Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                    </div>
                )}

                <div className="ml-auto w-full sm:w-64 relative">
                    <input
                        type="text"
                        aria-label="Search employee"
                        placeholder="Search employee..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="field-sm pl-8 pr-3"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-slate-400 dark:text-slate-500" />
                </div>
            </div>

            {/* Applications Table */}
            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load leave applications</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : filteredApps.length === 0 ? (
                    <div className="py-16 text-center">
                        <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {isFiltered ? 'No matching applications' : 'No leave applications yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {isFiltered
                                ? 'Nothing matches the current filters. Clear the search or pick another status.'
                                : 'Apply for leave on behalf of an employee to see requests here.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[11px] uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="pl-5 pr-2 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            aria-label="Select all pending"
                                            checked={allPendingSelected}
                                            disabled={pendingVisible.length === 0}
                                            onChange={toggleAll}
                                            className="rounded border-slate-300"
                                        />
                                    </th>
                                    <th className="px-5 py-3 font-semibold w-12">#</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Leave Type</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">From</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">To</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Days</th>
                                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Status</th>
                                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {pager.view.map((app, idx) => (
                                    <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                                        <td className="pl-5 pr-2 py-3">
                                            {app.status === 'Pending' && (
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Select ${app.employee_name || 'application'}`}
                                                    checked={selected.has(app.id)}
                                                    onChange={() => toggleOne(app.id)}
                                                    className="rounded border-slate-300"
                                                />
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {app.employee_name || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            {app.leave_type_name ? (
                                                <span
                                                    className={BADGE_BASE}
                                                    style={{ backgroundColor: (app.color || '#94a3b8') + '20', color: (app.color || '#64748b') }}
                                                >
                                                    {app.leave_type_name}
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-300">—</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                                            {formatDate(app.from_date)}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                                            {formatDate(app.to_date)}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                                            {app.total_days ?? '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">{getStatusBadge(app.status)}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                {app.status === 'Pending' ? (
                                                    <div className="dv-quiet flex items-center gap-1">
                                                        <Button variant="success" size="sm" icon={Check} aria-label="Approve" title="Approve" onClick={() => openReview([app.id], 'Approved')} />
                                                        <Button variant="danger" size="sm" icon={X} aria-label="Reject" title="Reject" onClick={() => openReview([app.id], 'Rejected')} />
                                                    </div>
                                                ) : app.status === 'Rejected' && app.rejection_reason ? (
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={app.rejection_reason}>
                                                        {app.rejection_reason}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !error && filteredApps.length > 0 && (
                    <TablePager controls={pager} noun="record" />
                )}
            </div>

            <Modal
                open={Boolean(review)}
                onClose={() => !acting && setReview(null)}
                title={review ? `${review.status === 'Approved' ? 'Approve' : 'Reject'} ${review.ids.length === 1 ? 'leave request' : `${review.ids.length} leave requests`}` : ''}
                size="md"
            >
                {review && (
                    <div className="space-y-4">
                        <ul className="max-h-56 overflow-auto divide-y divide-slate-100 dark:divide-slate-700 rounded-lg border border-slate-200 dark:border-slate-700">
                            {reviewApps.map(a => (
                                <li key={a.id} className="px-3 py-2.5 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-semibold text-slate-800 dark:text-slate-100">{a.employee_name || a.employee_code}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                            {formatDate(a.from_date)} – {formatDate(a.to_date)} · {a.total_days ?? '—'} day{Number(a.total_days) === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {a.leave_type_name || 'Leave'}{a.reason ? ` — “${a.reason}”` : ''}
                                    </p>
                                </li>
                            ))}
                        </ul>
                        {review.status === 'Approved' ? (
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                Approving deducts these days from each employee's leave balance.
                            </p>
                        ) : (
                            <div>
                                <label htmlFor="reject-reason" className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Reason for rejection *</label>
                                <textarea
                                    id="reject-reason"
                                    className="field"
                                    rows={3}
                                    value={rejectReason}
                                    onChange={e => setRejectReason(e.target.value)}
                                    placeholder="Shown to the employee"
                                    autoFocus
                                />
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                            <Button variant="secondary" onClick={() => setReview(null)} disabled={acting}>Cancel</Button>
                            <Button
                                variant={review.status === 'Approved' ? 'successSolid' : 'dangerSolid'}
                                onClick={confirmReview}
                                disabled={acting}
                            >
                                {acting ? 'Saving…' : review.status === 'Approved' ? 'Approve' : 'Reject'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                open={showApply}
                onClose={() => setShowApply(false)}
                title="Apply Leave"
                size="lg"
            >
                <form onSubmit={handleApply} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Employee</label>
                        <select required className="field" value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })}>
                            <option value="">Select Employee</option>
                            {employees.map(e => <option key={e.employee_code} value={e.employee_code}>{e.name} ({e.employee_code})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Leave Type</label>
                        <select required className="field" value={form.leave_type_id} onChange={e => setForm({ ...form, leave_type_id: e.target.value })}>
                            <option value="">Select Type</option>
                            {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">From Date</label>
                            <input type="date" required className="field" value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">To Date</label>
                            <input type="date" required className="field" value={form.to_date} onChange={e => setForm({ ...form, to_date: e.target.value })} />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="halfDay" checked={form.is_half_day} onChange={e => setForm({ ...form, is_half_day: e.target.checked })} />
                        <label htmlFor="halfDay" className="text-sm text-slate-700 dark:text-slate-300">Half Day</label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Reason</label>
                        <textarea required className="field" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={() => setShowApply(false)}>Cancel</Button>
                        <Button variant="primary" type="submit">Submit</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
