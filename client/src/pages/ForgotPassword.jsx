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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-orange-100 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 rounded-2xl text-orange-600 mb-3">
                        <KeyRound size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">Forgot Password</h1>
                    <p className="text-sm text-slate-500 mt-1 text-center">Enter your username and we'll email you a reset link</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            required
                        />
                    </div>

                    {message && (
                        <div className={`text-sm rounded-lg px-3 py-2 border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
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
