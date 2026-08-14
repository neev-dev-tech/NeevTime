import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { LockKeyhole, Check } from 'lucide-react';
import axios from 'axios';
import { Button } from '../components';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const uid = searchParams.get('uid');
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        if (password !== confirm) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/reset-password', { uid, token, password });
            setMessage({ type: 'success', text: 'Password updated — redirecting to sign in...' });
            setTimeout(() => navigate('/login'), 1500);
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Reset failed' });
        } finally {
            setLoading(false);
        }
    };

    if (!uid || !token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
                <div className="text-center">
                    <p className="text-slate-600 dark:text-slate-400 mb-3">Invalid reset link.</p>
                    <Link to="/forgot-password" className="text-orange-600 font-semibold hover:underline">Request a new one</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-4">
            <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-orange-100 dark:border-slate-700 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-2xl text-orange-600 dark:text-orange-300 mb-3">
                        <LockKeyhole size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Set New Password</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">New Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6}
                            className="field" required />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Confirm Password</label>
                        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={6}
                            className="field" required />
                    </div>

                    {message && (
                        <div className={`text-sm rounded-lg px-3 py-2 border ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'}`}>
                            {message.text}
                        </div>
                    )}

                    <Button type="submit" variant="primary" size="lg" icon={Check} className="w-full" disabled={loading}>
                        {loading ? 'Saving...' : 'Update Password'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
