import React, { useState } from 'react';
import api from '../api';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '../components';

const IMPORT_TYPES = [
    { id: 'employees', label: 'Employee Master', description: 'Import employee details, codes, and departments', endpoint: '/api/employees/import', templateColumns: ['employee_code', 'name', 'department_id'] },
    { id: 'shifts', label: 'Shift Assignment', description: 'Assign shifts to employees via bulk upload', endpoint: '/api/roster/import', templateColumns: ['employee_code', 'shift_id', 'effective_from'] },
    { id: 'holidays', label: 'Holidays', description: 'Upload annual holiday calendar list', endpoint: '/api/holidays/import', templateColumns: ['name', 'date', 'is_optional'] },
];

const STEP_LABELS = ['Select Type', 'Upload File', 'Preview', 'Complete'];

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
            // Report what the server actually wrote, not how many rows were sent —
            // rows can be skipped for validation reasons and the user needs to know.
            const imported = res.data?.imported ?? res.data?.count ?? parsedData.length;
            const skipped = res.data?.skipped ?? 0;
            setResult({
                success: true,
                message: skipped
                    ? `Imported ${imported} of ${parsedData.length} records. ${skipped} skipped.`
                    : `Successfully imported ${imported} records.`,
                errors: res.data?.errors || []
            });
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
            <div className="relative grid grid-cols-4 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm shadow-sm">
                {/* Connector Line */}
                <div className="absolute top-[36px] left-[12.5%] right-[12.5%] h-1 bg-slate-100 dark:bg-slate-700 rounded-full" />
                <div
                    className="absolute top-[36px] left-[12.5%] h-1 bg-orange-500 dark:bg-orange-500 rounded-full transition-ui duration-500"
                    style={{ width: `calc(75% * ${(step - 1) / 3})` }}
                />

                {STEP_LABELS.map((label, i) => (
                    <div key={i} className="relative z-10 flex flex-col items-center gap-2 px-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-ui shadow-sm backdrop-blur-sm border ${step > i + 1
                            ? 'bg-emerald-500 text-white border-transparent'
                            : step === i + 1
                                ? 'bg-orange-600 text-white border-transparent scale-110'
                                : 'bg-white/80 dark:bg-slate-900/70 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                            }`}>
                            {step > i + 1 ? <CheckCircle size={18} /> : i + 1}
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.09em] text-center ${step === i + 1
                            ? 'text-orange-600 dark:text-orange-400'
                            : step > i + 1
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}>
                            {label}
                        </span>
                    </div>
                ))}
            </div>

            <div className="card-base !p-8 min-h-[400px]">
                {/* Step 1: Select Type */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">What would you like to import?</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {IMPORT_TYPES.map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => { setImportType(type.id); setStep(2); }}
                                    className="flex flex-col text-left p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-md hover:bg-orange-50/40 dark:hover:bg-slate-700/60 transition-ui group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <FileSpreadsheet size={24} />
                                    </div>
                                    <div className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-1">{type.label}</div>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{type.description}</p>

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
                            <p className="text-slate-600 dark:text-slate-300 mt-1">
                                Importing: <span className="font-semibold text-orange-600 dark:text-orange-400">{IMPORT_TYPES.find(t => t.id === importType)?.label}</span>
                            </p>
                        </div>

                        <div className="relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm p-12 text-center transition-ui group cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50/40 dark:hover:bg-slate-700/50">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800/70 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                <Upload size={30} />
                            </div>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Click to upload or drag and drop</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">CSV files only (Max 5MB)</p>
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
                                <p className="text-slate-600 dark:text-slate-300 mt-1">
                                    Review your data before importing. Found <span className="font-semibold text-orange-600 dark:text-orange-400">{parsedData.length} records</span>.
                                </p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 overflow-hidden shadow-sm">
                            {parsedData.length === 0 ? (
                                <div className="py-16 text-center">
                                    <FileSpreadsheet size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No rows found in this file</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        The file needs a header row followed by at least one data row.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-[400px] overflow-auto custom-scrollbar">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-3 font-bold w-12 bg-slate-50 dark:bg-slate-900">#</th>
                                                    {parsedData[0] && Object.keys(parsedData[0]).map(k => (
                                                        <th key={k} className="px-4 py-3 font-bold whitespace-nowrap bg-slate-50 dark:bg-slate-900">{k}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {parsedData.slice(0, 50).map((row, i) => (
                                                    <tr key={i} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                                        <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}</td>
                                                        {Object.values(row).map((v, j) => (
                                                            <td key={j} className="px-4 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                                {v === '' || v === null || v === undefined ? '—' : v}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                                        Showing {Math.min(50, parsedData.length)} of {parsedData.length} row{parsedData.length === 1 ? '' : 's'}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Displaying first 50 rows only</div>
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
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border ${result.success
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800'
                            }`}>
                            {result.success ? <CheckCircle size={40} /> : <AlertCircle size={40} />}
                        </div>
                        <h2 className={`text-2xl font-bold mb-3 ${result.success ? 'text-slate-800 dark:text-slate-100' : 'text-rose-700 dark:text-rose-300'}`}>
                            {result.success ? 'Import Complete!' : 'Import Failed'}
                        </h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">{result.message}</p>

                        {result.errors?.length > 0 && (
                            <div className="mb-8 text-left rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 max-h-52 overflow-y-auto custom-scrollbar">
                                <p className="text-xs font-bold uppercase tracking-[0.09em] text-amber-800 dark:text-amber-300 mb-2">
                                    Skipped rows
                                </p>
                                <ul className="space-y-1">
                                    {result.errors.map((line, i) => (
                                        <li key={i} className="text-xs text-amber-800 dark:text-amber-200 font-mono">{line}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <Button variant="dark" size="lg" onClick={reset} className="w-full">
                            Import Another File
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
