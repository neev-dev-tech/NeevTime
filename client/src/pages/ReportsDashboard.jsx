import { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeftRight, Smartphone, List, Clock, Calendar,
    FileText, CheckSquare, UserX, AlertTriangle, FileSpreadsheet,
    Activity, ClipboardList, PieChart, Timer, FileBarChart, Star, SearchX, ChevronRight
} from 'lucide-react';
import { ListPage, ListSearch } from '../components';

const SECTIONS = [
    {
        title: "Transaction Reports",
        description: "View punch & movement logs",
        items: [
            { id: 'transaction', name: "Transaction", icon: ArrowLeftRight, path: "/reports/transactions", description: "All employee punch transactions" },
            { id: 'mobile_trans', name: "Mobile Transaction", icon: Smartphone, path: "/reports/mobile-transactions", description: "Mobile app punch records" },
            { id: 'total_punches', name: "Total Punches", icon: List, path: "/reports/total-punches", description: "Summary of all punch counts" },
            { id: 'first_last', name: "First & Last", icon: ArrowLeftRight, path: "/reports/first-last", description: "First and last punch of day" }
        ]
    },
    {
        title: "Scheduling Reports",
        description: "Schedule compliance & exceptions",
        items: [
            { id: 'scheduled_log', name: "Scheduled Log", icon: Calendar, path: "/reports/scheduled-log", description: "Schedule vs actual attendance" },
            { id: 'time_card', name: "Total Time Card", icon: FileText, path: "/reports/time-card", description: "Complete time card details" },
            { id: 'missed_punch', name: "Missed In & Out Punch", icon: AlertTriangle, path: "/reports/missed-punch", description: "Missing swipe records" },
            { id: 'late', name: "Late", icon: Clock, path: "/reports/late-coming", description: "Employees arriving after shift start" },
            { id: 'early', name: "Early Leave", icon: Timer, path: "/reports/early-leaving", description: "Early departure tracking" },
            { id: 'birthday', name: "Birthday", icon: Activity, path: "/reports/birthday", description: "Employee birthday calendar" },
            { id: 'overtime', name: "Overtime", icon: Clock, path: "/reports/overtime", description: "Overtime hours analysis" },
            { id: 'absent', name: "Absent", icon: UserX, path: "/reports/absent", description: "Employee absence tracking" },
            { id: 'half_day', name: "Half Day", icon: PieChart, path: "/reports/half-day", description: "Half day leave records" }
        ]
    },
    {
        title: "Daily Reports",
        description: "Day-wise attendance overview",
        items: [
            { id: 'daily_att', name: "Daily Attendance", icon: CheckSquare, path: "/reports/daily-attendance", description: "Today's employee presence overview" },
            { id: 'daily_details', name: "Daily Details", icon: FileText, path: "/reports/daily-details", description: "Detailed daily attendance view" },
            { id: 'daily_summary', name: "Daily Summary", icon: ClipboardList, path: "/reports/daily-summary", description: "Summary of daily attendance" },
            { id: 'daily_status', name: "Daily Status", icon: Activity, path: "/reports/daily-status", description: "Current day status overview" }
        ]
    },
    {
        title: "Monthly Reports",
        description: "Monthly attendance aggregation",
        items: [
            { id: 'basic_status', name: "Basic Status", icon: FileSpreadsheet, path: "/reports/basic-status", description: "Basic monthly attendance status" },
            { id: 'status_summary', name: "Status Summary", icon: FileBarChart, path: "/reports/status-summary", description: "Monthly status overview" },
            { id: 'ot_summary', name: "OT Summary", icon: Clock, path: "/reports/ot-summary", description: "Monthly approved overtime hours" },
            { id: 'work_duration', name: "Work Duration", icon: Timer, path: "/reports/work-duration", description: "Work hours analysis" },
            { id: 'work_detailed', name: "Work Detailed", icon: ClipboardList, path: "/reports/work-detailed", description: "Detailed work hours breakdown" },
            { id: 'att_sheet', name: "ATT Sheet Summary", icon: FileSpreadsheet, path: "/reports/att-sheet", description: "Attendance sheet summary" },
            { id: 'att_status', name: "Attendance Status", icon: CheckSquare, path: "/reports/att-status", description: "Monthly attendance status" },
            { id: 'att_summary', name: "Attendance Summary", icon: Calendar, path: "/reports/att-summary", description: "Complete attendance summary" },
            { id: 'payroll', name: "Payroll Export", icon: FileSpreadsheet, path: "/reports/payroll", description: "Monthly attendance inputs for payroll" }
        ]
    },
    {
        title: "System Reports",
        description: "Device & biometric health",
        items: [
            { id: 'device_health', name: "Device Health", icon: Activity, path: "/reports/device-health", description: "Device uptime, activity and command success" },
            { id: 'biometric_summary', name: "Biometric Summary", icon: FileBarChart, path: "/reports/biometric-summary", description: "Enrolled face and fingerprint templates per employee" }
        ]
    }
];

