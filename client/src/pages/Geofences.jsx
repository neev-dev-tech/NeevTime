
import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Search, Trash2, Edit2, AlertCircle, CheckCircle, Navigation, RefreshCw } from 'lucide-react';
import api from '../api';
import { Button, PageHeader, ExportMenu } from '../components';
import Modal from '../components/Modal';

const Geofences = () => {
    const [geofences, setGeofences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingGeofence, setEditingGeofence] = useState(null);
    const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radius_meters: 100, address: '' });
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState(null);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        fetchGeofences();
    }, []);

    const fetchGeofences = async () => {
        try {
            setLoadError(null);
            const res = await api.get('/api/mobile/geofences');
            setGeofences(res.data);
        } catch (err) {
            showToast('error', 'Failed to fetch geofences');
            setLoadError(err.response?.data?.error || 'Failed to fetch geofences');
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
        String(g.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(g.address ?? '').toLowerCase().includes(searchTerm.toLowerCase())
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
                        <Button variant="successSolid" icon={Plus} onClick={() => openModal()}>Add Location</Button>
                    </>
                }
            />

            <div className="card-base !p-0 flex flex-col flex-1 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex gap-4 bg-slate-50/70 dark:bg-slate-900/50">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search locations..."
                            className="input-base pl-10 bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-6 space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : loadError ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load locations</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{loadError}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchGeofences}>Try again</Button>
                    </div>
                ) : filteredGeofences.length === 0 ? (
                    <div className="py-16 text-center">
                        <MapPin size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            {searchTerm ? 'No matching locations' : 'No locations yet'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {searchTerm
                                ? 'No geofence matches that name or address.'
                                : 'Add a geofence to limit mobile punches to a GPS boundary.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50/70 dark:bg-slate-900/50 text-[10px] uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 sticky top-0 z-10">
                                <tr>
                                    <th className="px-5 py-3 font-bold w-12">#</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Name</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Coordinates</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Radius</th>
                                    <th className="px-5 py-3 font-bold whitespace-nowrap">Address</th>
                                    <th className="px-5 py-3 font-bold text-right whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {filteredGeofences.map((fence, idx) => (
                                    <tr key={fence.id} className="hover:bg-orange-50/50 dark:hover:bg-slate-700/40 transition-colors">
                                        <td className="px-5 py-3 text-slate-400 dark:text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">{fence.name || '—'}</td>
                                        <td className="px-5 py-3 font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold whitespace-nowrap">
                                            {Number(fence.latitude).toFixed(5)}, {Number(fence.longitude).toFixed(5)}
                                        </td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{fence.radius_meters}m</td>
                                        <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{fence.address || '—'}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                <div className="dv-quiet">
                                                    <Button variant="ghost" size="sm" icon={Edit2} aria-label="Edit geofence" onClick={() => openModal(fence)} />
                                                    <Button variant="danger" size="sm" icon={Trash2} aria-label="Delete geofence" onClick={() => handleDelete(fence.id)} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {!loading && !loadError && filteredGeofences.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {filteredGeofences.length} location{filteredGeofences.length === 1 ? '' : 's'}
                    </div>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={closeModal}
                title={editingGeofence ? 'Edit Location' : 'Add Location'}
            >

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Location Name</label>
                        <input
                            required
                            className="input-base dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                            placeholder="e.g. Head Office"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Latitude</label>
                            <input
                                required
                                type="number" step="any"
                                className="input-base dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                placeholder="12.9716"
                                value={form.latitude}
                                onChange={e => setForm({ ...form, latitude: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Longitude</label>
                            <input
                                required
                                type="number" step="any"
                                className="input-base dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
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
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Radius (Meters)</label>
                            <input
                                type="number"
                                className="input-base dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                                value={form.radius_meters}
                                onChange={e => setForm({ ...form, radius_meters: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address (Optional)</label>
                        <textarea
                            className="input-base h-20 resize-none dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Full address..."
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-slate-700">
                        <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                        <Button type="submit">{editingGeofence ? 'Update' : 'Create'}</Button>
                    </div>
                </form>
            </Modal>

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
