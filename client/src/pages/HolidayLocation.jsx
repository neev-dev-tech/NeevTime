import React, { useState, useEffect } from 'react';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, X, Save, Calendar, Globe, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function HolidayLocation({ initialTab = 'locations' }) {
    const toast = useToast();
    const [locations, setLocations] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState(initialTab);

    const [form, setForm] = useState({
        name: '',
        description: ''
    });

    const [holidayForm, setHolidayForm] = useState({
        name: '',
        date: '',
        holiday_type: 'national',
        is_optional: false,
        description: ''
    });
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [editingHolidayId, setEditingHolidayId] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setError(null);
            const [locRes, holRes] = await Promise.all([
                api.get('/api/holiday-locations'),
                api.get('/api/holidays')
            ]);
            setLocations(locRes.data || []);
            setHolidays(holRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || 'Could not load holidays and locations');
        } finally {
            setLoading(false);
        }
    };

    // Location CRUD
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/api/holiday-locations/${editingId}`, form);
            } else {
                await api.post('/api/holiday-locations', form);
            }
            fetchData();
            closeModal();
        } catch (err) {
            console.error('Error saving location:', err);
            toast.error('Error saving location');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this location?')) return;
        try {
            await api.delete(`/api/holiday-locations/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting location:', err);
        }
    };

    const openEdit = (location) => {
        setForm({
            name: location.name || '',
            description: location.description || ''
        });
        setEditingId(location.id);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm({ name: '', description: '' });
    };

    // Holiday CRUD
    const handleHolidaySubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingHolidayId) {
                await api.put(`/api/holidays/${editingHolidayId}`, holidayForm);
            } else {
                await api.post('/api/holidays', holidayForm);
            }
            fetchData();
            closeHolidayModal();
        } catch (err) {
            console.error('Error saving holiday:', err);
            toast.error('Error saving holiday');
        }
    };

    const handleHolidayDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this holiday?')) return;
        try {
            await api.delete(`/api/holidays/${id}`);
            fetchData();
        } catch (err) {
            console.error('Error deleting holiday:', err);
        }
    };

    const openHolidayEdit = (holiday) => {
        setHolidayForm({
            name: holiday.name || '',
            date: holiday.date?.split('T')[0] || '',
            holiday_type: holiday.holiday_type || 'national',
            is_optional: holiday.is_optional || false,
            description: holiday.description || ''
        });
        setEditingHolidayId(holiday.id);
        setShowHolidayModal(true);
    };

    const closeHolidayModal = () => {
        setShowHolidayModal(false);
        setEditingHolidayId(null);
        setHolidayForm({ name: '', date: '', holiday_type: 'national', is_optional: false, description: '' });
    };

    const getHolidayTypeColor = (type) => {
        switch (type) {
            case 'national': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            case 'regional': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
            case 'company': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
            default: return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
        }
    };

    const upcomingHolidays = holidays
        .filter(h => new Date(h.date) >= new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={MapPin}
                title="Holidays & Locations"
                subtitle="Regional locations and the holiday calendar attached to them"
                actions={
                    <>
                        {activeTab === 'locations' ? (
                            <ExportMenu
                                rows={locations}
                                columns={[
                                    { key: 'name', label: 'Name' },
                                    { key: 'description', label: 'Description' }
                                ]}
                                filename="holiday-locations"
                                title="Holiday Locations"
                            />
                        ) : (
                            <ExportMenu
                                rows={holidays}
                                columns={[
                                    { key: 'name', label: 'Holiday Name' },
                                    { key: 'date', label: 'Date' },
                                    { key: 'holiday_type', label: 'Type' },
                                    { key: 'is_optional', label: 'Optional' },
                                    { key: 'description', label: 'Description' }
                                ]}
                                filename="holidays"
                                title="Holidays"
                                mapRow={h => ({
                                    ...h,
                                    date: h.date?.split('T')[0] || '',
                                    is_optional: h.is_optional ? 'Yes' : 'No'
                                })}
                            />
                        )}
                        <Button variant="successSolid"
                            icon={Plus}
                            onClick={() => activeTab === 'locations' ? setShowModal(true) : setShowHolidayModal(true)}
                        >
                            {activeTab === 'locations' ? 'Add Location' : 'Add Holiday'}
                        </Button>
                    </>
                }
            />

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setActiveTab('locations')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${activeTab === 'locations'
                        ? 'bg-orange-600 text-white border-transparent shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
                        }`}
                >
                    <MapPin size={13} />
                    Locations ({locations.length})
                </button>
                <button
                    onClick={() => setActiveTab('holidays')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${activeTab === 'holidays'
                        ? 'bg-orange-600 text-white border-transparent shadow-sm'
                        : 'bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'
                        }`}
                >
                    <Calendar size={13} />
                    Holidays ({holidays.length})
                </button>
            </div>

            {/* Upcoming Holidays Banner */}
            {upcomingHolidays.length > 0 && (
                <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                        <Calendar size={13} /> Upcoming Holidays
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {upcomingHolidays.map(h => (
                            <div key={h.id} className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 hover:-translate-y-0.5 transition-transform">
                                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">{h.name || '—'}</div>
                                <div className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                    {new Date(h.date).toLocaleDateString('en-US', {
                                        month: 'short', day: 'numeric', year: 'numeric'
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="card-base !p-0 overflow-hidden">
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                </div>
            ) : error ? (
                <div className="card-base !p-0 overflow-hidden">
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load this page</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                </div>
            ) : activeTab === 'locations' ? (
                /* Locations Grid */
                locations.length === 0 ? (
                    <div className="card-base !p-0 overflow-hidden">
                        <div className="py-16 text-center">
                            <MapPin size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No locations yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Locations let you attach region-specific holidays to the right sites.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {locations.map(loc => (
                                <div key={loc.id} className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:-translate-y-0.5 transition-transform">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl shrink-0">
                                                <MapPin size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{loc.name || '—'}</h3>
                                                <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                                    {loc.description || '—'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={Edit2}
                                                aria-label="Edit"
                                                onClick={() => openEdit(loc)}
                                            />
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                icon={Trash2}
                                                aria-label="Delete"
                                                onClick={() => handleDelete(loc.id)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {locations.length} record{locations.length === 1 ? '' : 's'}
                        </div>
                    </div>
                )
            ) : (
                /* Holidays Table */
                <div className="card-base !p-0 overflow-hidden">
                    {holidays.length === 0 ? (
                        <div className="py-16 text-center">
                            <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No holidays yet</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Add a holiday and it will be excluded from attendance for the assigned locations.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="px-5 py-3 font-bold w-12">#</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Holiday Name</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Date</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Type</th>
                                        <th className="px-5 py-3 font-bold whitespace-nowrap">Optional</th>
                                        <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {holidays.map((h, idx) => (
                                        <tr key={h.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                            <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums align-top">{idx + 1}</td>
                                            <td className="px-5 py-3">
                                                <div className="font-semibold text-slate-800 dark:text-slate-100">{h.name || '—'}</div>
                                                {h.description && (
                                                    <div className="text-xs text-slate-600 dark:text-slate-300">{h.description}</div>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                                {new Date(h.date).toLocaleDateString('en-US', {
                                                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                                })}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getHolidayTypeColor(h.holiday_type)}`}>
                                                    {h.holiday_type || 'national'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                {h.is_optional ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Optional</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Mandatory</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center justify-end">
                                                    <div className="dv-quiet">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            icon={Edit2}
                                                            aria-label="Edit"
                                                            onClick={() => openHolidayEdit(h)}
                                                        />
                                                        <Button
                                                            variant="danger"
                                                            size="sm"
                                                            icon={Trash2}
                                                            aria-label="Delete"
                                                            onClick={() => handleHolidayDelete(h.id)}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {holidays.length > 0 && (
                        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {holidays.length} record{holidays.length === 1 ? '' : 's'}
                        </div>
                    )}
                </div>
            )}

            {/* Location Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <h2 className="text-lg font-semibold">
                                {editingId ? 'Edit Location' : 'Add Location'}
                            </h2>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={closeModal} />
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="field"
                                    placeholder="e.g., Head Office, Branch A"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="field"
                                    rows={3}
                                    placeholder="Location details..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                                <Button type="submit" icon={Save}>
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Holiday Modal */}
            {showHolidayModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md">
                        <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
                            <h2 className="text-lg font-semibold">
                                {editingHolidayId ? 'Edit Holiday' : 'Add Holiday'}
                            </h2>
                            <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={closeHolidayModal} />
                        </div>
                        <form onSubmit={handleHolidaySubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Holiday Name *</label>
                                <input
                                    type="text"
                                    value={holidayForm.name}
                                    onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                                    className="field"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Date *</label>
                                    <input
                                        type="date"
                                        value={holidayForm.date}
                                        onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })}
                                        className="field"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Type</label>
                                    <select
                                        value={holidayForm.holiday_type}
                                        onChange={e => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })}
                                        className="field"
                                    >
                                        <option value="national">National</option>
                                        <option value="regional">Regional</option>
                                        <option value="company">Company</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <input
                                    type="text"
                                    value={holidayForm.description}
                                    onChange={e => setHolidayForm({ ...holidayForm, description: e.target.value })}
                                    className="field"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={holidayForm.is_optional}
                                    onChange={e => setHolidayForm({ ...holidayForm, is_optional: e.target.checked })}
                                    className="w-4 h-4 text-green-600 rounded"
                                />
                                <span className="text-sm">Optional Holiday (Restricted)</span>
                            </label>
                            <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-700">
                                <Button variant="secondary" onClick={closeHolidayModal}>Cancel</Button>
                                <Button type="submit" icon={Save}>
                                    {editingHolidayId ? 'Update' : 'Create'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
