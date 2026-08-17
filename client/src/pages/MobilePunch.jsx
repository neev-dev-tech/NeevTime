
import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, CheckCircle, XCircle, RefreshCw, Camera, X } from 'lucide-react';
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
    const [geofencesLoaded, setGeofencesLoaded] = useState(false);
    const [photo, setPhoto] = useState(null);       // data URL, sent with the punch
    const [photoNote, setPhotoNote] = useState(''); // why there is no photo, if there is none
    const [cameraOn, setCameraOn] = useState(false);
    const videoRef = React.useRef(null);
    const streamRef = React.useRef(null);

    /**
     * Open the front camera in the page.
     *
     * A file input with capture="user" was the first attempt. On a phone it
     * hands off to the camera app; on a desktop it is simply a file picker
     * asking someone to upload a photo — which is not a selfie at the moment of
     * the punch, it is any image they happen to have. For an anti-buddy-punching
     * feature that distinction is the entire point.
     *
     * getUserMedia needs a secure context. The self-signed certificate counts
     * once accepted, but if it is refused — or there is no camera, or the
     * permission is denied — the file input stays as the fallback, because a
     * punch without a photo still has to be possible.
     */
    const openCamera = async () => {
        setPhotoNote('');
        if (!navigator.mediaDevices?.getUserMedia) {
            setPhotoNote('This browser cannot open the camera here. Use the upload option below.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraOn(true);
            // The element only exists once cameraOn has rendered it.
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
        } catch (err) {
            setPhotoNote(
                err.name === 'NotAllowedError'
                    ? 'Camera permission was refused. Allow it, or use the upload option below.'
                    : 'The camera could not be opened. Use the upload option below.'
            );
        }
    };

    /** Always stop the tracks. A camera left running is a light left on in a room. */
    const closeCamera = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    useEffect(() => closeCamera, []);

    /** Freeze the current frame at 640px — the size the server and the reviewer need. */
    const capture = () => {
        const video = videoRef.current;
        if (!video) return;

        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        setPhoto(canvas.toDataURL('image/jpeg', 0.75));
        closeCamera();
    };

    /**
     * Read the captured image, shrink it, and keep it as a data URL.
     *
     * Shrunk on the phone rather than the server. A modern camera produces
     * 4–8 MB; the point of this image is to recognise a face in a review
     * screen, and 640px does that. Sending the original would fail the server's
     * 2 MB limit and waste a factory worker's mobile data on every punch.
     *
     * A failure here never blocks the punch — it clears the photo and says why.
     */
    const handlePhoto = (file) => {
        setPhotoNote('');
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxSide = 640;
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                // 0.75 keeps a face clearly recognisable at roughly 40-80 KB.
                setPhoto(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.onerror = () => setPhotoNote('That image could not be read. Punching without a photo.');
            img.src = reader.result;
        };
        reader.onerror = () => setPhotoNote('That image could not be read. Punching without a photo.');
        reader.readAsDataURL(file);
    };

    useEffect(() => {
        fetchData();
        // Returns a cleanup that clears the watch; without it the GPS stays
        // awake after the page is closed.
        const stopWatching = startLocationWatch();
        return () => { if (typeof stopWatching === 'function') stopWatching(); };
    }, []);

    const fetchData = async () => {
        try {
            // Fetch Geofences
            const geoRes = await api.get('/api/mobile/geofences');
            setGeofences(geoRes.data);
            setGeofencesLoaded(true);

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

        // Store the position and nothing else.
        //
        // This used to evaluate proximity here, which could never work: the
        // callback is created when the effect runs, and geofences is still []
        // at that moment because fetchData is asynchronous. The closure held
        // that empty array forever, `geofences.length > 0` was false on every
        // fix, and the page stayed on "locating" no matter how quickly the
        // position arrived. It looked exactly like a slow GPS and was not.
        //
        // The evaluation now lives in an effect that watches both, so whichever
        // arrives second triggers it.
        const use = (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setLocation({ latitude, longitude, accuracy });
            setError('');
        };

        // Coarse first, then refine.
        //
        // This asked for a high-accuracy fix with a five-second timeout, which
        // is a GPS lock — outdoors on a phone that is a few seconds, indoors or
        // on a laptop it routinely takes longer than the timeout and then
        // reported an error. The page sat on "locating" and then failed, which
        // is what "GPS is taking too long" looked like.
        //
        // A network-based fix arrives in under a second and is accurate to tens
        // of metres, which is enough to decide a 100 m geofence. The watch below
        // then improves it in the background.
        navigator.geolocation.getCurrentPosition(
            use,
            () => { /* the watch may still succeed; not fatal on its own */ },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
        );

        const watchId = navigator.geolocation.watchPosition(
            use,
            (err) => {
                // Only fatal if nothing has been found at all. A timeout while
                // refining an existing fix is normal and must not throw away a
                // position that is already good enough to punch with.
                setLocation((current) => {
                    if (!current) {
                        setError(err.code === err.PERMISSION_DENIED
                            ? 'Location permission was refused. Allow it and reload.'
                            : 'Your location could not be determined yet. Move somewhere with a clearer view of the sky.');
                        setStatus('error');
                    }
                    return current;
                });
            },
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
        );

        // A watch left running keeps the GPS awake and drains the battery of a
        // phone somebody carries all day.
        return () => navigator.geolocation.clearWatch(watchId);
    };

    // Whichever of the two arrives second decides the status.
    useEffect(() => {
        // No site configured is a different problem from no position, and it
        // belongs to a different person. Without this the page waits on
        // "Locating GPS…" for a fix that will never be usable, and the reader
        // concludes their phone is at fault.
        if (geofencesLoaded && geofences.length === 0) {
            setStatus('no_geofence');
            return;
        }
        if (!location || geofences.length === 0) return;
        checkProximity(location.latitude, location.longitude, geofences);
    }, [location, geofences, geofencesLoaded]);

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
                punch_time: new Date(),
                photo
            });

            if (res.data.success) {
                setStatus('success');
                // The punch succeeded either way; say so if the image did not,
                // rather than letting someone believe one was stored.
                if (res.data.photo_warning) setPhotoNote(res.data.photo_warning);
                setPhoto(null);
                setTimeout(() => { setStatus('ready'); setPhotoNote(''); }, 3000);
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
                        {status === 'no_geofence' ? (
                            <div className="flex flex-col items-center z-10 px-6 text-center">
                                <MapPin className="text-amber-500 mb-2" size={32} />
                                <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                                    No work location set up
                                </span>
                                <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                    Add one under Attendance &rarr; Rule &rarr; Geofences before punching from a phone.
                                </span>
                            </div>
                        ) : status === 'locating' ? (
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

                                {/* Photo at the moment of the punch.
                                    A reviewable image removes most buddy punching without
                                    face matching — which would bring an accuracy claim and a
                                    far heavier consent obligation for biometric data.
                                    Optional on purpose: a camera that fails must not stop
                                    someone clocking in. */}
                                <div className="mb-4">
                                    {photo ? (
                                        <div className="relative">
                                            <img
                                                src={photo}
                                                alt="Photo that will be attached to this punch"
                                                className="w-full rounded-2xl border border-slate-200 dark:border-slate-700"
                                            />
                                            <button
                                                onClick={() => { setPhoto(null); setPhotoNote(''); }}
                                                aria-label="Remove photo"
                                                className="absolute top-2 right-2 rounded-full bg-slate-900/70 p-2 text-white"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : cameraOn ? (
                                        <div className="space-y-2">
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                /* Mirrored, so it behaves like a mirror rather
                                                   than a stranger copying your movements. */
                                                className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 -scale-x-100"
                                            />
                                            <div className="flex gap-2">
                                                <Button variant="primary" onClick={capture} className="flex-1">
                                                    Take photo
                                                </Button>
                                                <Button variant="secondary" onClick={closeCamera}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <button
                                                onClick={openCamera}
                                                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 py-4 text-slate-600 dark:text-slate-300"
                                            >
                                                <Camera size={20} />
                                                <span className="font-medium">Take a selfie (optional)</span>
                                            </button>
                                            {/* Fallback only. Kept because a punch must still be
                                                possible where the camera cannot open — an older
                                                browser, a refused permission, a machine without
                                                one. Deliberately quieter than the camera button:
                                                an uploaded file is any picture someone already
                                                had, which is worth much less as evidence. */}
                                            <label className="block cursor-pointer text-center text-xs text-slate-500 dark:text-slate-400 underline">
                                                or upload a photo instead
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    capture="user"
                                                    className="hidden"
                                                    onChange={(e) => handlePhoto(e.target.files?.[0])}
                                                />
                                            </label>
                                        </div>
                                    )}
                                    {photoNote && (
                                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{photoNote}</p>
                                    )}
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
