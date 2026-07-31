import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import io from 'socket.io-client';
import {
    LayoutDashboard, Users, Clock, AlertTriangle, CheckCircle, XCircle, Wifi, WifiOff,
    TrendingUp, Calendar, UserPlus, UserMinus, Tablet, Fingerprint, RefreshCw,
    ArrowUpRight, ArrowDownRight, Timer, LogIn, LogOut as LogOutIcon, Percent,
    Activity, Target, Zap, BarChart3, TrendingDown, Brain, Info, ExternalLink,
    ChevronRight, Circle
} from 'lucide-react';
import { formatTimeShort, toLocalDateString } from '../utils/dateFormat';

export default function Dashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        employees: 0,
        newJoinees: 0,
        resigned: 0,
        devices: 0,
        devicesOnline: 0,
        verificationCount: 0,
        present: 0,
        absent: 0,
        late: 0,
        earlyLeave: 0,
        onLeave: 0,
        attendanceRate: 0,
        punctualityRate: 0,
        totalPunches: 0,
        avgHours: 0
    });
    const [yesterdayStats, setYesterdayStats] = useState({
        attendanceRate: 0,
        punctualityRate: 0,
        present: 0,
        late: 0
    });
    const [insights, setInsights] = useState([]);
    const [devices, setDevices] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [attendanceTrends, setAttendanceTrends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        fetchAllData();

        // Setup socket for real-time updates
        // Use relative URL - Vite proxy handles /socket.io in dev, production uses same origin
        const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
        socketRef.current = io(socketUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            path: '/socket.io'
        });

        // Handle connection events
        socketRef.current.on('connect', () => {
            console.log('✅ Real-time connection established');
        });

        socketRef.current.on('disconnect', () => {
            console.log('⚠️ Real-time connection lost');
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error);
        });

        // Handle new punch events - update everything in real-time
        socketRef.current.on('new_punch', async (data) => {
            console.log('📥 New punch received:', data);

            // Immediately update recent logs
            setRecentLogs(prev => {
                const newLog = {
                    employee_code: data.employee_code,
                    employee_name: data.employee_name || data.employee_code,
                    device_serial: data.device_serial,
                    device_name: data.device_name || data.device_serial,
                    punch_time: data.timestamp || data.punch_time || new Date().toISOString(),
                    punch_type: data.state === '0' || data.state === 'Check In' ? 'IN' : 'OUT'
                };
                return [newLog, ...prev.slice(0, 9)];
            });

            // Refresh stats to get updated attendance data
            // Use a small delay to ensure database has been updated
            setTimeout(async () => {
                await fetchStats();
                await fetchRecentLogs();
                setLastUpdated(new Date());
            }, 500);
        });

        // Handle device status updates
        socketRef.current.on('device_status', (data) => {
            console.log('📡 Device status update:', data);
            // Refresh device list when status changes
            fetchDevices();
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                console.log('🔌 Real-time connection closed');
            }
        };
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        await Promise.all([
            fetchStats(),
            fetchDevices(),
            fetchRecentLogs(),
            fetchAttendanceTrends()
        ]);
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = toLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
            const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

            const [employeesRes, devicesRes, summaryRes, logsRes, yesterdaySummaryRes] = await Promise.all([
                api.get('/api/employees'),
                api.get('/api/devices'),
                api.get('/api/attendance/summary', { params: { date: today } }),
                api.get('/api/logs', { params: { limit: 100 } }),
                api.get('/api/attendance/summary', { params: { date: yesterday } })
            ]);

            const employees = employeesRes.data || [];
            const devicesList = devicesRes.data || [];
            const summary = summaryRes.data || [];
            const yesterdaySummary = yesterdaySummaryRes.data || [];

            // Calculate stats
            const newJoinees = employees.filter(e => {
                const joinDate = new Date(e.joining_date || e.created_at);
                return joinDate >= new Date(sevenDaysAgo);
            }).length;

            const resigned = employees.filter(e => e.status === 'resigned' || e.resignation_date).length;
            const devicesOnline = devicesList.filter(d => d.status === 'online').length;
            const verificationCount = devicesList.reduce((sum, d) => sum + (d.fingerprint_count || 0) + (d.face_count || 0), 0);

            const present = summary.filter(r => r.status === 'Present').length;
            const absent = summary.filter(r => r.status === 'Absent').length;
            const late = summary.filter(r => (r.late_minutes || 0) > 0).length;
            const earlyLeave = summary.filter(r => (r.early_leave_minutes || 0) > 0).length;
            const onLeave = summary.filter(r => r.status === 'On Leave').length;

            // Calculate additional metrics
            const totalEmployees = employees.length;
            const attendanceRate = totalEmployees > 0 ? Math.round((present / totalEmployees) * 100) : 0;
            const punctualityRate = totalEmployees > 0 ? Math.round(((totalEmployees - late) / totalEmployees) * 100) : 0;
            const totalPunches = logsRes.data?.length || 0;
            const avgHours = summary.length > 0
                ? Math.round(summary.reduce((sum, r) => sum + (r.duration_minutes || 0), 0) / summary.length / 60 * 10) / 10
                : 0;

            // Calculate yesterday's stats for benchmarking
            const yesterdayPresent = yesterdaySummary.filter(r => r.status === 'Present').length;
            const yesterdayLate = yesterdaySummary.filter(r => (r.late_minutes || 0) > 0).length;
            const yesterdayAttendanceRate = totalEmployees > 0 ? Math.round((yesterdayPresent / totalEmployees) * 100) : 0;
            const yesterdayPunctualityRate = totalEmployees > 0 ? Math.round(((totalEmployees - yesterdayLate) / totalEmployees) * 100) : 0;

            setYesterdayStats({
                attendanceRate: yesterdayAttendanceRate,
                punctualityRate: yesterdayPunctualityRate,
                present: yesterdayPresent,
                late: yesterdayLate
            });

            // Generate Smart Insights
            const newInsights = [];
            if (late > 0) {
                newInsights.push({
                    type: 'warning',
                    icon: AlertTriangle,
                    text: `${late} employee${late > 1 ? 's' : ''} arrived late today`
                });
            }
            const attendanceChange = attendanceRate - yesterdayAttendanceRate;
            if (attendanceChange > 0) {
                newInsights.push({
                    type: 'success',
                    icon: TrendingUp,
                    text: `Attendance improved by +${Math.abs(attendanceChange)}% vs yesterday`
                });
            } else if (attendanceChange < 0) {
                newInsights.push({
                    type: 'warning',
                    icon: TrendingDown,
                    text: `Attendance decreased by ${Math.abs(attendanceChange)}% vs yesterday`
                });
            }
            if (devicesOnline === devicesList.length && devicesList.length > 0) {
                newInsights.push({
                    type: 'success',
                    icon: CheckCircle,
                    text: `All ${devicesList.length} device${devicesList.length > 1 ? 's are' : ' is'} online and syncing normally`
                });
            } else if (devicesList.length > 0 && devicesOnline < devicesList.length) {
                newInsights.push({
                    type: 'error',
                    icon: AlertTriangle,
                    text: `${devicesList.length - devicesOnline} device${devicesList.length - devicesOnline > 1 ? 's are' : ' is'} offline`
                });
            }
            if (newInsights.length === 0) {
                newInsights.push({
                    type: 'info',
                    icon: CheckCircle,
                    text: 'All systems operating normally'
                });
            }
            setInsights(newInsights);

            setStats({
                employees: totalEmployees,
                newJoinees,
                resigned,
                devices: devicesList.length,
                devicesOnline,
                verificationCount,
                present,
                absent,
                late,
                earlyLeave,
                onLeave,
                attendanceRate,
                punctualityRate,
                totalPunches,
                avgHours,
            });

            setLastUpdated(new Date());
        } catch (err) { console.error('Stats error:', err); }
    };

    const fetchDevices = async () => {
        try {
            const res = await api.get('/api/devices');
            setDevices(res.data || []);
        } catch (err) { console.error(err); }
    };

    const fetchRecentLogs = async () => {
        try {
            const res = await api.get('/api/logs', { params: { limit: 10 } });
            // Transform logs to match expected format
            const formattedLogs = (res.data || []).map(log => ({
                ...log,
                employee_name: log.employee_name || log.emp_name || log.employee_code,
                device_name: log.device_name || log.device_serial,
                punch_type: log.punch_type || (log.punch_state === '0' || log.punch_state === 'Check In' ? 'IN' : 'OUT')
            }));
            setRecentLogs(formattedLogs);
        } catch (err) { console.error(err); }
    };

    const fetchAttendanceTrends = async () => {
        try {
            const start = toLocalDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
            const end = new Date().toISOString().split('T')[0];
            const [lateEarlyRes, absentRes] = await Promise.all([
                api.get('/api/reports/late-early', { params: { start_date: start, end_date: end } }),
                api.get('/api/reports/absent', { params: { start_date: start, end_date: end } })
            ]);

            const byDate = {};
            for (let i = 6; i >= 0; i--) {
                const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
                const key = toLocalDateString(date);
                byDate[key] = {
                    date: date.toLocaleDateString('en-US', { weekday: 'short' }),
                    fullDate: key,
                    late: 0,
                    earlyLeave: 0,
                    absent: 0
                };
            }

            // Report endpoints wrap rows in {summary, data}
            const rowsOf = (res) => (Array.isArray(res.data) ? res.data : (res.data?.data || []));
            rowsOf(lateEarlyRes).forEach(row => {
                const key = row.attendance_date ? String(row.attendance_date).split('T')[0] : null;
                if (!key || !byDate[key]) return;
                if (row.late_minutes > 0) byDate[key].late += 1;
                if (row.early_minutes > 0) byDate[key].earlyLeave += 1;
            });
            rowsOf(absentRes).forEach(row => {
                const key = row.absent_date ? String(row.absent_date).split('T')[0] : null;
                if (key && byDate[key]) byDate[key].absent += 1;
            });

            setAttendanceTrends(Object.values(byDate));
        } catch (err) { console.error(err); }
    };

    const StatCard = ({ icon: Icon, label, value, color, bgColor, subtitle, tooltip, benchmark, trend }) => {
        return (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4 hover:shadow-md transition-all duration-300 group">
                <div className={`p-3 rounded-lg ${bgColor} ${color} group-hover:scale-110 transition-transform`}>
                    <Icon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
                        {tooltip && <Info size={12} className="text-slate-300 cursor-help" title={tooltip} />}
                    </div>
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate">{value}</p>
                    </div>
                    {(subtitle || trend) && (
                        <div className="flex items-center gap-2 mt-1">
                            {trend && (
                                <span className={`text-[10px] font-bold ${trend.color ? '' : 'text-emerald-600'}`} style={{ color: trend.color }}>
                                    {trend.text}
                                </span>
                            )}
                            {subtitle && !trend && <span className="text-[10px] text-slate-400 font-medium truncate">{subtitle}</span>}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const AttendanceStatusCard = ({ label, value, type = 'success', trend }) => {
        const cardClasses = {
            success: 'summary-card-success',
            warning: 'summary-card-warning',
            error: 'summary-card-error',
            info: 'summary-card-info'
        };
        const accentColors = {
            success: '#2EAD6D',
            warning: '#E09B2D',
            error: '#E5533D',
            info: '#4C6FFF'
        };
        return (
            <div className={cardClasses[type] || cardClasses.success}>
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="card-title mb-1">{label}</div>
                        <div className="card-value">{value}</div>
                        {trend && (
                            <div className="card-meta mt-1.5" style={{ color: accentColors[type] }}>
                                {trend}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Calculate device status percentages for pie chart visualization
    const onlinePercent = stats.devices > 0 ? (stats.devicesOnline / stats.devices) * 100 : 0;
    const offlinePercent = 100 - onlinePercent;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-3 text-slate-800 dark:text-slate-100">
                        <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                            <LayoutDashboard className="text-saffron" size={24} />
                        </div>
                        Worktable
                    </h1>
                    <div className="flex items-center gap-3 mt-1 ml-11">
                        <p className="text-sm text-slate-600 dark:text-slate-400">Overview of today's attendance and device status</p>
                        {lastUpdated && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <Circle size={6} className="text-green-500 fill-green-500 animate-pulse" />
                                <span>Live · Updated {Math.floor((new Date() - lastUpdated) / 1000 / 60)} min{Math.floor((new Date() - lastUpdated) / 1000 / 60) !== 1 ? 's' : ''} ago</span>
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={fetchAllData}
                    className="btn-primary flex items-center gap-2"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Stats + insights rail */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            <div className="order-2 xl:order-1 space-y-4">
            {/* Primary Stats Row - Premium Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-24 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse"></div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <StatCard
                        icon={Users}
                        label="Employees"
                        value={stats.employees}
                        color="text-blue-600 dark:text-blue-300"
                        bgColor="bg-blue-50 dark:bg-blue-900/30"
                    />
                    <StatCard
                        icon={UserPlus}
                        label="New Joinees"
                        value={stats.newJoinees}
                        color="text-emerald-600 dark:text-emerald-300"
                        bgColor="bg-emerald-50 dark:bg-emerald-900/30"
                        subtitle="Last 7 Days"
                    />
                    <StatCard
                        icon={UserMinus}
                        label="Resigned"
                        value={stats.resigned}
                        color="text-rose-600 dark:text-rose-300"
                        bgColor="bg-rose-50 dark:bg-rose-900/30"
                    />
                    <StatCard
                        icon={Tablet}
                        label="Devices"
                        value={stats.devices}
                        color="text-indigo-600 dark:text-indigo-300"
                        bgColor="bg-indigo-50 dark:bg-indigo-900/30"
                        trend={stats.devicesOnline === stats.devices && stats.devices > 0
                            ? { text: 'All online', color: '#059669' }
                            : stats.devices > 0 && stats.devicesOnline < stats.devices
                                ? { text: `${stats.devices - stats.devicesOnline} offline`, color: '#DC2626' }
                                : null
                        }
                    />
                    <StatCard
                        icon={Fingerprint}
                        label="Verifications"
                        value={stats.verificationCount}
                        color="text-purple-600 dark:text-purple-300"
                        bgColor="bg-purple-50 dark:bg-purple-900/30"
                    />
                    <StatCard
                        icon={Percent}
                        label="Attendance"
                        value={`${stats.attendanceRate || 0}%`}
                        color="text-teal-600 dark:text-teal-300"
                        bgColor="bg-teal-50 dark:bg-teal-900/30"
                        subtitle="Today"
                        tooltip="Based on today's punches"
                    />
                    <StatCard
                        icon={Target}
                        label="Punctuality"
                        value={`${stats.punctualityRate || 0}%`}
                        color="text-sky-600 dark:text-sky-300"
                        bgColor="bg-sky-50 dark:bg-sky-900/30"
                        subtitle="On Time"
                    />
                    <StatCard
                        icon={Activity}
                        label="Punches"
                        value={stats.totalPunches || 0}
                        color="text-amber-600 dark:text-amber-300"
                        bgColor="bg-amber-50 dark:bg-amber-900/30"
                        subtitle="Today"
                    />
                    <StatCard
                        icon={Clock}
                        label="Avg Hours"
                        value={`${stats.avgHours || 0}h`}
                        color="text-blue-600 dark:text-blue-300"
                        bgColor="bg-blue-50 dark:bg-blue-900/30"
                        subtitle="Per Employee"
                    />
                </div>
            )}
            </div>

            {/* Insights rail */}
            <aside className="order-1 xl:order-2 card-base animate-fade-in xl:sticky xl:top-24">
                <div className="flex items-center gap-2 mb-4">
                    <Brain size={18} className="text-orange-500" />
                    <h2 className="font-semibold text-base text-slate-800 dark:text-slate-100">Today's Insights</h2>
                </div>
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                        ))}
                    </div>
                ) : insights.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No insights for today yet.</p>
                ) : (
                    <div className="space-y-2.5">
                        {insights.map((insight, idx) => {
                            const Icon = insight.icon;
                            const tone = {
                                success: 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800',
                                warning: 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
                                error: 'bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-800',
                                info: 'bg-orange-50 dark:bg-orange-900/25 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800'
                            }[insight.type] || 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-100 dark:border-slate-700';
                            return (
                                <div key={idx} className={`flex items-start gap-2.5 p-3 rounded-xl border ${tone}`}>
                                    <Icon size={15} className="mt-0.5 shrink-0" />
                                    <span className="text-sm font-medium leading-snug">{insight.text}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </aside>
            </div>

            {/* Attendance Status Row - Staggered */}
            <div className="card-tier-2 animate-fade-in stagger-2">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-semibold flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                        <Clock className="text-blue-500" size={18} /> Today's Attendance Status
                    </h2>
                    <a
                        href="/attendance-register"
                        className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                        onClick={(e) => {
                            e.preventDefault();
                            navigate('/attendance-register');
                        }}
                    >
                        View Attendance Details
                        <ChevronRight size={14} />
                    </a>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <AttendanceStatusCard
                        label="Present"
                        value={stats.present}
                        type="success"
                        trend={yesterdayStats.present > 0
                            ? `${stats.present >= yesterdayStats.present ? '↑' : '↓'} ${Math.abs(Math.round(((stats.present - yesterdayStats.present) / yesterdayStats.present) * 100))}% vs yesterday`
                            : undefined}
                    />
                    <AttendanceStatusCard label="Absent" value={stats.absent} type="error" />
                    <AttendanceStatusCard label="Late Arrival" value={stats.late} type="warning" />
                    <AttendanceStatusCard label="Early Leave" value={stats.earlyLeave} type="warning" />
                    <AttendanceStatusCard label="On Leave" value={stats.onLeave} type="neutral" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Device Status Widget - Staggered */}
                <div className="card-tier-2 animate-slide-up stagger-3">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-semibold flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                            <Tablet className="text-saffron" size={18} /> Device Status
                        </h2>
                        <a
                            href="/devices"
                            className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                            onClick={(e) => {
                                e.preventDefault();
                                navigate('/devices');
                            }}
                        >
                            Manage Devices
                            <ChevronRight size={14} />
                        </a>
                    </div>
                    <div className="flex items-center justify-center mb-6 py-4">
                        {/* Simple CSS Pie Chart - Enterprise Style */}
                        <div className="relative w-36 h-36">
                            <div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: `conic-gradient(
                                        #2EAD6D 0deg ${onlinePercent * 3.6}deg,
                                        #E5E7EB ${onlinePercent * 3.6}deg 360deg
                                    )`,
                                    border: '2px solid #FFFFFF'
                                }}
                            />
                            <div className="absolute inset-0 rounded-full scale-[0.88] bg-white" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[28px] font-bold text-slate-900 dark:text-slate-100">{stats.devices}</span>
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Devices</span>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2 text-sm">
                        <button
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                            onClick={() => {
                                // Future: Filter devices by online status
                                console.log('Filter: Online devices');
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#2EAD6D' }} />
                                <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Online</span>
                            </div>
                            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{stats.devicesOnline}</span>
                        </button>
                        <button
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                            onClick={() => {
                                // Future: Filter devices by offline status
                                console.log('Filter: Offline devices');
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                                <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Offline</span>
                            </div>
                            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{stats.devices - stats.devicesOnline}</span>
                        </button>
                        <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Live sync from {stats.devices} device{stats.devices !== 1 ? 's' : ''}</span>
                            {lastUpdated && (
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Live · Updated {Math.floor((new Date() - lastUpdated) / 1000 / 60)} min{Math.floor((new Date() - lastUpdated) / 1000 / 60) !== 1 ? 's' : ''} ago
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Attendance Exception Chart - Staggered */}
                <div className="card-base animate-slide-up stagger-4">
                    <h2 className="font-semibold mb-4 flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                        <TrendingUp className="text-saffron" size={18} /> Attendance Exception
                    </h2>
                    <div className="h-48 pt-4">
                        {/* Simple Bar Chart */}
                        <div className="flex items-end justify-between h-full gap-3">
                            {attendanceTrends.map((day, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 group cursor-default">
                                    <div className="flex flex-col items-center w-full gap-0.5" style={{ height: '140px' }}>
                                        <div
                                            className="w-full bg-saffron-light rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity"
                                            style={{ height: `${Math.min(day.late * 3, 40)}px` }}
                                            title={`Late: ${day.late}`}
                                        />
                                        <div
                                            className="w-full bg-saffron opacity-90 group-hover:opacity-100 transition-opacity"
                                            style={{ height: `${Math.min(day.earlyLeave * 3, 40)}px` }}
                                            title={`Early Leave: ${day.earlyLeave}`}
                                        />
                                        <div
                                            className="w-full bg-saffron-dark rounded-b-sm group-hover:opacity-100 transition-opacity"
                                            style={{ height: `${Math.min(day.absent * 2, 40)}px` }}
                                            title={`Absent: ${day.absent}`}
                                        />
                                    </div>
                                    <span className="text-[10px] text-slate-grey font-bold uppercase tracking-wider">{day.date}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-center gap-4 mt-6 text-[10px] font-bold text-slate-grey uppercase tracking-wider">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-saffron-light rounded-full" /> Late</div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-saffron rounded-full" /> Early Leave</div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-saffron-dark rounded-full" /> Absent</div>
                    </div>
                </div>

                {/* Real-Time Monitor - Staggered */}
                <div className="card-tier-2 animate-slide-up stagger-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                            <Clock className="text-green-500 animate-pulse" size={18} /> Real-Time Monitor
                        </h2>
                        <a
                            href="/logs"
                            className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                            onClick={(e) => {
                                e.preventDefault();
                                navigate('/logs');
                            }}
                        >
                            Go to Live Monitor
                            <ChevronRight size={14} />
                        </a>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {recentLogs.length === 0 ? (
                            <div className="text-center py-10 rounded-xl text-[13px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                                <div className="mb-2 font-medium">No attendance data yet</div>
                                <div className="text-xs text-slate-400">Devices will sync automatically once employees check in</div>
                            </div>
                        ) : (() => {
                            const now = new Date();
                            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
                            const recent = recentLogs.filter(log => new Date(log.punch_time) > fiveMinutesAgo);
                            const older = recentLogs.filter(log => new Date(log.punch_time) <= fiveMinutesAgo);

                            return (
                                <>
                                    {recent.length > 0 && (
                                        <div className="mb-3">
                                            <div className="text-xs font-semibold mb-2 uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Last 5 mins
                                            </div>
                                            {recent.map((log, i) => (
                                                <div
                                                    key={i}
                                                    className={`flex items-center justify-between py-3 px-4 rounded-lg transition-all mb-2 ${i === 0 ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 animate-pulse' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                                    style={i === 0 ? { animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' } : {}}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-1.5 rounded-lg ${log.punch_type === 'IN' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                                            {log.punch_type === 'IN' ? <LogIn size={14} style={{ color: '#2EAD6D' }} /> : <LogOutIcon size={14} style={{ color: '#E5533D' }} />}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{log.employee_name || log.emp_name || log.employee_code}</div>
                                                            <div className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">{log.device_name || log.device_serial}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                                                            {formatTimeShort(log.punch_time)}
                                                        </div>
                                                        <div className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${log.punch_type === 'IN' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                                                            {log.punch_type || 'PUNCH'}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {older.length > 0 && (
                                        <div>
                                            <div className="text-xs font-semibold mb-2 uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                Earlier
                                            </div>
                                            {older.map((log, i) => (
                                                <div
                                                    key={i + recent.length}
                                                    className="flex items-center justify-between py-3 px-4 rounded-lg transition-all mb-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-1.5 rounded-lg ${log.punch_type === 'IN' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                                            {log.punch_type === 'IN' ? <LogIn size={14} style={{ color: '#2EAD6D' }} /> : <LogOutIcon size={14} style={{ color: '#E5533D' }} />}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">{log.employee_name || log.emp_name || log.employee_code}</div>
                                                            <div className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">{log.device_name || log.device_serial}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                                                            {formatTimeShort(log.punch_time)}
                                                        </div>
                                                        <div className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${log.punch_type === 'IN' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                                                            {log.punch_type || 'PUNCH'}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Bottom Row - Device List & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Today's Summary - Staggered */}
                <div className="card-tier-2 animate-slide-up stagger-6">
                    <h2 className="font-semibold mb-6 flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                        <Calendar className="text-indigo-500" size={18} /> Today's Summary
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="summary-card-success">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="card-title mb-1">Check-ins</div>
                                    <div className="card-value">{stats.present}</div>
                                </div>
                                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(46, 173, 109, 0.1)' }}>
                                    <ArrowUpRight size={20} style={{ color: '#2EAD6D' }} />
                                </div>
                            </div>
                        </div>
                        <div className="summary-card-error">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="card-title mb-1">Absent</div>
                                    <div className="card-value">{stats.absent}</div>
                                </div>
                                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(229, 83, 61, 0.1)' }}>
                                    <ArrowDownRight size={20} style={{ color: '#E5533D' }} />
                                </div>
                            </div>
                        </div>
                        <div className="summary-card-warning">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="card-title mb-1">Late Arrivals</div>
                                    <div className="card-value">{stats.late}</div>
                                </div>
                                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(224, 155, 45, 0.1)' }}>
                                    <Timer size={20} style={{ color: '#E09B2D' }} />
                                </div>
                            </div>
                        </div>
                        <div className="summary-card-neutral">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="card-title mb-1">On Leave</div>
                                    <div className="card-value">{stats.onLeave}</div>
                                </div>
                                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(156, 163, 175, 0.1)' }}>
                                    <Calendar size={20} className="text-slate-500 dark:text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Device List - Staggered */}
                <div className="card-tier-2 animate-slide-up stagger-6">
                    <h2 className="font-semibold mb-6 flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                        <Wifi className="text-blue-500" size={18} /> Connected Devices
                    </h2>
                    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="table-header" style={{ textAlign: 'left' }}>Device</th>
                                    <th className="table-header" style={{ textAlign: 'left' }}>IP Address</th>
                                    <th className="table-header" style={{ textAlign: 'center' }}>Users</th>
                                    <th className="table-header" style={{ textAlign: 'center' }}>FP</th>
                                    <th className="table-header" style={{ textAlign: 'center' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-12 text-slate-500 dark:text-slate-400">
                                            <div className="flex flex-col items-center gap-2">
                                                <WifiOff size={32} className="text-slate-300 mb-2" />
                                                <div className="font-medium">No devices registered</div>
                                                <div className="text-xs text-slate-400">Add devices to start tracking attendance</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : devices.slice(0, 5).map(d => (
                                    <tr key={d.id || d.serial_number} className="table-row">
                                        <td className="px-6 py-4" style={{ textAlign: 'left', color: '#1E40AF', fontWeight: 600, fontSize: '14px' }}>
                                            {d.device_name || d.serial_number}
                                        </td>
                                        <td className="px-6 py-4" style={{ textAlign: 'left', color: '#7C3AED', fontFamily: 'monospace', fontSize: '12px', fontWeight: 500 }}>
                                            {d.ip_address}{d.port ? `:${d.port}` : ''}
                                        </td>
                                        <td className="px-6 py-4" style={{ textAlign: 'center', color: '#059669', fontWeight: 600, fontSize: '14px' }}>
                                            {d.user_count || 0}
                                        </td>
                                        <td className="px-6 py-4" style={{ textAlign: 'center', color: '#DC2626', fontWeight: 600, fontSize: '14px' }}>
                                            {d.fingerprint_count || 0}
                                        </td>
                                        <td className="px-6 py-4" style={{ textAlign: 'center' }}>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${d.status === 'online' ? 'status-active' : 'badge-inactive'}`}>
                                                {d.status === 'online' ? <Wifi size={9} /> : <WifiOff size={9} />}
                                                {d.status || 'offline'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
