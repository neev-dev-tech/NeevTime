import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { ChevronLeft, ChevronRight, Users, AlertCircle, RefreshCw } from 'lucide-react';
import { Button, ListPage, ListTabs, ListSearch, ListIconButton } from '../components';
import { toLocalDateString } from '../utils/dateFormat';

// DATE columns arrive either as 'YYYY-MM-DD' or as the UTC instant of local
// midnight ('2026-08-31T18:30:00Z' for 1 Sep in IST). Both mean a calendar day;
// read the second in local time so it is not a day early.
const dayOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : toLocalDateString(v));

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Fallback shift colours, used in a fixed order when a shift has none of its own.
const FALLBACK = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#14b8a6'];

const sameDay = (a, b) => a.toDateString() === b.toDateString();

export default function ScheduleCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month');
    const [employees, setEmployees] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [empRes, shiftRes, deptRes, schedRes] = await Promise.all([
                api.get('/api/employees'),
                api.get('/api/shifts'),
                api.get('/api/departments'),
                api.get('/api/schedules/employee')
            ]);
            setEmployees(empRes.data || []);
            setShifts(shiftRes.data || []);
            setDepartments(deptRes.data || []);
            setSchedules(schedRes.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load the schedule');
        } finally {
            setLoading(false);
        }
    };

    // Only real days: a roster runs left to right, so the month grid's leading
    // blank cells (for the weekday the month starts on) meant nothing here.
    const days = useMemo(() => {
        if (viewMode === 'month') {
            const y = currentDate.getFullYear(), m = currentDate.getMonth();
            const n = new Date(y, m + 1, 0).getDate();
            return Array.from({ length: n }, (_, i) => new Date(y, m, i + 1));
        }
        const start = new Date(currentDate);
        start.setDate(currentDate.getDate() - currentDate.getDay());
        return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    }, [currentDate, viewMode]);

    const step = (dir) => {
        const d = new Date(currentDate);
        if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
        else d.setDate(d.getDate() + dir * 7);
        setCurrentDate(d);
    };

    const periodLabel = viewMode === 'month'
        ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
        : `${days[0].getDate()} ${MONTHS[days[0].getMonth()].slice(0, 3)} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()].slice(0, 3)} ${days[6].getFullYear()}`;

    // A shift's own colour when it is distinctive; when several shifts share one
    // (every shift created with the default blue), they get a fixed palette
    // slot instead so they can be told apart in the grid.
    const shiftById = useMemo(() => {
        const uses = {};
        shifts.forEach(s => { if (s.color) uses[s.color.toLowerCase()] = (uses[s.color.toLowerCase()] || 0) + 1; });
        return Object.fromEntries(shifts.map((s, i) => [s.id, {
        ...s, tint: s.color && uses[s.color.toLowerCase()] === 1 ? s.color : FALLBACK[i % FALLBACK.length],
        short: s.code || (s.name || '').slice(0, 3).toUpperCase()
    }]));
    }, [shifts]);

    const scheduleFor = (employeeId, date) => {
        const ds = toLocalDateString(date);
        return schedules.find(s =>
            s.employee_id === employeeId &&
            s.effective_from && ds >= dayOf(s.effective_from) &&
            (!s.effective_to || ds <= dayOf(s.effective_to))
        );
    };

    // Week off comes from the employee's schedule; with no schedule, the
    // weekend is shown as off, as before.
    const cellFor = (emp, date) => {
        const sch = scheduleFor(emp.id, date);
        const dow = date.getDay();
        const offDays = Array.isArray(sch?.week_off_days) ? sch.week_off_days.map(d => String(d).toLowerCase()) : null;
        const isOff = offDays ? offDays.includes(DOW_KEY[dow]) : (dow === 0 || dow === 6);
        if (isOff) return { kind: 'off' };
        if (sch) return { kind: 'shift', shift: shiftById[sch.shift_id], name: sch.shift_name, temporary: sch.is_temporary };
        return { kind: 'none' };
    };

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return employees
            .filter(e => e.status !== 'resigned' && !e.resignation_date)
            .filter(e => !selectedDepartment || e.department_id === parseInt(selectedDepartment, 10))
            .filter(e => !q || String(e.name || '').toLowerCase().includes(q) || String(e.employee_code || '').toLowerCase().includes(q));
    }, [employees, selectedDepartment, query]);

    // Today's picture for the rows on screen.
    const today = new Date();
    const todayCounts = useMemo(() => {
        let on = 0, off = 0, none = 0;
        for (const e of rows) {
            const c = cellFor(e, today);
            if (c.kind === 'shift') on += 1; else if (c.kind === 'off') off += 1; else none += 1;
        }
        return { on, off, none };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, schedules, shiftById]);
    const shiftsInUse = new Set(schedules.map(s => s.shift_id)).size;

    const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;

    // Open with today's column in view when the period includes it.
    const gridRef = useRef(null);
    useEffect(() => {
        const cell = gridRef.current?.querySelector('[data-today="true"]');
        if (cell && gridRef.current) {
            const box = gridRef.current;
            box.scrollLeft = Math.max(0, cell.offsetLeft - box.clientWidth / 2);
        }
    }, [days, rows.length, loading]);

    return (
        <ListPage
            title="Schedule View"
            count={rows.length}
            tabs={
                <ListTabs label="View" value={viewMode} onChange={setViewMode}
                    items={[{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }]} />
            }
            actions={
                <Link to="/schedule/employee" className="inline-flex items-center h-8 px-3 rounded-lg text-[13px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200">
                    Assign schedules
                </Link>
            }
            toolbar={
                <>
                    <div className="flex items-center gap-1">
                        <ListIconButton label={viewMode === 'month' ? 'Previous month' : 'Previous week'} icon={ChevronLeft} onClick={() => step(-1)} />
                        <span className="min-w-[10rem] text-center text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{periodLabel}</span>
                        <ListIconButton label={viewMode === 'month' ? 'Next month' : 'Next week'} icon={ChevronRight} onClick={() => step(1)} />
                        <Button variant="tonal" size="toolbar" onClick={() => setCurrentDate(new Date())}>Today</Button>
                    </div>
                    <select
                        aria-label="Department"
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="field-sm !h-8 !py-0 !w-auto"
                    >
                        <option value="">All departments</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <ListSearch label="Search employees" placeholder="Search name or code…" value={query} onChange={setQuery} />
                    <div className="ml-auto">
                        <ListIconButton label="Refresh" icon={RefreshCw} onClick={fetchData} disabled={loading} spin={loading} />
                    </div>
                </>
            }
            bodyClassName="!overflow-hidden flex flex-col"
        >
            {loading ? (
                <div className="p-6 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />)}
                </div>
            ) : error ? (
                <div className="py-20 text-center px-6">
                    <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Could not load the schedule</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                    <Button variant="tonal" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                </div>
            ) : (
                <>
                    {/* Today at a glance */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 dark:border-slate-800 divide-x divide-slate-200 dark:divide-slate-800 shrink-0">
                        {[
                            ['On a shift today', todayCounts.on],
                            ['Week off today', todayCounts.off],
                            ['No schedule today', todayCounts.none, todayCounts.none > 0 && 'text-amber-700 dark:text-amber-400'],
                            ['Shifts in use', `${shiftsInUse} of ${shifts.length}`]
                        ].map(([label, v, tone]) => (
                            <div key={label} className="px-4 sm:px-6 py-3">
                                <span className="block text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                <span className={`block mt-0.5 text-2xl font-semibold tabular-nums ${tone || 'text-slate-900 dark:text-slate-50'}`}>{v}</span>
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 shrink-0">
                        {shifts.map(s => {
                            const sh = shiftById[s.id];
                            return (
                                <span key={s.id} className="inline-flex items-center gap-1.5">
                                    <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: sh.tint }} />
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{sh.short}</span>
                                    {s.name} {s.start_time && `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`}
                                </span>
                            );
                        })}
                        <span className="inline-flex items-center gap-1.5"><span className="font-medium text-slate-800 dark:text-slate-200">Off</span> Week off</span>
                        <span className="inline-flex items-center gap-1.5"><span className="font-medium text-slate-800 dark:text-slate-200">·</span> No schedule</span>
                        <span className="inline-flex items-center gap-1.5"><span className="font-medium text-slate-800 dark:text-slate-200">*</span> Temporary</span>
                    </div>

                    {rows.length === 0 ? (
                        <div className="py-20 text-center px-6">
                            <Users size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                {selectedDepartment || query ? 'No matching employees' : 'No employees yet'}
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {selectedDepartment || query ? 'Try another department or search.' : 'Add employees and they will appear here with their shifts.'}
                            </p>
                        </div>
                    ) : (
                        <div ref={gridRef} className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <table className="text-sm border-separate border-spacing-0 min-w-full">
                                <thead>
                                    <tr>
                                        <th className="sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-800 pl-4 sm:pl-6 pr-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400 min-w-[200px]">
                                            Employee
                                        </th>
                                        {days.map(d => {
                                            const isToday = sameDay(d, today);
                                            return (
                                                <th key={d.toISOString()} data-today={isToday ? 'true' : undefined}
                                                    className={`sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 px-1 py-1.5 text-center ${weekend(d) ? 'bg-slate-100 dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900'}`}
                                                    style={{ minWidth: viewMode === 'week' ? 96 : 44 }}>
                                                    <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">{DOW[d.getDay()]}</span>
                                                    <span className={`inline-grid place-items-center mt-0.5 w-6 h-6 rounded-full text-xs tabular-nums ${isToday ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {d.getDate()}
                                                    </span>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(emp => (
                                        <tr key={emp.id} className="group">
                                            <td className="sticky left-0 z-10 bg-app-surface group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 border-b border-r border-slate-100 dark:border-slate-800 pl-4 sm:pl-6 pr-4 py-2">
                                                <Link to={`/employees/${emp.id}`} className="block font-medium text-slate-900 dark:text-slate-100 truncate hover:underline underline-offset-2">{emp.name || '—'}</Link>
                                                <span className="block font-mono text-xs text-slate-600 dark:text-slate-400">{emp.employee_code}{emp.department_name ? ` · ${emp.department_name}` : ''}</span>
                                            </td>
                                            {days.map(d => {
                                                const c = cellFor(emp, d);
                                                const isToday = sameDay(d, today);
                                                const base = `border-b border-slate-100 dark:border-slate-800 px-1 py-1.5 text-center ${weekend(d) ? 'bg-slate-50 dark:bg-slate-800/40' : ''} ${isToday ? 'bg-slate-100/70 dark:bg-slate-800/70' : ''}`;
                                                if (c.kind === 'shift' && c.shift) {
                                                    return (
                                                        <td key={d.toISOString()} className={base}>
                                                            <span
                                                                title={`${c.name || c.shift.name}${c.temporary ? ' (temporary)' : ''} · ${String(c.shift.start_time).slice(0, 5)}–${String(c.shift.end_time).slice(0, 5)}`}
                                                                className="inline-flex items-center justify-center h-6 px-1.5 rounded text-[11px] font-semibold text-slate-900 dark:text-slate-50"
                                                                style={{ backgroundColor: `${c.shift.tint}26`, boxShadow: `inset 2px 0 0 ${c.shift.tint}` }}
                                                            >
                                                                {viewMode === 'week' ? (c.name || c.shift.name) : c.shift.short}{c.temporary ? '*' : ''}
                                                            </span>
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td key={d.toISOString()} className={base}>
                                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{c.kind === 'off' ? 'Off' : '·'}</span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </ListPage>
    );
}

