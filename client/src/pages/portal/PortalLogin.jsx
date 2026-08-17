import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, LogIn, Building2, KeyRound, ArrowLeft } from 'lucide-react';
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
    // signin | activate | forgot | change
    const [view, setView] = useState('signin');
    const [activation, setActivation] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [notice, setNotice] = useState('');
    const [changeToken, setChangeToken] = useState(null);
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
            // A password an administrator typed is a password somebody else
            // knows. The server will refuse everything but this screen until
            // the employee picks their own.
            if (res.data.must_change) {
                setChangeToken(res.data.token);
                setView('change');
                setPassword('');
                setNotice('This password was set for you by HR. Choose your own to continue.');
                return;
            }
            finish(res.data.token, res.data.user);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const activate = async (e) => {
        e.preventDefault();
        setError(''); setNotice(''); setLoading(true);
        try {
            await api.post('/api/portal/activate', {
                employee_code: identifier.trim(),
                code: activation.trim(),
                password: newPassword,
            });
            setView('signin');
            setPassword(''); setNewPassword(''); setActivation('');
            setNotice('Password set. Sign in with it now.');
        } catch (err) {
            setError(err.response?.data?.error || 'Activation failed');
        } finally { setLoading(false); }
    };

    const requestReset = async (e) => {
        e.preventDefault();
        setError(''); setNotice(''); setLoading(true);
        try {
            const res = await api.post('/api/portal/forgot-password', {
                employee_code: identifier.trim(),
            });
            setNotice(res.data.message);
            setView('activate');
        } catch (err) {
            setError(err.response?.data?.error || 'Could not send the email');
        } finally { setLoading(false); }
    };

    const changePassword = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const res = await api.post('/api/portal/change-password',
                { current_password: password, new_password: newPassword },
                { headers: { Authorization: `Bearer ${changeToken}` } });
            const me = await api.get('/api/portal/me',
                { headers: { Authorization: `Bearer ${res.data.token}` } });
            finish(res.data.token, {
                username: me.data.employee_code, name: me.data.name, role: 'employee',
            });
        } catch (err) {
            setError(err.response?.data?.error || 'Could not change the password');
        } finally { setLoading(false); }
    };

    const back = (
        <button type="button" onClick={() => { setView('signin'); setError(''); setNotice(''); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mb-4">
            <ArrowLeft size={12} /> Back to sign in
        </button>
    );

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

                {notice && (
                    <div className="mb-4 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">{notice}</div>
                )}

                {/* Choosing a password: after an activation code from HR or by
                    email, or because HR set one and it must not stay in use. */}
                {(view === 'activate' || view === 'forgot' || view === 'change') && (
                    <form onSubmit={view === 'activate' ? activate : view === 'forgot' ? requestReset : changePassword}
                          className="space-y-4">
                        {view !== 'change' && back}

                        {view !== 'change' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Employee Code</label>
                                <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                                       className="field" placeholder="e.g. INT089" required />
                            </div>
                        )}

                        {view === 'activate' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Activation code</label>
                                <input type="text" value={activation} onChange={e => setActivation(e.target.value.toUpperCase())}
                                       className="field tracking-[0.3em] font-mono" placeholder="XXXXXXXX"
                                       autoCapitalize="characters" required />
                                <p className="text-xs text-slate-400 mt-1">From HR, or the email you were sent. Valid for 24 hours.</p>
                            </div>
                        )}

                        {view === 'change' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Current password</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                       className="field" autoComplete="current-password" required />
                            </div>
                        )}

                        {view !== 'forgot' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                    {view === 'change' ? 'New password' : 'Choose a password'}
                                </label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                       className="field" autoComplete="new-password" required />
                                {/* Said plainly, because the reason people
                                    accept a password step is understanding what
                                    it buys them. */}
                                <p className="text-xs text-slate-400 mt-1">Only you will know this. HR cannot see it.</p>
                            </div>
                        )}

                        {error && (
                            <div className="text-sm text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 rounded-lg px-3 py-2">{error}</div>
                        )}

                        <Button type="submit" variant="primary" size="lg" disabled={loading} className="w-full">
                            {loading ? 'Working...'
                                : view === 'activate' ? 'Set my password'
                                : view === 'forgot' ? 'Email me a code'
                                : 'Save and continue'}
                        </Button>
                    </form>
                )}

                {view === 'signin' && modes?.oidc && (
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
                {view === 'signin' && modes?.local && modes?.ldap && (
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

                {view === 'signin' && (modes?.local || modes?.ldap) && (
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

                {view === 'signin' && modes?.local && (
                    <div className="flex justify-between mt-4 text-xs">
                        <button type="button" onClick={() => { setView('activate'); setError(''); setNotice(''); }}
                                className="text-orange-600 font-semibold hover:underline">
                            First time here?
                        </button>
                        <button type="button" onClick={() => { setView('forgot'); setError(''); setNotice(''); }}
                                className="text-slate-500 hover:underline">
                            Forgot password
                        </button>
                    </div>
                )}

                <p className="text-center text-xs text-slate-400 mt-6">
                    Admin or HR? <Link to="/login" className="text-orange-600 font-semibold hover:underline">Sign in here</Link>
                </p>
            </div>
        </div>
    );
}
