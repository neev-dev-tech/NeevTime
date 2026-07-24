import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { User, Mail, Phone, Building, Briefcase, Calendar, Clock, ArrowLeft, Edit2, Trash2, X } from 'lucide-react';
import { useToast } from '../components';

export default function EmployeeProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [employee, setEmployee] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [areas, setAreas] = useState([]);

    // Edit Form Data
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        fetchEmployee();
        fetchAttendance();
        fetchDepsAndAreas();
    }, [id]);

    const fetchEmployee = async () => {
        try {
            const res = await api.get(`/api/employees/${id}`);
            setEmployee(res.data);
            setEditForm(res.data); // Pre-fill edit form
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const fetchAttendance = async () => {
        try {
            const res = await api.get('/api/attendance/summary', { params: { employee_code: id } });
            setAttendance(res.data.slice(0, 30));
        } catch (err) { console.error(err); }
    };

    const fetchDepsAndAreas = async () => {
        try {
            const d = await api.get('/api/departments');
            const a = await api.get('/api/areas');
            setDepartments(d.data);
            setAreas(a.data);
        } catch (err) { }
    };

    // Delete Confirmation State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const handleDelete = async () => {
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/api/employees/${id}`);
            navigate('/employees');
        } catch (err) { toast.error('Delete failed'); }
    };

    // Portal password (employee self-service login)
    const [portalPassword, setPortalPassword] = useState('');
    const [settingPortalPw, setSettingPortalPw] = useState(false);

    const handleSetPortalPassword = async () => {
        if (!portalPassword || portalPassword.length < 6) {
            toast.warning('Portal password must be at least 6 characters');
            return;
        }
        setSettingPortalPw(true);
        try {
            await api.put(`/api/employees/${id}/portal-password`, { password: portalPassword });
            setPortalPassword('');
            toast.success('Portal password set. Employee can now log in at /portal/login');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to set portal password');
        } finally {
            setSettingPortalPw(false);
        }
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.put(`/api/employees/${id}`, editForm);
            setEmployee(res.data);
            setShowEditModal(false);
            toast.success('Employee updated successfully');
        } catch (err) {
            console.error(err);
            toast.error('Update failed');
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'Present': 'bg-green-500',
            'Absent': 'bg-red-500',
            'Late': 'bg-yellow-500',
            'Half Day': 'bg-orange-500',
            'Leave': 'bg-blue-500',
            'Holiday': 'bg-purple-500',
            'Weekly Off': 'bg-slate-400',
        };
        return colors[status] || 'bg-slate-300';
    };

    if (loading) return <div className="p-6 text-slate-400">Loading...</div>;
    if (!employee) return <div className="p-6 text-red-500">Employee not found</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Back Link */}
            <Link to="/employees" className="flex items-center gap-2 text-orange-600 hover:underline text-sm mb-4">
                <ArrowLeft size={16} /> Back to Employees
            </Link>

            {/* Profile Header */}
            <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-3xl font-bold shadow-md">
                        {employee.name?.[0]?.toUpperCase() || 'E'}
                    </div>
                    <div className="flex-1 w-full">
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">{employee.name}</h1>
                                <p className="text-slate-500">{employee.designation || 'Employee'}</p>
                                <div className="flex gap-3 text-sm mt-1">
                                    <span className="text-orange-600 font-medium">ID: {employee.employee_code}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {employee.status || 'Active'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowEditModal(true)} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"><Edit2 size={18} /></button>
                                <button onClick={handleDelete} className="p-2 border rounded-lg hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={18} /></button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Building size={16} className="text-slate-400" />
                                {employee.department_name || 'No Department'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Mail size={16} className="text-slate-400" />
                                {employee.email || 'No Email'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone size={16} className="text-slate-400" />
                                {employee.mobile || 'No Phone'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Calendar size={16} className="text-slate-400" />
                                Joined: {employee.joining_date ? new Date(employee.joining_date).toLocaleDateString() : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 mb-4 border-b">
                {['overview', 'attendance', 'documents'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-3 px-1 capitalize transition-colors border-b-2 font-medium ${activeTab === tab ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl shadow-sm border p-6 min-h-[400px]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                        <div>
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><User size={18} /> Personal Details</h3>
                            <dl className="space-y-3 text-sm">
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Employee ID</dt><dd className="col-span-2 font-medium">{employee.employee_code}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Full Name</dt><dd className="col-span-2 font-medium">{employee.name}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Gender</dt><dd className="col-span-2">{employee.gender || '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Date of Birth</dt><dd className="col-span-2">{employee.dob ? new Date(employee.dob).toLocaleDateString() : '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Mobile</dt><dd className="col-span-2">{employee.mobile || '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Address</dt><dd className="col-span-2">{employee.address || '-'}</dd></div>
                            </dl>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Briefcase size={18} /> Work Details</h3>
                            <dl className="space-y-3 text-sm">
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Department</dt><dd className="col-span-2 font-medium">{employee.department_name || '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Designation</dt><dd className="col-span-2">{employee.designation || '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Area</dt><dd className="col-span-2">{employee.area_name || '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Joining Date</dt><dd className="col-span-2">{employee.joining_date ? new Date(employee.joining_date).toLocaleDateString() : '-'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">Employment Type</dt><dd className="col-span-2">{employee.employment_type || 'Permanent'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-50 pb-2"><dt className="text-slate-500">App Access</dt><dd className="col-span-2">{employee.app_login_enabled ? 'Enabled' : 'Disabled'}</dd></div>
                            </dl>

                            {/* Self-service portal access */}
                            <div className="mt-6 p-4 bg-orange-50/60 border border-orange-100 rounded-xl">
                                <h4 className="text-sm font-semibold text-slate-700 mb-1">Employee Portal Access</h4>
                                <p className="text-xs text-slate-500 mb-3">Set a password so this employee can view their attendance and apply for leave at <code className="bg-white px-1 rounded border">/portal/login</code>.</p>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={portalPassword}
                                        onChange={e => setPortalPassword(e.target.value)}
                                        placeholder="New portal password (min 6 chars)"
                                        className="flex-1 text-sm border rounded-lg px-3 py-2"
                                    />
                                    <button
                                        onClick={handleSetPortalPassword}
                                        disabled={settingPortalPw}
                                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
                                    >
                                        {settingPortalPw ? 'Saving...' : 'Set Password'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div>
                        <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><Clock size={18} /> Recent Attendance</h3>
                        <div className="flex flex-wrap gap-2">
                            {attendance.map((day, i) => (
                                <div key={i} className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs text-white shadow-sm ${getStatusColor(day.status)}`} title={`${day.date}: ${day.status}`}>
                                    <span className="font-bold text-sm">{new Date(day.date).getDate()}</span>
                                </div>
                            ))}
                        </div>
                        {attendance.length === 0 && <p className="text-slate-400 text-sm italic">No attendance records found for the last 30 days.</p>}
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                        <User className="mx-auto text-slate-300 mb-2" size={48} />
                        <p className="text-slate-500 text-sm">No documents uploaded yet.</p>
                        <button className="mt-4 px-4 py-2 bg-orange-50 text-orange-600 rounded text-sm font-medium hover:bg-orange-100">Upload Document</button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm text-center shadow-xl">
                        <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="text-red-600" size={24} />
                        </div>
                        <h3 className="text-lg font-bold mb-2">Delete Employee?</h3>
                        <p className="text-slate-500 text-sm mb-6">Are you sure you want to delete <span className="font-bold">{employee.name}</span>? This action cannot be undone.</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setDeleteModalOpen(false)} className="px-4 py-2 border rounded-lg text-slate-700 hover:bg-slate-50">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50 sticky top-0">
                            <h3 className="font-bold text-lg">Edit Employee</h3>
                            <button onClick={() => setShowEditModal(false)}><X className="text-slate-400 hover:text-red-500" /></button>
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Similar Form Fields to Add Modal */}
                            <div className="col-span-1 md:col-span-3 font-semibold text-slate-600 border-b pb-1 mb-2">Personal Details</div>

                            <div><label className="block text-xs font-semibold text-slate-500">Employee ID</label><input disabled type="text" className="w-full border bg-slate-50 rounded px-2 py-1.5" value={editForm.employee_code} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500">Name</label><input type="text" className="w-full border rounded px-2 py-1.5" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500">Gender</label>
                                <select className="w-full border rounded px-2 py-1.5" value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })}>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500">DOB</label><input type="date" className="w-full border rounded px-2 py-1.5" value={editForm.dob ? editForm.dob.split('T')[0] : ''} onChange={e => setEditForm({ ...editForm, dob: e.target.value })} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500">Mobile</label><input type="text" className="w-full border rounded px-2 py-1.5" value={editForm.mobile} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500">Email</label><input type="email" className="w-full border rounded px-2 py-1.5" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
                            <div className="col-span-1 md:col-span-3"><label className="block text-xs font-semibold text-slate-500">Address</label><textarea rows={2} className="w-full border rounded px-2 py-1.5" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} /></div>

                            <div className="col-span-1 md:col-span-3 font-semibold text-slate-600 border-b pb-1 mb-2 mt-2">Work Details</div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500">Department</label>
                                <select className="w-full border rounded px-2 py-1.5" value={editForm.department_id} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}>
                                    <option value="">Select</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500">Designation</label><input type="text" className="w-full border rounded px-2 py-1.5" value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500">Area</label>
                                <select className="w-full border rounded px-2 py-1.5" value={editForm.area_id} onChange={e => setEditForm({ ...editForm, area_id: e.target.value })}>
                                    <option value="">Select</option>
                                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500">Joining Date</label><input type="date" className="w-full border rounded px-2 py-1.5" value={editForm.joining_date ? editForm.joining_date.split('T')[0] : ''} onChange={e => setEditForm({ ...editForm, joining_date: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500">Status</label>
                                <select className="w-full border rounded px-2 py-1.5" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="col-span-1 md:col-span-3 flex justify-end gap-3 pt-4 border-t mt-4">
                                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded hover:bg-slate-50">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
