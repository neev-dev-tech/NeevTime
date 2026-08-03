/**
 * Enhanced Excel Export Utility
 * Provides premium Excel/XLSX generation with styling across all reports
 */

// xlsx is ~280 KB and only needed on an actual export, so it loads on demand.
// Every caller of these helpers already awaits them.
let XLSX = null;
const loadXlsx = async () => {
    if (!XLSX) XLSX = await import('xlsx');
    return XLSX;
};

/**
 * Export data to Excel/XLSX format with enhanced styling
 * @param {Object} options - Export options
 * @param {Array} options.data - Array of data objects
 * @param {string} options.filename - Output filename (without extension)
 * @param {string} options.sheetName - Sheet name (default: 'Report')
 * @param {Array} options.headers - Optional custom headers array
 * @param {Object} options.metadata - Optional metadata object for additional sheets
 * @param {Function} options.onProgress - Optional progress callback (0-100)
 * @param {Function} options.onSuccess - Optional success callback
 * @param {Function} options.onError - Optional error callback
 * @param {Object} options.styling - Optional styling options
 */
export const exportToExcel = async (options) => {
    const {
        data,
        filename,
        sheetName = 'Report',
        headers,
        metadata,
        onProgress,
        onSuccess,
        onError,
        styling = {}
    } = options;

    // Validate data
    if (!data || !Array.isArray(data)) {
        const error = new Error('No data provided for export');
        if (onError) onError(error);
        else alert('No data to export');
        return false;
    }

    if (data.length === 0) {
        const error = new Error('Empty dataset - nothing to export');
        if (onError) onError(error);
        else alert('No data to export');
        return false;
    }

    try {
        // Report progress
        if (onProgress) onProgress(10);

        // Prepare data for export
        let exportData = data;

        // If headers are provided, map data to headers
        if (headers && Array.isArray(headers)) {
            exportData = data.map(row => {
                const mappedRow = {};
                headers.forEach((header) => {
                    const key = typeof header === 'object' ? header.key : header;
                    const label = typeof header === 'object' ? (header.label || header.header || header.key) : header;
                    let value = row[key];

                    // Format dates
                    if (value instanceof Date) {
                        value = value.toLocaleDateString();
                    }
                    // Format booleans
                    if (typeof value === 'boolean') {
                        value = value ? 'Yes' : 'No';
                    }
                    // Handle null/undefined
                    if (value === null || value === undefined) {
                        value = '';
                    }

                    mappedRow[label] = value;
                });
                return mappedRow;
            });
        } else {
            // Auto-detect headers from data keys and format them
            exportData = data.map(row => {
                const formattedRow = {};
                Object.keys(row).forEach(key => {
                    // Skip internal fields
                    if (['id', 'created_at', 'updated_at', 'days', '__v', '_id'].includes(key)) {
                        return;
                    }

                    // Format key: snake_case to Title Case
                    const formattedKey = key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());

                    let value = row[key];

                    // Format dates
                    if (value instanceof Date) {
                        value = value.toLocaleDateString();
                    }
                    // Format booleans
                    if (typeof value === 'boolean') {
                        value = value ? 'Yes' : 'No';
                    }
                    // Handle nested objects
                    if (typeof value === 'object' && value !== null) {
                        value = JSON.stringify(value);
                    }
                    // Handle null/undefined
                    if (value === null || value === undefined) {
                        value = '';
                    }

                    formattedRow[formattedKey] = value;
                });
                return formattedRow;
            });
        }

        if (onProgress) onProgress(30);

        // Create workbook
        const XLSX = await loadXlsx();
        const wb = XLSX.utils.book_new();

        // Convert data to worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);

        if (onProgress) onProgress(50);

        // Set column widths (auto-size with intelligent calculations)
        const maxWidth = styling.maxColumnWidth || 50;
        const minWidth = styling.minColumnWidth || 10;
        const colWidths = [];

        if (exportData.length > 0) {
            const keys = Object.keys(exportData[0]);
            keys.forEach((key) => {
                // Sample first 100 rows for performance
                const sampleSize = Math.min(exportData.length, 100);
                const maxLength = Math.max(
                    key.length,
                    ...exportData.slice(0, sampleSize).map(row => {
                        const value = row[key];
                        return value ? String(value).length : 0;
                    })
                );
                colWidths.push({
                    wch: Math.min(Math.max(maxLength + 2, minWidth), maxWidth)
                });
            });
            ws['!cols'] = colWidths;
        }

        // Set row heights for header
        ws['!rows'] = [{ hpt: 24 }]; // Header row height

        if (onProgress) onProgress(70);

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Add metadata sheet if provided
        if (metadata && typeof metadata === 'object') {
            const metaData = Object.entries(metadata).map(([key, value]) => ({
                Property: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                Value: String(value)
            }));

            // Add export info
            metaData.push(
                { Property: 'Export Date', Value: new Date().toLocaleString() },
                { Property: 'Total Records', Value: String(data.length) }
            );

            const metaSheet = XLSX.utils.json_to_sheet(metaData);
            metaSheet['!cols'] = [{ wch: 25 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, metaSheet, 'Metadata');
        }

        // Add summary sheet for large datasets
        if (data.length > 100 && styling.includeSummary !== false) {
            const summaryData = [
                { Metric: 'Total Records', Value: data.length },
                { Metric: 'Export Date', Value: new Date().toLocaleString() },
                { Metric: 'Columns', Value: Object.keys(exportData[0] || {}).length }
            ];
            const summarySheet = XLSX.utils.json_to_sheet(summaryData);
            summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
        }

        if (onProgress) onProgress(85);

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const finalFilename = filename
            ? (filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
            : `export_${timestamp}.xlsx`;

        // Write file
        XLSX.writeFile(wb, finalFilename);

        if (onProgress) onProgress(100);
        if (onSuccess) onSuccess({ filename: finalFilename, recordCount: data.length });

        return true;
    } catch (err) {
        console.error('Excel export error:', err);
        if (onError) onError(err);
        else alert('Failed to export Excel file: ' + err.message);
        return false;
    }
};

/**
 * Export simple array of objects to Excel with minimal configuration
 */
export const exportArrayToExcel = (data, filename, sheetName = 'Data') => {
    return exportToExcel({
        data,
        filename,
        sheetName
    });
};

/**
 * Export data to CSV format with enhanced handling
 * @param {Object} options - Export options
 * @param {Array} options.data - Array of data objects
 * @param {string} options.filename - Output filename (without extension)
 * @param {Array} options.headers - Optional custom headers array
 * @param {string} options.delimiter - CSV delimiter (default: ',')
 * @param {Function} options.onProgress - Optional progress callback
 * @param {Function} options.onSuccess - Optional success callback
 * @param {Function} options.onError - Optional error callback
 */
export const exportToCSV = async (options) => {
    const {
        data,
        filename,
        headers,
        delimiter = ',',
        onProgress,
        onSuccess,
        onError
    } = options;

    // Validate data
    if (!data || !Array.isArray(data) || data.length === 0) {
        const error = new Error('No data to export');
        if (onError) onError(error);
        else alert('No data to export');
        return false;
    }

    try {
        if (onProgress) onProgress(10);

        // Determine headers
        let csvHeaders = headers;
        if (!csvHeaders) {
            csvHeaders = Object.keys(data[0]).filter(key =>
                !['id', 'created_at', 'updated_at', 'days', '__v', '_id'].includes(key)
            );
        }

        // Format header labels
        const headerLabels = csvHeaders.map(h => {
            if (typeof h === 'object') return h.label || h.header || h.key;
            return h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        });

        const headerKeys = csvHeaders.map(h => {
            if (typeof h === 'object') return h.key;
            return h;
        });

        if (onProgress) onProgress(30);

        // Build CSV content
        const escapeCSV = (value) => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            // Escape quotes and wrap in quotes if contains delimiter, newline, or quote
            if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = [headerLabels.map(escapeCSV).join(delimiter)];

        data.forEach((row, index) => {
            const values = headerKeys.map(key => {
                let value = row[key];

                // Format dates
                if (value instanceof Date) {
                    value = value.toISOString();
                }
                // Format booleans
                if (typeof value === 'boolean') {
                    value = value ? 'Yes' : 'No';
                }
                // Handle objects
                if (typeof value === 'object' && value !== null) {
                    value = JSON.stringify(value);
                }

                return escapeCSV(value);
            });
            rows.push(values.join(delimiter));

            // Report progress periodically
            if (onProgress && index % 100 === 0) {
                onProgress(30 + Math.floor((index / data.length) * 50));
            }
        });

        if (onProgress) onProgress(85);

        const csv = rows.join('\n');

        // Add BOM for Excel compatibility with UTF-8
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const finalFilename = filename
            ? (filename.endsWith('.csv') ? filename : `${filename}.csv`)
            : `export_${timestamp}.csv`;

        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (onProgress) onProgress(100);
        if (onSuccess) onSuccess({ filename: finalFilename, recordCount: data.length });

        return true;
    } catch (err) {
        console.error('CSV export error:', err);
        if (onError) onError(err);
        else alert('Failed to export CSV file: ' + err.message);
        return false;
    }
};

/**
 * Simple CSV export for backward compatibility
 */
export const exportArrayToCSV = (data, filename) => {
    return exportToCSV({
        data,
        filename
    });
};
