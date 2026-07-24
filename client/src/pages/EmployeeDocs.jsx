import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Download, Trash2, X, Search, RefreshCw, User, Calendar } from 'lucide-react';
import api from '../api';
import { Button, PageHeader } from '../components';

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
            const res = await api.get('/api/employee-docs');
            setDocuments(res.data);
            setFilteredDocuments(res.data);
        } catch (err) {
            console.error('Failed to fetch documents', err);
            showToast('Failed to load documents', 'error');
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
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={FileText}
                title="Employee Documents"
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
            <div className="p-4 border-b border-slate-100 bg-white">
                <div className="relative w-full max-w-md">
                    <input
                        type="text"
                        placeholder="Search by document name, employee code, or name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-base pl-10 py-2 text-sm w-full"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-slate-grey" />
                </div>
            </div>

            {/* Documents Table */}
            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                {filteredDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                        <FileText size={64} className="text-slate-300 mb-4" />
                        <p className="text-slate-500 text-lg font-medium">No documents found</p>
                        <p className="text-sm text-slate-400 mt-2">
                            {searchQuery ? 'Try a different search term' : 'Upload your first document to get started'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-orange-50/50 text-charcoal font-semibold sticky top-0 z-10">
                            <tr>
                                <th className="p-4 border-b border-slate-100">Document Name</th>
                                <th className="p-4 border-b border-slate-100">Employee</th>
                                <th className="p-4 border-b border-slate-100">Employee Code</th>
                                <th className="p-4 border-b border-slate-100">Uploaded Date</th>
                                <th className="p-4 border-b border-slate-100 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredDocuments.map(doc => (
                                <tr key={doc.id} className="hover:bg-cream-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <FileText size={18} className="text-orange-600" />
                                            <span className="font-medium text-charcoal">{doc.doc_name}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-slate-grey">{doc.employee_name || '-'}</td>
                                    <td className="p-4 font-mono text-saffron font-medium">{doc.employee_code}</td>
                                    <td className="p-4 text-slate-grey">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-400" />
                                            {formatDate(doc.uploaded_at)}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleDownload(doc)}
                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                title="Download"
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-xs font-medium text-slate-grey flex justify-between items-center">
                <span>Total <span className="text-charcoal font-bold">{filteredDocuments.length}</span> Documents</span>
            </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-charcoal/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-white/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-charcoal">Upload Document</h3>
                            <button
                                onClick={() => {
                                    setShowUploadModal(false);
                                    setSelectedEmployee('');
                                    setDocName('');
                                    setSelectedFile(null);
                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = '';
                                    }
                                }}
                                className="p-2 hover:bg-slate-50 rounded-full text-slate-grey transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleUpload} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-grey mb-1.5">Employee *</label>
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
                                <label className="block text-sm font-medium text-slate-grey mb-1.5">Document Name *</label>
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
                                <label className="block text-sm font-medium text-slate-grey mb-1.5">File *</label>
                                <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 hover:border-orange-300 transition-colors">
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
                                        <Upload size={32} className="text-orange-500 mb-2" />
                                        <span className="text-sm text-slate-grey">
                                            {selectedFile ? selectedFile.name : 'Click to select file'}
                                        </span>
                                        <span className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX, JPG, PNG (Max 10MB)</span>
                                    </label>
                                </div>
                                {selectedFile && (
                                    <p className="text-xs text-slate-500 mt-2">
                                        Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setShowUploadModal(false);
                                        setSelectedEmployee('');
                                        setDocName('');
                                        setSelectedFile(null);
                                        if (fileInputRef.current) {
                                            fileInputRef.current.value = '';
                                        }
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" disabled={uploading}>
                                    {uploading ? 'Uploading...' : 'Upload'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
