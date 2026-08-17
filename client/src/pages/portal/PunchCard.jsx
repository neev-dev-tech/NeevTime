import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Camera, CheckCircle, RefreshCw, X } from 'lucide-react';
import api from '../../api';
import { Button } from '../../components';

/**
 * An employee clocks themselves in or out.
 *
 * The identity comes from the portal token, never from a field on the page.
 * /mobile/punch names the employee in the request body, which is correct for an
 * administrator punching on someone's behalf and would be a hole here — a body
 * field means anyone can punch as anyone.
 *
 * Three things have to be true before the button does anything, and the page
 * says which one is missing rather than failing with "punch failed":
 *
 *   1. the browser gave up a position,
 *   2. an administrator has configured at least one site,
 *   3. the person is standing inside one.
 *
 * The photo is optional by design. A camera that will not open is not a reason
 * to refuse someone their attendance record — the punch is the thing that must
 * not be lost, and the response says plainly whether an image was stored.
 */
const PunchCard = () => {
    const [status, setStatus] = useState(null);   // next_state, geofences_configured
    const [position, setPosition] = useState(null);
    const [locating, setLocating] = useState(true);
    const [locationError, setLocationError] = useState('');
    const [photo, setPhoto] = useState(null);
    const [cameraOn, setCameraOn] = useState(false);
    const [note, setNote] = useState('');
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        api.get('/api/portal/punch-status').then(r => setStatus(r.data)).catch(() => {});

        if (!navigator.geolocation) {
            setLocating(false);
            setLocationError('This browser cannot report a location, so punching is not possible here.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => { setPosition(pos.coords); setLocating(false); },
            (err) => {
                setLocating(false);
                // Distinguish refused from unavailable: one is fixed by the
                // person, the other by moving or waiting.
                setLocationError(err.code === err.PERMISSION_DENIED
                    ? 'Location permission was refused. Allow it and reload to punch.'
                    : 'Your location could not be determined. Move somewhere with a clearer signal.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );

        return closeCamera;
    }, []);

    const openCamera = async () => {
        setNote('');
        if (!navigator.mediaDevices?.getUserMedia) {
            setNote('This browser cannot open the camera. You can still punch without a photo.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 } }, audio: false,
            });
            streamRef.current = stream;
            setCameraOn(true);
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 0);
        } catch (err) {
            setNote(err.name === 'NotAllowedError'
                ? 'Camera permission was refused. You can still punch without a photo.'
                : 'The camera could not be opened. You can still punch without a photo.');
        }
    };

    /** Always stop the tracks — a camera left running is a light left on. */
    const closeCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraOn(false);
    };

    const capture = () => {
        const video = videoRef.current;
        if (!video) return;
        // 640px is what the reviewer needs to recognise a face. A phone camera
        // produces 4-8 MB; sending that on every punch spends someone's mobile
        // data for no gain.
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL('image/jpeg', 0.75));
        closeCamera();
    };

    const punch = async () => {
        if (!position) return;
        setBusy(true);
        setResult(null);
        try {
            const res = await api.post('/api/portal/punch', {
                latitude: position.latitude,
                longitude: position.longitude,
                photo,
            });
            setResult({ ok: true, ...res.data });
            setPhoto(null);
            // Reflect the new state so the button reads correctly straight away.
            const next = await api.get('/api/portal/punch-status');
            setStatus(next.data);
        } catch (err) {
            setResult({
                ok: false,
                message: err.response?.data?.error || 'The punch could not be recorded',
                details: err.response?.data?.details,
            });
        } finally {
            setBusy(false);
        }
    };

    const checkingIn = status?.next_state !== 'check_out';

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                    {checkingIn ? 'Check in' : 'Check out'}
                </h3>
                {status?.last_punch && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Last today: {status.last_punch.punch_state === 'check_in' ? 'in' : 'out'} at{' '}
                        {new Date(status.last_punch.punch_time).toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                )}
            </div>

            {/* Say which precondition is missing, rather than a dead button. */}
            {status && !status.geofences_configured && (
                <p className="text-sm rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-800 dark:text-amber-300">
                    No work location has been set up yet. Ask your administrator to add one —
                    until then punching from a phone is not possible.
                </p>
            )}

            {locating && (
                <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <RefreshCw size={14} className="animate-spin" /> Finding your location…
                </p>
            )}

            {locationError && (
                <p className="text-sm rounded-lg bg-rose-50 dark:bg-rose-900/20 p-3 text-rose-700 dark:text-rose-300">
                    {locationError}
                </p>
            )}

            {position && (
                <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin size={14} />
                    Location found, accurate to about {Math.round(position.accuracy)} m
                </p>
            )}

            {/* Photo — optional, and quieter than the punch itself. */}
            {photo ? (
                <div className="relative">
                    <img src={photo} alt="Photo for this punch"
                         className="w-full rounded-xl border border-slate-200 dark:border-slate-700" />
                    <button onClick={() => setPhoto(null)} aria-label="Remove photo"
                            className="absolute top-2 right-2 rounded-full bg-slate-900/70 p-2 text-white">
                        <X size={14} />
                    </button>
                </div>
            ) : cameraOn ? (
                <div className="space-y-2">
                    <video ref={videoRef} autoPlay playsInline muted
                           className="w-full rounded-xl border border-slate-200 dark:border-slate-700 -scale-x-100" />
                    <div className="flex gap-2">
                        <Button variant="primary" onClick={capture} className="flex-1">Take photo</Button>
                        <Button variant="secondary" onClick={closeCamera}>Cancel</Button>
                    </div>
                </div>
            ) : (
                <button onClick={openCamera}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 py-3 text-sm text-slate-600 dark:text-slate-300">
                    <Camera size={16} /> Take a selfie (optional)
                </button>
            )}

            {note && <p className="text-xs text-amber-700 dark:text-amber-400">{note}</p>}

            <Button
                variant="dark"
                onClick={punch}
                disabled={!position || busy || (status && !status.geofences_configured)}
                className="w-full"
            >
                {busy ? 'Recording…' : checkingIn ? 'Check in now' : 'Check out now'}
            </Button>

            {result && (
                <div className={`rounded-lg p-3 text-sm ${result.ok
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'}`}>
                    {result.ok ? (
                        <>
                            <p className="flex items-center gap-2 font-medium">
                                <CheckCircle size={16} /> {result.message} at {result.location}
                            </p>
                            {/* A punch that stored no image is still a punch, and
                                whoever reviews it later should know why there is
                                nothing to look at. */}
                            {result.photo_warning && (
                                <p className="mt-1 text-xs">No photo was saved: {result.photo_warning}</p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="font-medium">{result.message}</p>
                            {result.details && <p className="mt-1 text-xs">{result.details}</p>}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default PunchCard;
