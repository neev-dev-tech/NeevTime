import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Download, Trash2, X, Search, RefreshCw, User, Calendar, AlertCircle } from 'lucide-react';
import api from '../api';
import { Button, PageHeader } from '../components';
import Modal from '../components/Modal';

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
                doc.doc_name.toLowerCase().includes(lower) ||
                doc.employee_code.toLowerCase().includes(lower) ||
                (doc.employee_name && doc.employee_name.toLowerCase().includes(lower))
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
        if (!window.confirm('Are you sure you want to delete this document?')) {
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

    const handleDownload = (doc) => {
        try {
            // Decode base64 and create download
            const base64Data = doc.file_path;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: doc.file_type || 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = doc.doc_name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            showToast('Failed to download document', 'error');
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

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={FileText}
                title="Employee Documents"
                subtitle="Contracts, ID proofs and other files held against each employee"
                actions={
                    <>
                        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                        </Button>
                        <Button variant="primary" icon={Upload} onClick={() => setShowUploadModal(true)}>
                            Upload Document
                        </Button>
                    </>
                }
            />

            <div className="flex flex-col h-[calc(100vh-210px)] card-base overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="relative w-full max-w-md">
                    <input
                        type="text"
                        placeholder="Search by document name, employee code, or name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm w-full"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey dark:text-slate-400" />
                </div>
            </div>

            {/* Documents Table */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-800 custom-scrollbar">
                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load documents</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchDocuments}>Try again</Button>
                    </div>
                ) : filteredDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                        <FileText size={40} className="mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No documents found</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchQuery
                                ? 'No document matches that search term.'
                                : 'Nothing has been uploaded for any employee yet.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-700">
                            <tr>
                                <th className="px-5 py-3 font-bold whitespace-nowrap">Document Name</th>
                                <th className="px-5 py-3 font-bold whitespace-nowrap">Employee</th>
                                <th className="px-5 py-3 font-bold whitespace-nowrap">Employee Code</th>
                                <th className="px-5 py-3 font-bold whitespace-nowrap">Uploaded Date</th>
                                <th className="px-5 py-3 font-bold whitespace-nowrap text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredDocuments.map(doc => (
                                <tr key={doc.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            <FileText size={16} className="text-orange-600 dark:text-orange-400 shrink-0" />
                                            <span className="font-semibold text-slate-800 dark:text-slate-100">{doc.doc_name || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{doc.employee_name || '—'}</td>
                                    <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{doc.employee_code || '—'}</td>
                                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-400 dark:text-slate-500" />
                                            {formatDate(doc.uploaded_at)}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
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
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400 flex justify-between items-center">
                <span>Total <span className="text-slate-800 dark:text-slate-100 font-bold tabular-nums">{filteredDocuments.length}</span> Documents</span>
            </div>
            </div>

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
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-orange-300 transition-colors">
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
                                <Upload size={32} className="text-orange-500 dark:text-orange-400 mb-2" />
                                <span className="text-sm text-slate-grey dark:text-slate-400">
                                    {selectedFile ? selectedFile.name : 'Click to select file'}
                                </span>
                                <span className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, JPG, PNG (Max 10MB)</span>
                            </label>
                        </div>
                        {selectedFile && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
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
                <div className={`fixed bottom-4 right-4 flex items-center px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>
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
        </div>
    );
}
