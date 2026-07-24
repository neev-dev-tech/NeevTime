import React, { useState, useEffect } from 'react';
import api from '../api';
import { Calendar, ChevronLeft, ChevronRight, Clock, User, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import SkeletonLoader from '../components/SkeletonLoader';
import { Button, PageHeader } from '../components';

export default function AttendanceCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const fetchData = async () => {
        setLoading(true);
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
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [currentDate]);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const renderCalendar = () => {
        const days = [];
        const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Header
        for (let d of weekDays) {
            days.push(
                <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    {d}
                </div>
            );
        }

        // Empty cells
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="bg-slate-50/30 dark:bg-slate-900/50 min-h-[120px] border-b border-r border-slate-100 dark:border-slate-700"></div>);
        }

        // Calendar Days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = data[dateStr];
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            days.push(
                <div key={day} className={`relative min-h-[120px] p-2 transition-all hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-r border-slate-100 dark:border-slate-700 group ${isToday ? 'bg-orange-50/30 dark:bg-orange-900/30' : 'bg-white dark:bg-slate-800'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-orange-600 text-white shadow-md' : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 group-hover:bg-white dark:group-hover:bg-slate-800 border border-transparent group-hover:border-slate-200 dark:group-hover:border-slate-700'}`}>
                            {day}
                        </span>
                        {dayData && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 font-medium">
                                {dayData.total} Staff
                            </span>
                        )}
                    </div>

                    {dayData ? (
                        <div className="space-y-1.5 mt-2">
                            {dayData.present > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800">
                                    <span className="flex items-center gap-1.5"><CheckCircle size={10} /> Present</span>
                                    <span className="font-bold">{dayData.present}</span>
                                </div>
                            )}
                            {dayData.absent > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800">
                                    <span className="flex items-center gap-1.5"><XCircle size={10} /> Absent</span>
                                    <span className="font-bold">{dayData.absent}</span>
                                </div>
                            )}
                            {dayData.late > 0 && (
                                <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                                    <span className="flex items-center gap-1.5"><Clock size={10} /> Late</span>
                                    <span className="font-bold">{dayData.late}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        loading ? <div className="animate-pulse space-y-2 mt-4"><div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4"></div></div> : null
                    )}
                </div>
            );
        }

        return days;
    };

    return (
        <div className="space-y-6">
            <div className="report-container">
                {/* Header */}
                <div className="px-6 pt-6 border-b border-slate-100 dark:border-slate-700">
                    <PageHeader
                        icon={Calendar}
                        title="Attendance Calendar"
                        subtitle="Monthly attendance overview"
                        actions={
                            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
                                <Button variant="ghost" size="sm" icon={ChevronLeft} iconSize={20} aria-label="Previous month" onClick={prevMonth} />
                                <span className="w-48 text-center font-bold text-slate-800 dark:text-slate-100 text-sm py-1">
                                    {monthNames[month]} {year}
                                </span>
                                <Button variant="ghost" size="sm" icon={ChevronRight} iconSize={20} aria-label="Next month" onClick={nextMonth} />
                            </div>
                        }
                    />
                </div>

                {/* Legend */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-emerald-100"></span> Present
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-rose-500 rounded-full ring-2 ring-rose-100"></span> Absent
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-amber-500 rounded-full ring-2 ring-amber-100"></span> Late Arrival
                    </div>
                    <div className="ml-auto text-slate-400">
                        Summary for {monthNames[month]} {year}
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="bg-white dark:bg-slate-800">
                    <div className="grid grid-cols-7 border-l border-t border-slate-100 dark:border-slate-700">
                        {renderCalendar()}
                    </div>
                </div>
            </div>
        </div>
    );
}
