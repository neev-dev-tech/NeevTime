import React, { useState, useEffect } from 'react';
import api from '../api';
import { CalendarDays, ChevronLeft, ChevronRight, Users, Building2, Clock, Filter, AlertCircle, RefreshCw } from 'lucide-react';
import { PageHeader, Button } from '../components';

export default function ScheduleCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'week' or 'month'
    const [employees, setEmployees] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
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
            console.error('Error fetching data:', err);
            setError(err.response?.data?.error || 'Could not load the schedule calendar');
        } finally {
            setLoading(false);
        }
    };

    // Calendar helpers
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];
        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }
        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }
        return days;
    };

    const getWeekDays = (date) => {
        const days = [];
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());

        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            days.push(day);
        }
        return days;
    };

    const navigateMonth = (direction) => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') {
            newDate.setMonth(newDate.getMonth() + direction);
        } else {
            newDate.setDate(newDate.getDate() + (direction * 7));
        }
        setCurrentDate(newDate);
    };

    const getScheduleForEmployeeOnDate = (employeeId, date) => {
        if (!date) return null;
        const dateStr = date.toISOString().split('T')[0];
        return schedules.find(s =>
            s.employee_id === employeeId &&
            dateStr >= s.effective_from?.split('T')[0] &&
            (!s.effective_to || dateStr <= s.effective_to?.split('T')[0])
        );
    };

    const getShiftColor = (shiftId) => {
        const colors = [
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
            'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
        ];
        return colors[shiftId % colors.length];
    };

    const isWeekend = (date) => {
        if (!date) return false;
        const day = date.getDay();
        return day === 0 || day === 6;
    };

    const isToday = (date) => {
        if (!date) return false;
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    const filteredEmployees = selectedDepartment
        ? employees.filter(e => e.department_id === parseInt(selectedDepartment))
        : employees;

    const days = viewMode === 'month' ? getDaysInMonth(currentDate) : getWeekDays(currentDate);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                icon={CalendarDays}
                title="Schedule Calendar"
                subtitle="Who is on which shift, day by day"
                actions={
                    <>
                        {/* Department Filter */}
                        <div className="relative">
                            <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                            <select
                                value={selectedDepartment}
                                onChange={(e) => setSelectedDepartment(e.target.value)}
                                className="field pl-9 pr-3 bg-white/70"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        {/* View Mode Toggle */}
                        <div className="inline-flex rounded-full p-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${viewMode === 'week'
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400'}`}
                            >
                                Week
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${viewMode === 'month'
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-orange-600 dark:hover:text-orange-400'}`}
                            >
                                Month
                            </button>
                        </div>
                    </>
                }
            />

            {/* Calendar Navigation */}
            <div className="card-base !p-4">
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => navigateMonth(-1)}
                        aria-label="Previous"
                        className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-slate-700 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <h2 className="text-sm font-bold uppercase tracking-[0.09em] text-slate-600 dark:text-slate-300 tabular-nums">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h2>
                    <button
                        onClick={() => navigateMonth(1)}
                        aria-label="Next"
                        className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-slate-700 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Shift Legend */}
                <div className="flex flex-wrap gap-1.5 mb-4 pb-4 border-b border-slate-100 dark:border-slate-700">
                    {shifts.map((shift, i) => (
                        <span
                            key={shift.id}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getShiftColor(i)}`}
                        >
                            {shift.name}
                        </span>
                    ))}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        WO = Week Off
                    </span>
                </div>

                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="py-16 text-center">
                        <AlertCircle size={40} className="mx-auto mb-3 text-rose-400 dark:text-rose-500" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Could not load the calendar</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error}</p>
                        <Button variant="secondary" icon={RefreshCw} onClick={fetchData}>Try again</Button>
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div className="py-16 text-center">
                        <Users size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No employees to show</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {selectedDepartment
                                ? 'No employees belong to the selected department.'
                                : 'Add employees and they will appear here with their shifts.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-1">
                            <thead>
                                <tr>
                                    <th className="p-2 rounded-lg ring-1 ring-black/5 dark:ring-white/10 bg-slate-50/70 dark:bg-slate-900/50 text-left min-w-[150px] sticky left-0 z-10 text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">
                                        Employee
                                    </th>
                                    {days.map((day, i) => (
                                        <th
                                            key={i}
                                            className={`p-1.5 rounded-lg ring-1 ring-black/5 dark:ring-white/10 text-center min-w-[60px] ${day && isToday(day) ? 'bg-orange-100 dark:bg-orange-900/30' :
                                                day && isWeekend(day) ? 'bg-slate-100 dark:bg-slate-700' : 'bg-slate-50/70 dark:bg-slate-900/50'
                                                }`}
                                        >
                                            {day ? (
                                                <>
                                                    <div className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">{dayNames[day.getDay()]}</div>
                                                    <div className={`text-xs tabular-nums ${isToday(day) ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-slate-600 dark:text-slate-300'}`}>
                                                        {day.getDate()}
                                                    </div>
                                                </>
                                            ) : null}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.slice(0, 15).map((emp) => (
                                    <tr key={emp.id} className="group">
                                        <td className="p-2 rounded-lg ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-slate-800 sticky left-0 z-10 group-hover:bg-orange-50/50 dark:group-hover:bg-slate-700/40 transition-colors">
                                            <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">{emp.name || '—'}</div>
                                            <div className="font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400 font-semibold">{emp.employee_code || '—'}</div>
                                        </td>
                                        {days.map((day, i) => {
                                            if (!day) return <td key={i} className="rounded-lg ring-1 ring-black/5 dark:ring-white/10 bg-slate-50/50 dark:bg-slate-900/40"></td>;

                                            const schedule = getScheduleForEmployeeOnDate(emp.id, day);
                                            const isWO = isWeekend(day);

                                            return (
                                                <td
                                                    key={i}
                                                    className={`p-1 text-center rounded-lg ring-1 ring-black/5 dark:ring-white/10 ${isToday(day) ? 'bg-orange-50 dark:bg-orange-900/20' :
                                                        isWO ? 'bg-slate-100 dark:bg-slate-700' : 'bg-white dark:bg-slate-800'
                                                        }`}
                                                >
                                                    {isWO ? (
                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">WO</span>
                                                    ) : schedule ? (
                                                        <span
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getShiftColor(shifts.findIndex(s => s.id === schedule.shift_id))
                                                                }`}
                                                            title={schedule.shift_name}
                                                        >
                                                            {schedule.shift_name?.substring(0, 3) || 'SCH'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            {filteredEmployees.length > 15
                                ? `Showing 15 of ${filteredEmployees.length} employees`
                                : `${filteredEmployees.length} employee${filteredEmployees.length === 1 ? '' : 's'}`}
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                            <Users size={16} />
                        </div>
                        <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Total Employees</h3>
                    </div>
                    <div className="text-3xl font-bold tabular-nums text-orange-600 dark:text-orange-400">{filteredEmployees.length}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                        {selectedDepartment ? 'In selected department' : 'Across all departments'}
                    </div>
                </div>
                <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                            <Clock size={16} />
                        </div>
                        <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Active Shifts</h3>
                    </div>
                    <div className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{shifts.length}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">Defined in system</div>
                </div>
                <div className="bg-white/70 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:-translate-y-0.5 transition-transform">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                            <Building2 size={16} />
                        </div>
                        <h3 className="text-[10px] uppercase tracking-[0.09em] font-bold text-slate-500 dark:text-slate-400">Departments</h3>
                    </div>
                    <div className="text-3xl font-bold tabular-nums text-purple-600 dark:text-purple-400">{departments.length}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">With employees</div>
                </div>
            </div>
        </div>
    );
}
