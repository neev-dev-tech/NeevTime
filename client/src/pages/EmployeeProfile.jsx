import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { User, Mail, Phone, Building, Briefcase, Calendar, Clock, ArrowLeft, Edit2, Trash2, X, AlertCircle, FileText, RefreshCw } from 'lucide-react';
import { useToast, Button } from '../components';

export default function EmployeeProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [employee, setEmployee] = useState(null);
    const [attendance, setAttendance] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [areas, setAreas] = useState([]);
    const [docs, setDocs] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // Edit Form Data
    const [editForm, setEditForm] = useState({});

    useEffect(() => {
        fetchEmployee();
        fetchDepsAndAreas();
    }, [id]);

    const fetchEmployee = async () => {
        try {
            setError(null);
            const res = await api.get(`/api/employees/${id}`);
            setEmployee(res.data);
            setEditForm(res.data); // Pre-fill edit form
            // Summary rows are keyed by employee_code, not the numeric route id
            if (res.data?.employee_code) {
                fetchAttendance(res.data.employee_code);
                fetchDocs(res.data.employee_code);
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load this employee');
        }
        setLoading(false);
    };

    const fetchAttendance = async (employeeCode) => {
        try {
            const res = await api.get('/api/attendance/summary', { params: { employee_code: employeeCode } });
            setAttendance((res.data || []).slice(0, 30));
        } catch (err) { console.error(err); }
    };

    const fetchDocs = async (employeeCode) => {
        setDocsLoading(true);
        try {
            const res = await api.get(`/api/employee-docs/${employeeCode}`);
            setDocs(res.data || []);
        } catch (err) {
            console.error(err);
            setDocs([]);
        }
        setDocsLoading(false);
    };

    // Files are stored as base64 by the API, so keep uploads small enough that
    // the row stays sane — 5 MB is well under any practical column limit.
    const MAX_DOC_BYTES = 5 * 1024 * 1024;

    const handleDocUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !employee?.employee_code) return;

        if (file.size > MAX_DOC_BYTES) {
            toast.error('File is larger than 5 MB');
            return;
        }

        setUploadingDoc(true);
        try {
            const fileData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Could not read the file'));
                reader.readAsDataURL(file);
            });

            await api.post('/api/employee-docs', {
                employee_code: employee.employee_code,
                doc_name: file.name,
                file_data: fileData,
                file_type: file.type || 'application/octet-stream'
            });
            toast.success('Document uploaded');
            fetchDocs(employee.employee_code);
        } catch (err) {
            toast.error(err.response?.data?.error || err.message || 'Upload failed');
        } finally {
            setUploadingDoc(false);
        }
    };

    const handleDocDelete = async (docId) => {
        try {
            await api.delete(`/api/employee-docs/${docId}`);
            toast.success('Document deleted');
            fetchDocs(employee.employee_code);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Delete failed');
        }
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

    if (loading) return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="h-5 w-40 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="w-28 h-28 rounded-2xl bg-slate-100 dark:bg-slate-700 animate-pulse shrink-0" />
                    <div className="flex-1 w-full space-y-3">
                        <div className="h-7 w-56 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        <div className="h-4 w-40 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-4 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-10 w-72 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-6 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                ))}
            </div>
        </div>
    );

    if (!employee) return (
        <div className="p-6 max-w-6xl mx-auto">
            <Link to="/employees" className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:underline text-sm mb-4">
                <ArrowLeft size={16} /> Back to Employees
            </Link>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 py-16 text-center">
                <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Employee not found</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    {error || 'This employee record no longer exists or was removed.'}
                </p>
                <Button variant="secondary" icon={RefreshCw} onClick={fetchEmployee}>Try again</Button>
            </div>
        </div>
    );

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Back Link */}
            <Link to="/employees" className="inline-flex items-center gap-2 text-orange-600 dark:text-orange-400 hover:underline text-sm mb-4">
                <ArrowLeft size={16} /> Back to Employees
            </Link>

            {/* Profile Header — identity card */}
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-orange-50 to-transparent dark:from-orange-900/20 dark:to-transparent" />
                <div className="relative flex flex-col md:flex-row items-start gap-6">
                    <div className="w-28 h-28 shrink-0 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg ring-4 ring-orange-100 dark:ring-orange-900/40">
                        {employee.name?.[0]?.toUpperCase() || 'E'}
                    </div>
                    <div className="flex-1 w-full min-w-0">
                        <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0">
                                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">{employee.name || '—'}</h1>
                                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{employee.designation || 'Employee'}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-900/30 border border-orange-100 dark:border-orange-800">
                                        <span className="text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 font-bold">ID</span>
                                        <span className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{employee.employee_code || '—'}</span>
                                    </span>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${employee.status === 'active'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                                        : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${employee.status === 'active' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 dark:bg-rose-400'}`} />
                                        {employee.status || 'Active'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <Button variant="ghost" size="sm" icon={Edit2} aria-label="Edit" onClick={() => setShowEditModal(true)} />
                                <Button variant="danger" size="sm" icon={Trash2} aria-label="Delete" onClick={handleDelete} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 min-w-0">
                                <Building size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                <span className="truncate">{employee.department_name || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 min-w-0">
                                <Mail size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                <span className="truncate">{employee.email || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 min-w-0">
                                <Phone size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                <span className="truncate">{employee.mobile || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 min-w-0">
                                <Calendar size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                                <span className="truncate">Joined {employee.joining_date ? new Date(employee.joining_date).toLocaleDateString() : '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs — segmented control */}
            <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {['overview', 'attendance', 'documents'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${activeTab === tab
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white/70 dark:hover:bg-slate-700/60'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 min-h-[400px]">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                        <div>
                            <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2"><User size={14} /> Personal Details</h3>
                            <dl className="space-y-3 text-sm">
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Employee ID</dt><dd className="col-span-2 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{employee.employee_code || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Full Name</dt><dd className="col-span-2 font-semibold text-slate-800 dark:text-slate-100">{employee.name || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Gender</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.gender || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Date of Birth</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.dob ? new Date(employee.dob).toLocaleDateString() : '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Mobile</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.mobile || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Address</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.address || '—'}</dd></div>
                            </dl>
                        </div>
                        <div>
                            <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2"><Briefcase size={14} /> Work Details</h3>
                            <dl className="space-y-3 text-sm">
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Department</dt><dd className="col-span-2 font-semibold text-slate-800 dark:text-slate-100">{employee.department_name || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Designation</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.designation || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Area</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.area_name || '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Joining Date</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.joining_date ? new Date(employee.joining_date).toLocaleDateString() : '—'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">Employment Type</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.employment_type || 'Permanent'}</dd></div>
                                <div className="grid grid-cols-3 border-b border-slate-100 dark:border-slate-700 pb-2"><dt className="text-slate-500 dark:text-slate-400">App Access</dt><dd className="col-span-2 text-slate-600 dark:text-slate-300">{employee.app_login_enabled ? 'Enabled' : 'Disabled'}</dd></div>
                            </dl>

                            {/* Self-service portal access */}
                            <div className="mt-6 p-4 bg-orange-50/60 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl">
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Employee Portal Access</h4>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">Set a password so this employee can view their attendance and apply for leave at <code className="font-mono text-xs bg-white dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700">/portal/login</code>.</p>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        value={portalPassword}
                                        onChange={e => setPortalPassword(e.target.value)}
                                        placeholder="New portal password (min 6 chars)"
                                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                    />
                                    <Button
                                        variant="primary"
                                        onClick={handleSetPortalPassword}
                                        disabled={settingPortalPw}
                                    >
                                        {settingPortalPw ? 'Saving...' : 'Set Password'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div>
                        <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2"><Clock size={14} /> Recent Attendance</h3>
                        {attendance.length === 0 ? (
                            <div className="py-16 text-center">
                                <Clock size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No attendance yet</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Nothing has been recorded for this employee in the last 30 days.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {attendance.map((day, i) => (
                                    <div key={i} className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${getStatusColor(day.status)}`} title={`${day.date}: ${day.status}`}>
                                        <span className="font-bold text-sm tabular-nums">{new Date(day.date).getDate()}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Contracts and ID proofs for this employee. Maximum 5 MB per file.
                            </p>
                            <div className="relative inline-block">
                                <Button variant="successSolid" disabled={uploadingDoc} className="pointer-events-none">
                                    {uploadingDoc ? 'Uploading…' : 'Upload Document'}
                                </Button>
                                <input
                                    type="file"
                                    onChange={handleDocUpload}
                                    disabled={uploadingDoc}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>

                        {docsLoading ? (
                            <div className="space-y-2">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
                                ))}
                            </div>
                        ) : docs.length === 0 ? (
                            <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                <FileText className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                                <h4 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No documents uploaded</h4>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Use Upload Document to add the first one.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                {docs.map(doc => (
                                    <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-orange-50/50 dark:hover:bg-slate-700/40">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileText size={18} className="text-orange-500 dark:text-orange-400 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{doc.doc_name}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '—'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {doc.file_path && (
                                                <a
                                                    href={doc.file_path}
                                                    download={doc.doc_name}
                                                    className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                                                >
                                                    Download
                                                </a>
                                            )}
                                            <Button variant="danger" size="sm" icon={Trash2} onClick={() => handleDocDelete(doc.id)} aria-label="Delete document" />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {docs.length} {docs.length === 1 ? 'document' : 'documents'}
                        </p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm text-center shadow-xl border border-white/50 dark:border-slate-700">
                        <div className="mx-auto w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mb-4">
                            <Trash2 className="text-rose-600 dark:text-rose-400" size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Delete Employee?</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Are you sure you want to delete <span className="font-semibold text-slate-800 dark:text-slate-100">{employee.name}</span>? This action cannot be undone.</p>
                        <div className="flex justify-center gap-3">
                            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
                            <Button variant="dangerSolid" onClick={confirmDelete}>Delete</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-white/50 dark:border-slate-700">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/70 dark:bg-slate-900/50 sticky top-0 z-10">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Edit Employee</h3>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={() => setShowEditModal(false)} />
                        </div>
                        <form onSubmit={handleEditSubmit} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Similar Form Fields to Add Modal */}
                            <div className="col-span-1 md:col-span-3 font-semibold text-slate-600 dark:text-slate-400 border-b dark:border-slate-700 pb-1 mb-2">Personal Details</div>

                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Employee ID</label><input disabled type="text" className="w-full border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 text-sm font-mono tabular-nums text-slate-500 dark:bg-slate-900/50 dark:border-slate-600 dark:text-slate-400" value={editForm.employee_code} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Name</label><input type="text" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Gender</label>
                                <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value })}>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">DOB</label><input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.dob ? editForm.dob.split('T')[0] : ''} onChange={e => setEditForm({ ...editForm, dob: e.target.value })} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Mobile</label><input type="text" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.mobile} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} /></div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Email</label><input type="email" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
                            <div className="col-span-1 md:col-span-3"><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Address</label><textarea rows={2} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} /></div>

                            <div className="col-span-1 md:col-span-3 font-semibold text-slate-600 dark:text-slate-400 border-b dark:border-slate-700 pb-1 mb-2 mt-2">Work Details</div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Department</label>
                                <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.department_id} onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}>
                                    <option value="">Select</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Designation</label><input type="text" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.designation} onChange={e => setEditForm({ ...editForm, designation: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Area</label>
                                <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.area_id} onChange={e => setEditForm({ ...editForm, area_id: e.target.value })}>
                                    <option value="">Select</option>
                                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Joining Date</label><input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.joining_date ? editForm.joining_date.split('T')[0] : ''} onChange={e => setEditForm({ ...editForm, joining_date: e.target.value })} /></div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">Status</label>
                                <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="col-span-1 md:col-span-3 flex justify-end gap-3 pt-4 border-t dark:border-slate-700 mt-4">
                                <Button variant="secondary" type="button" onClick={() => setShowEditModal(false)}>Cancel</Button>
                                <Button variant="primary" type="submit">Save Changes</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
