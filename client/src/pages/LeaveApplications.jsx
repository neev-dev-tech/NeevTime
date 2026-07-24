import React, { useEffect, useState } from 'react';
import api from '../api';
import { Calendar, Plus, Check, X, Clock, User, FileText, Search, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { useToast } from '../components';

export default function LeaveApplications() {
    const toast = useToast();
    const [applications, setApplications] = useState([]);
    const [filteredApps, setFilteredApps] = useState([]);
    const [leaveTypes, setLeaveTypes] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [showApply, setShowApply] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [form, setForm] = useState({
        employee_code: '', leave_type_id: '', from_date: '', to_date: '', is_half_day: false, reason: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
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
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        let res = applications;
        if (searchQuery) {
            res = res.filter(a => a.employee_name.toLowerCase().includes(searchQuery.toLowerCase()));
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

    const handleAction = async (id, status) => {
        try {
            await api.put(`/api/leave-applications/${id}/status`, { status });
            fetchData();
        } catch (err) { toast.error('Action failed'); }
    };

    const getStatusBadge = (status) => {
        const colors = { 'Pending': 'bg-yellow-100 text-yellow-700', 'Approved': 'bg-green-100 text-green-700', 'Rejected': 'bg-red-100 text-red-700' };
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
    };

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] bg-white border border-gray-200 shadow-sm rounded-md overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50 text-sm flex-wrap">
                <button
                    onClick={() => setShowApply(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded text-blue-700"
                >
                    <Plus size={14} /> Apply Leave
                </button>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-3 pr-8 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 cursor-pointer text-sm font-medium focus:outline-none"
                    >
                        <option value="All">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-2.5 text-gray-500 pointer-events-none" />
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
                >
                    <RefreshCw size={14} /> Refresh
                </button>

                <div className="ml-auto w-64 relative">
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
                </div>
            </div>

            {/* Applications Table */}
            <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-600 sticky top-0 z-10">
                        <tr>
                            <th className="p-3 border-b border-r font-semibold">Employee</th>
                            <th className="p-3 border-b border-r font-semibold">Leave Type</th>
                            <th className="p-3 border-b border-r font-semibold text-center">From</th>
                            <th className="p-3 border-b border-r font-semibold text-center">To</th>
                            <th className="p-3 border-b border-r font-semibold text-center">Days</th>
                            <th className="p-3 border-b border-r font-semibold text-center">Status</th>
                            <th className="p-3 border-b font-semibold text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredApps.map(app => (
                            <tr key={app.id} className="hover:bg-blue-50">
                                <td className="p-3 border-r flex items-center gap-2 font-medium text-gray-900">
                                    <User size={16} className="text-gray-400" /> {app.employee_name}
                                </td>
                                <td className="p-3 border-r">
                                    <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: (app.color || '#999') + '20', color: (app.color || '#666') }}>
                                        {app.leave_type_name}
                                    </span>
                                </td>
                                <td className="p-3 border-r text-center text-gray-600">{new Date(app.from_date).toLocaleDateString()}</td>
                                <td className="p-3 border-r text-center text-gray-600">{new Date(app.to_date).toLocaleDateString()}</td>
                                <td className="p-3 border-r text-center text-gray-600">{app.total_days}</td>
                                <td className="p-3 border-r text-center">{getStatusBadge(app.status)}</td>
                                <td className="p-3 text-center">
                                    {app.status === 'Pending' && (
                                        <div className="flex justify-center gap-1">
                                            <button onClick={() => handleAction(app.id, 'Approved')} className="p-1.5 bg-green-100 hover:bg-green-200 rounded text-green-700" title="Approve"><Check size={16} /></button>
                                            <button onClick={() => handleAction(app.id, 'Rejected')} className="p-1.5 bg-red-100 hover:bg-red-200 rounded text-red-700" title="Reject"><X size={16} /></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredApps.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-gray-400">
                                    No applications found matching your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Apply Modal */}
            {showApply && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <form onSubmit={handleApply} className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="font-bold text-lg">Apply Leave</h3>
                        <div>
                            <label className="block text-sm font-medium mb-1">Employee</label>
                            <select required className="w-full border rounded-lg px-3 py-2" value={form.employee_code} onChange={e => setForm({ ...form, employee_code: e.target.value })}>
                                <option value="">Select Employee</option>
                                {employees.map(e => <option key={e.employee_code} value={e.employee_code}>{e.name} ({e.employee_code})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Leave Type</label>
                            <select required className="w-full border rounded-lg px-3 py-2" value={form.leave_type_id} onChange={e => setForm({ ...form, leave_type_id: e.target.value })}>
                                <option value="">Select Type</option>
                                {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">From Date</label>
                                <input type="date" required className="w-full border rounded-lg px-3 py-2" value={form.from_date} onChange={e => setForm({ ...form, from_date: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">To Date</label>
                                <input type="date" required className="w-full border rounded-lg px-3 py-2" value={form.to_date} onChange={e => setForm({ ...form, to_date: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="halfDay" checked={form.is_half_day} onChange={e => setForm({ ...form, is_half_day: e.target.checked })} />
                            <label htmlFor="halfDay" className="text-sm">Half Day</label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Reason</label>
                            <textarea required className="w-full border rounded-lg px-3 py-2" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setShowApply(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">Submit</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
