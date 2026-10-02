import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Download, Trash2, X, RefreshCw, Calendar, AlertCircle } from 'lucide-react';
import api from '../api';
import { downloadEmployeeDoc } from '../utils/employeeDocs';
import { Button, ListPage, ListSearch, ListIconButton, LIST_THEAD, LIST_TH, LIST_EDGE_FIRST, LIST_EDGE_LAST } from '../components';
import Modal from '../components/Modal';
import { formatDate as formatDateUtil } from '../utils/dateFormat';
import { confirm } from '../components/ConfirmDialog';
import useTableControls from '../hooks/useTableControls';
import { TablePager } from '../components/TableControls';

export default function EmployeeDocs() {
    const [documents, setDocuments] = useState([]);
    const [filteredDocuments, setFilteredDocuments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [docName, setDocName] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);

    const showToast = (message, type = 'info') => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ message, type });
        toastTimeoutRef.current = setTimeout(() => {
            setToast(null);
            toastTimeoutRef.current = null;
        }, 5000);
    };

    useEffect(() => {
        fetchDocuments();
        fetchEmployees();
    }, []);

    useEffect(() => {
        if (!searchQuery) {
            setFilteredDocuments(documents);
        } else {
            const lower = searchQuery.toLowerCase();
            setFilteredDocuments(documents.filter(doc =>
                String(doc.doc_name ?? '').toLowerCase().includes(lower) ||
                String(doc.employee_code ?? '').toLowerCase().includes(lower) ||
                String(doc.employee_name ?? '').toLowerCase().includes(lower)
            ));
        }
    }, [searchQuery, documents]);

    const fetchDocuments = async () => {
        try {
            setError(null);
            const res = await api.get('/api/employee-docs');
            setDocuments(res.data);
            setFilteredDocuments(res.data);
        } catch (err) {
            console.error('Failed to fetch documents', err);
            setError(err.response?.data?.error || 'Failed to load documents');
            showToast('Failed to load documents', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await api.get('/api/employees');
            setEmployees(res.data);
        } catch (err) {
            console.error('Failed to fetch employees', err);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showToast('File size must be less than 10MB', 'error');
                return;
            }
            setSelectedFile(file);
            if (!docName) {
                setDocName(file.name);
            }
        }
    };

    const closeUpload = () => {
        setShowUploadModal(false);
        setSelectedEmployee('');
        setDocName('');
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedEmployee || !docName || !selectedFile) {
            showToast('Please fill all fields and select a file', 'error');
            return;
        }

        setUploading(true);
        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const base64Data = event.target.result.split(',')[1]; // Remove data:type;base64, prefix
                    const res = await api.post('/api/employee-docs', {
                        employee_code: selectedEmployee,
                        doc_name: docName,
                        file_data: base64Data,
                        file_type: selectedFile.type
                    });
                    
                    showToast('Document uploaded successfully', 'success');
                    setShowUploadModal(false);
                    setSelectedEmployee('');
                    setDocName('');
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                    fetchDocuments();
                } catch (err) {
                    console.error('Upload error:', err);
                    showToast('Failed to upload document: ' + (err.response?.data?.error || err.message), 'error');
                } finally {
                    setUploading(false);
                }
            };
            reader.onerror = () => {
                showToast('Failed to read file', 'error');
                setUploading(false);
            };
            reader.readAsDataURL(selectedFile);
        } catch (err) {
            console.error('Upload error:', err);
            showToast('Failed to upload document', 'error');
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!(await confirm({ title: 'Delete', confirmText: 'Delete', type: 'danger', message: 'Are you sure you want to delete this document?' }))) {
            return;
        }
        try {
            await api.delete(`/api/employee-docs/${id}`);
            showToast('Document deleted successfully', 'success');
            fetchDocuments();
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete document', 'error');
        }
    };

    const handleDownload = async (doc) => {
        try {
            await downloadEmployeeDoc(doc);
        } catch (err) {
            console.error('Download error:', err);
            showToast(err.response?.status === 403 ? 'Only admin and HR can download documents' : 'Failed to download document', 'error');
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchDocuments(), fetchEmployees()]);
            showToast('Data refreshed successfully', 'success');
        } catch (err) {
            showToast('Failed to refresh data', 'error');
        } finally {
            setRefreshing(false);
        }
    };

    // Delegates to the shared formatter so this page cannot drift from the
    // rest of the app the way it had (it rendered "Aug 16, 2026" while the
    // tables beside it rendered 8/16/2026).
    const formatDate = (dateString) => (dateString ? formatDateUtil(dateString) : '—');

    const pager = useTableControls(filteredDocuments, { pageSize: 50 });

    return (
        <>
        <ListPage
            title="Employee Documents"
            count={documents.length}
            actions={
                <Button mutating variant="primary" size="toolbar" icon={Upload} onClick={() => setShowUploadModal(true)}>
                    Upload Document
                </Button>
            }
            toolbar={
                <>
                    <ListSearch label="Search documents" placeholder="Search by document name, employee code, or name..." value={searchQuery} onChange={setSearchQuery} />
                    <div className="ml-auto flex items-center gap-2">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={handleRefresh} disabled={refreshing} spin={refreshing} />
                    </div>
                </>
            }
            footer={<TablePager controls={pager} noun="document" />}
        >
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-20 px-6 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load documents</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchDocuments}>Try again</Button>
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className="py-20 px-6 text-center">
                        <FileText size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No documents found</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {searchQuery
                                ? 'No document matches that search term.'
                                : 'Nothing has been uploaded for any employee yet.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className={LIST_THEAD}>
                            <tr>
                                <th className={`${LIST_TH} ${LIST_EDGE_FIRST}`}>Document Name</th>
                                <th className={LIST_TH}>Employee</th>
                                <th className={LIST_TH}>Employee Code</th>
                                <th className={LIST_TH}>Uploaded Date</th>
                                <th className={`${LIST_TH} ${LIST_EDGE_LAST} !text-right`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pager.view.map(doc => (
                                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className={`${LIST_EDGE_FIRST} pr-4 py-3`}>
                                        <div className="flex items-center gap-2">
                                            <FileText size={16} className="text-slate-600 dark:text-slate-400 shrink-0" />
                                            <span className="font-semibold text-slate-800 dark:text-slate-100">{doc.doc_name || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{doc.employee_name || '—'}</td>
                                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 font-semibold">{doc.employee_code || '—'}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-500 dark:text-slate-400" />
                                            {formatDate(doc.uploaded_at)}
                                        </div>
                                    </td>
                                    <td className={`pl-4 ${LIST_EDGE_LAST} py-3`}>
                                        <div className="flex items-center justify-end">
                                        <div className="dv-quiet">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={Download}
                                                aria-label="Download document"
                                                title="Download"
                                                onClick={() => handleDownload(doc)}
                                            />
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                icon={Trash2}
                                                aria-label="Delete document"
                                                title="Delete"
                                                onClick={() => handleDelete(doc.id)}
                                            />
                                        </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </ListPage>

            <Modal
                open={showUploadModal}
                onClose={closeUpload}
                title="Upload Document"
            >
                <form onSubmit={handleUpload} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Employee *</label>
                        <select
                            required
                            value={selectedEmployee}
                            onChange={e => setSelectedEmployee(e.target.value)}
                            className="input-base w-full"
                        >
                            <option value="">Select Employee</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.employee_code}>
                                    {emp.employee_code} - {emp.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">Document Name *</label>
                        <input
                            type="text"
                            required
                            value={docName}
                            onChange={e => setDocName(e.target.value)}
                            placeholder="e.g., Employment Contract, ID Card, etc."
                            className="input-base w-full"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-grey dark:text-slate-400 mb-1.5">File *</label>
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-slate-300 transition-colors">
                            <input
                                ref={fileInputRef}
                                type="file"
                                required
                                onChange={handleFileSelect}
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                className="hidden"
                                id="file-upload"
                            />
                            <label
                                htmlFor="file-upload"
                                className="cursor-pointer flex flex-col items-center justify-center"
                            >
                                <Upload size={32} className="text-slate-600 dark:text-slate-400 mb-2" />
                                <span className="text-sm text-slate-grey dark:text-slate-400">
                                    {selectedFile ? selectedFile.name : 'Click to select file'}
                                </span>
                                <span className="text-xs text-slate-500 mt-1">PDF, DOC, DOCX, JPG, PNG (Max 10MB)</span>
                            </label>
                        </div>
                        {selectedFile && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <Button variant="secondary" onClick={closeUpload}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Upload'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-slate-500'}`}>
                    <span className="flex-1 pr-3">{toast.message}</span>
                    <button
                        onClick={() => {
                            setToast(null);
                            if (toastTimeoutRef.current) {
                                clearTimeout(toastTimeoutRef.current);
                            }
                        }}
                        className="text-white hover:text-slate-200"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </>
    );
}
