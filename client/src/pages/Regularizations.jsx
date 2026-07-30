import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Filter, AlertCircle } from 'lucide-react';
import api from '../api';
import { useToast, Button, PageHeader } from '../components';

const BADGE_BASE = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';

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

    const filterLabel = { pending: 'pending', approved: 'approved', rejected: 'rejected' }[statusFilter];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Clock}
                title="Attendance Regularization"
                subtitle="Review missed-punch correction requests from employees"
                actions={
                    <>
                        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-2 py-1.5">
                            <Filter size={14} className="text-slate-400 dark:text-slate-500" />
                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-slate-700 dark:text-slate-100 dark:bg-slate-800"
                            >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="">All</option>
                            </select>
                        </div>
                        <Button variant="secondary" onClick={fetchRequests} title="Refresh">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </Button>
                    </>
                }
            />

            <div className="card-base !p-0 overflow-hidden">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load requests</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchRequests}>Try again</Button>
                    </div>
                ) : requests.length === 0 ? (
                    <div className="py-16 text-center">
                        <Clock size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {filterLabel ? `No ${filterLabel} requests` : 'No requests yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {filterLabel
                                ? `Nothing is currently ${filterLabel}. Switch the filter to see other requests.`
                                : 'Employees have not submitted any missed-punch corrections.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Code</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Department</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Date</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Current</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Requested</th>
                                    <th className="px-5 py-3 font-bold">Reason</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Status</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {requests.map((req, idx) => (
                                    <tr key={req.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                                            {req.employee_name || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">
                                                {req.employee_code || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                            {req.department || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 tabular-nums">
                                            {req.date || '—'}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                {req.current_in_time || '—'} → {req.current_out_time || '—'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className="font-mono text-xs tabular-nums font-semibold text-orange-600 dark:text-orange-400">
                                                {req.requested_in_time || '(keep)'} → {req.requested_out_time || '(keep)'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 max-w-xs">
                                            <span className="text-slate-600 dark:text-slate-300 italic">
                                                {req.reason ? `“${req.reason}”` : '—'}
                                            </span>
                                            {req.review_comment && (
                                                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 not-italic">
                                                    Review note: {req.review_comment}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 whitespace-nowrap">
                                            <span className={`${BADGE_BASE} ${badge(req.status)}`}>{req.status || '—'}</span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                {req.status === 'pending' ? (
                                                    <div className="dv-quiet flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Comment (optional)"
                                                            value={comment[req.id] || ''}
                                                            onChange={e => setComment(c => ({ ...c, [req.id]: e.target.value }))}
                                                            className="text-xs w-40 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 px-2 py-1.5 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500"
                                                        />
                                                        <Button variant="success" size="sm" icon={CheckCircle} onClick={() => review(req.id, 'approved')}>
                                                            Approve
                                                        </Button>
                                                        <Button variant="danger" size="sm" icon={XCircle} onClick={() => review(req.id, 'rejected')}>
                                                            Reject
                                                        </Button>
                                                    </div>
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

                {!loading && !error && requests.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {requests.length} record{requests.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>
        </div>
    );
}
