import React, { useState, useEffect } from 'react';
import api from '../api';
import { Calendar, ChevronLeft, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button, PageHeader } from '../components';

export default function AttendanceCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // In a real scenario, you'd pass startDate and endDate to fetch specific month data
            // const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            // const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${daysInMonth}`;

            const res = await api.get('/api/attendance/summary');
            const grouped = {};
            res.data.forEach(row => {
                const date = row.date?.split('T')[0];
                if (!grouped[date]) grouped[date] = { present: 0, absent: 0, late: 0, total: 0 };

                grouped[date].total++;
                if (row.status === 'Present') grouped[date].present++;
                else if (row.status === 'Absent') grouped[date].absent++;

                if (row.late_minutes > 0) grouped[date].late++;
            });
            setData(grouped);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Could not load attendance summary');
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [currentDate]);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const CELL_BASE = 'rounded-lg ring-1 ring-black/5 dark:ring-white/10';

    const renderCalendar = () => {
        const days = [];

        // Empty leading cells
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(
                <div
                    key={`empty-${i}`}
                    className={`${CELL_BASE} min-h-[120px] bg-slate-50/60 dark:bg-slate-900/40`}
                />
            );
        }

        // Calendar Days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = data[dateStr];
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            days.push(
                <div
                    key={day}
                    className={`${CELL_BASE} relative min-h-[120px] p-2 transition-colors group hover:bg-orange-50/50 dark:hover:bg-slate-700/40 ${isToday ? 'bg-orange-50/60 dark:bg-orange-900/20' : 'bg-white/70 dark:bg-slate-800/70'}`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-sm font-semibold tabular-nums w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700'}`}>
                            {day}
                        </span>
                        {dayData && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide tabular-nums bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                {dayData.total} Staff
                            </span>
                        )}
                    </div>

                    {dayData ? (
                        <div className="space-y-1.5 mt-2">
                            {dayData.present > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800">
                                    <span className="flex items-center gap-1.5"><CheckCircle size={10} /> Present</span>
                                    <span className="font-bold tabular-nums">{dayData.present}</span>
                                </div>
                            )}
                            {dayData.absent > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-200/70 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800">
                                    <span className="flex items-center gap-1.5"><XCircle size={10} /> Absent</span>
                                    <span className="font-bold tabular-nums">{dayData.absent}</span>
                                </div>
                            )}
                            {dayData.late > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800">
                                    <span className="flex items-center gap-1.5"><Clock size={10} /> Late</span>
                                    <span className="font-bold tabular-nums">{dayData.late}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <span className="block mt-2 text-xs text-slate-400 dark:text-slate-500">—</span>
                    )}
                </div>
            );
        }

        return days;
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysWithData = Object.keys(data).length;

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Calendar}
                title="Attendance Calendar"
                subtitle="Monthly attendance overview"
                actions={
                    <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-1">
                        <Button variant="ghost" size="sm" icon={ChevronLeft} iconSize={20} aria-label="Previous month" onClick={prevMonth} />
                        <span className="w-48 text-center font-bold text-slate-800 dark:text-slate-100 text-sm py-1">
                            {monthNames[month]} {year}
                        </span>
                        <Button variant="ghost" size="sm" icon={ChevronRight} iconSize={20} aria-label="Next month" onClick={nextMonth} />
                    </div>
                }
            />

            <div className="card-base !p-0 overflow-hidden">
                {/* Legend */}
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-emerald-100 dark:ring-emerald-900/50" /> Present
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-rose-500 rounded-full ring-2 ring-rose-100 dark:ring-rose-900/50" /> Absent
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-amber-500 rounded-full ring-2 ring-amber-100 dark:ring-amber-900/50" /> Late Arrival
                    </div>
                    <div className="ml-auto text-slate-500 dark:text-slate-400">
                        Summary for {monthNames[month]} {year}
                    </div>
                </div>

                {loading ? (
                    <div className="p-5 grid grid-cols-7 gap-2">
                        {Array.from({ length: 35 }).map((_, i) => (
                            <div key={i} className="min-h-[120px] rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load the calendar</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : daysWithData === 0 ? (
                    <div className="py-16 text-center">
                        <Calendar size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No attendance recorded</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Nothing has been captured yet. Once punches arrive they will appear day by day.
                        </p>
                    </div>
                ) : (
                    <div className="p-5">
                        <div className="grid grid-cols-7 gap-2 mb-2">
                            {weekDays.map(d => (
                                <div key={d} className="text-center text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 py-2">
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-2">
                            {renderCalendar()}
                        </div>
                    </div>
                )}

                {!loading && !error && daysWithData > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                        {daysWithData} day{daysWithData === 1 ? '' : 's'} with attendance
                    </div>
                )}
            </div>
        </div>
    );
}
