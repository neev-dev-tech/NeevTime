import PropTypes from 'prop-types';
// ChevronUp/Down rather than ArrowUp/Down: the project's icon shim maps a
// fixed set of names onto Phosphor, and the arrows are not in it. Chevrons are
// the conventional sort indicator regardless.
import { Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * The toolbar, sortable header cell and pager that go with useTableControls.
 *
 * Shared rather than written per page, because "each page wrote its own" is
 * exactly what made 41 variants of a text input across this codebase. Three
 * small pieces so a page can keep drawing its own cells and still get the same
 * controls in the same place.
 */

export function TableToolbar({ controls, placeholder = 'Search…', children }) {
    const { query, setQuery, matched, total, isFiltered, reset } = controls;

    return (
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-slate-100 dark:border-slate-700">
            <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="search"
                    className="field-sm pl-8"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={placeholder}
                />
            </div>

            {children}

            {/* Only shown while filtering: a count that never changes is noise,
                and a Clear button with nothing to clear is worse. */}
            {isFiltered && (
                <>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {matched} of {total}
                    </span>
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300
                                   hover:text-orange-600 dark:hover:text-orange-400"
                    >
                        <X size={13} /> Clear
                    </button>
                </>
            )}
        </div>
    );
}

TableToolbar.propTypes = {
    controls: PropTypes.object.isRequired,
    placeholder: PropTypes.string,
    children: PropTypes.node
};

/** A sortable <th>. Renders a plain header when no sortKey is given. */
export function SortableTh({ controls, sortKey, children, className = '' }) {
    const active = controls.sort?.key === sortKey;
    const dir = active ? controls.sort.dir : null;

    if (!sortKey) {
        return <th className={`px-5 py-3 font-bold ${className}`}>{children}</th>;
    }

    return (
        <th className={`px-5 py-3 font-bold ${className}`} aria-sort={
            active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
        }>
            <button
                type="button"
                onClick={() => controls.toggleSort(sortKey)}
                className="inline-flex items-center gap-1 uppercase tracking-[0.09em] text-[10px] font-bold
                           hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
            >
                {children}
                {/* The arrow only appears on the sorted column. An icon on every
                    header reads as decoration and stops signalling anything. */}
                {active && (dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
            </button>
        </th>
    );
}

SortableTh.propTypes = {
    controls: PropTypes.object.isRequired,
    sortKey: PropTypes.string,
    children: PropTypes.node,
    className: PropTypes.string
};

export function TablePager({ controls, noun = 'record' }) {
    const { page, pageCount, setPage, matched, pageSize } = controls;
    const from = matched === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, matched);

    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {matched === 0
                    ? `No ${noun}s`
                    : `${from}–${to} of ${matched} ${noun}${matched === 1 ? '' : 's'}`}
            </span>

            {pageCount > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600
                                   disabled:opacity-40 disabled:cursor-not-allowed
                                   hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums px-2">
                        {page} / {pageCount}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                        disabled={page === pageCount}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600
                                   disabled:opacity-40 disabled:cursor-not-allowed
                                   hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            )}
        </div>
    );
}

TablePager.propTypes = {
    controls: PropTypes.object.isRequired,
    noun: PropTypes.string
};
