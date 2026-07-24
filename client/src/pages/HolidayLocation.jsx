import React, { useState, useEffect } from 'react';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, X, Save, Calendar, Globe } from 'lucide-react';
import { useToast, Button, PageHeader, ExportMenu } from '../components';

export default function HolidayLocation() {
    const toast = useToast();
    const [locations, setLocations] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState('locations');

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
            const [locRes, holRes] = await Promise.all([
                api.get('/api/holiday-locations'),
                api.get('/api/holidays')
            ]);
            setLocations(locRes.data || []);
            setHolidays(holRes.data || []);
        } catch (err) {
            console.error('Error fetching data:', err);
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
            case 'national': return 'bg-blue-100 text-blue-800';
            case 'regional': return 'bg-green-100 text-green-800';
            case 'company': return 'bg-purple-100 text-purple-800';
            default: return 'bg-gray-100 text-gray-800';
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
                        <Button
                            icon={Plus}
                            onClick={() => activeTab === 'locations' ? setShowModal(true) : setShowHolidayModal(true)}
                        >
                            {activeTab === 'locations' ? 'Add Location' : 'Add Holiday'}
                        </Button>
                    </>
                }
            />

            {/* Tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setActiveTab('locations')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'locations'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <MapPin size={16} />
                    Locations ({locations.length})
                </button>
                <button
                    onClick={() => setActiveTab('holidays')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'holidays'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Calendar size={16} />
                    Holidays ({holidays.length})
                </button>
            </div>

            {/* Upcoming Holidays Banner */}
            {upcomingHolidays.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                        <Calendar size={16} /> Upcoming Holidays
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {upcomingHolidays.map(h => (
                            <div key={h.id} className="bg-white rounded-lg px-3 py-2 shadow-sm">
                                <div className="font-medium text-sm">{h.name}</div>
                                <div className="text-xs text-gray-500">
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
                <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : activeTab === 'locations' ? (
                /* Locations Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {locations.length === 0 ? (
                        <div className="col-span-full text-center py-8 text-gray-500">
                            No locations defined. Locations help assign region-specific holidays.
                        </div>
                    ) : locations.map(loc => (
                        <div key={loc.id} className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                        <MapPin size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{loc.name}</h3>
                                        <div className="text-xs text-gray-500">
                                            {loc.description || 'No description'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => openEdit(loc)}
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(loc.id)}
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Holidays Table */
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Holiday Name</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Type</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Optional</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {holidays.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                        No holidays defined. Click "Add Holiday" to create one.
                                    </td>
                                </tr>
                            ) : holidays.map(h => (
                                <tr key={h.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{h.name}</div>
                                        {h.description && (
                                            <div className="text-xs text-gray-500">{h.description}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {new Date(h.date).toLocaleDateString('en-US', {
                                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                        })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getHolidayTypeColor(h.holiday_type)}`}>
                                            {h.holiday_type || 'national'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {h.is_optional ? (
                                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">Optional</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Mandatory</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => openHolidayEdit(h)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleHolidayDelete(h.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Location Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">
                                {editingId ? 'Edit Location' : 'Add Location'}
                            </h2>
                            <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="e.g., Head Office, Branch A"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    rows={3}
                                    placeholder="Location details..."
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t">
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
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-lg font-semibold">
                                {editingHolidayId ? 'Edit Holiday' : 'Add Holiday'}
                            </h2>
                            <button onClick={closeHolidayModal} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleHolidaySubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Holiday Name *</label>
                                <input
                                    type="text"
                                    value={holidayForm.name}
                                    onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg"
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
                                        className="w-full px-3 py-2 border rounded-lg"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Type</label>
                                    <select
                                        value={holidayForm.holiday_type}
                                        onChange={e => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg"
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
                                    className="w-full px-3 py-2 border rounded-lg"
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
                            <div className="flex justify-end gap-3 pt-4 border-t">
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
