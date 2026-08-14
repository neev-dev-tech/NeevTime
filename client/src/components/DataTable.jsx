/**
 * DataTable Component
 * 
 * Premium data table with:
 * - Sortable columns with indicators
 * - Column visibility toggles
 * - Pagination
 * - Row selection
 * - Search/filter
 * - Export selected
 * - Responsive design
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    ChevronUp, ChevronDown, ChevronsUpDown,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    Search, Settings2, Download, Eye, EyeOff, Columns3,
    Check, X
} from 'lucide-react';
import useDismissable from '../hooks/useDismissable';

/**
 * Sort state constants
 */
const SORT_ORDER = {
    NONE: 'none',
    ASC: 'asc',
    DESC: 'desc'
};

/**
 * Main DataTable Component
 */
export default function DataTable({
    data = [],
    columns = [],
    defaultSort = null,
    defaultSortOrder = SORT_ORDER.ASC,
    pageSize = 25,
    pageSizeOptions = [10, 25, 50, 100],
    selectable = false,
    onSelectionChange,
    onRowClick,
    searchable = true,
    searchPlaceholder = 'Search...',
    showColumnToggle = true,
    showPagination = true,
    showRowCount = true,
    loading = false,
    emptyMessage = 'No data available',
    stickyHeader = true,
    stickyFirstColumn = false,
    striped = true,
    compact = false,
    className = '',
    headerClassName = '',
    rowClassName = '',
    onExport
}) {
    // State
    const [sortColumn, setSortColumn] = useState(defaultSort);
    const [sortOrder, setSortOrder] = useState(defaultSortOrder);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(pageSize);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRows, setSelectedRows] = useState(new Set());
    const [visibleColumns, setVisibleColumns] = useState(
        columns.reduce((acc, col) => ({ ...acc, [col.key]: col.visible !== false }), {})
    );
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const columnMenuRef = useRef(null);
    const columnTriggerRef = useRef(null);

    // Replaces a `fixed inset-0 z-10` backdrop. That pattern only closes the
    // menu while nothing on the page outpaints z-10 — the header popovers used
    // the same trick at z-30 and silently stopped working. This does not depend
    // on stacking order, and it adds Escape, which the backdrop never handled.
    useDismissable(showColumnMenu, () => setShowColumnMenu(false), columnMenuRef, columnTriggerRef);

    // Auto-generate columns from data if not provided
    const tableColumns = useMemo(() => {
        if (columns.length > 0) return columns;
        if (data.length === 0) return [];

        return Object.keys(data[0])
            .filter(key => !['id', 'created_at', 'updated_at'].includes(key))
            .map(key => ({
                key,
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                sortable: true,
                visible: true
            }));
    }, [columns, data]);

    // Filtered and sorted data
    const processedData = useMemo(() => {
        let result = [...data];

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(row =>
                Object.values(row).some(value =>
                    String(value).toLowerCase().includes(term)
                )
            );
        }

        // Apply sorting
        if (sortColumn && sortOrder !== SORT_ORDER.NONE) {
            result.sort((a, b) => {
                let aVal = a[sortColumn];
                let bVal = b[sortColumn];

                // Handle null/undefined
                if (aVal == null) return sortOrder === SORT_ORDER.ASC ? 1 : -1;
                if (bVal == null) return sortOrder === SORT_ORDER.ASC ? -1 : 1;

                // Numeric comparison
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortOrder === SORT_ORDER.ASC ? aVal - bVal : bVal - aVal;
                }

                // Date comparison
                if (aVal instanceof Date && bVal instanceof Date) {
                    return sortOrder === SORT_ORDER.ASC
                        ? aVal.getTime() - bVal.getTime()
                        : bVal.getTime() - aVal.getTime();
                }

                // String comparison
                const aStr = String(aVal).toLowerCase();
                const bStr = String(bVal).toLowerCase();
                const comparison = aStr.localeCompare(bStr);
                return sortOrder === SORT_ORDER.ASC ? comparison : -comparison;
            });
        }

        return result;
    }, [data, searchTerm, sortColumn, sortOrder]);

    // Paginated data
    const paginatedData = useMemo(() => {
        if (!showPagination) return processedData;
        const start = (currentPage - 1) * rowsPerPage;
        return processedData.slice(start, start + rowsPerPage);
    }, [processedData, currentPage, rowsPerPage, showPagination]);

    // Total pages
    const totalPages = Math.ceil(processedData.length / rowsPerPage);

    // Handle sort click
    const handleSort = useCallback((columnKey) => {
        const column = tableColumns.find(c => c.key === columnKey);
        if (!column?.sortable) return;

        if (sortColumn === columnKey) {
            // Cycle through: ASC -> DESC -> NONE
            if (sortOrder === SORT_ORDER.ASC) {
                setSortOrder(SORT_ORDER.DESC);
            } else if (sortOrder === SORT_ORDER.DESC) {
                setSortOrder(SORT_ORDER.NONE);
                setSortColumn(null);
            } else {
                setSortOrder(SORT_ORDER.ASC);
            }
        } else {
            setSortColumn(columnKey);
            setSortOrder(SORT_ORDER.ASC);
        }
        setCurrentPage(1);
    }, [sortColumn, sortOrder, tableColumns]);

    // Handle row selection
    const handleSelectRow = useCallback((rowId) => {
        setSelectedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(rowId)) {
                newSet.delete(rowId);
            } else {
                newSet.add(rowId);
            }
            onSelectionChange?.(Array.from(newSet));
            return newSet;
        });
    }, [onSelectionChange]);

    // Handle select all
    const handleSelectAll = useCallback(() => {
        if (selectedRows.size === paginatedData.length) {
            setSelectedRows(new Set());
            onSelectionChange?.([]);
        } else {
            const allIds = new Set(paginatedData.map((row, i) => row.id || i));
            setSelectedRows(allIds);
            onSelectionChange?.(Array.from(allIds));
        }
    }, [paginatedData, selectedRows.size, onSelectionChange]);

    // Toggle column visibility
    const toggleColumn = useCallback((columnKey) => {
        setVisibleColumns(prev => ({
            ...prev,
            [columnKey]: !prev[columnKey]
        }));
    }, []);

    // Format cell value
    const formatValue = useCallback((value, column) => {
        if (value === null || value === undefined) return '-';

        // Custom formatter
        if (column.formatter) {
            return column.formatter(value);
        }

        // Date formatting
        if (column.type === 'date' || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
            const date = new Date(value);
            if (!isNaN(date)) {
                return date.toLocaleDateString();
            }
        }

        // Time formatting
        if (column.type === 'time') {
            const date = new Date(value);
            if (!isNaN(date)) {
                return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            }
        }

        // Boolean formatting
        if (typeof value === 'boolean') {
            return value ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                    <Check size={12} className="mr-1" /> Yes
                </span>
            ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                    <X size={12} className="mr-1" /> No
                </span>
            );
        }

        // Status badge
        if (column.type === 'status' || column.key === 'status') {
            const statusColors = {
                active: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                inactive: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                present: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                absent: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
                late: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
                online: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                offline: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
                approved: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                rejected: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
            };
            const colorClass = statusColors[String(value).toLowerCase()] || 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
            return (
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${colorClass}`}>
                    {value}
                </span>
            );
        }

        // Number formatting
        if (typeof value === 'number') {
            if (column.type === 'currency') {
                return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
            }
            if (column.type === 'percentage') {
                return `${value.toFixed(1)}%`;
            }
            return value.toLocaleString();
        }

        return String(value);
    }, []);

    // Get sort icon
    const getSortIcon = (columnKey) => {
        if (sortColumn !== columnKey) {
            return <ChevronsUpDown size={14} className="text-slate-300 group-hover:text-slate-400" />;
        }
        if (sortOrder === SORT_ORDER.ASC) {
            return <ChevronUp size={14} className="text-orange-500" />;
        }
        if (sortOrder === SORT_ORDER.DESC) {
            return <ChevronDown size={14} className="text-orange-500" />;
        }
        return <ChevronsUpDown size={14} className="text-slate-300" />;
    };

    // Visible columns for rendering
    const renderColumns = tableColumns.filter(col => visibleColumns[col.key]);

    return (
        <div className={`data-table-wrapper ${className}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                {/* Search */}
                {searchable && (
                    <div className="relative flex-1 max-w-sm">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="field pl-10 pr-4"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    {/* Row count */}
                    {showRowCount && (
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                            {processedData.length} record{processedData.length !== 1 ? 's' : ''}
                            {selectedRows.size > 0 && ` (${selectedRows.size} selected)`}
                        </span>
                    )}

                    {/* Column visibility toggle */}
                    {showColumnToggle && (
                        <div className="relative">
                            <button
                                ref={columnTriggerRef}
                                onClick={() => setShowColumnMenu(!showColumnMenu)}
                                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                title="Toggle columns"
                            >
                                <Columns3 size={18} className="text-slate-500 dark:text-slate-400" />
                            </button>

                            {showColumnMenu && (
                                <div
                                    ref={columnMenuRef}
                                    className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 py-2"
                                >
                                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b dark:border-slate-700">
                                        Visible Columns
                                    </div>
                                    <div className="max-h-64 overflow-y-auto">
                                        {tableColumns.map(col => (
                                            <label
                                                key={col.key}
                                                className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={visibleColumns[col.key]}
                                                    onChange={() => toggleColumn(col.key)}
                                                    className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-400"
                                                />
                                                <span className="text-sm text-slate-700 dark:text-slate-300">{col.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Export button */}
                    {onExport && (
                        <button
                            onClick={() => onExport(selectedRows.size > 0
                                ? data.filter((row, i) => selectedRows.has(row.id || i))
                                : processedData
                            )}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 
                                hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-sm text-slate-600 dark:text-slate-400"
                        >
                            <Download size={16} />
                            Export
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm">
                    <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                            {/* Selection checkbox */}
                            {selectable && (
                                <th className="w-12 px-4 py-3 text-center">
                                    <input
                                        type="checkbox"
                                        checked={paginatedData.length > 0 && selectedRows.size === paginatedData.length}
                                        onChange={handleSelectAll}
                                        className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-400"
                                    />
                                </th>
                            )}

                            {/* Column headers */}
                            {renderColumns.map((col, index) => (
                                <th
                                    key={col.key}
                                    className={`
                                        px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider
                                        ${col.sortable ? 'cursor-pointer select-none group hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors' : ''}
                                        ${stickyFirstColumn && index === 0 ? 'sticky left-0 bg-slate-50 dark:bg-slate-900/50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}
                                        ${headerClassName}
                                    `}
                                    style={{
                                        minWidth: col.minWidth || 'auto',
                                        width: col.width || 'auto'
                                    }}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span>{col.label}</span>
                                        {col.sortable && getSortIcon(col.key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            // Loading skeleton
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                                    {selectable && <td className="px-4 py-3"><div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" /></td>}
                                    {renderColumns.map((col, j) => (
                                        <td key={j} className="px-4 py-3">
                                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : paginatedData.length === 0 ? (
                            // Empty state
                            <tr>
                                <td
                                    colSpan={renderColumns.length + (selectable ? 1 : 0)}
                                    className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                                            <Search size={24} className="text-slate-400" />
                                        </div>
                                        <span>{searchTerm ? 'No matching records found' : emptyMessage}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            // Data rows
                            paginatedData.map((row, rowIndex) => {
                                const rowId = row.id || rowIndex;
                                const isSelected = selectedRows.has(rowId);

                                return (
                                    <tr
                                        key={rowId}
                                        className={`
                                            border-b border-slate-100 dark:border-slate-700 transition-colors
                                            ${striped && rowIndex % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-900/25' : 'bg-white dark:bg-slate-800'}
                                            ${isSelected ? 'bg-orange-50 dark:bg-orange-900/30' : ''}
                                            ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'hover:bg-slate-50/80 dark:hover:bg-slate-700/50'}
                                            ${rowClassName}
                                        `}
                                        onClick={() => onRowClick?.(row)}
                                    >
                                        {selectable && (
                                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelectRow(rowId)}
                                                    className="rounded border-slate-300 dark:border-slate-600 text-orange-500 focus:ring-orange-400"
                                                />
                                            </td>
                                        )}

                                        {renderColumns.map((col, colIndex) => (
                                            <td
                                                key={col.key}
                                                className={`
                                                    px-4 ${compact ? 'py-2' : 'py-3'} text-slate-700 dark:text-slate-300
                                                    ${stickyFirstColumn && colIndex === 0 ? 'sticky left-0 bg-inherit z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : ''}
                                                    ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}
                                                `}
                                            >
                                                {formatValue(row[col.key], col)}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {showPagination && totalPages > 0 && (
                <div className="flex items-center justify-between mt-4 flex-wrap gap-4">
                    {/* Rows per page */}
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <span>Rows per page:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="field-sm"
                        >
                            {pageSizeOptions.map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>

                    {/* Page info & navigation */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            {((currentPage - 1) * rowsPerPage) + 1} - {Math.min(currentPage * rowsPerPage, processedData.length)} of {processedData.length}
                        </span>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="First page"
                            >
                                <ChevronsLeft size={18} className="text-slate-600 dark:text-slate-400" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Previous page"
                            >
                                <ChevronLeft size={18} className="text-slate-600 dark:text-slate-400" />
                            </button>

                            {/* Page numbers */}
                            <div className="flex items-center gap-1 mx-2">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`
                                                w-8 h-8 rounded-lg text-sm font-medium transition-colors
                                                ${currentPage === pageNum
                                                    ? 'bg-orange-500 text-white'
                                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                }
                                            `}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Next page"
                            >
                                <ChevronRight size={18} className="text-slate-600 dark:text-slate-400" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Last page"
                            >
                                <ChevronsRight size={18} className="text-slate-600 dark:text-slate-400" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Column definition helper
 */
export const createColumn = (key, options = {}) => ({
    key,
    label: options.label || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    sortable: options.sortable !== false,
    visible: options.visible !== false,
    type: options.type || 'text',
    align: options.align || 'left',
    width: options.width,
    minWidth: options.minWidth,
    formatter: options.formatter
});

/**
 * Common column presets
 */
export const columnPresets = {
    id: { key: 'id', label: 'ID', width: '60px', sortable: true },
    status: { key: 'status', label: 'Status', type: 'status', width: '100px' },
    createdAt: { key: 'created_at', label: 'Created', type: 'date', sortable: true },
    actions: { key: 'actions', label: 'Actions', sortable: false, align: 'center' }
};
