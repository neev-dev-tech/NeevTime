import React, { useState } from 'react';
import api from '../api';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, X, ChevronRight, FileText, ArrowRight, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '../components';

const IMPORT_TYPES = [
    { id: 'employees', label: 'Employee Master', description: 'Import employee details, codes, and departments', endpoint: '/api/employees/import', templateColumns: ['employee_code', 'name', 'department_id'] },
    { id: 'shifts', label: 'Shift Assignment', description: 'Assign shifts to employees via bulk upload', endpoint: '/api/roster/import', templateColumns: ['employee_code', 'shift_id', 'effective_from'] },
    { id: 'holidays', label: 'Holidays', description: 'Upload annual holiday calendar list', endpoint: '/api/holidays/import', templateColumns: ['name', 'date', 'is_optional'] },
];

export default function ImportWizard() {
    const [step, setStep] = useState(1);
    const [importType, setImportType] = useState(null);
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileSelect = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;
        setFile(selectedFile);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            const headers = lines[0]?.split(',').map(h => h.trim().toLowerCase());
            const data = lines.slice(1).map(line => {
                const values = line.split(',');
                const obj = {};
                headers.forEach((h, i) => obj[h] = values[i]?.trim() || '');
                return obj;
            });
            setParsedData(data);
            setStep(3);
        };
        reader.readAsText(selectedFile);
    };

    const handleImport = async () => {
        if (!importType || parsedData.length === 0) return;
        setImporting(true);
        try {
            const endpoint = IMPORT_TYPES.find(t => t.id === importType)?.endpoint;
            // Support both payload structures depending on backend expectation
            const res = await api.post(endpoint, { employees: parsedData, data: parsedData });
            setResult({ success: true, message: `Successfully imported ${parsedData.length} records.` });
            setStep(4);
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.error || 'Import failed. Please check your data format.' });
            setStep(4);
        }
        setImporting(false);
    };

    const downloadTemplate = () => {
        const type = IMPORT_TYPES.find(t => t.id === importType);
        if (!type) return;
        const csv = type.templateColumns.join(',') + '\n';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type.id}_template.csv`;
        a.click();
    };

    const reset = () => {
        setStep(1);
        setImportType(null);
        setFile(null);
        setParsedData([]);
        setResult(null);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <PageHeader
                icon={Upload}
                title="Data Import Wizard"
                subtitle="Bulk upload your data in a few simple steps"
            />

            {/* Progress Steps */}
            <div className="relative flex items-center justify-between px-16">
                {/* Connector Line */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700 -z-10 transform -translate-y-1/2 rounded-full"></div>
                <div className="absolute top-1/2 left-0 h-1 bg-orange-500 -z-10 transform -translate-y-1/2 rounded-full transition-all duration-500" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>

                {['Select Type', 'Upload File', 'Preview', 'Complete'].map((label, i) => (
                    <div key={i} className="flex flex-col items-center gap-2 bg-slate-50 dark:bg-slate-900 px-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-sm ${step > i + 1 ? 'bg-green-500 text-white shadow-green-200' :
                                step === i + 1 ? 'bg-orange-600 text-white shadow-orange-200 scale-110' :
                                    'bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-400'
                            }`}>
                            {step > i + 1 ? <CheckCircle size={18} /> : i + 1}
                        </div>
                        <span className={`text-xs font-semibold uppercase tracking-wider ${step === i + 1 ? 'text-orange-600 dark:text-orange-400' :
                                step > i + 1 ? 'text-green-600' : 'text-slate-400'
                            }`}>
                            {label}
                        </span>
                    </div>
                ))}
            </div>

            <div className="report-container p-8 min-h-[400px]">
                {/* Step 1: Select Type */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">What would you like to import?</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {IMPORT_TYPES.map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => { setImportType(type.id); setStep(2); }}
                                    className="flex flex-col text-left p-6 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-orange-400 hover:shadow-md hover:bg-orange-50/30 dark:hover:bg-slate-700 transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet size={24} />
                                    </div>
                                    <div className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-1">{type.label}</div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{type.description}</p>

                                    <div className="mt-4 flex items-center text-orange-600 dark:text-orange-400 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                        Select <ArrowRight size={14} className="ml-1" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Upload File */}
                {step === 2 && (
                    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Upload CSV File</h2>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">Importing: <span className="font-semibold text-orange-600 dark:text-orange-400">{IMPORT_TYPES.find(t => t.id === importType)?.label}</span></p>
                        </div>

                        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-orange-400 transition-all group cursor-pointer relative">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="w-16 h-16 bg-orange-50 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/50 transition-colors">
                                <Upload className="text-orange-500" size={32} />
                            </div>
                            <h3 className="font-semibold text-slate-700 dark:text-slate-300">Click to upload or drag and drop</h3>
                            <p className="text-sm text-slate-400 mt-2">CSV files only (Max 5MB)</p>
                        </div>

                        <div className="flex justify-center gap-4">
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button variant="secondary" icon={Download} onClick={downloadTemplate}>Download Template</Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Preview */}
                {step === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-end">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Preview Data</h2>
                                <p className="text-slate-500 dark:text-slate-400 mt-1">Review your data before importing. Found <span className="font-semibold text-orange-600 dark:text-orange-400">{parsedData.length} records</span>.</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm max-h-[400px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                                    <tr>
                                        {parsedData[0] && Object.keys(parsedData[0]).map(k => (
                                            <th key={k} className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-xs bg-slate-50 dark:bg-slate-900/50">{k}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {parsedData.slice(0, 50).map((row, i) => (
                                        <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700 transition-colors">
                                            {Object.values(row).map((v, j) => (
                                                <td key={j} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{v}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {parsedData.length === 0 && <div className="p-8 text-center text-slate-400">No data found in file.</div>}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                            <div className="text-xs text-slate-400">Displaying first 50 rows only</div>
                            <div className="flex items-center gap-3">
                                <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                                <Button variant="primary" onClick={handleImport} disabled={importing}>
                                    {importing ? <div className="flex items-center gap-2"><RefreshCw size={16} className="animate-spin" /> Importing...</div> : <>Confirm Import <ArrowRight size={16} /></>}
                                </Button>
                            </div>
                        </div>

                    </div>
                )}

                {/* Step 4: Complete */}
                {step === 4 && result && (
                    <div className="max-w-md mx-auto text-center py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${result.success ? 'bg-green-100 dark:bg-green-900/30 text-green-500' : 'bg-red-100 dark:bg-red-900/30 text-red-500'}`}>
                            {result.success ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                        </div>
                        <h2 className={`text-2xl font-bold mb-3 ${result.success ? 'text-slate-800 dark:text-slate-100' : 'text-red-700 dark:text-red-300'}`}>
                            {result.success ? 'Import Complete!' : 'Import Failed'}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{result.message}</p>

                        <Button variant="dark" size="lg" onClick={reset} className="w-full">
                            Import Another File
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
