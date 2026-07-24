import React, { useState, useEffect } from 'react';
import { Database, FileCode, Image, ArrowRightLeft, FileX, Activity, AlertCircle, Upload as UploadIcon, RefreshCw } from 'lucide-react';
import api from '../api';
import { Button, ExportMenu } from '../components';

export default function DeviceData() {
    const [activeSection, setActiveSection] = useState('work-code');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const dataSections = [
        { id: 'work-code', label: 'Work Code', icon: FileCode, group: 'Data' },
        { id: 'bio-template', label: 'Bio-Template', icon: Database, group: 'Data' },
        { id: 'bio-photo', label: 'Bio-Photo', icon: Image, group: 'Data' },
        { id: 'transaction', label: 'Transaction', icon: ArrowRightLeft, group: 'Data' },
        { id: 'unregistered', label: 'Unregistered Transactions', icon: FileX, group: 'Data' },
        { id: 'operation-log', label: 'Operation Log', icon: Activity, group: 'Log' },
        { id: 'error-log', label: 'Error Log', icon: AlertCircle, group: 'Log' },
        { id: 'upload-log', label: 'Upload Log', icon: UploadIcon, group: 'Log' },
    ];

    useEffect(() => {
        fetchData();
    }, [activeSection]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/api/devices/data/${activeSection}`);
            setData(response.data || []);
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    const groupedSections = dataSections.reduce((acc, section) => {
        if (!acc[section.group]) acc[section.group] = [];
        acc[section.group].push(section);
        return acc;
    }, {});

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-140px)] gap-6">
            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-charcoal text-white rounded-2xl overflow-hidden shadow-lg flex-shrink-0">
                {Object.entries(groupedSections).map(([groupName, sections], groupIdx) => (
                    <div key={groupIdx} className="border-b border-gray-700 last:border-0">
                        <div className="px-4 py-3 bg-gray-800/50 flex items-center gap-2">
                            <Database size={16} className="text-gray-400" />
                            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300">{groupName}</h3>
                        </div>
                        <nav className="py-2">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`w-full px-4 py-3 text-left text-sm transition-all flex items-center gap-3 ${activeSection === section.id
                                            ? 'bg-white/10 text-white font-medium border-l-4 border-saffron'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    <section.icon size={16} />
                                    {section.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                ))}
            </aside>

            {/* Main Content */}
            <main className="flex-1 card-base p-6 overflow-auto">
                <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-2xl font-bold text-charcoal mb-2">
                            {dataSections.find(s => s.id === activeSection)?.label}
                        </h2>
                        <p className="text-slate-grey text-sm">
                            View and manage {dataSections.find(s => s.id === activeSection)?.label.toLowerCase()} records
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={fetchData}>Refresh</Button>
                        <ExportMenu
                            rows={data}
                            filename={`device_${activeSection}`}
                            title={dataSections.find(s => s.id === activeSection)?.label}
                            mapRow={(item) => ({
                                ID: item.id ?? '',
                                Details: item.details || item.description || '',
                                Timestamp: item.timestamp ? new Date(item.timestamp).toLocaleString() : ''
                            })}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-saffron mx-auto mb-4"></div>
                            <p className="text-slate-grey">Loading data...</p>
                        </div>
                    </div>
                ) : data.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <Database size={48} className="mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-bold text-charcoal mb-2">No Data Available</h3>
                        <p className="text-slate-grey text-sm">
                            There are no {dataSections.find(s => s.id === activeSection)?.label.toLowerCase()} records to display.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-sm">
                            <thead className="bg-orange-50/50 text-charcoal font-semibold">
                                <tr>
                                    <th className="px-4 py-3 text-left border-b border-gray-100">#</th>
                                    <th className="px-4 py-3 text-left border-b border-gray-100">ID</th>
                                    <th className="px-4 py-3 text-left border-b border-gray-100">Details</th>
                                    <th className="px-4 py-3 text-left border-b border-gray-100">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {data.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-cream-50 transition-colors">
                                        <td className="px-4 py-3 text-slate-grey">{idx + 1}</td>
                                        <td className="px-4 py-3 font-mono text-saffron font-medium">{item.id || '-'}</td>
                                        <td className="px-4 py-3 text-slate-grey">{item.details || item.description || '-'}</td>
                                        <td className="px-4 py-3 text-slate-grey font-mono text-xs">
                                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
