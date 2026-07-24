import React from 'react';
import PropTypes from 'prop-types';

/**
 * Standard page header: icon chip + title + subtitle on the left,
 * action buttons on the right. Keeps every page's top row identical.
 *
 *   <PageHeader icon={Users} title="Employees" subtitle="Manage personnel"
 *               actions={<Button icon={Plus}>Add</Button>} />
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions, className = '' }) {
    return (
        <div className={`flex items-center justify-between flex-wrap gap-3 mb-6 ${className}`}>
            <div className="flex items-center gap-3 min-w-0">
                {Icon && (
                    <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-orange-600 shrink-0 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400">
                        <Icon size={22} />
                    </div>
                )}
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-slate-800 truncate dark:text-slate-100">{title}</h1>
                    {subtitle && <p className="text-sm text-slate-500 truncate dark:text-slate-400">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
    );
}

PageHeader.propTypes = {
    icon: PropTypes.elementType,
    title: PropTypes.node.isRequired,
    subtitle: PropTypes.node,
    actions: PropTypes.node,
    className: PropTypes.string
};
