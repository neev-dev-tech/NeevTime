import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import api from '../api';
import {
    useToast, Button, ListPage, ListTabs, ListSearch, ListIconButton,
    LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST
} from '../components';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide';

export default function Regularizations() {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [comment, setComment] = useState({});

    const fetchRequests = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/regularizations', {
                params: statusFilter ? { status: statusFilter } : {}
            });
            setRequests(res.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load regularization requests');
            toast.error('Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRequests(); }, [statusFilter]);

    const review = async (id, status) => {
        try {
            await api.put(`/api/regularizations/${id}/status`, { status, comment: comment[id] || null });
            toast.success(`Request ${status}`);
            setComment(c => ({ ...c, [id]: '' }));
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Review failed');
        }
    };

    const badge = (status) => ({
        pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    }[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300');

    const pager = useTableControls(requests, {
        searchKeys: ['employee_name', 'employee_code', 'department', 'date', 'reason'],
        pageSize: 50
    });

    const filterLabel = { pending: 'pending', approved: 'approved', rejected: 'rejected' }[statusFilter];

    const STATUS_TABS = [
        { key: 'pending', label: 'Pending' },
        { key: 'approved', label: 'Approved' },
        { key: 'rejected', label: 'Rejected' },
        { key: '', label: 'All' }
    ];

    return (
        <>
            <ListPage
                title="Attendance Regularization"
                count={requests.length}
                tabs={<ListTabs label="Filter by status" value={statusFilter} onChange={setStatusFilter} items={STATUS_TABS} />}
                toolbar={
                    <>
                        <ListSearch label="Search requests" placeholder="Search by employee, code, department…" value={pager.query} onChange={pager.setQuery} />
                        <div className="ml-auto flex items-center gap-2">
                            <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchRequests} disabled={loading} spin={loading} />
                        </div>
                    </>
                }
                footer={!loading && !error && requests.length > 0 ? <TablePager controls={pager} noun="request" /> : null}
            >
                {loading ? (
                    <div className="p-4 sm:p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 text-center px-6">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load requests</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRequests}>Try again</Button>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="py-20 text-center px-6">
                        <Clock size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {filterLabel ? `No ${filterLabel} requests` : 'No requests yet'}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {filterLabel
                                ? `Nothing is currently ${filterLabel}. Switch the filter to see other requests.`
                                : 'Employees have not submitted any missed-punch corrections.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST} w-12`}>#</th>
                                <th className={LIST_TH}>Employee</th>
                                <th className={LIST_TH}>Code</th>
                                <th className={LIST_TH}>Department</th>
                                <th className={LIST_TH}>Date</th>
                                <th className={LIST_TH}>Current</th>
                                <th className={LIST_TH}>Requested</th>
                                <th className={LIST_TH}>Reason</th>
                                <th className={LIST_TH}>Status</th>
                                <th className={`${LIST_TH} !text-right ${LIST_EDGE_LAST}`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pager.view.map((req, idx) => (
                                <tr key={req.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums`}>{(pager.page - 1) * pager.pageSize + idx + 1}</td>
                                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                        {req.employee_name || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                                            {req.employee_code || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                        {req.department || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                                        {req.date || '—'}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                            {req.current_in_time || '—'} → {req.current_out_time || '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="font-mono text-xs tabular-nums font-semibold text-slate-600 dark:text-slate-400">
                                            {req.requested_in_time || '(keep)'} → {req.requested_out_time || '(keep)'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                        <span className="text-slate-600 dark:text-slate-300 italic">
                                            {req.reason ? `“${req.reason}”` : '—'}
                                        </span>
                                        {req.review_comment && (
                                            <span className="block text-xs text-slate-600 dark:text-slate-400 mt-0.5 not-italic">
                                                Review note: {req.review_comment}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`${BADGE_BASE} ${badge(req.status)}`}>{req.status || '—'}</span>
                                    </td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                        <div className="flex items-center justify-end">
                                            {req.status === 'pending' ? (
                                                <div className="dv-quiet flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Comment (optional)"
                                                        value={comment[req.id] || ''}
                                                        onChange={e => setComment(c => ({ ...c, [req.id]: e.target.value }))}
                                                        className="text-xs w-40 rounded-lg border border-slate-200 dark:border-slate-600 bg-app-surface text-slate-700 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 px-2 py-1.5 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500"
                                                    />
                                                    <Button variant="success" size="sm" icon={CheckCircle} onClick={() => review(req.id, 'approved')}>
                                                        Approve
                                                    </Button>
                                                    <Button variant="danger" size="sm" icon={XCircle} onClick={() => review(req.id, 'rejected')}>
                                                        Reject
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 dark:text-slate-400">—</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </ListPage>
        </>
    );
}
