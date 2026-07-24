import React, { useState, useEffect } from 'react';
import api from '../api';
import { CalendarDays, ChevronLeft, ChevronRight, Users, Building2, Clock, Filter } from 'lucide-react';
import { PageHeader } from '../components';

export default function ScheduleCalendar() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('month'); // 'week' or 'month'
    const [employees, setEmployees] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
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
            'bg-blue-100 text-blue-800',
            'bg-green-100 text-green-800',
            'bg-purple-100 text-purple-800',
            'bg-amber-100 text-amber-800',
            'bg-rose-100 text-rose-800',
            'bg-cyan-100 text-cyan-800'
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
        <div className="space-y-4">
            {/* Header */}
            <PageHeader
                icon={CalendarDays}
                title="Schedule Calendar"
                actions={
                    <>
                        {/* Department Filter */}
                        <div className="flex items-center gap-2">
                            <Filter size={16} className="text-gray-500" />
                            <select
                                value={selectedDepartment}
                                onChange={(e) => setSelectedDepartment(e.target.value)}
                                className="px-3 py-2 border rounded-lg text-sm"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        {/* View Mode Toggle */}
                        <div className="flex bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1 rounded text-sm ${viewMode === 'week' ? 'bg-white shadow' : ''}`}
                            >
                                Week
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1 rounded text-sm ${viewMode === 'month' ? 'bg-white shadow' : ''}`}
                            >
                                Month
                            </button>
                        </div>
                    </>
                }
            />

            {/* Calendar Navigation */}
            <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => navigateMonth(-1)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-lg font-semibold">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h2>
                    <button
                        onClick={() => navigateMonth(1)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                {/* Shift Legend */}
                <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b">
                    {shifts.map((shift, i) => (
                        <span
                            key={shift.id}
                            className={`px-2 py-1 rounded text-xs font-medium ${getShiftColor(i)}`}
                        >
                            {shift.name}
                        </span>
                    ))}
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-600">
                        WO = Week Off
                    </span>
                </div>

                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading schedule...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="border p-2 bg-gray-50 text-left min-w-[150px] sticky left-0 z-10">
                                        Employee
                                    </th>
                                    {days.map((day, i) => (
                                        <th
                                            key={i}
                                            className={`border p-2 text-center min-w-[60px] text-sm ${day && isToday(day) ? 'bg-green-100' :
                                                    day && isWeekend(day) ? 'bg-gray-100' : 'bg-gray-50'
                                                }`}
                                        >
                                            {day ? (
                                                <>
                                                    <div className="font-medium">{dayNames[day.getDay()]}</div>
                                                    <div className={`text-xs ${isToday(day) ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                                                        {day.getDate()}
                                                    </div>
                                                </>
                                            ) : null}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.length === 0 ? (
                                    <tr>
                                        <td colSpan={days.length + 1} className="border p-4 text-center text-gray-500">
                                            No employees found
                                        </td>
                                    </tr>
                                ) : filteredEmployees.slice(0, 15).map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="border p-2 bg-white sticky left-0 z-10">
                                            <div className="font-medium text-sm">{emp.name}</div>
                                            <div className="text-xs text-gray-500">{emp.employee_code}</div>
                                        </td>
                                        {days.map((day, i) => {
                                            if (!day) return <td key={i} className="border bg-gray-50"></td>;

                                            const schedule = getScheduleForEmployeeOnDate(emp.id, day);
                                            const isWO = isWeekend(day);

                                            return (
                                                <td
                                                    key={i}
                                                    className={`border p-1 text-center ${isToday(day) ? 'bg-green-50' :
                                                            isWO ? 'bg-gray-100' : ''
                                                        }`}
                                                >
                                                    {isWO ? (
                                                        <span className="text-xs text-gray-500 font-medium">WO</span>
                                                    ) : schedule ? (
                                                        <span
                                                            className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getShiftColor(shifts.findIndex(s => s.id === schedule.shift_id))
                                                                }`}
                                                            title={schedule.shift_name}
                                                        >
                                                            {schedule.shift_name?.substring(0, 3) || 'SCH'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-300">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredEmployees.length > 15 && (
                            <div className="text-center py-2 text-sm text-gray-500">
                                Showing 15 of {filteredEmployees.length} employees
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="text-blue-600" />
                        <h3 className="font-semibold">Total Employees</h3>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">{filteredEmployees.length}</div>
                    <div className="text-sm text-gray-500">
                        {selectedDepartment ? 'In selected department' : 'Across all departments'}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="text-green-600" />
                        <h3 className="font-semibold">Active Shifts</h3>
                    </div>
                    <div className="text-3xl font-bold text-green-600">{shifts.length}</div>
                    <div className="text-sm text-gray-500">Defined in system</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Building2 className="text-purple-600" />
                        <h3 className="font-semibold">Departments</h3>
                    </div>
                    <div className="text-3xl font-bold text-purple-600">{departments.length}</div>
                    <div className="text-sm text-gray-500">With employees</div>
                </div>
            </div>
        </div>
    );
}
