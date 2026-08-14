/**
 * Empty State Components
 * 
 * Beautiful empty state components with:
 * - SVG illustrations
 * - Contextual messaging
 * - Action buttons
 * - Various presets for common scenarios
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React from 'react';
import {
    Plus, Search, RefreshCw, FileText, Users, Calendar,
    Building2, Fingerprint, Clock, AlertCircle, CheckCircle,
    FolderOpen, Database, Wifi, WifiOff, Upload, Download
} from 'lucide-react';

/**
 * Base Empty State Component
 */
export function EmptyState({
    icon,
    illustration,
    title,
    description,
    actionLabel,
    actionIcon,
    onAction,
    secondaryLabel,
    onSecondary,
    variant = 'default', // 'default', 'compact', 'card'
    className = ''
}) {
    const isCompact = variant === 'compact';
    const isCard = variant === 'card';

    return (
        <div className={`
            flex flex-col items-center justify-center text-center
            ${isCompact ? 'py-8 px-4' : 'py-16 px-6'}
            ${isCard ? 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm' : ''}
            ${className}
        `}>
            {/* Illustration or Icon */}
            {illustration ? (
                <div className={`${isCompact ? 'mb-4' : 'mb-6'}`}>
                    {illustration}
                </div>
            ) : icon ? (
                <div className={`
                    ${isCompact ? 'w-14 h-14 mb-4' : 'w-20 h-20 mb-6'}
                    rounded-full bg-gradient-to-br from-orange-50 to-orange-100
                    flex items-center justify-center
                    animate-pulse-subtle
                `}>
                    {React.cloneElement(icon, {
                        size: isCompact ? 28 : 40,
                        className: 'text-orange-400'
                    })}
                </div>
            ) : null}

            {/* Title */}
            {title && (
                <h3 className={`
                    font-semibold text-slate-800 dark:text-slate-100
                    ${isCompact ? 'text-base mb-1' : 'text-xl mb-2'}
                `}>
                    {title}
                </h3>
            )}

            {/* Description */}
            {description && (
                <p className={`
                    text-slate-500 dark:text-slate-400 max-w-md
                    ${isCompact ? 'text-sm mb-4' : 'text-base mb-6'}
                `}>
                    {description}
                </p>
            )}

            {/* Actions */}
            {(actionLabel || secondaryLabel) && (
                <div className="flex items-center gap-3 flex-wrap justify-center">
                    {actionLabel && (
                        <button
                            onClick={onAction}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                                bg-gradient-to-r from-orange-500 to-orange-600 text-white
                                font-medium shadow-md hover:shadow-lg
                                transform hover:-translate-y-0.5
                                transition-ui duration-200"
                        >
                            {actionIcon && React.cloneElement(actionIcon, { size: 18 })}
                            {actionLabel}
                        </button>
                    )}
                    {secondaryLabel && (
                        <button
                            onClick={onSecondary}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                                border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400
                                font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50
                                transition-colors duration-200"
                        >
                            {secondaryLabel}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * SVG Illustrations
 */

// No Data Illustration
const NoDataIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FFF7ED" />
        <rect x="60" y="50" width="80" height="100" rx="8" fill="white" stroke="#F97316" strokeWidth="2" />
        <rect x="70" y="65" width="60" height="4" rx="2" fill="#FED7AA" />
        <rect x="70" y="77" width="45" height="4" rx="2" fill="#FDBA74" />
        <rect x="70" y="89" width="55" height="4" rx="2" fill="#FED7AA" />
        <rect x="70" y="101" width="35" height="4" rx="2" fill="#FDBA74" />
        <rect x="70" y="113" width="50" height="4" rx="2" fill="#FED7AA" />
        <circle cx="145" cy="140" r="30" fill="#FFEDD5" stroke="#F97316" strokeWidth="2" />
        <path d="M135 140L145 150L155 130" stroke="#F97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// No Search Results Illustration
const NoSearchIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FFF7ED" />
        <circle cx="90" cy="85" r="35" fill="white" stroke="#F97316" strokeWidth="3" />
        <line x1="115" y1="110" x2="145" y2="140" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
        <path d="M80 80L100 90M80 90L100 80" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round" />
        <circle cx="90" cy="85" r="20" fill="none" stroke="#FFEDD5" strokeWidth="8" />
    </svg>
);

// No Employees Illustration
const NoEmployeesIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FFF7ED" />
        <circle cx="100" cy="75" r="25" fill="#FFEDD5" stroke="#F97316" strokeWidth="2" />
        <circle cx="100" cy="70" r="15" fill="#FED7AA" />
        <path d="M60 140C60 115 140 115 140 140" fill="#FFEDD5" stroke="#F97316" strokeWidth="2" />
        <circle cx="155" cy="55" r="15" fill="white" stroke="#F97316" strokeWidth="2" />
        <path d="M150 55H160M155 50V60" stroke="#F97316" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

// No Devices Illustration
const NoDevicesIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FFF7ED" />
        <rect x="60" y="55" width="80" height="70" rx="8" fill="white" stroke="#F97316" strokeWidth="2" />
        <rect x="70" y="65" width="60" height="40" rx="4" fill="#FFEDD5" />
        <rect x="85" y="130" width="30" height="8" rx="2" fill="#F97316" />
        <circle cx="100" cy="85" r="12" fill="none" stroke="#FDBA74" strokeWidth="2" strokeDasharray="4 2" />
        <path d="M95 85L100 90L108 78" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// No Attendance Illustration
const NoAttendanceIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FFF7ED" />
        <rect x="55" y="50" width="90" height="100" rx="8" fill="white" stroke="#F97316" strokeWidth="2" />
        <rect x="55" y="50" width="90" height="25" rx="8" fill="#FFEDD5" />
        <text x="100" y="68" textAnchor="middle" fill="#F97316" fontSize="12" fontWeight="600">DEC</text>
        <g>
            {[0, 1, 2, 3, 4, 5, 6].map((i) =>
                [0, 1, 2, 3, 4].map((j) => (
                    <rect key={`${i}-${j}`} x={65 + i * 11} y={85 + j * 12} width="8" height="8" rx="2"
                        fill={Math.random() > 0.3 ? '#FED7AA' : '#FFEDD5'} />
                ))
            )}
        </g>
    </svg>
);

// Error Illustration
const ErrorIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FEF2F2" />
        <circle cx="100" cy="100" r="45" fill="white" stroke="#EF4444" strokeWidth="3" />
        <path d="M100 75V105" stroke="#EF4444" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="120" r="4" fill="#EF4444" />
    </svg>
);

// Success Illustration
const SuccessIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#F0FDF4" />
        <circle cx="100" cy="100" r="45" fill="white" stroke="#22C55E" strokeWidth="3" />
        <path d="M80 100L95 115L125 85" stroke="#22C55E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Offline Illustration
const OfflineIllustration = ({ size = 120 }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="80" fill="#FEF3C7" />
        <path d="M60 110C60 85 80 65 100 65C120 65 140 85 140 110" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M75 115C75 100 87 85 100 85C113 85 125 100 125 115" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="100" cy="125" r="8" fill="#F59E0B" />
        <line x1="60" y1="60" x2="140" y2="140" stroke="#EF4444" strokeWidth="4" strokeLinecap="round" />
    </svg>
);

/**
 * Preset Empty States
 */

// No Data
export function EmptyNoData({ onAction, actionLabel = 'Get Started', ...props }) {
    return (
        <EmptyState
            illustration={<NoDataIllustration />}
            title="No data yet"
            description="There's nothing here at the moment. Start by adding some data or adjust your filters."
            actionLabel={actionLabel}
            actionIcon={<Plus />}
            onAction={onAction}
            {...props}
        />
    );
}

// No Search Results
export function EmptySearchResults({ searchTerm, onClear, ...props }) {
    return (
        <EmptyState
            illustration={<NoSearchIllustration />}
            title="No results found"
            description={searchTerm
                ? `We couldn't find anything matching "${searchTerm}". Try a different search term.`
                : "Try adjusting your search or filter criteria."
            }
            actionLabel="Clear Search"
            actionIcon={<RefreshCw />}
            onAction={onClear}
            {...props}
        />
    );
}

// No Employees
export function EmptyEmployees({ onAdd, ...props }) {
    return (
        <EmptyState
            illustration={<NoEmployeesIllustration />}
            title="No employees yet"
            description="Start building your team by adding your first employee. You can also import employees from a file."
            actionLabel="Add Employee"
            actionIcon={<Plus />}
            onAction={onAdd}
            secondaryLabel="Import from File"
            {...props}
        />
    );
}

// No Devices
export function EmptyDevices({ onAdd, ...props }) {
    return (
        <EmptyState
            illustration={<NoDevicesIllustration />}
            title="No devices connected"
            description="Connect your biometric devices to start tracking attendance. Supported: eSSL, ZKTeco, and more."
            actionLabel="Add Device"
            actionIcon={<Plus />}
            onAction={onAdd}
            {...props}
        />
    );
}

// No Attendance Records
export function EmptyAttendance({ onSync, ...props }) {
    return (
        <EmptyState
            illustration={<NoAttendanceIllustration />}
            title="No attendance records"
            description="No attendance data found for the selected period. Try syncing from devices or adjusting your date range."
            actionLabel="Sync Now"
            actionIcon={<RefreshCw />}
            onAction={onSync}
            {...props}
        />
    );
}

// No Reports
export function EmptyReports({ onGenerate, ...props }) {
    return (
        <EmptyState
            icon={<FileText />}
            title="No reports generated"
            description="Generate your first report by selecting a report type and date range above."
            actionLabel="Generate Report"
            actionIcon={<FileText />}
            onAction={onGenerate}
            {...props}
        />
    );
}

// Error State
export function EmptyError({ message, onRetry, ...props }) {
    return (
        <EmptyState
            illustration={<ErrorIllustration />}
            title="Something went wrong"
            description={message || "An unexpected error occurred. Please try again or contact support if the issue persists."}
            actionLabel="Try Again"
            actionIcon={<RefreshCw />}
            onAction={onRetry}
            {...props}
        />
    );
}

// Success State
export function EmptySuccess({ title, message, onAction, actionLabel, ...props }) {
    return (
        <EmptyState
            illustration={<SuccessIllustration />}
            title={title || "Success!"}
            description={message || "The operation completed successfully."}
            actionLabel={actionLabel}
            onAction={onAction}
            {...props}
        />
    );
}

// Offline State
export function EmptyOffline({ onRetry, ...props }) {
    return (
        <EmptyState
            illustration={<OfflineIllustration />}
            title="You're offline"
            description="Please check your internet connection and try again."
            actionLabel="Retry"
            actionIcon={<RefreshCw />}
            onAction={onRetry}
            {...props}
        />
    );
}

// No Departments
export function EmptyDepartments({ onAdd, ...props }) {
    return (
        <EmptyState
            icon={<Building2 />}
            title="No departments yet"
            description="Create departments to organize your employees better."
            actionLabel="Add Department"
            actionIcon={<Plus />}
            onAction={onAdd}
            {...props}
        />
    );
}

// No Shifts
export function EmptyShifts({ onAdd, ...props }) {
    return (
        <EmptyState
            icon={<Clock />}
            title="No shifts configured"
            description="Set up work shifts to define employee schedules and attendance rules."
            actionLabel="Create Shift"
            actionIcon={<Plus />}
            onAction={onAdd}
            {...props}
        />
    );
}

// Loading placeholder (optional skeleton version)
export function EmptyLoading({ message = 'Loading...', ...props }) {
    return (
        <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4 animate-pulse">
                <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-slate-500 dark:text-slate-400">{message}</p>
        </div>
    );
}

export default EmptyState;
