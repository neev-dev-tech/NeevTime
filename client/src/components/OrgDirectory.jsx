import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import api from '../api';
import { toLocalDateString } from '../utils/dateFormat';

/**
 * Master–detail body for the Organization pages (departments, positions,
 * areas).
 *
 * The old pages were a table of IDs and names: they said a department existed
 * and nothing about it. This lists each unit with its headcount and who is in
 * today, and the selected one shows its numbers, its actions and the people in
 * it, each linking to their profile. The page keeps its own modals and
 * handlers; this only renders the body inside ListPage.
 *
 * `memberOf(item, employee)` decides membership, since each unit links
 * employees differently (department_id, designation text, area_id).
 */

const NON_ATTENDING = ['Absent', 'Weekly Off', 'Holiday', 'On Leave'];

function todayState(row) {
    if (!row) return { label: 'No record', tone: 'bg-slate-300 dark:bg-slate-600' };
    if (row.status === 'On Leave') return { label: 'On leave', tone: 'bg-sky-400' };
    if (row.status === 'Weekly Off' || row.status === 'Holiday') return { label: row.status, tone: 'bg-slate-300 dark:bg-slate-600' };
    if (row.status === 'Absent') return { label: 'Not in', tone: 'bg-slate-300 dark:bg-slate-600' };
    if ((row.late_minutes || 0) > 0) return { label: 'Late', tone: 'bg-amber-400' };
    return { label: 'Present', tone: 'bg-emerald-500' };
}

