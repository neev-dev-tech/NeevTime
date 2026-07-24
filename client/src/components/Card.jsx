/**
 * Card Components
 * 
 * Consistent card system with:
 * - Multiple variants (default, elevated, outlined, glass)
 * - Size options (sm, md, lg)
 * - Optional header/footer
 * - Hover effects
 * - Click handlers
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React from 'react';

/**
 * Base Card Component
 */
export function Card({
    children,
    variant = 'default', // 'default', 'elevated', 'outlined', 'glass', 'gradient'
    size = 'md', // 'sm', 'md', 'lg'
    padding = true,
    hover = false,
    clickable = false,
    onClick,
    className = '',
    style = {},
    ...props
}) {
    const baseClasses = 'rounded-2xl transition-all duration-200';

    const variantClasses = {
        default: 'bg-white border border-slate-100 shadow-sm',
        elevated: 'bg-white shadow-md hover:shadow-lg',
        outlined: 'bg-white border-2 border-slate-200',
        glass: 'bg-white/80 backdrop-blur-sm border border-white/20 shadow-lg',
        gradient: 'bg-gradient-to-br from-white to-slate-50 border border-slate-100 shadow-sm'
    };

    const sizeClasses = {
        sm: padding ? 'p-4' : '',
        md: padding ? 'p-6' : '',
        lg: padding ? 'p-8' : ''
    };

    const hoverClasses = hover || clickable
        ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
        : '';

    return (
        <div
            className={`
                ${baseClasses}
                ${variantClasses[variant]}
                ${sizeClasses[size]}
                ${hoverClasses}
                ${className}
            `}
            onClick={clickable ? onClick : undefined}
            style={style}
            {...props}
        >
            {children}
        </div>
    );
}

/**
 * Card Header
 */
export function CardHeader({
    title,
    subtitle,
    icon,
    action,
    className = '',
    children
}) {
    return (
        <div className={`flex items-start justify-between mb-4 ${className}`}>
            <div className="flex items-start gap-3">
                {icon && (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-50 to-orange-100 
                        flex items-center justify-center flex-shrink-0">
                        {React.cloneElement(icon, { size: 20, className: 'text-orange-500' })}
                    </div>
                )}
                <div>
                    {title && (
                        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
                    )}
                    {subtitle && (
                        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
                    )}
                    {children}
                </div>
            </div>
            {action && (
                <div className="flex-shrink-0">
                    {action}
                </div>
            )}
        </div>
    );
}

/**
 * Card Body
 */
export function CardBody({ children, className = '' }) {
    return (
        <div className={`${className}`}>
            {children}
        </div>
    );
}

/**
 * Card Footer
 */
export function CardFooter({ children, className = '', separator = true }) {
    return (
        <div className={`
            mt-4 pt-4 
            ${separator ? 'border-t border-slate-100' : ''} 
            ${className}
        `}>
            {children}
        </div>
    );
}

/**
 * Stat Card - For dashboard statistics
 */
