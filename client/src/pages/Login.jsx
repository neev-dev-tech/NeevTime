import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Fingerprint, Clock, Shield, Users } from 'lucide-react';
import loginIllustration from '../assets/login_illustration.png';

export default function Login({ setAuth }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post('/api/login', { username, password });
            const { token, user } = res.data;

            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setAuth(user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    return (
        <div className="min-h-screen flex">
            {/* Left Panel - Illustration */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-50 via-cream-50 to-orange-100 relative overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-30">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-saffron/20 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-300/20 rounded-full blur-3xl"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
                    {/* Illustration */}
                    <img
                        src={loginIllustration}
                        alt="Attendance Management"
                        className="w-full max-w-lg mb-8 drop-shadow-2xl"
                    />

                    {/* Features List */}
                    <div className="space-y-4 text-center max-w-md">
                        <h2 className="text-2xl font-bold text-charcoal">Smart Attendance Management</h2>
                        <p className="text-slate-grey">Streamline your workforce management with biometric integration and real-time tracking.</p>

                        <div className="flex justify-center gap-8 pt-6">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                                    <Fingerprint className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Biometric</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Real-time</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Secure</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 bg-white rounded-xl shadow-lg flex items-center justify-center">
                                    <Users className="w-6 h-6 text-saffron" />
                                </div>
                                <span className="text-xs font-medium text-slate-grey">Team</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="mb-4 flex justify-center">
                            <img
                                src="/vayutime_logo.png?v=5"
                                alt="NeevTime"
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
                                    fallback.innerHTML = '<span class="text-5xl font-bold" style="color: #1E293B">Neev</span><span class="text-5xl font-bold" style="color: #F97316">Time</span>';
                                    e.target.parentElement?.appendChild(fallback);
                                }}
                            />
                        </div>
                        <p className="text-slate-grey text-sm font-medium">Sign in to your account</p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl text-center">
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">Username</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron/50 focus:border-saffron transition-all bg-gray-50/50"
                                    placeholder="Enter your username"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-charcoal">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron/50 focus:border-saffron transition-all bg-gray-50/50"
                                    placeholder="Enter your password"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="rounded border-gray-300 text-saffron focus:ring-saffron" />
                                <span className="text-slate-grey">Remember me</span>
                            </label>
                            <a href="#" className="text-saffron hover:underline font-medium">Forgot password?</a>
                        </div>

                        <button className="w-full btn-primary py-3.5 rounded-xl shadow-lg shadow-orange-200 transition-all hover:scale-[1.02] hover:shadow-xl text-base font-semibold">
                            Sign In
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                        <p className="text-xs text-slate-grey">
                            Demo credentials: <span className="font-mono bg-gray-100 px-2 py-1 rounded">admin / admin</span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
