import React, { useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeftRight, Smartphone, List, Clock, AlarmClock, Calendar,
    FileText, CheckSquare, XSquare, UserX, AlertTriangle, FileSpreadsheet,
    Activity, ClipboardList, PieChart, Timer, FileBarChart, Eye, Download, Star, StarOff
} from 'lucide-react';

export default function ReportsDashboard() {
    const navigate = useNavigate();
    const [pinnedReports, setPinnedReports] = useState(new Set());
    const [hoveredCard, setHoveredCard] = useState(null);

    // Define report hierarchy: primary, secondary, utility
    const getReportTier = (id) => {
        const primary = [
            'daily_att', 'time_card', 'att_summary', 'transaction', 'total_punches',
            'daily_attendance', 'attendance_summary', 'daily_status', 'att_status'
        ];
        const utility = ['birthday', 'multiple', 'half_day'];
        if (primary.includes(id)) return 'primary';
        if (utility.includes(id)) return 'utility';
        return 'secondary';
    };

    // Color discipline: 1 color per category, all within the brand family.
    // Red stays reserved for destructive/error UI, blue for semantic info.
    const getCategoryColor = (category) => {
        const colors = {
            'attendance': {
                color: '#059669',
                bgColor: 'linear-gradient(135deg, rgba(5, 150, 105, 0.10) 0%, rgba(20, 184, 166, 0.20) 100%)',
                hoverGradient: 'linear-gradient(135deg, rgba(5, 150, 105, 0.15) 0%, rgba(20, 184, 166, 0.25) 100%)'
            },
            'time': {
                color: '#EA580C',
                bgColor: 'linear-gradient(135deg, rgba(234, 88, 12, 0.10) 0%, rgba(251, 146, 60, 0.20) 100%)',
                hoverGradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.15) 0%, rgba(251, 146, 60, 0.25) 100%)'
            },
            'exception': {
                color: '#D97706',
                bgColor: 'linear-gradient(135deg, rgba(217, 119, 6, 0.10) 0%, rgba(245, 158, 11, 0.20) 100%)',
                hoverGradient: 'linear-gradient(135deg, rgba(217, 119, 6, 0.15) 0%, rgba(245, 158, 11, 0.25) 100%)'
            },
            'log': {
                color: '#475569',
                bgColor: 'linear-gradient(135deg, rgba(71, 85, 105, 0.08) 0%, rgba(100, 116, 139, 0.16) 100%)',
                hoverGradient: 'linear-gradient(135deg, rgba(71, 85, 105, 0.12) 0%, rgba(100, 116, 139, 0.22) 100%)'
            },
            'utility': { 
                color: '#6B7280', 
                bgColor: 'linear-gradient(135deg, rgba(107, 114, 128, 0.06) 0%, rgba(156, 163, 175, 0.12) 100%)',
                hoverGradient: 'linear-gradient(135deg, rgba(107, 114, 128, 0.10) 0%, rgba(156, 163, 175, 0.18) 100%)'
            }
        };
        return colors[category] || colors.log;
    };

    const sections = [
        {
            title: "Transaction Reports",
            description: "View punch & movement logs",
            category: 'log',
            items: [
                { id: 'transaction', name: "Transaction", icon: ArrowLeftRight, path: "/reports/transactions", description: "All employee punch transactions", tier: 'primary' },
                { id: 'mobile_trans', name: "Mobile Transaction", icon: Smartphone, path: "/reports/mobile-transactions", description: "Mobile app punch records", tier: 'secondary' },
                { id: 'total_punches', name: "Total Punches", icon: List, path: "/reports/total-punches", description: "Summary of all punch counts", tier: 'primary' },
                { id: 'first_last', name: "First & Last", icon: ArrowLeftRight, path: "/reports/first-last", description: "First and last punch of day", tier: 'secondary' },
                { id: 'first_in_last_out', name: "First In Last Out", icon: ArrowLeftRight, path: "/reports/first-last", description: "Entry and exit punch details", tier: 'secondary' }
            ]
        },
        {
            title: "Scheduling Reports",
            description: "Schedule compliance & exceptions",
            category: 'exception',
            items: [
                { id: 'scheduled_log', name: "Scheduled Log", icon: Calendar, path: "/reports/scheduled-log", description: "Schedule vs actual attendance", tier: 'secondary' },
                { id: 'time_card', name: "Total Time Card", icon: FileText, path: "/reports/time-card", description: "Complete time card details", tier: 'primary' },
                { id: 'missed_punch', name: "Missed In & Out Punch", icon: AlertTriangle, path: "/reports/missed-punch", description: "Missing swipe records", tier: 'secondary' },
                { id: 'late', name: "Late", icon: Clock, path: "/reports/late-coming", description: "Employees arriving after shift start", tier: 'secondary' },
                { id: 'early', name: "Early Leave", icon: Timer, path: "/reports/early-leaving", description: "Early departure tracking", tier: 'secondary' },
                { id: 'birthday', name: "Birthday", icon: Activity, path: "/reports/birthday", description: "Employee birthday calendar", tier: 'utility' },
                { id: 'overtime', name: "Overtime", icon: Clock, path: "/reports/overtime", description: "Overtime hours analysis", tier: 'secondary' },
                { id: 'absent', name: "Absent", icon: UserX, path: "/reports/absent", description: "Employee absence tracking", tier: 'secondary' },
                { id: 'multiple', name: "Multiple Transaction", icon: List, path: "/reports/transactions", description: "Multiple punch records", tier: 'utility' },
                { id: 'break', name: "Break Time", icon: Clock, path: "/break-times", description: "Break duration analysis", tier: 'secondary' },
                { id: 'half_day', name: "Half Day", icon: PieChart, path: "/reports/half-day", description: "Half day leave records", tier: 'utility' }
            ]
        },
        {
            title: "Daily Reports",
            description: "Day-wise attendance overview",
            category: 'attendance',
            items: [
                { id: 'daily_att', name: "Daily Attendance", icon: CheckSquare, path: "/reports/daily-attendance", description: "Today's employee presence overview", tier: 'primary' },
                { id: 'daily_details', name: "Daily Details", icon: FileText, path: "/reports/daily-details", description: "Detailed daily attendance view", tier: 'secondary' },
                { id: 'daily_summary', name: "Daily Summary", icon: ClipboardList, path: "/reports/daily-summary", description: "Summary of daily attendance", tier: 'secondary' },
                { id: 'daily_status', name: "Daily Status", icon: Activity, path: "/reports/daily-status", description: "Current day status overview", tier: 'secondary' }
            ]
        },
        {
            title: "Monthly Reports",
            description: "Monthly attendance aggregation",
            category: 'attendance',
            items: [
                { id: 'basic_status', name: "Basic Status", icon: FileSpreadsheet, path: "/reports/basic-status", description: "Basic monthly attendance status", tier: 'secondary' },
                { id: 'status_summary', name: "Status Summary", icon: FileBarChart, path: "/reports/status-summary", description: "Monthly status overview", tier: 'secondary' },
                { id: 'ot_summary', name: "OT Summary", icon: Clock, path: "/reports/ot-summary", description: "Monthly approved overtime hours", tier: 'secondary' },
                { id: 'work_duration', name: "Work Duration", icon: Timer, path: "/reports/work-duration", description: "Work hours analysis", tier: 'secondary' },
                { id: 'work_detailed', name: "Work Detailed", icon: ClipboardList, path: "/reports/work-detailed", description: "Detailed work hours breakdown", tier: 'secondary' },
                { id: 'att_sheet', name: "ATT Sheet Summary", icon: FileSpreadsheet, path: "/reports/att-sheet", description: "Attendance sheet summary", tier: 'secondary' },
                { id: 'att_status', name: "Attendance Status", icon: CheckSquare, path: "/reports/att-status", description: "Monthly attendance status", tier: 'secondary' },
                { id: 'att_summary', name: "Attendance Summary", icon: Calendar, path: "/reports/att-summary", description: "Complete attendance summary", tier: 'primary' },
                { id: 'payroll', name: "Payroll Export", icon: FileSpreadsheet, path: "/reports/payroll", description: "Monthly attendance inputs for payroll", tier: 'primary' }
            ]
        },
        {
            title: "System Reports",
            description: "Device & biometric health",
            category: 'log',
            items: [
                { id: 'device_health', name: "Device Health", icon: Activity, path: "/reports/device-health", description: "Device uptime, activity and command success", tier: 'primary' },
                { id: 'biometric_summary', name: "Biometric Summary", icon: FileBarChart, path: "/reports/biometric-summary", description: "Enrolled face and fingerprint templates per employee", tier: 'secondary' }
            ]
        }
    ];

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

    const handleCardHover = useCallback((itemId) => {
        setHoveredCard(itemId);
    }, []);

    const handleCardLeave = useCallback(() => {
        setHoveredCard(null);
    }, []);

    const ReportCard = memo(({ item, section, index, isPinned, onNavigate, onTogglePin }) => {
        // Memoize tier and colors to prevent recalculation
        const tier = useMemo(() => item.tier || getReportTier(item.id), [item.tier, item.id]);
        const categoryColors = useMemo(() => getCategoryColor(section.category), [section.category]);

        // Card size based on tier - 2 TIERS for visual hierarchy
        const cardStyles = useMemo(() => ({
            primary: {
                height: '170px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderTop: `3px solid ${categoryColors.color}`,
                boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.06), 0px 12px 32px rgba(0, 0, 0, 0.10)'
            },
            secondary: {
                height: '160px',
                border: '1px solid rgba(0, 0, 0, 0.04)',
                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.04), 0px 6px 16px rgba(0, 0, 0, 0.06)'
            },
            utility: {
                height: '160px',
                border: '1px solid rgba(0, 0, 0, 0.03)',
                boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.03), 0px 4px 12px rgba(0, 0, 0, 0.05)'
            }
        }), [categoryColors.color]);

        const currentStyle = cardStyles[tier];
        const cardId = `report-card-${item.id}`;

        return (
            <div
                className="relative group report-card-wrapper"
                style={{
                    animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                    animationFillMode: 'both',
                    contain: 'layout style paint'
                }}
            >
                <button
                    id={cardId}
                    onClick={onNavigate}
                    className="report-card-button w-full p-5 rounded-[16px] cursor-pointer flex flex-col items-center justify-center gap-3 text-center relative overflow-hidden bg-white dark:bg-slate-800"
                    style={{
                        ...currentStyle,
                        border: tier === 'primary' ? `1px solid rgba(0, 0, 0, 0.08)` : currentStyle.border,
                        borderTop: tier === 'primary' ? `3px solid ${categoryColors.color}` : currentStyle.border,
                        position: 'relative',
                        zIndex: 1
                    }}
                >
                    {/* Pin indicator */}
                    {isPinned && (
                        <div className="absolute top-2 right-2 z-10">
                            <Star size={14} className="text-yellow-500 fill-yellow-500" />
                        </div>
                    )}

                    {/* Icon Container with Refined Gradient */}
                    <div
                        className="report-card-icon p-3.5 rounded-[12px] relative"
                        style={{
                            width: tier === 'primary' ? '52px' : tier === 'secondary' ? '44px' : '40px',
                            height: tier === 'primary' ? '52px' : tier === 'secondary' ? '44px' : '40px',
                            background: categoryColors.bgColor,
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                            boxShadow: tier === 'primary' ? '0px 2px 8px rgba(0, 0, 0, 0.08)' : 'none'
                        }}
                    >
                        <item.icon 
                            size={tier === 'primary' ? 24 : tier === 'secondary' ? 22 : 20} 
                            strokeWidth={tier === 'primary' ? 2.5 : 2}
                            style={{ color: categoryColors.color }}
                        />
                    </div>

                    {/* Report Name */}
                    <div className="flex flex-col gap-1 w-full">
                        <span
                            className="font-semibold leading-tight transition-colors text-slate-800 dark:text-slate-100"
                            style={{
                                fontWeight: tier === 'primary' ? 700 : 600,
                                fontSize: tier === 'primary' ? '14px' : tier === 'secondary' ? '13px' : '12px'
                            }}
                        >
                            {item.name}
                        </span>
                        {/* Microcopy - More Secondary */}
                        <span
                            className="text-[10px] leading-tight text-slate-400 dark:text-slate-500"
                            style={{
                                opacity: 0.9,
                                fontWeight: 400,
                                marginTop: '2px'
                            }}
                        >
                            {item.description}
                        </span>
                    </div>

                </button>
            </div>
        );
    }, (prevProps, nextProps) => {
        // Custom comparison to prevent unnecessary re-renders and blinking
        return (
            prevProps.item.id === nextProps.item.id &&
            prevProps.item.name === nextProps.item.name &&
            prevProps.item.description === nextProps.item.description &&
            prevProps.isPinned === nextProps.isPinned &&
            prevProps.section.category === nextProps.section.category &&
            prevProps.section.title === nextProps.section.title
        );
    });

    ReportCard.displayName = 'ReportCard';

    return (
        <div className="space-y-10 p-6" style={{ paddingBottom: '40px' }}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-3 text-charcoal dark:text-slate-100">
                    <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                        <FileBarChart className="text-saffron" size={24} />
                    </div>
                    Reports
                </h1>
            </div>

            {/* Sections */}
            {sections.map((section, idx) => (
                <div key={idx} className="space-y-6" style={{ marginTop: '32px' }}>
                    {/* Enhanced Section Header - More Designed */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1.5">
                                <div 
                                    className="w-1 h-8 rounded-full"
                                    style={{ 
                                        backgroundColor: getCategoryColor(section.category).color,
                                        boxShadow: `0 0 8px ${getCategoryColor(section.category).color}40`
                                    }}
                                ></div>
                                <h2 
                                    className="text-xl font-bold flex items-center gap-3 text-slate-900 dark:text-slate-100"
                                    style={{ fontWeight: 800, letterSpacing: '-0.02em' }}
                                >
                                    {section.title}
                                    <span 
                                        className="px-3 py-1 rounded-full text-xs font-bold"
                                        style={{
                                            backgroundColor: `${getCategoryColor(section.category).color}12`,
                                            color: getCategoryColor(section.category).color,
                                            border: `1px solid ${getCategoryColor(section.category).color}20`
                                        }}
                                    >
                                        {section.items.length}
                                    </span>
                                </h2>
                            </div>
                            {section.description && (
                                <p 
                                    className="text-sm ml-4 text-slate-500 dark:text-slate-400"
                                    style={{ fontWeight: 500, letterSpacing: '-0.01em' }}
                                >
                                    {section.description}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Refined Divider */}
                    <div 
                        className="h-px ml-4 mb-6"
                        style={{
                            background: `linear-gradient(to right, ${getCategoryColor(section.category).color}40, transparent)`
                        }}
                    ></div>

                    {/* Report Cards Grid */}
                    <div 
                        className="grid"
                        style={{
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '24px'
                        }}
                    >
                        {section.items.map((item, itemIdx) => {
                            const isPinned = pinnedReports.has(item.id);
                            
                            return (
                                <ReportCard 
                                    key={item.id} 
                                    item={item} 
                                    section={section}
                                    index={itemIdx}
                                    isPinned={isPinned}
                                    onNavigate={() => navigate(item.path)}
                                    onTogglePin={(e) => togglePin(item.id, e)}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* CSS Animations */}
            <style>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                .report-card-wrapper {
                    contain: layout style paint;
                }
                .report-card-button {
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                                box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                                border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                }
                .report-card-button:hover {
                    transform: translateY(-6px) scale(1.02) !important;
                    box-shadow: 0px 8px 24px rgba(0, 0, 0, 0.12), 0px 24px 64px rgba(0, 0, 0, 0.16) !important;
                    z-index: 10 !important;
                }
                .report-card-button:active {
                    transform: translateY(-2px) scale(0.98) !important;
                    transition: transform 0.1s ease-out;
                }
                .report-card-icon {
                    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                                background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .report-card-button:hover .report-card-icon {
                    transform: scale(1.12) !important;
                    opacity: 0.95;
                }
                /* Prevent any layout shifts */
                .report-card-wrapper {
                    isolation: isolate;
                }
                /* Ripple effect on click */
                @keyframes ripple {
                    0% {
                        transform: scale(0);
                        opacity: 1;
                    }
                    100% {
                        transform: scale(4);
                        opacity: 0;
                    }
                }
                .report-card-button::after {
                    content: '';
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(0, 0, 0, 0.1);
                    width: 20px;
                    height: 20px;
                    margin-top: -10px;
                    margin-left: -10px;
                    opacity: 0;
                    pointer-events: none;
                }
                .report-card-button:active::after {
                    animation: ripple 0.6s ease-out;
                }
            `}</style>
        </div>
    );
}
