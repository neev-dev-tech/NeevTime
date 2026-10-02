import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import io from 'socket.io-client';
import {
    AlertTriangle, CheckCircle, WifiOff, RefreshCw, ChevronRight, Circle,
    Plane, FileCheck, LogIn, LogOut as LogOutIcon, Timer, TrendingUp, TrendingDown
} from 'lucide-react';
import { formatTimeShort, toLocalDateString, formatDateWithWeekday } from '../utils/dateFormat';
import SetupChecklist from '../components/SetupChecklist';

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
    const [statusMix, setStatusMix] = useState([]);
    // Today's summary rows (one per expected employee) for the department table.
    const [todayRows, setTodayRows] = useState([]);
    // Pending approvals, from the same endpoint the notification bell uses.
    const [pending, setPending] = useState({ pending_leave: 0, pending_regularizations: 0 });
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    // Set when some dashboard requests fail, so a zero caused by a broken
    // query is never mistaken for a real zero.
    const [loadWarning, setLoadWarning] = useState(null);
    const socketRef = useRef(null);

    useEffect(() => {
        fetchAllData();

        // Setup socket for real-time updates
        // Use relative URL - Vite proxy handles /socket.io in dev, production uses same origin
        const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
        socketRef.current = io(socketUrl, {
            // The live feed needs a staff token, like the API.
            auth: (cb) => cb({ token: localStorage.getItem('token') }),
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
            fetchAttendanceTrends(),
            api.get('/api/notifications/summary').then(r => setPending(r.data || {})).catch(() => {})
        ]);
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const today = toLocalDateString();
            const yesterday = toLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
            const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

            // allSettled, not all. With Promise.all a single failing endpoint
            // rejected the lot and the catch below left every figure at its
            // initial zero — the whole dashboard read 0 employees, 0 devices,
            // 0 punches because one query had broken. Each panel now stands or
            // falls on its own request.
            const [employeesRes, devicesRes, summaryRes, logsRes, yesterdaySummaryRes, punchCountRes] =
                await Promise.allSettled([
                    api.get('/api/employees'),
                    api.get('/api/devices'),
                    api.get('/api/attendance/summary', { params: { date: today } }),
                    // Date-filtered, and the count comes from a real COUNT(*).
                    // This used to be an undated limit-100 fetch whose array
                    // length was displayed as "Punches today" — so it read 100
                    // every day, including the 145 days on which nothing was
                    // recorded at all.
                    api.get('/api/logs', { params: { date: today, limit: 200 } }),
                    api.get('/api/attendance/summary', { params: { date: yesterday } }),
                    api.get('/api/logs/count', { params: { date: today } })
                ]);

            const rowsOfSettled = (settled) =>
                (settled.status === 'fulfilled' ? settled.value.data : null) || [];

            const failed = [employeesRes, devicesRes, summaryRes, logsRes, yesterdaySummaryRes, punchCountRes]
                .filter(r => r.status === 'rejected');
            setLoadWarning(failed.length
                ? `${failed.length} of 6 dashboard requests failed (${failed[0].reason?.response?.data?.error || failed[0].reason?.message || 'network error'}). Figures showing 0 may be wrong.`
                : null);
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
            setTodayRows(summary);
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
            // A real count for today, not the number of rows that came back.
            const totalPunches = punchCountRes.status === 'fulfilled'
                ? (punchCountRes.value.data?.count ?? 0)
                : 0;
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
            // Today only. Without the filter this showed the newest rows in the
            // table whatever their date, so March punches appeared in a panel
            // titled "Real-Time Monitor" while nothing was being collected.
            const res = await api.get('/api/logs', {
                params: { date: toLocalDateString(new Date()), limit: 10 }
            });
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
            const end = toLocalDateString();
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


    // ── Derived figures for the layout ───────────────────────────────────
    // Today's attendance split into parts that add up to the headcount, so one
    // bar can show the whole day: on time + late + on leave + not in.
    const onTime = Math.max(0, stats.present - stats.late);
    const notIn = Math.max(0, stats.employees - stats.present - stats.onLeave);
    const dayParts = [
        { key: 'ontime', label: 'On time', value: onTime, bar: 'bg-emerald-500', to: '/attendance-register?status=Present' },
        { key: 'late', label: 'Late', value: stats.late, bar: 'bg-amber-400', to: '/attendance-register?late=1' },
        { key: 'leave', label: 'On leave', value: stats.onLeave, bar: 'bg-sky-400', to: '/leaves?status=Approved' },
        { key: 'out', label: 'Not in', value: notIn, bar: 'bg-slate-200 dark:bg-slate-700', to: '/attendance-register?status=Absent' }
    ];
    const dayTotal = dayParts.reduce((n, p) => n + p.value, 0);
    const presentDelta = stats.attendanceRate - (yesterdayStats.attendanceRate || 0);

    // What needs someone's attention now. Only non-zero items are listed.
    const offline = Math.max(0, stats.devices - stats.devicesOnline);
    const attention = [
        offline > 0 && { icon: WifiOff, tone: 'critical', label: `${offline} device${offline === 1 ? '' : 's'} offline`, hint: `${stats.devicesOnline} of ${stats.devices} online`, to: '/devices' },
        pending.pending_leave > 0 && { icon: Plane, tone: 'warning', label: `${pending.pending_leave} leave request${pending.pending_leave === 1 ? '' : 's'} to approve`, to: '/leaves?status=Pending' },
        pending.pending_regularizations > 0 && { icon: FileCheck, tone: 'warning', label: `${pending.pending_regularizations} regularization${pending.pending_regularizations === 1 ? '' : 's'} to review`, to: '/regularizations' },
        stats.late > 0 && { icon: Timer, tone: 'warning', label: `${stats.late} late today`, to: '/attendance-register?late=1' },
        stats.earlyLeave > 0 && { icon: LogOutIcon, tone: 'neutral', label: `${stats.earlyLeave} left early today`, to: '/reports/early-leaving' }
    ].filter(Boolean);

    // Today by department: staff, in, late, not in.
    const byDepartment = useMemo(() => {
        const NON_ATTENDING = ['Absent', 'Weekly Off', 'Holiday', 'On Leave'];
        const map = {};
        for (const r of todayRows) {
            const name = r.department || r.department_name || 'Unassigned';
            const d = (map[name] ||= { name, staff: 0, present: 0, late: 0, absent: 0 });
            d.staff += 1;
            if (!NON_ATTENDING.includes(r.status)) d.present += 1;
            if ((r.late_minutes || 0) > 0) d.late += 1;
            if (r.status === 'Absent') d.absent += 1;
        }
        return Object.values(map).sort((a, b) => b.staff - a.staff);
    }, [todayRows]);

    const trendMax = Math.max(1, ...attendanceTrends.map(d => (d.absent || 0) + (d.late || 0)));
    const minsAgo = lastUpdated ? Math.floor((new Date() - lastUpdated) / 60000) : null;

    return (
        // Full-bleed, like the list pages: bands separated by hairlines rather
        // than a grid of floating cards.
        <div className="-m-4 sm:-m-6 min-h-[calc(100%+2rem)] sm:min-h-[calc(100%+3rem)] bg-app-surface">
            {/* Title bar */}
            <div className="flex items-center gap-x-4 gap-y-1 px-4 sm:px-6 min-h-14 py-2.5 border-b border-slate-200 dark:border-slate-800 flex-wrap">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">Dashboard</h1>
                <span className="text-[13px] text-slate-600 dark:text-slate-400">
                    {formatDateWithWeekday(new Date())}
                </span>
                {minsAgo !== null && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                        <Circle size={6} className="text-emerald-500 fill-emerald-500" aria-hidden="true" />
                        Live · updated {minsAgo === 0 ? 'just now' : `${minsAgo} min${minsAgo === 1 ? '' : 's'} ago`}
                    </span>
                )}
                <button
                    type="button"
                    onClick={fetchAllData}
                    className="ml-auto grid place-items-center w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    aria-label="Refresh"
                    title="Refresh"
                >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Load problems and first-run setup; collapses when both are empty. */}
            <div className="px-4 sm:px-6 pt-4 space-y-3 empty:hidden">
                    {loadWarning && (
                        <div role="alert" className="flex items-center gap-3 flex-wrap p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span className="flex-1 min-w-0">{loadWarning}</span>
                            <button type="button" onClick={fetchAllData} className="font-semibold underline underline-offset-2">Retry</button>
                        </div>
                    )}
                    <SetupChecklist />
            </div>

            {/* Band 1: today at a glance + what needs attention */}
            <section className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] border-b border-slate-200 dark:border-slate-800">
                <div className="px-4 sm:px-6 py-5 lg:border-r border-slate-200 dark:border-slate-800">
                    <h2 className="text-[13px] font-medium text-slate-600 dark:text-slate-400">Present today</h2>
                    {loading ? (
                        <div className="mt-3 h-12 w-48 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    ) : (
                        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                            <span className="text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{stats.present}</span>
                            <span className="text-lg text-slate-500 dark:text-slate-400">of {stats.employees}</span>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{stats.attendanceRate}% attendance</span>
                            {yesterdayStats.attendanceRate > 0 && presentDelta !== 0 && (
                                <span className={`text-xs font-medium ${presentDelta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                    {presentDelta > 0 ? '▲' : '▼'} {Math.abs(presentDelta)} pts vs yesterday
                                </span>
                            )}
                        </div>
                    )}

                    {/* The day as one bar: every employee lands in exactly one part */}
                    <div className="mt-5">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 gap-[2px]" role="img"
                            aria-label={dayParts.map(p => `${p.label} ${p.value}`).join(', ')}>
                            {dayTotal > 0 && dayParts.filter(p => p.value > 0).map(p => (
                                <div key={p.key} className={`${p.bar} h-full first:rounded-l-full last:rounded-r-full`}
                                    style={{ width: `${(p.value / dayTotal) * 100}%` }} title={`${p.label}: ${p.value}`} />
                            ))}
                        </div>
                        <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {dayParts.map(p => (
                                <li key={p.key}>
                                    <button type="button" onClick={() => navigate(p.to)}
                                        className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                            <span aria-hidden="true" className={`w-2 h-2 rounded-full ${p.bar}`} />{p.label}
                                        </span>
                                        <span className="mt-0.5 block text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{p.value}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="px-4 sm:px-6 py-5 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                    <h2 className="text-[13px] font-medium text-slate-600 dark:text-slate-400">Needs attention</h2>
                    {attention.length === 0 ? (
                        <div className="mt-4 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                            <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                            All clear — devices online, nothing waiting for approval.
                        </div>
                    ) : (
                        <ul className="mt-2 -mx-2 divide-y divide-slate-100 dark:divide-slate-800">
                            {attention.map(item => (
                                <li key={item.label}>
                                    <button type="button" onClick={() => navigate(item.to)}
                                        className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${TONE[item.tone]}`}>
                                            <item.icon size={16} />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.label}</span>
                                            {item.hint && <span className="block text-xs text-slate-600 dark:text-slate-400">{item.hint}</span>}
                                        </span>
                                        <ChevronRight size={15} className="text-slate-300 dark:text-slate-500 shrink-0" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </section>

            {/* Band 2: key figures in one row */}
            <section aria-label="Key figures" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-slate-200 dark:border-slate-800 divide-x divide-y lg:divide-y-0 divide-slate-200 dark:divide-slate-800">
                {[
                    { label: 'Employees', value: stats.employees, hint: stats.newJoinees ? `+${stats.newJoinees} joined this week` : 'on the payroll', to: '/employees' },
                    { label: 'Punctuality', value: `${stats.punctualityRate}%`, hint: stats.late ? `${stats.late} late` : 'nobody late', to: '/attendance-register?late=1' },
                    { label: 'Punches today', value: stats.totalPunches, hint: 'from all devices', to: '/logs' },
                    { label: 'Avg hours', value: `${stats.avgHours}h`, hint: 'per employee today', to: '/attendance-register' },
                    { label: 'Devices online', value: `${stats.devicesOnline}/${stats.devices}`, hint: offline ? `${offline} offline` : 'all connected', to: '/devices', bad: offline > 0 },
                    { label: 'Biometric templates', value: stats.verificationCount, hint: 'fingerprint + face', to: '/devices/data' }
                ].map(k => (
                    <button key={k.label} type="button" onClick={() => navigate(k.to)}
                        className="text-left px-4 sm:px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <span className="block text-xs text-slate-600 dark:text-slate-400">{k.label}</span>
                        <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{loading ? '–' : k.value}</span>
                        <span className={`mt-0.5 block text-xs ${k.bad ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>{k.hint}</span>
                    </button>
                ))}
            </section>

            {/* Band 3: exceptions trend + live punches */}
            <section className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] border-b border-slate-200 dark:border-slate-800">
                <div className="px-4 sm:px-6 py-5 lg:border-r border-slate-200 dark:border-slate-800">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Exceptions, last 7 days</h2>
                        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-rose-500" aria-hidden="true" />Absent</span>
                            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" aria-hidden="true" />Late</span>
                        </div>
                    </div>
                    <div className={`mt-4 grid grid-cols-7 gap-2 sm:gap-3 items-end ${attendanceTrends.some(d => d.absent || d.late) ? 'h-40' : 'h-10'}`} role="img"
                        aria-label={attendanceTrends.map(d => `${d.date}: ${d.absent} absent, ${d.late} late`).join('; ')}>
                        {attendanceTrends.map(d => {
                            const total = (d.absent || 0) + (d.late || 0);
                            return (
                                <div key={d.fullDate} className="flex flex-col items-center justify-end h-full group" title={`${d.date}: ${d.absent} absent, ${d.late} late`}>
                                    <span className="mb-1 text-[11px] tabular-nums text-slate-600 dark:text-slate-400 opacity-0 group-hover:opacity-100">{total}</span>
                                    <div className="w-full max-w-[36px] flex flex-col justify-end gap-[2px]" style={{ height: `${(total / trendMax) * 100}%` }}>
                                        {d.late > 0 && <div className="bg-amber-400 rounded-t-[4px]" style={{ flex: d.late }} />}
                                        {d.absent > 0 && <div className={`bg-rose-500 ${d.late > 0 ? '' : 'rounded-t-[4px]'}`} style={{ flex: d.absent }} />}
                                    </div>
                                    <div className="w-full max-w-[36px] h-px bg-slate-200 dark:bg-slate-700" />
                                    <span className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">{d.date}</span>
                                </div>
                            );
                        })}
                    </div>
                    {attendanceTrends.every(d => !d.absent && !d.late) && (
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">No absences or late arrivals recorded in the last 7 days.</p>
                    )}
                </div>

                <div className="px-4 sm:px-6 py-5 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Latest punches</h2>
                        <button type="button" onClick={() => navigate('/logs')} className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">View all</button>
                    </div>
                    {recentLogs.length === 0 ? (
                        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">No punches yet today. They appear here as employees check in.</p>
                    ) : (
                        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                            {recentLogs.slice(0, 7).map((log, i) => {
                                const isIn = String(log.punch_type).toUpperCase() === 'IN';
                                return (
                                    <li key={log.id || i} className="flex items-center gap-3 py-2">
                                        <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 ${isIn ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                            {isIn ? <LogIn size={13} /> : <LogOutIcon size={13} />}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{log.employee_name}</span>
                                            <span className="block text-xs text-slate-500 truncate">{isIn ? 'In' : 'Out'} · {log.device_name || '—'}</span>
                                        </span>
                                        <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{formatTimeShort(log.punch_time || log.timestamp)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </section>

            {/* Band 4: today by department */}
            <section className="pb-6">
                <div className="px-4 sm:px-6 pt-5 pb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today by department</h2>
                    <button type="button" onClick={() => navigate('/attendance-register')} className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">Open register</button>
                </div>
                {byDepartment.length === 0 ? (
                    <p className="px-4 sm:px-6 text-sm text-slate-600 dark:text-slate-400">No attendance rows for today yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
                                <tr>
                                    {['Department', 'Staff', 'Present', 'Late', 'Not in', 'Attendance'].map((h, i) => (
                                        <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400 ${i === 0 ? 'pl-4 sm:pl-6' : 'text-right'} ${i === 5 ? 'pr-4 sm:pr-6 w-56' : ''}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {byDepartment.map(d => {
                                    const pct = d.staff ? Math.round((d.present / d.staff) * 100) : 0;
                                    return (
                                        <tr key={d.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="pl-4 sm:pl-6 px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{d.name}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.staff}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.present}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.late || '—'}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.absent || '—'}</td>
                                            <td className="px-4 pr-4 sm:pr-6 py-2.5">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-28 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                                                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="w-10 text-right tabular-nums text-xs text-slate-600 dark:text-slate-300">{pct}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

// Icon chip tones for the attention list; status colours only where they mean status.
const TONE = {
    critical: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
};
