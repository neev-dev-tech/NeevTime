import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api';
import { ListPage, ListSearch, ListIconButton } from '../components';
import { SETTINGS_SECTIONS, SETTINGS_AREAS } from '../config/settingsMeta';

/**
 * Settings home: every section in one place, with what it is set to now.
 *
 * Each row carries a live one-line status computed from the saved values
 * ("Email: not configured", "Backups: off"), so an administrator sees what
 * needs attention without opening each section in turn.
 */
export default function SettingsHome() {
    const [values, setValues] = useState(null);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        api.get('/api/settings')
            .then(res => {
                const flat = {};
                Object.entries(res.data || {}).forEach(([cat, fields]) => {
                    flat[cat] = Object.fromEntries(Object.entries(fields).map(([k, c]) => [k, c.value]));
                });
                setValues(flat);
            })
            .catch(() => setValues({}))
            .finally(() => setLoading(false));
    };
    useEffect(load, []);

    const q = query.trim().toLowerCase();
    const matches = (s) => !q || `${s.label} ${s.description} ${s.area}`.toLowerCase().includes(q);
    const needsAttention = values
        ? SETTINGS_SECTIONS.filter(s => { const st = s.status?.(values[s.id] || {}); return st && typeof st === 'object' && st.warn; })
        : [];

    return (
        <ListPage
            title="Settings"
            toolbar={
                <>
                    <ListSearch label="Search settings" placeholder="Search settings…" value={query} onChange={setQuery} />
                    {needsAttention.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-amber-800 dark:text-amber-300">
                            <AlertTriangle size={14} /> {needsAttention.length} section{needsAttention.length === 1 ? '' : 's'} need attention
                        </span>
                    )}
                    <div className="ml-auto"><ListIconButton label="Refresh" icon={RefreshCw} onClick={load} disabled={loading} spin={loading} /></div>
                </>
            }
        >
            {SETTINGS_AREAS.map(area => {
                const sections = SETTINGS_SECTIONS.filter(s => s.area === area && matches(s));
                if (!sections.length) return null;
                return (
                    <section key={area} className="border-b border-slate-200 dark:border-slate-800">
                        <h2 className="px-4 sm:px-6 pt-5 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400">{area}</h2>
                        <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-2 px-2 sm:px-4 pb-4">
                            {sections.map(s => {
                                const Icon = s.icon;
                                const st = values ? s.status?.(values[s.id] || {}) : null;
                                const warn = st && typeof st === 'object' ? st.warn : null;
                                return (
                                    <li key={s.id}>
                                        <Link to={`/settings/${s.id}`} className="group flex items-start gap-3 px-2 sm:px-3 py-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                            <span className="grid place-items-center w-9 h-9 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 shrink-0">
                                                <Icon size={17} />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{s.label}</span>
                                                <span className="block text-xs text-slate-600 dark:text-slate-400 leading-snug">{s.description}</span>
                                                {loading && !values ? (
                                                    <span className="block mt-1.5 h-3 w-32 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                                                ) : st ? (
                                                    <span className={`inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium ${warn ? 'text-amber-800 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${warn ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                        {warn || st}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <ChevronRight size={16} className="mt-2 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0" />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </ListPage>
    );
}
