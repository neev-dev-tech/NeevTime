/**
 * Enhanced PDF Export Utility
 * 
 * Professional PDF generation with:
 * - Company branding & logo
 * - Customizable headers/footers
 * - Smart column width handling
 * - Page break optimization
 * - Signature placeholders
 * - Watermarks
 * - Row limit protection
 * 
 * @author DevTeam
 * @version 2.1.0
 */

import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// Maximum rows for PDF export (browser memory limit)
const MAX_PDF_ROWS = 1000;

/**
 * Enhanced PDF Export Utility
 * 
 * Professional PDF generation with:
 * - Company branding & logo
 * - Customizable headers/footers
 * - Smart column width handling
 * - Page break optimization
 * - Signature placeholders
 * - Watermarks
 * 
 * @author DevTeam
 * @version 2.0.0
 */

// Default company settings (can be overridden)
const DEFAULT_COMPANY = {
    name: 'NeevTime',
    tagline: 'Attendance Management System',
    address: '',
    phone: '',
    email: '',
    website: ''
};

// Color palette
const COLORS = {
    primary: [249, 115, 22],      // Orange/Saffron
    primaryDark: [234, 88, 12],   // Darker orange
    secondary: [30, 41, 59],      // Dark gray
    text: [33, 33, 33],           // Black text
    textMuted: [100, 100, 100],   // Gray text
    headerBg: [249, 115, 22],     // Orange header
    headerText: [255, 255, 255],  // White header text
    rowEven: [254, 247, 237],     // Light orange
    rowOdd: [255, 255, 255],      // White
    border: [229, 231, 235],      // Light gray border
    success: [16, 185, 129],      // Green
    warning: [245, 158, 11],      // Amber
    error: [239, 68, 68]          // Red
};

/**
 * Main PDF export function with branding
 */
