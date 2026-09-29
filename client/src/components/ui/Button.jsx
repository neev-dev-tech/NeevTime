import React from 'react';
import PropTypes from 'prop-types';
import { usePermissions } from '../../hooks/usePermissions';

/**
 * Standard app button. Use everywhere instead of ad-hoc styled <button>s so
 * sizes, colors and focus states stay consistent.
 *
 *   <Button variant="primary" icon={Plus}>Add Employee</Button>
 *   <Button variant="secondary" size="sm" icon={Download}>CSV</Button>
 */
const VARIANTS = {
    // Brand primary via theme tokens: black on light, white on the black theme,
    // with the correct contrasting text either way. One primary look app-wide.
    primary: 'bg-[rgb(var(--brand))] hover:bg-[rgb(var(--brand-hover))] text-[rgb(var(--brand-contrast))] border border-transparent shadow-sm',
    // Filled neutral — no white buttons in the app
    secondary: 'bg-slate-500 hover:bg-slate-600 text-white border border-transparent shadow-sm dark:bg-slate-600 dark:hover:bg-slate-500',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800',
    // Solid red — reserve for the FINAL destructive confirm ("Yes, Delete")
    dangerSolid: 'bg-rose-600 hover:bg-rose-700 text-white border border-transparent shadow-sm',
    success: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800',
    // Solid green — the "Add / Create new thing" action app-wide
    successSolid: 'bg-emerald-600 hover:bg-emerald-700 text-white border border-transparent shadow-sm',
    // Quiet filled neutral for secondary header actions (Import, Export) that
    // sit beside a primary one. Filled, so it keeps the "no white buttons" rule.
    tonal: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 border border-transparent dark:text-slate-300 dark:hover:bg-slate-700',
    dark: 'bg-slate-800 hover:bg-slate-900 text-white border border-transparent shadow-sm dark:bg-slate-600 dark:hover:bg-slate-500'
};

// The variants that only ever mean "change data" in this app: create (solid
// green), approve (green), reject/delete (red). A view-only account gets them
// disabled with a reason rather than a button that answers 403. The server
// still enforces this; this only stops offering what will be refused.
const MUTATING = new Set(['successSolid', 'success', 'danger', 'dangerSolid']);

const SIZES = {
    // Toolbar controls on list pages: every button in a bar the same 32px.
    toolbar: 'h-8 px-3 text-[13px] gap-1.5',
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2'
};

export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconSize,
    className = '',
    disabled = false,
    type = 'button',
    // Marks a create/change action whose variant is not one of MUTATING
    // (e.g. a black primary "Add"), so view-only accounts get it disabled too.
    mutating = false,
    ...rest
}) {
    const { isViewer } = usePermissions();
    const readOnly = isViewer && (mutating || MUTATING.has(variant));
    return (
        <button
            type={type}
            disabled={disabled || readOnly}
            {...(readOnly ? { title: 'Read-only access' } : {})}
            className={`inline-flex items-center justify-center font-semibold rounded-lg transition-colors
                focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1
                disabled:opacity-50 disabled:cursor-not-allowed
                ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
            {...rest}
        >
            {Icon && <Icon size={iconSize || (size === 'sm' || size === 'toolbar' ? 15 : 16)} />}
            {children}
        </button>
    );
}

Button.propTypes = {
    children: PropTypes.node,
    variant: PropTypes.oneOf(Object.keys(VARIANTS)),
    size: PropTypes.oneOf(Object.keys(SIZES)),
    icon: PropTypes.elementType,
    iconSize: PropTypes.number,
    className: PropTypes.string,
    disabled: PropTypes.bool,
    type: PropTypes.string,
    mutating: PropTypes.bool
};