const TOTAL = SECTIONS.reduce((n, s) => n + s.items.length, 0);

/** One catalogue row: the whole row opens the report; the star pins it. */
function ReportRow({ item, pinned, onOpen, onTogglePin }) {
    const Icon = item.icon;
    return (
        <li className="group relative">
            <button
                type="button"
                onClick={onOpen}
                className="w-full flex items-start gap-3 pl-2.5 pr-16 py-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
                <Icon size={16} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.name}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400 truncate">{item.description}</span>
                </span>
                <ChevronRight size={15} className="absolute right-2.5 top-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100" aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={onTogglePin}
                aria-pressed={pinned}
                aria-label={pinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
                title={pinned ? 'Unpin' : 'Pin to top'}
                className={`absolute right-8 top-2 grid place-items-center w-7 h-7 rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100 focus:opacity-100 ${pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
                <Star size={14} className={pinned ? 'fill-slate-700 text-slate-700 dark:fill-slate-200 dark:text-slate-200' : ''} />
            </button>
        </li>
    );
}

ReportRow.propTypes = {
    item: PropTypes.shape({
        icon: PropTypes.elementType.isRequired,
        name: PropTypes.string.isRequired,
        description: PropTypes.string
    }).isRequired,
    pinned: PropTypes.bool,
    onOpen: PropTypes.func.isRequired,
    onTogglePin: PropTypes.func.isRequired
};

export default function ReportsDashboard() {
    const navigate = useNavigate();
    const [pinnedReports, setPinnedReports] = useState(new Set());
    const [query, setQuery] = useState('');

    const togglePin = useCallback((reportId, e) => {
        e.stopPropagation();
        setPinnedReports(prev => {
            const newSet = new Set(prev);
            if (newSet.has(reportId)) {
                newSet.delete(reportId);
            } else {
                newSet.add(reportId);
            }
            return newSet;
        });
    }, []);

    const q = query.trim().toLowerCase();
    const matches = useCallback(
        (item) => !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
        [q]
    );

    const visibleSections = useMemo(() => {
        const out = [];
        const pinned = SECTIONS.flatMap(s => s.items).filter(i => pinnedReports.has(i.id) && matches(i));
        if (pinned.length > 0) out.push({ title: 'Pinned', description: 'Your shortcuts', items: pinned });
        SECTIONS.forEach(s => {
            const items = s.items.filter(matches);
            if (items.length > 0) out.push({ ...s, items });
        });
        return out;
    }, [pinnedReports, matches]);

    return (
        <ListPage
            title="Reports"
            count={TOTAL}
            actions={<ListSearch label="Search reports" placeholder="Search reports…" value={query} onChange={setQuery} />}
        >
            {visibleSections.length === 0 ? (
                <div className="py-20 text-center px-6">
                    <SearchX size={40} className="mx-auto mb-3 text-slate-300 dark:text-slate-500" />
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">No matching reports</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Nothing matches “{query}”. Try another word.</p>
                </div>
            ) : (
                visibleSections.map(section => (
                    <section key={section.title} aria-label={section.title} className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-baseline gap-2 flex-wrap px-2.5">
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{section.title}</h2>
                            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{section.items.length}</span>
                            {section.description && (
                                <span className="text-xs text-slate-600 dark:text-slate-400">· {section.description}</span>
                            )}
                        </div>
                        <ul className="mt-1.5 grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-2">
                            {section.items.map(item => (
                                <ReportRow
                                    key={item.id}
                                    item={item}
                                    pinned={pinnedReports.has(item.id)}
                                    onOpen={() => navigate(item.path)}
                                    onTogglePin={(e) => togglePin(item.id, e)}
                                />
                            ))}
                        </ul>
                    </section>
                ))
            )}
        </ListPage>
    );
}
