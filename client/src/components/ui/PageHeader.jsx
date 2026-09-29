import React from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { chipClass } from '../../utils/iconTones';
import {
    personnelSidebar, deviceSidebar, attendanceSidebar, systemSidebar
} from '../../config/navigation';

/**
 * Standard page header: breadcrumb, icon chip + title + subtitle on the left,
 * action buttons on the right. Keeps every page's top row identical.
 *
 *   <PageHeader icon={Users} title="Employees" subtitle="Manage personnel"
 *               actions={<Button icon={Plus}>Add</Button>} />
 */

const SECTIONS = [
    ['Personnel', personnelSidebar],
    ['Device', deviceSidebar],
    ['Attendance', attendanceSidebar],
    ['System', systemSidebar]
];

// Module › group for the current route, read from the same config the sidebar
// renders, so the trail can never disagree with the navigation.
function trailFor(pathname) {
    for (const [module, groups] of SECTIONS) {
        for (const g of groups) {
            if ((g.items || []).some((i) => i.path === pathname)) return [module, g.group];
        }
    }
    return null;
}

export default function PageHeader({ icon: Icon, title, subtitle, actions, tone, className = '' }) {
    // The chip is neutral: the breadcrumb and sidebar already say where you
    // are, and a monochrome header is what keeps pages reading as one product.
    // Pass `tone` only where colour carries meaning.
    const { pathname } = useLocation();
    const resolved = tone || 'slate';
    const trail = trailFor(pathname);

    return (
        <div className={`flex items-end justify-between flex-wrap gap-4 mb-6 pb-5 border-b border-slate-200/70 dark:border-slate-800 ${className}`}>
            <div className="min-w-0">
                {trail && (
                    <nav aria-label="Breadcrumb" className="flex items-center gap-1 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span>{trail[0]}</span>
                        <ChevronRight size={12} aria-hidden="true" />
                        <span>{trail[1]}</span>
                    </nav>
                )}
                <div className="flex items-center gap-3 min-w-0">
                    {Icon && (
                        <div className={`grid place-items-center w-10 h-10 border rounded-xl shrink-0 ${chipClass(resolved)}`}>
                            <Icon size={19} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-slate-900 truncate dark:text-slate-50">{title}</h1>
                        {subtitle && <p className="mt-0.5 text-sm text-slate-600 sm:truncate dark:text-slate-400">{subtitle}</p>}
                    </div>
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
    tone: PropTypes.string,
    className: PropTypes.string
};