export default function OrgDirectory({
    items, noun, icon: Icon = Users, memberOf, memberColumn,
    selectedIds, onToggleSelect, onToggleAll,
    detailActions, detailMeta, emptyState, itemDepth, onActiveChange
}) {
    const [employees, setEmployees] = useState([]);
    const [today, setToday] = useState({});
    const [activeId, setActiveId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([
            api.get('/api/employees'),
            api.get('/api/attendance/summary', { params: { date: toLocalDateString() } })
        ]).then(([emps, summary]) => {
            if (cancelled) return;
            if (emps.status === 'fulfilled') {
                setEmployees((emps.value.data || []).filter(e => e.status !== 'resigned' && !e.resignation_date));
            }
            if (summary.status === 'fulfilled') {
                setToday(Object.fromEntries((summary.value.data || []).map(r => [r.employee_code, r])));
            }
        });
        return () => { cancelled = true; };
    }, []);

    // Per-unit people and today's counts, computed once per data change.
    const byItem = useMemo(() => {
        const out = {};
        for (const item of items) {
            const people = employees.filter(e => memberOf(item, e));
            let present = 0, late = 0, notIn = 0;
            for (const p of people) {
                const r = today[p.employee_code];
                if (r && !NON_ATTENDING.includes(r.status)) present += 1;
                if (r && (r.late_minutes || 0) > 0) late += 1;
                if (r && r.status === 'Absent') notIn += 1;
            }
            out[item.id] = { people, present, late, notIn };
        }
        return out;
    }, [items, employees, today, memberOf]);

    // Keep a valid selection as the list is filtered or reloaded.
    useEffect(() => {
        if (!items.some(i => i.id === activeId)) setActiveId(items[0]?.id ?? null);
    }, [items, activeId]);
    useEffect(() => {
        if (onActiveChange) onActiveChange(items.find(i => i.id === activeId) || null);
    }, [activeId, items, onActiveChange]);

    if (items.length === 0) return emptyState;

    const active = items.find(i => i.id === activeId) || items[0];
    const stats = byItem[active.id] || { people: [], present: 0, late: 0, notIn: 0 };
    const allTicked = items.length > 0 && items.every(i => selectedIds.includes(i.id));

    return (
        <div className="grid md:grid-cols-[300px_minmax(0,1fr)] h-full min-h-0">
            {/* List of units */}
            <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
                <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <input
                        type="checkbox"
                        aria-label={`Select all ${noun}s`}
                        checked={allTicked}
                        onChange={e => onToggleAll(e.target.checked)}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400">
                        {items.length} {noun}{items.length === 1 ? '' : 's'}
                    </span>
                </div>
                <ul>
                    {items.map(item => {
                        const s = byItem[item.id] || { people: [], present: 0 };
                        const on = item.id === active.id;
                        return (
                            <li key={item.id} className="relative">
                                {on && <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[rgb(var(--brand))]" />}
                                <div style={itemDepth ? { paddingLeft: 16 + itemDepth(item) * 18 } : undefined}
                                    className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800/70 ${on ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                                    <input
                                        type="checkbox"
                                        aria-label={`Select ${item.name}`}
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => onToggleSelect(item.id)}
                                    />
                                    <button type="button" onClick={() => setActiveId(item.id)} aria-current={on ? 'true' : undefined}
                                        className="flex-1 min-w-0 text-left">
                                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{item.name || '—'}</span>
                                        <span className="block text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                                            {s.people.length} {s.people.length === 1 ? 'person' : 'people'}
                                            {s.people.length > 0 && ` · ${s.present} in today`}
                                        </span>
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* Selected unit */}
            <div className="min-h-0 overflow-y-auto">
                <div className="flex items-start justify-between gap-4 px-4 sm:px-6 pt-5 pb-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="grid place-items-center w-10 h-10 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 shrink-0">
                            <Icon size={19} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate">{active.name}</h2>
                            {detailMeta && <p className="text-[13px] text-slate-600 dark:text-slate-400">{detailMeta(active)}</p>}
                        </div>
                    </div>
                    {detailActions && <div className="flex items-center gap-2 flex-wrap">{detailActions(active)}</div>}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800">
                    {[
                        ['People', stats.people.length],
                        ['Present today', stats.present],
                        ['Late today', stats.late],
                        ['Not in', stats.notIn]
                    ].map(([label, value]) => (
                        <div key={label} className="px-4 sm:px-6 py-3">
                            <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                            <span className="block mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
                        </div>
                    ))}
                </div>

                {stats.people.length === 0 ? (
                    <div className="px-4 sm:px-6 py-12 text-center">
                        <Users size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Nobody in this {noun} yet</p>
                        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">
                            Assign people from the Employees page, or with Transfer there.
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                {['Employee', memberColumn?.label, 'Today'].filter(Boolean).map((h, i, arr) => (
                                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400 ${i === 0 ? 'pl-4 sm:pl-6' : ''} ${i === arr.length - 1 ? 'pr-4 sm:pr-6' : ''}`}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {stats.people.map(p => {
                                const t = todayState(today[p.employee_code]);
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                        <td className="pl-4 sm:pl-6 px-4 py-2.5">
                                            <Link to={`/employees/${p.id}`} className="flex items-center gap-3 min-w-0 group">
                                                <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {(String(p.name || '?').trim()[0] || '?').toUpperCase()}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block font-medium text-slate-900 dark:text-slate-100 truncate group-hover:underline underline-offset-2">{p.name || '—'}</span>
                                                    <span className="block font-mono text-xs text-slate-600 dark:text-slate-400">{p.employee_code}</span>
                                                </span>
                                            </Link>
                                        </td>
                                        {memberColumn && (
                                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{memberColumn.value(p) || '—'}</td>
                                        )}
                                        <td className="px-4 pr-4 sm:pr-6 py-2.5 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-700 dark:text-slate-300">
                                                <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${t.tone}`} />{t.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

OrgDirectory.propTypes = {
    items: PropTypes.array.isRequired,
    noun: PropTypes.string.isRequired,
    icon: PropTypes.elementType,
    memberOf: PropTypes.func.isRequired,
    memberColumn: PropTypes.shape({ label: PropTypes.string, value: PropTypes.func }),
    selectedIds: PropTypes.array.isRequired,
    onToggleSelect: PropTypes.func.isRequired,
    onToggleAll: PropTypes.func.isRequired,
    detailActions: PropTypes.func,
    detailMeta: PropTypes.func,
    emptyState: PropTypes.node,
    /** Indent level for hierarchical lists (areas). */
    itemDepth: PropTypes.func,
    /** Told the selected item, so the page can act on it (e.g. add a child). */
    onActiveChange: PropTypes.func
};
