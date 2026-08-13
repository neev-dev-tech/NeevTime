import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { useTheme } from '../components/Theme';
import HeroStat from '../components/HeroStat';
import useReveal from '../hooks/useReveal';
import DonutCard from '../components/DonutCard';
import { categoricalPalette } from '../utils/chartPalette';

export default function Dashboard() {
    const navigate = useNavigate();
    // Charts follow the palette chosen in Settings → Appearance rather than
    // hardcoding orange, so a rebranded deployment does not end up with an
    // orange dashboard sitting inside its own colours.
    const { themeColors, isDarkMode } = useTheme();
    // A fixed, validated categorical order rather than anything derived from
    // the brand colour — see chartPalette for why generated hues were the wrong
    // trade for slices that only need to be told apart.
    const donutPalette = useMemo(() => categoricalPalette(isDarkMode), [isDarkMode]);
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
    const [statusMix, setStatusMix] = useState([]);
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

            // allSettled, not all. With Promise.all a single failing endpoint
            // rejected the lot and the catch below left every figure at its
            // initial zero — the whole dashboard read 0 employees, 0 devices,
            // 0 punches because one query had broken. Each panel now stands or
            // falls on its own request.
            const [employeesRes, devicesRes, summaryRes, logsRes, yesterdaySummaryRes] =
                await Promise.allSettled([
                    api.get('/api/employees'),
                    api.get('/api/devices'),
                    api.get('/api/attendance/summary', { params: { date: today } }),
                    api.get('/api/logs', { params: { limit: 100 } }),
                    api.get('/api/attendance/summary', { params: { date: yesterday } })
                ]);

            const rowsOfSettled = (settled) =>
                (settled.status === 'fulfilled' ? settled.value.data : null) || [];

            const failed = [employeesRes, devicesRes, summaryRes, logsRes, yesterdaySummaryRes]
                .filter(r => r.status === 'rejected');
            if (failed.length) {
                // Logged rather than swallowed: a panel quietly showing zero is
                // indistinguishable from a genuine zero, which is what made the
                // original failure so hard to place.
                console.error('Dashboard: %d of 5 requests failed', failed.length,
                    failed.map(f => f.reason?.response?.data?.error || f.reason?.message));
            }

            const employees = rowsOfSettled(employeesRes);
            const devicesList = rowsOfSettled(devicesRes);
            const summary = rowsOfSettled(summaryRes);
            const yesterdaySummary = rowsOfSettled(yesterdaySummaryRes);

            // Calculate stats
            const newJoinees = employees.filter(e => {
                const joinDate = new Date(e.joining_date || e.created_at);
                return joinDate >= new Date(sevenDaysAgo);
            }).length;

            const resigned = employees.filter(e => e.status === 'resigned' || e.resignation_date).length;

            // Headcount per department, for the middle donut.
            //
            // It used to be absences by month, which said the same thing as the
            // two charts either side of it — three rings all counting problems,
            // and the monthly one covering a window most deployments have no
            // punch history for. Headcount is a different axis entirely, needs
            // no extra request, and answers a question nothing else on the page
            // does: how the company is actually distributed.
            const byDept = {};
            employees
                .filter(e => e.status !== 'resigned' && !e.resignation_date)
                .forEach(e => {
                    const name = e.department_name || 'Unassigned';
                    byDept[name] = (byDept[name] || 0) + 1;
                });
            setStatusMix(
                Object.entries(byDept)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
            );
            const devicesOnline = devicesList.filter(d => d.status === 'online').length;
            const verificationCount = devicesList.reduce((sum, d) => sum + (d.fingerprint_count || 0) + (d.face_count || 0), 0);

            // "Present" means the person turned up. Matching the literal status
            // string missed everyone on a Half Day, Short Day or Miss Punch, so
            // 57 people with punches counted as neither present nor absent and
            // attendance read 0%. Anything that is not an explicit non-attendance
            // status is someone who came in.
            const NON_ATTENDING = ['Absent', 'Weekly Off', 'Holiday', 'On Leave'];
            const present = summary.filter(r => !NON_ATTENDING.includes(r.status)).length;
            // The summary now carries a row per expected employee rather than
            // only those who punched, so absence is a direct count instead of
            // a subtraction from the headcount — which drifted whenever the two
            // sides disagreed about who was expected (exempt staff, people who
            // had not started yet).
            const absentRows = summary.filter(r => r.status === 'Absent').length;
            const absent = absentRows;
            const late = summary.filter(r => (r.late_minutes || 0) > 0).length;
            const earlyLeave = summary.filter(r => (r.early_leave_minutes || 0) > 0).length;
            const onLeave = summary.filter(r => r.status === 'On Leave').length;

            // Calculate additional metrics
            const totalEmployees = employees.length;
            const attendanceRate = totalEmployees > 0 ? Math.round((present / totalEmployees) * 100) : 0;
            const punctualityRate = totalEmployees > 0 ? Math.round(((totalEmployees - late) / totalEmployees) * 100) : 0;
            const totalPunches = rowsOfSettled(logsRes).length;
            const avgHours = summary.length > 0
                ? Math.round(summary.reduce((sum, r) => sum + (r.duration_minutes || 0), 0) / summary.length / 60 * 10) / 10
                : 0;

            // Calculate yesterday's stats for benchmarking
            const yesterdayPresent = yesterdaySummary.filter(r => !NON_ATTENDING.includes(r.status)).length;
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

            // Splitting the timestamp on "T" took the UTC date, and the buckets
            // above are keyed by local date. In IST a row for the 13th arrives
            // as 2026-08-12T18:30:00Z, so every absence and late arrival landed
            // on the day before — the whole chart was shifted back one day, and
            // today's own rows fell outside the window entirely and vanished.
            const localKey = (value) => (value ? toLocalDateString(new Date(value)) : null);

            rowsOf(lateEarlyRes).forEach(row => {
                const key = localKey(row.attendance_date);
                if (!key || !byDate[key]) return;
                if (row.late_minutes > 0) byDate[key].late += 1;
                if (row.early_minutes > 0) byDate[key].earlyLeave += 1;
            });
            rowsOf(absentRes).forEach(row => {
                const key = localKey(row.absent_date);
                if (key && byDate[key]) byDate[key].absent += 1;
            });

            setAttendanceTrends(Object.values(byDate));
        } catch (err) { console.error(err); }
    };


    /**
     * A stat tile.
     *
     * Colour carries meaning rather than decorating: plain counts stay neutral so
     * the eye is not pulled nine ways at once, and only figures that represent a
     * judgement — a rate that is good or bad, a device that is offline — take a
     * semantic tone. The previous version gave all nine tiles a different pastel,
     * which made everything equally loud and therefore nothing readable.
     *
     * tone: 'neutral' | 'good' | 'warn' | 'bad'
     */
    const TONES = {
        neutral: {
            chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-slate-400'
        },
        // Identity colours: the icon is coloured by what it counts, while the
        // figure itself stays near-black so the numbers remain the thing you read.
        people: {
            chip: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-blue-500'
        },
        device: {
            chip: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-violet-500'
        },
        biometric: {
            chip: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-cyan-500'
        },
        activity: {
            chip: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-indigo-500'
        },
        time: {
            chip: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',
            value: 'text-slate-900 dark:text-slate-50',
            rule: 'bg-teal-500'
        },
        good: {
            chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            value: 'text-emerald-700 dark:text-emerald-300',
            rule: 'bg-emerald-500'
        },
        warn: {
            chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
            value: 'text-amber-700 dark:text-amber-300',
            rule: 'bg-amber-500'
        },
        bad: {
            chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
            value: 'text-rose-700 dark:text-rose-300',
            rule: 'bg-rose-500'
        }
    };

    /**
     * The same glass language as the headline cards, dialled down: no bloom, a
     * thinner ring, and the figure in near-black rather than the accent. These
     * are reference numbers rather than headlines, and eight cards each glowing
     * in their own colour would undo the point of having a headline row at all.
     */
    const StatCard = ({ icon: Icon, label, value, subtitle, tooltip, trend, tone = 'neutral' }) => {
        const t = TONES[tone] || TONES.neutral;
        const revealRef = useReveal();
        return (
            <div ref={revealRef} className="group relative overflow-hidden rounded-xl !p-3 flex items-center gap-3
                            bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl
                            shadow-sm ring-1 ring-slate-900/[0.06] dark:ring-white/[0.07]
                            hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300">
                {/* A hairline that lights up on hover, so the row still has
                    motion without every tile carrying a permanent colour. */}
                <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${t.rule || 'bg-slate-400'}`}
                />
                <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-105 ${t.chip}`}>
                    <Icon size={17} strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                        <p className="text-[9px] font-bold uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
                        {tooltip && <Info size={11} className="text-slate-400 cursor-help shrink-0" title={tooltip} />}
                    </div>
                    <p className={`text-xl leading-tight font-bold tabular-nums truncate tracking-tight ${t.value}`}>{value}</p>
                    {(trend || subtitle) && (
                        <p className="text-[10px] leading-tight truncate"
                           style={trend?.color ? { color: trend.color } : undefined}>
                            <span className={trend ? 'font-semibold' : 'text-slate-500 dark:text-slate-400'}>
                                {trend ? trend.text : subtitle}
                            </span>
                        </p>
                    )}
                </div>
            </div>
        );
    };

    /** Rates read as good/warn/bad; everything else stays neutral. */
    const rateTone = (pct) => (pct >= 85 ? 'good' : pct >= 60 ? 'warn' : 'bad');


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
                <div className="space-y-4">
                    {/* The four headline counts. Who is on the payroll, who is
                        in, who is missing, who was late — the questions the page
                        exists to answer, given the weight to match. Each one
                        opens the list behind it, because the number on its own
                        prompts "which of them?" every time. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <HeroStat
                            icon={Users}
                            label="Employees"
                            value={stats.employees || 0}
                            accent={themeColors.info}
                            hint={stats.resigned ? `${stats.resigned} resigned` : 'on the payroll'}
                            onClick={() => navigate('/employees')}
                        />
                        <HeroStat
                            icon={CheckCircle}
                            label="Present"
                            value={stats.present || 0}
                            accent={themeColors.success}
                            share={stats.employees ? stats.present / stats.employees : null}
                            shareLabel={`${stats.present || 0} of ${stats.employees || 0} in today`}
                            trend={yesterdayStats.present > 0
                                ? `${stats.present >= yesterdayStats.present ? '↑' : '↓'} ${Math.abs(Math.round(((stats.present - yesterdayStats.present) / yesterdayStats.present) * 100))}% vs yesterday`
                                : undefined}
                            onClick={() => navigate('/attendance-register')}
                        />
                        <HeroStat
                            icon={XCircle}
                            label="Absent"
                            value={stats.absent || 0}
                            accent={themeColors.error}
                            share={stats.employees ? stats.absent / stats.employees : null}
                            shareLabel={stats.onLeave
                                ? `${stats.onLeave} more on approved leave`
                                : `${stats.absent || 0} of ${stats.employees || 0}, excluding leave`}
                            onClick={() => navigate('/attendance-register')}
                        />
                        <HeroStat
                            icon={Timer}
                            label="Late Corners"
                            value={stats.late || 0}
                            accent={themeColors.warning}
                            share={stats.present ? stats.late / stats.present : null}
                            shareLabel={`${stats.late || 0} of ${stats.present || 0} who came in`}
                            onClick={() => navigate('/reports/first-last')}
                        />
                    </div>

                    {/* Standing facts — neutral, so they do not compete with the above */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <StatCard
                            icon={Percent}
                            label="Attendance"
                            value={`${stats.attendanceRate || 0}%`}
                            subtitle={`${stats.present || 0} of ${stats.employees || 0} in`}
                            tone={rateTone(stats.attendanceRate || 0)}
                            tooltip="Share of employees with at least one punch today"
                        />
                        <StatCard
                            icon={Target}
                            label="Punctuality"
                            value={`${stats.punctualityRate || 0}%`}
                            subtitle={stats.late ? `${stats.late} late` : 'nobody late'}
                            tone={rateTone(stats.punctualityRate || 0)}
                        />
                        <StatCard
                            icon={Activity}
                            label="Punches"
                            value={stats.totalPunches || 0}
                            subtitle="today"
                            tone="activity"
                        />
                        <StatCard
                            icon={Clock}
                            label="Avg Hours"
                            value={`${stats.avgHours || 0}h`}
                            subtitle="per employee"
                            tone="time"
                        />
                        <StatCard
                            icon={UserPlus}
                            label="New Joinees"
                            value={stats.newJoinees}
                            subtitle="last 7 days"
                            tone={stats.newJoinees > 0 ? 'good' : 'neutral'}
                        />
                        <StatCard
                            icon={UserMinus}
                            label="Resigned"
                            value={stats.resigned}
                            tone={stats.resigned > 0 ? 'bad' : 'neutral'}
                        />
                        <StatCard
                            icon={Tablet}
                            label="Devices"
                            value={stats.devices}
                            tone={stats.devices > 0 && stats.devicesOnline < stats.devices ? 'bad' : 'device'}
                            trend={stats.devices > 0
                                ? (stats.devicesOnline === stats.devices
                                    ? { text: 'all online', color: '#059669' }
                                    : { text: `${stats.devices - stats.devicesOnline} offline`, color: '#DC2626' })
                                : null}
                        />
                        <StatCard icon={Fingerprint} label="Verifications" value={stats.verificationCount} tone="biometric" />
                        {/* Moved up from the removed attendance-status row —
                            the only two figures on it that were not already
                            stated by the headline cards. */}
                        <StatCard
                            icon={LogOutIcon}
                            label="Early Leave"
                            value={stats.earlyLeave}
                            subtitle="left before shift end"
                            tone={stats.earlyLeave > 0 ? 'warn' : 'neutral'}
                        />
                        <StatCard
                            icon={Calendar}
                            label="On Leave"
                            value={stats.onLeave}
                            subtitle="approved today"
                            tone="neutral"
                        />
                    </div>
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

            {/* Breakdown donuts.
                The headline row says how many were absent or late today; these
                say whether that is normal. A single day's count is unreadable
                without it — four absent means nothing until you can see that
                last Tuesday had eleven. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DonutCard
                    title="Absentees — last 7 days"
                    subtitle="Unplanned absences per day"
                    loading={loading}
                    data={attendanceTrends.map(d => ({ name: d.date, value: d.absent }))}
                    colors={donutPalette}
                    emptyMessage="No absences in the last 7 days"
                />
                <DonutCard
                    title="Workforce by department"
                    subtitle="Active headcount"
                    loading={loading}
                    data={statusMix}
                    colors={donutPalette}
                    emptyMessage="No employees on the payroll yet"
                />
                <DonutCard
                    title="Late Corners — last 7 days"
                    subtitle="Arrivals after shift start"
                    loading={loading}
                    data={attendanceTrends.map(d => ({ name: d.date, value: d.late }))}
                    colors={donutPalette}
                    emptyMessage="Nobody arrived late in the last 7 days"
                />
            </div>

            {/* "Today's Attendance Status" lived here and was removed: Present,
                Absent and Late Arrival simply restated the headline cards a
                screen above, in the same colours, so the page said everything
                twice. Early Leave and On Leave were the only figures unique to
                it and have moved up into the tile grid; the vs-yesterday
                comparison moved onto the Present card. */}

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
                    {/* A donut for a single ratio was 140px of chart to say "4 of 4".
                        A bar carries the same fact in a fraction of the space, and
                        the fleet is listed in full under Connected Devices. */}
                    <div className="mb-5">
                        <div className="flex items-baseline gap-2">
                            <span className="text-[34px] leading-none font-bold tabular-nums text-slate-900 dark:text-slate-50">
                                {stats.devicesOnline}
                            </span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                of {stats.devices} online
                            </span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${onlinePercent === 100 ? 'bg-emerald-500' : onlinePercent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${onlinePercent}%` }}
                            />
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
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="font-semibold flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                            <TrendingUp className="text-orange-500" size={18} /> Attendance Exceptions
                        </h2>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">last 7 days</span>
                    </div>
                    {(() => {
                        // One shared scale across every bar. The previous version
                        // multiplied each series by a different constant and capped
                        // it at 40px, so bar heights carried no information — and
                        // all three series were shades of the same orange, which
                        // made them impossible to tell apart.
                        const peak = Math.max(
                            1,
                            ...attendanceTrends.map(d => (d.late || 0) + (d.earlyLeave || 0) + (d.absent || 0))
                        );
                        const H = 150;
                        const px = (n) => (n > 0 ? Math.max(3, Math.round((n / peak) * H)) : 0);
                        const anyData = attendanceTrends.some(d => (d.late || 0) + (d.earlyLeave || 0) + (d.absent || 0) > 0);

                        if (!attendanceTrends.length) {
                            return <div className="h-[190px] rounded-xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />;
                        }
                        if (!anyData) {
                            return (
                                <div className="h-[190px] flex flex-col items-center justify-center text-center">
                                    <CheckCircle size={26} className="text-emerald-500 mb-2" />
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No exceptions</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Nobody was late, left early or absent in the last 7 days.
                                    </p>
                                </div>
                            );
                        }
                        return (
                            <>
                                <div className="flex items-end justify-between gap-2 mt-3" style={{ height: `${H + 26}px` }}>
                                    {attendanceTrends.map((day, i) => {
                                        const total = (day.late || 0) + (day.earlyLeave || 0) + (day.absent || 0);
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                                                <span className="text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                                                    {total || ''}
                                                </span>
                                                <div className="w-full flex flex-col justify-end rounded-md overflow-hidden"
                                                     style={{ height: `${H}px` }}
                                                     title={`${day.date} — late ${day.late || 0}, early leave ${day.earlyLeave || 0}, absent ${day.absent || 0}`}>
                                                    <div style={{ height: `${px(day.late)}px` }} className="w-full bg-amber-400" />
                                                    <div style={{ height: `${px(day.earlyLeave)}px` }} className="w-full bg-orange-500" />
                                                    <div style={{ height: `${px(day.absent)}px` }} className="w-full bg-rose-500" />
                                                </div>
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate w-full text-center">
                                                    {day.date}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-center gap-5 mt-4 text-[11px] text-slate-600 dark:text-slate-300">
                                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Late</div>
                                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Early leave</div>
                                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Absent</div>
                                </div>
                            </>
                        );
                    })()}
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
                {/* "Today's Summary" removed: it repeated Present, Absent, Late
                    Arrivals and On Leave from Today's Attendance Status above,
                    with the same values from the same fields. */}

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
