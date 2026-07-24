import React from 'react';
import PropTypes from 'prop-types';

/**
 * Standard app button. Use everywhere instead of ad-hoc styled <button>s so
 * sizes, colors and focus states stay consistent.
 *
 *   <Button variant="primary" icon={Plus}>Add Employee</Button>
 *   <Button variant="secondary" size="sm" icon={Download}>CSV</Button>
 */
const VARIANTS = {
    primary: 'bg-orange-500 hover:bg-orange-600 text-white border border-transparent shadow-sm',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm',
    danger: 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200',
    success: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 border border-transparent',
    dark: 'bg-slate-800 hover:bg-slate-900 text-white border border-transparent shadow-sm'
};

const SIZES = {
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
    ...rest
}) {
    return (
        <button
            type={type}
            disabled={disabled}
            className={`inline-flex items-center justify-center font-semibold rounded-lg transition-colors
                focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1
                disabled:opacity-50 disabled:cursor-not-allowed
                ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
            {...rest}
        >
            {Icon && <Icon size={iconSize || (size === 'sm' ? 14 : 16)} />}
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
    type: PropTypes.string
};
