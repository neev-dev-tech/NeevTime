import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Send } from 'lucide-react';
import axios from 'axios';
import { Button } from '../components';

export default function ForgotPassword() {
    const [username, setUsername] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);
        setLoading(true);
        try {
            const res = await axios.post('/api/forgot-password', { username: username.trim() });
            setMessage({ type: 'success', text: res.data.message });
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Request failed' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-4">
            <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-orange-100 dark:border-slate-700 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-2xl text-orange-600 dark:text-orange-300 mb-3">
                        <KeyRound size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Forgot Password</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 text-center">Enter your username and we'll email you a reset link</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="field"
                            required
                        />
                    </div>

                    {message && (
                        <div className={`text-sm rounded-lg px-3 py-2 border ${message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'}`}>
                            {message.text}
                        </div>
                    )}

                    <Button type="submit" variant="primary" size="lg" icon={Send} className="w-full" disabled={loading}>
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </Button>
                </form>

                <p className="text-center text-xs text-slate-400 mt-6">
                    <Link to="/login" className="text-orange-600 font-semibold hover:underline">Back to sign in</Link>
                </p>
            </div>
        </div>
    );
}
