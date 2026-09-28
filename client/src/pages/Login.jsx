import React, { useState } from 'react';
import useBranding from '../hooks/useBranding';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Fingerprint, Clock, Shield, Users } from 'lucide-react';
import loginIllustration from '../assets/login_illustration.png';
import { loadReportSettings } from '../utils/reportSettings';

export default function Login({ setAuth }) {
    const { logo, hasLogo, name } = useBranding();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    // The first-boot admin is signed in with a password it did not choose. When
    // the server flags must_change, the form flips to a set-new-password step
    // instead of entering the app. The password just typed becomes the "current"
    // one, so the operator does not type the bootstrap secret twice.
    const [mustChange, setMustChange] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();

    const enter = (token, user) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setAuth(user);
        // Company + PDF settings for report exports; failure is non-fatal
        loadReportSettings();
        navigate('/');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (busy) return; // a slow network must not let a double-click send two logins
        setError('');
        setBusy(true);
        try {
            const res = await axios.post('/api/login', { username, password });
            const { token, user, must_change } = res.data;
            if (must_change) {
                // Hold the token so the change-password call is authenticated,
                // but do NOT enter the app — that token is refused everywhere
                // except /change-password until the password is replaced.
                localStorage.setItem('token', token);
                setMustChange(true);
                return;
            }
            enter(token, user);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setBusy(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) {
            setError('The two passwords do not match');
            return;
        }
        if (newPassword === password) {
            setError('The new password must be different from the temporary one');
            return;
        }
        setBusy(true);
        try {
            const res = await axios.post(
                '/api/change-password',
                { current_password: password, new_password: newPassword },
                { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            enter(res.data.token, res.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not set the new password');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left Panel - Illustration */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-50 via-cream-50 to-slate-200 dark:from-black dark:via-black dark:to-neutral-900 relative overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-saffron/20 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-slate-300/20 rounded-full blur-3xl"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
                    {/* Illustration */}
                    {/* Raster illustration carries a baked light background, which
                        reads as a bright box on the black theme. Hidden in dark
                        until a neutral asset lands (theme Phase 4). */}
                    <img
                        src={loginIllustration}
                        alt="Attendance Management"
                        className="w-full max-w-lg mb-8 drop-shadow-2xl dark:hidden"
                    />

                    {/* Features List */}
                    <div className="space-y-4 text-center max-w-md">
                        <h2 className="text-2xl font-bold text-charcoal">Smart Attendance Management</h2>
                        <p className="text-slate-grey">Streamline your workforce management with biometric integration and real-time tracking.</p>

                        <div className="flex justify-center gap-8 pt-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-app-surface rounded-xl shadow-lg flex items-center justify-center">
                                    <Fingerprint className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Biometric</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-app-surface rounded-xl shadow-lg flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Real-time</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-app-surface rounded-xl shadow-lg flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Secure</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-app-surface rounded-xl shadow-lg flex items-center justify-center">
                                    <Users className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Team</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-app-surface">
                <div className="w-full max-w-md depth-in">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="mb-4 flex justify-center">
                            {/* A customer logo replaces the product mark here.
                                Fetched from the public branding endpoint, since
                                nobody has a token on this screen yet. */}
                            <img
                                src={hasLogo ? logo : '/vayutime_logo.png?v=5'}
                                alt={name}
                                className="mx-auto object-contain"
                                style={{
                                    height: '160px',
                                    width: 'auto',
                                    maxWidth: '500px',
                                    display: 'block',
                                    objectFit: 'contain'
                                }}
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    // Show text fallback if image fails
                                    const fallback = document.createElement('div');
                                    fallback.className = 'flex items-center justify-center gap-2';
                                    fallback.innerHTML = '<span class="text-5xl font-bold" style="color: #1E293B">Neev</span><span class="text-5xl font-bold" style="color: #0F172A">Time</span>';
                                    e.target.parentElement?.appendChild(fallback);
                                }}
                            />
                        </div>
                        <p className="text-slate-grey text-sm font-medium">
                            {mustChange ? 'Set a new administrator password' : 'Sign in to your account'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl text-center">
                            {error}
                        </div>
                    )}

                    {!mustChange ? (
                    /* Login Form */
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">Username</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="field pl-12 pr-4"
                                    placeholder="Enter your username"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="field pl-12 pr-4"
                                    placeholder="Enter your password"
                                />
                            </div>
                        </div>

                        {/* Session length is set by the Security settings, so there is
                            no "remember me" for the user to choose. */}
                        <div className="flex items-center justify-end text-sm">
                            <a href="/forgot-password" className="text-saffron hover:underline font-medium">Forgot password?</a>
                        </div>

                        <button
                            disabled={busy}
                            className="w-full btn-primary py-3.5 rounded-xl shadow-lg shadow-slate-200 transition-ui hover:scale-[1.02] hover:shadow-xl text-base font-semibold disabled:opacity-60 disabled:hover:scale-100"
                        >
                            {busy ? 'Signing in…' : 'Sign In'}
                        </button>
                    </form>
                    ) : (
                    /* First-sign-in: replace the bootstrap password */
                    <form onSubmit={handleChangePassword} className="space-y-6">
                        <p className="text-sm text-slate-grey -mt-2">
                            This account was created with a temporary password. Choose your own to continue.
                        </p>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">New password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="field pl-12 pr-4"
                                    placeholder="Enter a new password"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">Confirm new password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="field pl-12 pr-4"
                                    placeholder="Re-enter the new password"
                                />
                            </div>
                        </div>

                        <button
                            disabled={busy}
                            className="w-full btn-primary py-3.5 rounded-xl shadow-lg shadow-slate-200 transition-ui hover:scale-[1.02] hover:shadow-xl text-base font-semibold disabled:opacity-60 disabled:hover:scale-100"
                        >
                            {busy ? 'Saving…' : 'Set password & continue'}
                        </button>
                    </form>
                    )}

                </div>
            </div>
        </div>
    );
}
