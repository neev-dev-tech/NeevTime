import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, Search } from 'lucide-react';
import Button from './Button';
import useDismissable from '../../hooks/useDismissable';

/**
 * The list-page shell every table screen shares.
 *
 * Full-bleed: it cancels the layout's padding and fills the content area
 * edge to edge beside the sidebar. Two compact bars, then the body:
 *
 *   ┌ Title 24 · [tabs]                          [secondary] [primary] ┐
 *   ├ [search] (N selected · Clear)          [menus…] [danger] [↻]     ┤
 *   │ table (only this scrolls)                                        │
 *   └ pager                                                            ┘
 *
 *   <ListPage title="Employees" count={n} tabs={<ListTabs …/>}
 *             actions={<Button size="toolbar" …/>}
 *             toolbar={<><ListSearch …/> … </>}
 *             footer={<TablePager controls={pager} />}>
 *     <table>…</table>
 *   </ListPage>
 *
 * Every button in the bars uses size="toolbar" so they are one height.
 */
export default function ListPage({ title, count, tabs, actions, toolbar, toolbarActive = false, footer, children, bodyClassName = '' }) {
    return (
        <div className="relative -m-4 sm:-m-6 h-[calc(100%+2rem)] sm:h-[calc(100%+3rem)] flex flex-col bg-app-surface">
            <div className="flex items-center gap-x-4 gap-y-2 px-4 sm:px-6 min-h-14 py-2.5 border-b border-slate-200 dark:border-slate-800 flex-wrap">
                <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                    {title}
                    {count !== undefined && count !== null && (
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 tabular-nums">{count}</span>
                    )}
                </h1>
                {tabs}
                {actions && <div className="ml-auto flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>

            {toolbar && (
                <div className={`flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800 flex-wrap ${toolbarActive ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}>
                    {toolbar}
                </div>
            )}

            <div className={`flex-1 min-h-0 overflow-auto custom-scrollbar ${bodyClassName}`}>
                {children}
            </div>

            {footer && <div className="border-t border-slate-200 dark:border-slate-800 [&>div]:border-t-0">{footer}</div>}
        </div>
    );
}

ListPage.propTypes = {
    title: PropTypes.node.isRequired,
    count: PropTypes.number,
    tabs: PropTypes.node,
    actions: PropTypes.node,
    toolbar: PropTypes.node,
    toolbarActive: PropTypes.bool,
    footer: PropTypes.node,
    children: PropTypes.node,
    bodyClassName: PropTypes.string
};

/** View tabs beside the title: [{ key, label, count? }]. */
export function ListTabs({ items, value, onChange, label = 'Filter' }) {
    return (
        <div role="tablist" aria-label={label} className="flex items-center gap-0.5 flex-wrap">
            {items.map(t => {
                const on = value === t.key;
                return (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(t.key)}
                        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium transition-colors ${on
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'}`}
                    >
                        {t.label}
                        {t.count !== undefined && <span className={`tabular-nums text-xs ${on ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{t.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

ListTabs.propTypes = {
    items: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string, label: PropTypes.node, count: PropTypes.number })).isRequired,
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string
};

/** Compact search box for the toolbar. */
export function ListSearch({ value, onChange, placeholder = 'Search…', label = 'Search' }) {
    return (
        <div className="relative w-full sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
                type="search"
                aria-label={label}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="field-sm !h-8 !py-0 pl-9"
            />
        </div>
    );
}

ListSearch.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    label: PropTypes.string
};

/** "N selected · Clear" shown in the toolbar while rows are ticked. */
export function ListSelection({ count, onClear }) {
    if (!count) return null;
    return (
        <div className="flex items-center gap-1 pl-1">
            <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{count} selected</span>
            <button
                type="button"
                onClick={onClear}
                className="h-7 px-2 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
                Clear
            </button>
        </div>
    );
}

ListSelection.propTypes = { count: PropTypes.number, onClear: PropTypes.func.isRequired };

/**
 * Toolbar dropdown. Always clickable; pass `emptyHint` to show that text
 * instead of the items (e.g. when nothing is selected yet).
 * Items: <ListMenuItem onClick danger>Label</ListMenuItem>; the menu closes
 * itself after an item runs.
 */
export function ListMenu({ label, icon, emptyHint, width = 'w-56', align = 'right', children }) {
    const [open, setOpen] = useState(false);
    const panelRef = useRef(null);
    const triggerRef = useRef(null);
    useDismissable(open, () => setOpen(false), panelRef, triggerRef);
    return (
        <div className="relative">
            <span ref={triggerRef} className="inline-flex">
                <Button
                    variant="tonal"
                    size="toolbar"
                    icon={icon}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpen(o => !o)}
                >
                    {label} <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                </Button>
            </span>
            {open && (
                <div
                    ref={panelRef}
                    role="menu"
                    onClick={(e) => { if (e.target.closest('[role="menuitem"]')) setOpen(false); }}
                    className={`absolute top-full ${align === 'right' ? 'right-0' : 'left-0'} mt-1.5 ${width} bg-app-surface border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl z-30 overflow-hidden py-1`}
                >
                    {emptyHint
                        ? <p className="px-3.5 py-2.5 text-[13px] text-slate-600 dark:text-slate-400">{emptyHint}</p>
                        : children}
                </div>
            )}
        </div>
    );
}

ListMenu.propTypes = {
    label: PropTypes.node.isRequired,
    icon: PropTypes.elementType,
    emptyHint: PropTypes.node,
    width: PropTypes.string,
    align: PropTypes.oneOf(['left', 'right']),
    children: PropTypes.node
};

export function ListMenuItem({ onClick, danger = false, children }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={`block w-full text-left px-3.5 py-2 text-[13px] hover:bg-slate-100 dark:hover:bg-slate-800 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}
        >
            {children}
        </button>
    );
}

ListMenuItem.propTypes = { onClick: PropTypes.func, danger: PropTypes.bool, children: PropTypes.node };

export function ListMenuDivider() {
    return <div className="my-1 border-t border-slate-100 dark:border-slate-700" />;
}

/** Icon button for the toolbar's right end (refresh). */
export function ListIconButton({ label, icon: Icon, onClick, disabled = false, spin = false }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="grid place-items-center w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
            <Icon size={15} className={spin ? 'animate-spin' : ''} />
        </button>
    );
}

ListIconButton.propTypes = {
    label: PropTypes.string.isRequired,
    icon: PropTypes.elementType.isRequired,
    onClick: PropTypes.func,
    disabled: PropTypes.bool,
    spin: PropTypes.bool
};

/** Table header styling shared by list pages. */
export const LIST_THEAD = 'sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700';
export const LIST_TH = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-600 dark:text-slate-400 whitespace-nowrap text-left';
/** First/last cell padding so table content lines up with the bars above. */
export const LIST_EDGE_FIRST = 'pl-4 sm:pl-6';
export const LIST_EDGE_LAST = 'pr-4 sm:pr-6';
