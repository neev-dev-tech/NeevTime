
import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import api from '../api';
import { Button, PageHeader } from '../components';

const MobilePunch = () => {
    const [location, setLocation] = useState(null); // { lat, lng }
    const [error, setError] = useState('');
    const [status, setStatus] = useState('locating'); // locating, ready, success, error
    const [geofences, setGeofences] = useState([]);
    const [nearestFence, setNearestFence] = useState(null);
    const [distance, setDistance] = useState(null);
    const [user, setUser] = useState(null); // Current user/employee
    const [employees, setEmployees] = useState([]); // For Admin simulation
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(''); // For simulation

    useEffect(() => {
        fetchData();
        startLocationWatch();
    }, []);

    const fetchData = async () => {
        try {
            // Fetch Geofences
            const geoRes = await api.get('/api/mobile/geofences');
            setGeofences(geoRes.data);

            // Fetch Current User (Mock/Real) - For now, if admin, we allow selecting employee
            // In a real app, we'd hit /api/auth/me or similar
            // Let's allow selecting an employee for demo purposes
            const empRes = await api.get('/api/employees');
            setEmployees(empRes.data);
            if (empRes.data.length > 0) {
                setSelectedEmployeeId(empRes.data[0].id);
            }

        } catch (err) {
            console.error(err);
        }
    };

    const startLocationWatch = () => {
        if (!navigator.geolocation) {
            setError('Geolocation not supported');
            setStatus('error');
            return;
        }

        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setLocation({ latitude, longitude });
                setError('');

                // If we have geofences, find the nearest one
                if (geofences.length > 0) {
                    checkProximity(latitude, longitude, geofences);
                }
            },
            (err) => {
                setError(err.message);
                setStatus('error');
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );
    };

    const checkProximity = (lat, lng, fences) => {
        let minInfo = null;
        let minDist = Infinity;

        fences.forEach(fence => {
            const d = getDistanceFromLatLonInMeters(lat, lng, fence.latitude, fence.longitude);
            if (d < minDist) {
                minDist = d;
                minInfo = fence;
            }
        });

        setNearestFence(minInfo);
        setDistance(minDist);

        if (minInfo && minDist <= minInfo.radius_meters) {
            setStatus('ready');
        } else {
            setStatus('all_good_but_far'); // Custom internal state
        }
    };

    const handlePunch = async () => {
        if (!location || !selectedEmployeeId) return;

        try {
            setStatus('punching');
            const res = await api.post('/api/mobile/punch', {
                employee_id: selectedEmployeeId,
                latitude: location.latitude,
                longitude: location.longitude,
                punch_time: new Date()
            });

            if (res.data.success) {
                setStatus('success');
                setTimeout(() => setStatus('ready'), 3000); // Reset after 3s
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Punch Failed');
            setStatus('error'); // Go to error state
        }
    };

    // Helper: Haversine
    function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
        var R = 6371e3; // Radius of the earth in m
        var dLat = deg2rad(lat2 - lat1);  // deg2rad below
        var dLon = deg2rad(lon2 - lon1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
            ;
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c; // Distance in m
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180)
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900/50">
            <PageHeader
                icon={MapPin}
                title="Mobile Punch"
                subtitle="GPS geofenced attendance punch"
            />
            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-full max-w-md bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-3xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">

                    {/* Location panel */}
                    <div className="h-48 bg-slate-50/70 dark:bg-slate-900/50 relative flex items-center justify-center border-b border-slate-100 dark:border-slate-700">
                        <div className="absolute inset-0 bg-saffron-gradient opacity-10"></div>
                        {status === 'locating' ? (
                            <div className="flex flex-col items-center z-10">
                                <Navigation className="text-orange-500 animate-spin mb-2" size={32} />
                                <span className="text-orange-600 dark:text-orange-400 font-semibold text-sm">Locating GPS…</span>
                                <div className="mt-3 h-2 w-32 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                            </div>
                        ) : location ? (
                            <div className="flex flex-col items-center z-10">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-800 ${status === 'ready' ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}>
                                    <MapPin className="text-white" size={32} />
                                </div>
                                <div className="mt-2 text-center">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{nearestFence?.name || '—'}</p>
                                    <p className={`text-sm font-semibold tabular-nums ${status === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {distance != null ? `${Math.round(distance)}m away` : '—'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center z-10 text-center px-6">
                                <XCircle size={36} className="text-rose-400 mb-2" />
                                <p className="font-bold text-slate-800 dark:text-slate-100">GPS access denied</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Allow location access to punch in.</p>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <div className="mb-6">
                            <label className="block text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 mb-2">
                                Simulate Employee (Admin)
                            </label>
                            <select
                                className="input-base w-full"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            >
                                {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>)}
                            </select>
                            {employees.length === 0 && (
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No employees available yet.</p>
                            )}
                        </div>

                        {status === 'success' ? (
                            <div className="text-center py-8 animate-fade-in">
                                <CheckCircle className="mx-auto text-emerald-500 mb-4" size={64} />
                                <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Punched In</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Attendance recorded successfully.</p>
                            </div>
                        ) : status === 'error' ? (
                            <div className="text-center py-6 animate-fade-in">
                                <XCircle className="mx-auto text-rose-400 mb-4" size={48} />
                                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Punch failed</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error || 'Something went wrong.'}</p>
                                <Button variant="secondary" icon={RefreshCw} onClick={() => setStatus('ready')} className="w-full">
                                    Try again
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-sm">
                                    <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                                        <MapPin size={16} className="text-orange-500" /> Location required
                                    </p>
                                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                                        You must be within <span className="tabular-nums font-semibold">{nearestFence?.radius_meters || 100}m</span> of an office location.
                                    </p>
                                </div>

                                {/* Deliberate gradient CTA — the one loud element on the page */}
                                <button
                                    onClick={handlePunch}
                                    disabled={status !== 'ready' || !location}
                                    className={`
                                    w-full py-4 rounded-2xl font-bold text-lg shadow-lg transform transition-ui active:scale-95
                                    flex items-center justify-center gap-2
                                    ${status === 'ready'
                                            ? 'bg-saffron-gradient text-white hover:shadow-orange-200 dark:hover:shadow-orange-900/40'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'}
                                `}
                                >
                                    {status === 'punching' ? (
                                        <>
                                            <RefreshCw className="animate-spin" /> Processing…
                                        </>
                                    ) : 'Tap to Punch In'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobilePunch;