export const exportToPDF = (options) => {
    const {
        data,
        filename,
        title,
        subtitle,
        headers,
        columns,
        dateRange,
        filters = {},
        orientation = 'landscape',
        format = 'a4',
        company = DEFAULT_COMPANY,
        showLogo = true,
        showFooter = true,
        showPageNumbers = true,
        showTimestamp = true,
        showSignature = false,
        signatureLabels = ['Prepared By', 'Approved By', 'Authorized By'],
        watermark = null,
        summaryData = null
    } = options;

    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    // ✅ ROW LIMIT CHECK - Prevent browser crashes
    if (data.length > MAX_PDF_ROWS) {
        const proceed = window.confirm(
            `⚠️ Large Dataset Warning\n\n` +
            `This report contains ${data.length.toLocaleString()} rows.\n` +
            `PDF export is limited to ${MAX_PDF_ROWS.toLocaleString()} rows for performance.\n\n` +
            `Recommendations:\n` +
            `• Use Excel export for full dataset (no row limit)\n` +
            `• Use CSV export for maximum compatibility\n` +
            `• Apply filters to reduce row count\n\n` +
            `Continue with first ${MAX_PDF_ROWS.toLocaleString()} rows?`
        );
        
        if (!proceed) {
            return;
        }
        
        // Truncate data and add warning
        options.data = data.slice(0, MAX_PDF_ROWS);
        if (!watermark) {
            options.watermark = `TRUNCATED: Showing ${MAX_PDF_ROWS.toLocaleString()} of ${data.length.toLocaleString()} rows`;
        }
    }

    // Create PDF document
    let doc;
    try {
        doc = new jsPDF({
            orientation: orientation || 'landscape',
            unit: 'mm',
            format: format || 'a4'
        });

        // Initialize document
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);

        if (!doc.internal || typeof doc.internal.getFontSize !== 'function') {
            throw new Error('jsPDF internal state not properly initialized');
        }
    } catch (err) {
        console.error('Failed to create jsPDF instance:', err);
        alert('Failed to initialize PDF document: ' + err.message);
        return;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let yPos = margin;

    // ============================================================
    // HEADER SECTION
    // ============================================================

    // Draw header background
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Company name (left side)
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(company.name || 'NeevTime', margin, 12);

    // Tagline
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(company.tagline || 'Attendance Management System', margin, 18);

    // Company contact info (right side)
    if (company.phone || company.email) {
        doc.setFontSize(8);
        const contactInfo = [company.phone, company.email].filter(Boolean).join(' | ');
        doc.text(contactInfo, pageWidth - margin, 12, { align: 'right' });
    }

    // Report title (center)
    if (title) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), pageWidth / 2, 24, { align: 'center' });
    }

    yPos = 35;

    // ============================================================
    // REPORT INFO BAR
    // ============================================================

    // Draw info bar background
    doc.setFillColor(254, 247, 237); // Light orange bg
    doc.rect(0, 28, pageWidth, 12, 'F');

    // Subtitle and date range
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFont('helvetica', 'normal');

    let infoText = [];
    if (subtitle) infoText.push(subtitle);
    if (dateRange) infoText.push(`Period: ${dateRange}`);

    // Applied filters
    const filterText = Object.entries(filters)
        .filter(([key, value]) => value && value !== '' && value !== 'all')
        .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
        .join(' | ');

    if (filterText) infoText.push(filterText);

    if (infoText.length > 0) {
        doc.text(infoText.join('  •  '), margin, 35);
    }

    // Generated timestamp (right side)
    if (showTimestamp) {
        doc.setFontSize(8);
        doc.text(
            `Generated: ${new Date().toLocaleString()}`,
            pageWidth - margin,
            35,
            { align: 'right' }
        );
    }

    yPos = 45;

    // ============================================================
    // SUMMARY CARDS (if provided)
    // ============================================================

    if (summaryData && summaryData.length > 0) {
        const cardWidth = (pageWidth - margin * 2 - (summaryData.length - 1) * 4) / summaryData.length;
        const cardHeight = 20;

        summaryData.forEach((card, index) => {
            const x = margin + index * (cardWidth + 4);

            // Card background
            const bgColor = card.color === 'success' ? COLORS.success :
                card.color === 'warning' ? COLORS.warning :
                    card.color === 'error' ? COLORS.error : COLORS.primary;

            doc.setFillColor(...bgColor);
            doc.roundedRect(x, yPos, cardWidth, cardHeight, 2, 2, 'F');

            // Card value
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text(String(card.value), x + cardWidth / 2, yPos + 10, { align: 'center' });

            // Card label
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(card.label.toUpperCase(), x + cardWidth / 2, yPos + 16, { align: 'center' });
        });

        yPos += cardHeight + 8;
    }

    // ============================================================
    // TABLE DATA
    // ============================================================

    // Prepare table headers
    let tableHeaders = headers;
    let tableRows = [];

    if (!tableHeaders && columns) {
        tableHeaders = columns.map(col => {
            if (typeof col === 'string') return col;
            return col.header || col.key || col;
        });
    }

    if (!tableHeaders && data.length > 0) {
        tableHeaders = Object.keys(data[0]).filter(key =>
            !['id', 'created_at', 'updated_at', 'days'].includes(key)
        );
    }

    // Handle muster roll / attendance sheet with days
    if (data[0] && 'days' in data[0]) {
        const daysInMonth = data[0].days?.length || 30;
        tableHeaders = ['Employee', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), 'P', 'A', 'L'];

        tableRows = data.map(row => {
            const presentCount = row.days?.filter(d => d === 'P').length || 0;
            const absentCount = row.days?.filter(d => d === 'A').length || 0;
            const lateCount = row.days?.filter(d => d === 'L').length || 0;

            return [
                `${row.employee_name || row.name}\n${row.employee_code || ''}`,
                ...row.days.map(day => day || '-'),
                presentCount,
                absentCount,
                lateCount
            ];
        });
    } else {
        // Standard table
        tableRows = data.map(row => {
            return tableHeaders.map(header => {
                const key = typeof header === 'object' ? header.key : header;
                let value = row[key];

                // Format values
                if (value === null || value === undefined) return '-';
                if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                if (value instanceof Date) return value.toLocaleDateString();
                if (typeof value === 'string' && value.includes('T') && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
                    const date = new Date(value);
                    if (!isNaN(date)) {
                        if (key.includes('time') || key.includes('punch')) {
                            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        }
                        return date.toLocaleDateString();
                    }
                }

                if (typeof header === 'object' && header.formatter) {
                    return header.formatter(value, row);
                }

                return String(value);
            });
        });
    }

    // Format headers for display
    const displayHeaders = tableHeaders.map(h => {
        if (typeof h === 'object') return h.label || h.header || h.key;
        return h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    });

    // Calculate column widths
    const columnWidths = {};
    const availableWidth = pageWidth - margin * 2;
    const numCols = displayHeaders.length;

    // Auto-size columns based on content
    displayHeaders.forEach((header, index) => {
        // Check if it's a date column (1-31)
        if (!isNaN(parseInt(header)) && parseInt(header) <= 31) {
            columnWidths[index] = { cellWidth: 6 }; // Narrow for day numbers
        } else if (header.length <= 3) {
            columnWidths[index] = { cellWidth: 10 }; // Narrow for short headers
        } else if (header.toLowerCase().includes('employee') || header.toLowerCase().includes('name')) {
            columnWidths[index] = { cellWidth: 'auto', minCellWidth: 30 };
        }
    });

    // Generate table
    try {
        autoTable(doc, {
            head: [displayHeaders],
            body: tableRows,
            startY: yPos,
            theme: 'grid',
            headStyles: {
                fillColor: COLORS.headerBg,
                textColor: COLORS.headerText,
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3,
                halign: 'center',
                valign: 'middle'
            },
            bodyStyles: {
                textColor: COLORS.text,
                fontSize: 7,
                cellPadding: 2.5,
                valign: 'middle'
            },
            alternateRowStyles: {
                fillColor: COLORS.rowEven
            },
            styles: {
                overflow: 'linebreak',
                cellWidth: 'wrap',
                lineColor: COLORS.border,
                lineWidth: 0.1
            },
            columnStyles: columnWidths,
            margin: { top: 45, left: margin, right: margin, bottom: showSignature ? 50 : 25 },
            tableLineColor: COLORS.border,
            tableLineWidth: 0.1,

            // Page break handling with header repeat
            showHead: 'everyPage',

            didDrawPage: (data) => {
                const pageNum = doc.internal.getNumberOfPages();

                // Watermark
                if (watermark) {
                    doc.setFontSize(60);
                    doc.setTextColor(200, 200, 200);
                    doc.setFont('helvetica', 'bold');
                    doc.text(
                        watermark,
                        pageWidth / 2,
                        pageHeight / 2,
                        { align: 'center', angle: 45 }
                    );
                }

                // Footer
                if (showFooter) {
                    const footerY = pageHeight - 10;

                    // Footer line
                    doc.setDrawColor(...COLORS.border);
                    doc.setLineWidth(0.5);
                    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);

                    // Company name in footer
                    doc.setFontSize(7);
                    doc.setTextColor(...COLORS.textMuted);
                    doc.setFont('helvetica', 'normal');
                    doc.text(company.name || 'NeevTime', margin, footerY);

                    // Page numbers
                    if (showPageNumbers) {
                        doc.text(
                            `Page ${data.pageNumber}`,
                            pageWidth / 2,
                            footerY,
                            { align: 'center' }
                        );
                    }

                    // Confidential notice
                    doc.text(
                        'Confidential - For Internal Use Only',
                        pageWidth - margin,
                        footerY,
                        { align: 'right' }
                    );
                }

                // Repeat header on each page
                if (data.pageNumber > 1) {
                    // Mini header on subsequent pages
                    doc.setFillColor(...COLORS.primary);
                    doc.rect(0, 0, pageWidth, 15, 'F');

                    doc.setFontSize(10);
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.text(title || 'Report', margin, 10);

                    doc.setFontSize(8);
                    doc.text(
                        `Page ${data.pageNumber}`,
                        pageWidth - margin,
                        10,
                        { align: 'right' }
                    );
                }
            }
        });
    } catch (tableError) {
        console.error('Error generating PDF table:', tableError);
        alert('Failed to generate PDF table: ' + (tableError.message || 'Unknown error'));
        return;
    }

    // ============================================================
    // SIGNATURE SECTION
    // ============================================================

    if (showSignature && signatureLabels.length > 0) {
        const lastPage = doc.internal.getNumberOfPages();
        doc.setPage(lastPage);

        const signatureY = pageHeight - 40;
        const signatureWidth = (pageWidth - margin * 2 - 20) / signatureLabels.length;

        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.3);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.textMuted);
        doc.setFont('helvetica', 'normal');

        signatureLabels.forEach((label, index) => {
            const x = margin + 10 + index * (signatureWidth + 10);

            // Signature line
            doc.line(x, signatureY, x + signatureWidth - 20, signatureY);

            // Label
            doc.text(label, x + (signatureWidth - 20) / 2, signatureY + 5, { align: 'center' });

            // Date placeholder
            doc.setFontSize(7);
            doc.text('Date: ____________', x + (signatureWidth - 20) / 2, signatureY + 10, { align: 'center' });
        });
    }

    // ============================================================
    // SAVE PDF
    // ============================================================

    try {
        const finalFilename = filename || `${title?.replace(/\s+/g, '_') || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(finalFilename);
    } catch (saveError) {
        console.error('Error saving PDF:', saveError);
        alert('Failed to save PDF: ' + (saveError.message || 'Unknown error'));
    }
};

/**
 * Export simple table to PDF with defaults
 */
export const exportTableToPDF = (data, options = {}) => {
    const {
        filename,
        title = 'Report',
        dateRange,
        filters
    } = options;

    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    const headers = Object.keys(data[0]).filter(key =>
        !['id', 'created_at', 'updated_at', 'days'].includes(key)
    );

    exportToPDF({
        data,
        filename,
        title,
        headers,
        dateRange,
        filters
    });
};

/**
 * Export with custom column mapping
 */
export const exportWithColumns = (data, columnDefs, options = {}) => {
    const {
        filename,
        title = 'Report',
        subtitle,
        dateRange,
        filters
    } = options;

    exportToPDF({
        data,
        filename,
        title,
        subtitle,
        columns: columnDefs,
        dateRange,
        filters
    });
};

/**
 * Export attendance report with summary cards
 */
export const exportAttendanceReport = (data, options = {}) => {
    const {
        title = 'Attendance Report',
        dateRange,
        present = 0,
        absent = 0,
        late = 0,
        onLeave = 0,
        ...restOptions
    } = options;

    exportToPDF({
        data,
        title,
        dateRange,
        summaryData: [
            { label: 'Present', value: present, color: 'success' },
            { label: 'Absent', value: absent, color: 'error' },
            { label: 'Late', value: late, color: 'warning' },
            { label: 'On Leave', value: onLeave, color: 'primary' }
        ],
        ...restOptions
    });
};

/**
 * Export with signature section
 */
export const exportWithSignature = (data, options = {}) => {
    exportToPDF({
        ...options,
        data,
        showSignature: true,
        signatureLabels: options.signatureLabels || ['Prepared By', 'Verified By', 'Approved By']
    });
};

export default exportToPDF;
