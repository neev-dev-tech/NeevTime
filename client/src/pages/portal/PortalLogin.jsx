import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, LogIn } from 'lucide-react';
import api from '../../api';
import useStore from '../../store/useStore';

export default function PortalLogin() {
    const [employeeCode, setEmployeeCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { setAuth } = useStore();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/api/portal/login', {
                employee_code: employeeCode.trim(),
                password
            });
            const { token, user } = res.data;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setAuth(user);
            navigate('/portal');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-orange-100 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 rounded-2xl text-orange-600 mb-3">
                        <Fingerprint size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800">Employee Portal</h1>
                    <p className="text-sm text-slate-500 mt-1">NeevTime self-service</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Employee Code</label>
                        <input
                            type="text"
                            value={employeeCode}
                            onChange={e => setEmployeeCode(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            placeholder="e.g. EMP001"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
                            required
                        />
                    </div>

                    {error && (
                        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
                    >
                        <LogIn size={16} />
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-xs text-slate-400 mt-6">
                    Admin or HR? <Link to="/login" className="text-orange-600 font-semibold hover:underline">Sign in here</Link>
                </p>
            </div>
        </div>
    );
}
