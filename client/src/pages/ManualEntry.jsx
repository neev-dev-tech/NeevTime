import React, { useState, useEffect } from 'react';
import api from '../api';
import { ClipboardEdit, Search, Calendar, Clock, User, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '../components';

export default function ManualEntry() {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [form, setForm] = useState({
        date: new Date().toISOString().split('T')[0],
        in_time: '09:00',
        out_time: '18:00',
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => { fetchEmployees(); }, []);

    const fetchEmployees = async () => {
        try {
            const res = await api.get('/api/employees');
            setEmployees(res.data);
        } catch (err) { console.error(err); }
    };

    const filteredEmployees = employees.filter(e =>
        e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.employee_code?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEmployee) return toast.warning('Select an employee');
        if (!form.reason.trim()) return toast.warning('Reason is required');

        setSubmitting(true);
        try {
            await api.post('/api/attendance/manual', {
                employee_code: selectedEmployee.employee_code,
                date: form.date,
                in_time: `${form.date} ${form.in_time}:00`,
                out_time: `${form.date} ${form.out_time}:00`,
                reason: form.reason
            });
            setResult({ success: true, message: 'Manual attendance added successfully' });
            setForm({ date: new Date().toISOString().split('T')[0], in_time: '09:00', out_time: '18:00', reason: '' });
            setSelectedEmployee(null);
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Failed to add' });
        }
        setSubmitting(false);
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><ClipboardEdit /> Manual Attendance Entry</h1>

            {result && (
                <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {result.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {result.message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
                {/* Employee Search */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Employee *</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            className="w-full border rounded-lg pl-10 pr-4 py-2"
                            value={selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employee_code})` : searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setSelectedEmployee(null); }}
                            onFocus={() => setSelectedEmployee(null)}
                        />
                    </div>
                    {!selectedEmployee && searchTerm && (
                        <div className="border rounded-lg mt-1 max-h-40 overflow-auto bg-white shadow-lg">
                            {filteredEmployees.length === 0 ? (
                                <div className="p-3 text-gray-400 text-sm">No employees found</div>
                            ) : filteredEmployees.slice(0, 5).map(emp => (
                                <button key={emp.id} type="button" onClick={() => { setSelectedEmployee(emp); setSearchTerm(''); }}
                                    className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2">
                                    <User size={16} className="text-gray-400" />
                                    <span className="font-medium">{emp.name}</span>
                                    <span className="text-gray-500 text-sm">{emp.employee_code}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Date */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date *</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="date" className="w-full border rounded-lg pl-10 pr-4 py-2" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                    </div>
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">In Time *</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input type="time" className="w-full border rounded-lg pl-10 pr-4 py-2" value={form.in_time} onChange={e => setForm({ ...form, in_time: e.target.value })} required />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Out Time *</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input type="time" className="w-full border rounded-lg pl-10 pr-4 py-2" value={form.out_time} onChange={e => setForm({ ...form, out_time: e.target.value })} required />
                        </div>
                    </div>
                </div>

                {/* Reason */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reason *</label>
                    <textarea className="w-full border rounded-lg px-4 py-2" rows={3} placeholder="Reason for manual entry..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
                </div>

                <button type="submit" disabled={submitting || !selectedEmployee} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? 'Submitting...' : 'Submit Manual Entry'}
                </button>
            </form>
        </div>
    );
}
