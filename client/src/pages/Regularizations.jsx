import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, Filter } from 'lucide-react';
import api from '../api';
import { useToast } from '../components';

export default function Regularizations() {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [loading, setLoading] = useState(false);
    const [comment, setComment] = useState({});

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/regularizations', {
                params: statusFilter ? { status: statusFilter } : {}
            });
            setRequests(res.data || []);
        } catch (err) {
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
        pending: 'bg-amber-50 text-amber-700 border-amber-200',
        approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        rejected: 'bg-rose-50 text-rose-700 border-rose-200'
    }[status] || 'bg-slate-50 text-slate-600 border-slate-200');

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Clock className="text-orange-500" size={22} /> Attendance Regularization
                    </h1>
                    <p className="text-sm text-slate-500">Review missed-punch correction requests from employees</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-white border rounded-lg px-2 py-1.5">
                        <Filter size={14} className="text-slate-400" />
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm border-none focus:ring-0">
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="">All</option>
                        </select>
                    </div>
                    <button onClick={fetchRequests} className="p-2 bg-white border rounded-lg text-slate-500 hover:bg-slate-50">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="bg-white border rounded-xl divide-y">
                {requests.length === 0 ? (
                    <p className="px-4 py-12 text-center text-slate-400 text-sm">
                        {loading ? 'Loading...' : 'No requests'}
                    </p>
                ) : requests.map(req => (
                    <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-800">{req.employee_name}</span>
                                <span className="text-xs font-mono text-slate-400">{req.employee_code}</span>
                                {req.department && <span className="text-xs text-slate-500">· {req.department}</span>}
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize ${badge(req.status)}`}>{req.status}</span>
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                                <span className="font-medium">{req.date}</span>
                                {' · Current: '}
                                <span className="font-mono text-xs">{req.current_in_time || '--:--'} → {req.current_out_time || '--:--'}</span>
                                {' · Requested: '}
                                <span className="font-mono text-xs font-bold text-orange-600">{req.requested_in_time || '(keep)'} → {req.requested_out_time || '(keep)'}</span>
                            </p>
                            <p className="text-xs text-slate-500 italic mt-0.5">"{req.reason}"</p>
                            {req.review_comment && <p className="text-xs text-slate-400 mt-0.5">Review note: {req.review_comment}</p>}
                        </div>
                        {req.status === 'pending' && (
                            <div className="flex items-center gap-2 shrink-0">
                                <input
                                    type="text"
                                    placeholder="Comment (optional)"
                                    value={comment[req.id] || ''}
                                    onChange={e => setComment(c => ({ ...c, [req.id]: e.target.value }))}
                                    className="text-xs border rounded-lg px-2 py-1.5 w-40"
                                />
                                <button
                                    onClick={() => review(req.id, 'approved')}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100"
                                >
                                    <CheckCircle size={13} /> Approve
                                </button>
                                <button
                                    onClick={() => review(req.id, 'rejected')}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold hover:bg-rose-100"
                                >
                                    <XCircle size={13} /> Reject
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
