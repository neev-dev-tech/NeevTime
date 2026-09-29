import React from 'react';
import PropTypes from 'prop-types';
import { Download } from 'lucide-react';
import { ListMenu, ListMenuItem } from './ui/ListPage';
import { exportToPDF } from '../utils/pdfExport';
import { exportToExcel } from '../utils/excelExport';

/**
 * Standard Export dropdown: CSV, Excel or PDF of the rows given.
 *
 *   <ExportMenu rows={rows} columns={[{key:'name',label:'Name'}, ...]}
 *               filename="devices" title="Devices" />
 *
 * `columns` maps row fields to export headers; omit it to export raw rows.
 * Optional `mapRow` runs per row before export (e.g. formatting dates).
 */
// eslint-disable-next-line no-unused-vars
export default function ExportMenu({ rows, columns, filename, title, mapRow, size }) {
    const buildRows = () => {
        const source = mapRow ? rows.map(mapRow) : rows;
        if (!columns || columns.length === 0) return source;
        return source.map(row => {
            const out = {};
            columns.forEach(col => { out[col.label] = row[col.key] ?? ''; });
            return out;
        });
    };

    const exportCSV = () => {
        const data = buildRows();
        if (data.length === 0) return;
        const headers = Object.keys(data[0]);
        const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csv = [headers.map(escape).join(','), ...data.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const exportExcel = () => {
        const data = buildRows();
        if (data.length === 0) return;
        exportToExcel({ data, filename, sheetName: (title || filename).slice(0, 31) });
    };

    const exportPDF = () => {
        const data = buildRows();
        if (data.length === 0) return;
        exportToPDF({ data, filename: `${filename}.pdf`, title: title || filename });
    };

    const empty = !rows || rows.length === 0;

    // One "Export" control instead of three coloured buttons, the same size
    // as every other toolbar button. `size` is kept for callers but unused.
    return (
        <ListMenu label="Export" icon={Download} width="w-44" emptyHint={empty ? 'Nothing to export yet.' : null}>
            <ListMenuItem onClick={exportCSV}>CSV</ListMenuItem>
            <ListMenuItem onClick={exportExcel}>Excel (.xlsx)</ListMenuItem>
            <ListMenuItem onClick={exportPDF}>PDF</ListMenuItem>
        </ListMenu>
    );
}

ExportMenu.propTypes = {
    rows: PropTypes.array.isRequired,
    columns: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired
    })),
    filename: PropTypes.string.isRequired,
    title: PropTypes.string,
    mapRow: PropTypes.func,
    size: PropTypes.string
};