export function StatCard({
    label,
    value,
    icon,
    trend,
    trendValue,
    color = 'orange', // 'orange', 'green', 'blue', 'red', 'purple'
    size = 'md',
    onClick,
    className = ''
}) {
    const colorStyles = {
        orange: {
            bg: 'bg-gradient-to-br from-orange-50 to-orange-100',
            border: 'border-l-4 border-l-orange-500',
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-500',
            valueColor: 'text-slate-800'
        },
        green: {
            bg: 'bg-gradient-to-br from-green-50 to-emerald-100',
            border: 'border-l-4 border-l-green-500',
            iconBg: 'bg-green-100',
            iconColor: 'text-green-500',
            valueColor: 'text-slate-800'
        },
        blue: {
            bg: 'bg-gradient-to-br from-blue-50 to-indigo-100',
            border: 'border-l-4 border-l-blue-500',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-500',
            valueColor: 'text-slate-800'
        },
        red: {
            bg: 'bg-gradient-to-br from-red-50 to-rose-100',
            border: 'border-l-4 border-l-red-500',
            iconBg: 'bg-red-100',
            iconColor: 'text-red-500',
            valueColor: 'text-slate-800'
        },
        purple: {
            bg: 'bg-gradient-to-br from-purple-50 to-violet-100',
            border: 'border-l-4 border-l-purple-500',
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-500',
            valueColor: 'text-slate-800'
        }
    };

    const styles = colorStyles[color] || colorStyles.orange;
    const sizeStyles = {
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6'
    };

    return (
        <div
            className={`
                ${styles.bg} ${styles.border}
                ${sizeStyles[size]}
                rounded-2xl shadow-sm
                transition-all duration-200
                ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}
                ${className}
            `}
            onClick={onClick}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${styles.valueColor}`}>
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </p>
                    {trend && (
                        <div className={`flex items-center gap-1 mt-2 text-sm ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'
                            }`}>
                            {trend === 'up' && '↑'}
                            {trend === 'down' && '↓'}
                            <span>{trendValue}</span>
                        </div>
                    )}
                </div>
                {icon && (
                    <div className={`w-12 h-12 ${styles.iconBg} rounded-xl flex items-center justify-center`}>
                        {React.cloneElement(icon, { size: 24, className: styles.iconColor })}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Summary Card - For quick summaries
 */
export function SummaryCard({
    title,
    items = [], // [{ label, value, color }]
    icon,
    className = ''
}) {
    return (
        <Card variant="default" className={className}>
            <CardHeader title={title} icon={icon} />
            <div className="space-y-3">
                {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">{item.label}</span>
                        <span className={`font-semibold ${item.color === 'green' ? 'text-green-600' :
                                item.color === 'red' ? 'text-red-600' :
                                    item.color === 'orange' ? 'text-orange-600' :
                                        'text-slate-800'
                            }`}>
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}

/**
 * Action Card - Card with prominent action
 */
export function ActionCard({
    title,
    description,
    icon,
    actionLabel,
    onAction,
    variant = 'default',
    className = ''
}) {
    return (
        <Card variant={variant} hover className={`group ${className}`}>
            <div className="flex items-start gap-4">
                {icon && (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 
                        flex items-center justify-center flex-shrink-0
                        group-hover:scale-110 transition-transform">
                        {React.cloneElement(icon, { size: 24, className: 'text-orange-600' })}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-slate-800 mb-1">{title}</h4>
                    <p className="text-sm text-slate-500 mb-3">{description}</p>
                    <button
                        onClick={onAction}
                        className="text-sm font-medium text-orange-600 hover:text-orange-700 
                            flex items-center gap-1 group/btn"
                    >
                        {actionLabel}
                        <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </button>
                </div>
            </div>
        </Card>
    );
}

/**
 * Info Card - For displaying key-value information
 */
export function InfoCard({
    title,
    data = [], // [{ key, value, icon }]
    columns = 2,
    className = ''
}) {
    return (
        <Card variant="default" className={className}>
            {title && (
                <h3 className="text-lg font-semibold text-slate-800 mb-4 pb-3 border-b border-slate-100">
                    {title}
                </h3>
            )}
            <div className={`grid grid-cols-${columns} gap-4`}>
                {data.map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                        {item.icon && (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                {React.cloneElement(item.icon, { size: 16, className: 'text-slate-500' })}
                            </div>
                        )}
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wide">{item.key}</p>
                            <p className="text-sm font-medium text-slate-800 mt-0.5">{item.value || '-'}</p>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

/**
 * Feature Card - For feature highlights
 */
export function FeatureCard({
    title,
    description,
    icon,
    badge,
    color = 'orange',
    className = ''
}) {
    const colorStyles = {
        orange: 'from-orange-500 to-orange-600',
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        purple: 'from-purple-500 to-violet-600'
    };

    return (
        <Card variant="elevated" hover className={`overflow-hidden ${className}`}>
            <div className={`h-2 w-full bg-gradient-to-r ${colorStyles[color]} -mx-6 -mt-6 mb-4`}
                style={{ marginLeft: '-1.5rem', marginRight: '-1.5rem', marginTop: '-1.5rem', width: 'calc(100% + 3rem)' }} />
            <div className="flex items-start gap-4">
                {icon && (
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorStyles[color]} 
                        flex items-center justify-center flex-shrink-0 shadow-md`}>
                        {React.cloneElement(icon, { size: 24, className: 'text-white' })}
                    </div>
                )}
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-800">{title}</h4>
                        {badge && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-600 rounded-full">
                                {badge}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500">{description}</p>
                </div>
            </div>
        </Card>
    );
}

/**
 * List Card - Card with list items
 */
export function ListCard({
    title,
    items = [], // [{ primary, secondary, icon, action }]
    emptyMessage = 'No items',
    maxItems,
    onViewAll,
    className = ''
}) {
    const displayItems = maxItems ? items.slice(0, maxItems) : items;
    const hasMore = maxItems && items.length > maxItems;

    return (
        <Card variant="default" padding={false} className={className}>
            {title && (
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    {hasMore && (
                        <button
                            onClick={onViewAll}
                            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                        >
                            View All ({items.length})
                        </button>
                    )}
                </div>
            )}
            {displayItems.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-500 text-sm">
                    {emptyMessage}
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {displayItems.map((item, index) => (
                        <div key={index} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                            {item.icon && (
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                    {item.icon}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{item.primary}</p>
                                {item.secondary && (
                                    <p className="text-xs text-slate-500 truncate">{item.secondary}</p>
                                )}
                            </div>
                            {item.action}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export default Card;
