import { useState, useMemo, useEffect } from 'react';

/**
 * Search, sort and pagination for a list a page already has in memory.
 *
 * The app has a DataTable that does all three, but it owns its own cell
 * rendering, and several pages draw cells that carry meaning — a colour dot for
 * a leave type, an employee code in mono, a balance coloured by whether it is
 * spent. Moving those onto DataTable would mean losing them or fighting it, so
 * this gives the same three capabilities to a table a page draws itself.
 *
 * Client-side on purpose. These lists are hundreds of rows, not millions:
 * leave balances is 71 employees times 9 types. Paging on the server would add
 * a round trip per page and a sort parameter to an endpoint, to solve a problem
 * that does not exist at this size.
 *
 * @param rows      the full list
 * @param searchKeys which fields the search box looks at
 * @param initialSort {key, dir} to start on
 * @param pageSize  rows per page, 0 for no pagination
 */
export default function useTableControls(rows, {
    searchKeys = [],
    initialSort = null,
    pageSize = 25
} = {}) {
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState({});
    const [sort, setSort] = useState(initialSort);
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        let out = rows || [];

        for (const [key, value] of Object.entries(filters)) {
            if (value === '' || value === null || value === undefined) continue;
            out = out.filter(r => String(r[key] ?? '') === String(value));
        }

        const q = query.trim().toLowerCase();
        if (q) {
            out = out.filter(r =>
                searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q))
            );
        }

        if (sort?.key) {
            // Copied before sorting: sort() mutates, and mutating the array a
            // parent owns makes the list reorder itself on unrelated renders.
            out = [...out].sort((a, b) => {
                const av = a[sort.key], bv = b[sort.key];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;   // blanks last, whichever direction
                if (bv == null) return -1;

                // Numbers compared as numbers. A string compare puts 100 before
                // 9, which on a column of balances is simply wrong.
                const an = Number(av), bn = Number(bv);
                const numeric = av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn);
                const cmp = numeric
                    ? an - bn
                    : String(av).localeCompare(String(bv), undefined, { numeric: true });
                return sort.dir === 'desc' ? -cmp : cmp;
            });
        }

        return out;
    }, [rows, query, filters, sort, searchKeys]);

    const pageCount = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;

    // Narrowing the list can leave you past the last page, looking at nothing
    // and assuming the filter matched none.
    useEffect(() => {
        if (page > pageCount) setPage(1);
    }, [page, pageCount]);

    const view = useMemo(() => {
        if (!pageSize) return filtered;
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize]);

    const toggleSort = (key) => {
        setSort(prev => {
            if (prev?.key !== key) return { key, dir: 'asc' };
            // asc, desc, then off — so a column can be put back to the list's
            // natural order without reloading the page.
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null;
        });
        setPage(1);
    };

    const setFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const reset = () => {
        setQuery('');
        setFilters({});
        setPage(1);
    };

    return {
        view, filtered,
        total: (rows || []).length,
        matched: filtered.length,
        query, setQuery: (v) => { setQuery(v); setPage(1); },
        filters, setFilter,
        sort, toggleSort,
        page, setPage, pageCount, pageSize,
        isFiltered: Boolean(query.trim()) || Object.values(filters).some(v => v !== '' && v != null),
        reset
    };
}
