import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, LogIn, Building2, KeyRound } from 'lucide-react';
import api from '../../api';
import useStore from '../../store/useStore';
import { Button } from '../../components';

/**
 * Employee sign-in.
 *
 * Which methods appear is decided by the server, not by this page: an
 * installation may offer a portal password, company single sign-on, an on-prem
 * directory, or several at once. Drawing a button the server cannot honour
 * teaches people the app is broken.
 */
export default function PortalLogin() {
    const [modes, setModes] = useState(null);
    const [method, setMethod] = useState(null);   // 'local' | 'ldap'
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { setAuth } = useStore();

    const finish = (token, user) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setAuth(user);
        navigate('/portal');
    };

    useEffect(() => {
        api.get('/api/portal/auth/modes')
            .then(r => {
                setModes(r.data);
                // One method needs no menu.
                if (r.data.local) setMethod('local');
                else if (r.data.ldap) setMethod('ldap');
            })
            .catch(() => { setModes({ local: true, oidc: false, ldap: false }); setMethod('local'); });

        // Single sign-on comes back through a redirect carrying the token in
        // the fragment — never the query string, which would put a working
        // session token into every access log and Referer header along the way.
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const token = hash.get('token');
        const failure = hash.get('error');
        if (failure) {
            setError(failure);
            window.history.replaceState(null, '', window.location.pathname);
        } else if (token) {
            window.history.replaceState(null, '', window.location.pathname);
            api.get('/api/portal/me', { headers: { Authorization: `Bearer ${token}` } })
                .then(r => finish(token, {
                    username: r.data.employee_code, name: r.data.name, role: 'employee',
                }))
                .catch(() => setError('Signed in, but your profile could not be loaded'));
        }
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = method === 'ldap'
                ? await api.post('/api/portal/auth/ldap', { login: identifier.trim(), password })
                : await api.post('/api/portal/login', {
                    employee_code: identifier.trim(), password,
                });
            finish(res.data.token, res.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const ldap = method === 'ldap';

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 p-4">
            <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-orange-100 dark:border-slate-700 p-8">
                <div className="flex flex-col items-center mb-6">
                    <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-2xl text-orange-600 dark:text-orange-300 mb-3">
                        <Fingerprint size={28} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employee Portal</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">NeevTime self-service</p>
                </div>

                {modes?.oidc && (
                    <>
                        {/* A full page load, not a fetch: the identity provider
                            has to own the browser to show its own sign-in and
                            whatever second factor the company requires. */}
                        <a href="/api/portal/auth/oidc/start" className="block">
                            <Button variant="dark" size="lg" icon={Building2} className="w-full">
                                Sign in with your company account
                            </Button>
                        </a>
                        {(modes.local || modes.ldap) && (
                            <div className="flex items-center gap-3 my-5">
                                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                                <span className="text-xs text-slate-400">or</span>
                                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                            </div>
                        )}
                    </>
                )}

                {/* Only when both password methods exist. One of them needs no
                    choice, and asking for one is a question with a single
                    answer. */}
                {modes?.local && modes?.ldap && (
                    <div className="flex gap-2 mb-4 text-xs font-semibold">
                        {[['local', 'Employee code'], ['ldap', 'Company username']].map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => { setMethod(id); setError(''); }}
                                className={`flex-1 rounded-lg px-3 py-2 border ${method === id
                                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                {(modes?.local || modes?.ldap) && (
                    <form onSubmit={submit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                {ldap ? 'Company username' : 'Employee Code'}
                            </label>
                            <input
                                type="text"
                                value={identifier}
                                onChange={e => setIdentifier(e.target.value)}
                                className="field"
                                placeholder={ldap ? 'name@company.com' : 'e.g. EMP001'}
                                autoComplete="username"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                {ldap ? 'Company password' : 'Password'}
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="field"
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 rounded-lg px-3 py-2">{error}</div>
                        )}

                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            icon={ldap ? KeyRound : LogIn}
                            disabled={loading}
                            className="w-full"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                )}

                {/* Shown to everyone, deliberately. A misconfigured sign-on is
                    invisible to the administrator who set it up and obvious to
                    the employee who cannot get in. */}
                {modes?.problems?.length > 0 && (
                    <div className="mt-4 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                        {modes.problems.map((p, i) => <p key={i}>{p}</p>)}
                    </div>
                )}

                {error && !modes?.local && !modes?.ldap && (
                    <div className="mt-4 text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 rounded-lg px-3 py-2">{error}</div>
                )}

                <p className="text-center text-xs text-slate-400 mt-6">
                    Admin or HR? <Link to="/login" className="text-orange-600 font-semibold hover:underline">Sign in here</Link>
                </p>
            </div>
        </div>
    );
}
