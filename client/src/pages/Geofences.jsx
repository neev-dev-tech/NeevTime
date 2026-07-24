
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Search, Trash2, Edit2, AlertCircle, CheckCircle, Navigation } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu } from '../components';

const Geofences = () => {
    const [geofences, setGeofences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingGeofence, setEditingGeofence] = useState(null);
    const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radius_meters: 100, address: '' });
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetchGeofences();
    }, []);

    const fetchGeofences = async () => {
        try {
            const res = await api.get('/api/mobile/geofences');
            setGeofences(res.data);
        } catch (err) {
            showToast('error', 'Failed to fetch geofences');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingGeofence) {
                await api.put(`/api/mobile/geofences/${editingGeofence.id}`, form);
                showToast('success', 'Geofence updated successfully');
            } else {
                await api.post('/api/mobile/geofences', form);
                showToast('success', 'Geofence created successfully');
            }
            closeModal();
            fetchGeofences();
        } catch (err) {
            setError(err.response?.data?.error || 'Operation failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this geofence?')) return;
        try {
            await api.delete(`/api/mobile/geofences/${id}`);
            showToast('success', 'Geofence deleted');
            fetchGeofences();
        } catch (err) {
            showToast('error', 'Failed to delete');
        }
    };

    const openModal = (geofence = null) => {
        if (geofence) {
            setEditingGeofence(geofence);
            setForm({
                name: geofence.name,
                latitude: geofence.latitude,
                longitude: geofence.longitude,
                radius_meters: geofence.radius_meters,
                address: geofence.address || ''
            });
        } else {
            setEditingGeofence(null);
            setForm({ name: '', latitude: '', longitude: '', radius_meters: 100, address: '' });
        }
        setShowModal(true);
        setError('');
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingGeofence(null);
    };

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setForm(prev => ({
                    ...prev,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }));
            },
            () => {
                setError('Unable to retrieve your location');
            }
        );
    };

    const filteredGeofences = geofences.filter(g =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (g.address && g.address.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="h-full flex flex-col space-y-6">
            <PageHeader
                icon={MapPin}
                title="Geofence Locations"
                subtitle="Manage GPS boundaries for mobile attendance"
                actions={
                    <>
                        <ExportMenu
                            rows={filteredGeofences}
                            columns={[
                                { key: 'name', label: 'Name' },
                                { key: 'latitude', label: 'Latitude' },
                                { key: 'longitude', label: 'Longitude' },
                                { key: 'radius_meters', label: 'Radius (m)' },
                                { key: 'address', label: 'Address' }
                            ]}
                            filename="geofences"
                            title="Geofence Locations"
                        />
                        <Button icon={Plus} onClick={() => openModal()}>Add Location</Button>
                    </>
                }
            />

            <div className="card-base p-0 flex flex-col flex-1 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search locations..."
                            className="input-base pl-10 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Coordinates</th>
                                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Radius</th>
                                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Address</th>
                                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan="5" className="p-8 text-center text-slate-500">Loading locations...</td></tr>
                            ) : filteredGeofences.length === 0 ? (
                                <tr><td colSpan="5" className="p-8 text-center text-slate-500">No locations found</td></tr>
                            ) : (
                                filteredGeofences.map(fence => (
                                    <tr key={fence.id} className="hover:bg-slate-50 bg-white">
                                        <td className="px-6 py-4 font-medium text-slate-900">{fence.name}</td>
                                        <td className="px-6 py-4 text-slate-600 font-mono text-sm">
                                            {Number(fence.latitude).toFixed(5)}, {Number(fence.longitude).toFixed(5)}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{fence.radius_meters}m</td>
                                        <td className="px-6 py-4 text-slate-600">{fence.address || '-'}</td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <Button variant="ghost" size="sm" icon={Edit2} aria-label="Edit geofence" onClick={() => openModal(fence)} />
                                            <Button variant="danger" size="sm" icon={Trash2} aria-label="Delete geofence" onClick={() => handleDelete(fence.id)} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-white/50 animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">{editingGeofence ? 'Edit Location' : 'Add Location'}</h3>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                                    <AlertCircle size={16} /> {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Location Name</label>
                                    <input
                                        required
                                        className="input-base"
                                        placeholder="e.g. Head Office"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Latitude</label>
                                        <input
                                            required
                                            type="number" step="any"
                                            className="input-base"
                                            placeholder="12.9716"
                                            value={form.latitude}
                                            onChange={e => setForm({ ...form, latitude: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Longitude</label>
                                        <input
                                            required
                                            type="number" step="any"
                                            className="input-base"
                                            placeholder="77.5946"
                                            value={form.longitude}
                                            onChange={e => setForm({ ...form, longitude: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <Button variant="secondary" icon={Navigation} onClick={getCurrentLocation}>
                                    Get Current Location
                                </Button>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Radius (Meters)</label>
                                        <input
                                            type="number"
                                            className="input-base"
                                            value={form.radius_meters}
                                            onChange={e => setForm({ ...form, radius_meters: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address (Optional)</label>
                                    <textarea
                                        className="input-base h-20 resize-none"
                                        placeholder="Full address..."
                                        value={form.address}
                                        onChange={e => setForm({ ...form, address: e.target.value })}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                    <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                                    <Button type="submit">{editingGeofence ? 'Update' : 'Create'}</Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-white z-50 animate-in slide-in-from-bottom-5 ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span>{toast.message}</span>
                </div>
            )}
        </div>
    );
};

export default Geofences;
