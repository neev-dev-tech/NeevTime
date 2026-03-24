# Critical Bugs - Immediate Fix Guide
## TimeNexa HRMS - Priority Fixes

**Date:** March 24, 2026  
**Estimated Time:** 6 hours total  
**Priority:** CRITICAL 🔴

---

## Bug #1: SQL Injection Vulnerability ⚠️ CRITICAL

### Location
**File:** `server/server.js` lines 156-210

### Current Code (VULNERABLE)
```javascript
app.get('/api/reports/first-last', async (req, res) => {
    try {
        const { startDate, endDate, employeeId, firstName } = req.query;
        let query = `
            SELECT 
                e.employee_code, 
                e.name as first_name, 
                '' as last_name, 
                d.name as department, 
                to_char(ads.date, 'YYYY-MM-DD') as date, 
                to_char(ads.date, 'Day') as weekday, 
                to_char(ads.in_time, 'HH24:MI') as first_punch, 
                to_char(ads.out_time, 'HH24:MI') as last_punch, 
                CASE 
                    WHEN ads.duration_minutes IS NULL THEN '0:00'
                    ELSE CONCAT(FLOOR(ads.duration_minutes / 60), ':', LPAD((ads.duration_minutes % 60)::text, 2, '0'))
                END as total_time
            FROM attendance_daily_summary ads
            JOIN employees e ON ads.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            params.push(startDate);
            query += ` AND ads.date >= ${params.length}`;  // ❌ MISSING $
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND ads.date <= ${params.length}`;  // ❌ MISSING $
        }
        if (employeeId) {
            params.push(employeeId);
            query += ` AND e.employee_code = ${params.length}`;  // ❌ MISSING $
        }
        if (firstName) {
            params.push(`%${firstName}%`);
            query += ` AND e.name ILIKE ${params.length}`;  // ❌ MISSING $
        }

        query += ' ORDER BY ads.date DESC, e.name ASC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
```

### Fixed Code ✅
```javascript
app.get('/api/reports/first-last', async (req, res) => {
    try {
        const { startDate, endDate, employeeId, firstName } = req.query;
        let query = `
            SELECT 
                e.employee_code, 
                e.name as first_name, 
                '' as last_name, 
                d.name as department, 
                to_char(ads.date, 'YYYY-MM-DD') as date, 
                to_char(ads.date, 'Day') as weekday, 
                to_char(ads.in_time, 'HH24:MI') as first_punch, 
                to_char(ads.out_time, 'HH24:MI') as last_punch, 
                CASE 
                    WHEN ads.duration_minutes IS NULL THEN '0:00'
                    ELSE CONCAT(FLOOR(ads.duration_minutes / 60), ':', LPAD((ads.duration_minutes % 60)::text, 2, '0'))
                END as total_time
            FROM attendance_daily_summary ads
            JOIN employees e ON ads.employee_code = e.employee_code
            LEFT JOIN departments d ON e.department_id = d.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            params.push(startDate);
            query += ` AND ads.date >= $${params.length}`;  // ✅ FIXED
        }
        if (endDate) {
            params.push(endDate);
            query += ` AND ads.date <= $${params.length}`;  // ✅ FIXED
        }
        if (employeeId) {
            params.push(employeeId);
            query += ` AND e.employee_code = $${params.length}`;  // ✅ FIXED
        }
        if (firstName) {
            params.push(`%${firstName}%`);
            query += ` AND e.name ILIKE $${params.length}`;  // ✅ FIXED
        }

        query += ' ORDER BY ads.date DESC, e.name ASC';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
```

### Testing
```bash
# Test with normal input
curl "http://localhost:3001/api/reports/first-last?startDate=2024-01-01&endDate=2024-01-31"

# Test with SQL injection attempt (should fail safely now)
curl "http://localhost:3001/api/reports/first-last?startDate=2024-01-01'; DROP TABLE employees; --"
```

**Time:** 15 minutes  
**Risk:** HIGH - Data breach, data loss

---

## Bug #2: Missing Authentication on Reports

### Location
**File:** `server/routes/reports.js` - All routes

### Current Code (INSECURE)
```javascript
const express = require('express');
const router = express.Router();
const reports = require('../services/reports');

// ❌ NO AUTHENTICATION!
router.get('/daily-attendance', async (req, res) => {
    // Anyone can access this
});
```

### Fixed Code ✅
```javascript
const express = require('express');
const router = express.Router();
const reports = require('../services/reports');
const { authenticateToken } = require('./auth');  // ✅ ADD THIS

// ✅ PROTECT ALL ROUTES
router.use(authenticateToken);

router.get('/daily-attendance', async (req, res) => {
    // Now requires valid JWT token
});
```

### Testing
```bash
# Should fail without token
curl http://localhost:3001/api/reports/daily-attendance
# Response: 401 Unauthorized

# Should work with token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3001/api/reports/daily-attendance
# Response: Report data
```

**Time:** 5 minutes  
**Risk:** CRITICAL - Unauthorized data access

---

## Bug #3: CSV Escaping Issues

### Location
**File:** `server/services/reports.js` - `toCSV()` function

### Current Code (BUGGY)
```javascript
const toCSV = (reportData) => {
    if (!reportData.data || reportData.data.length === 0) {
        return '';
    }

    const headers = Object.keys(reportData.data[0]);
    const rows = reportData.data.map(row =>
        headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') val = JSON.stringify(val);
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;  // ❌ INCOMPLETE
            return val;
        }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');  // ❌ MISSING BOM
};
```

**Issues:**
1. No BOM for Excel UTF-8 compatibility
2. Doesn't escape quotes inside quoted strings
3. Doesn't handle newlines in cell values

### Fixed Code ✅
```javascript
const toCSV = (reportData) => {
    if (!reportData.data || reportData.data.length === 0) {
        return '';
    }

    const BOM = '\uFEFF';  // ✅ UTF-8 BOM for Excel
    const headers = Object.keys(reportData.data[0]);
    
    // ✅ Proper CSV escaping
    const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;  // ✅ ESCAPE QUOTES
        }
        return str;
    };
    
    const headerRow = headers.map(escapeCSV).join(',');
    const dataRows = reportData.data.map(row =>
        headers.map(h => escapeCSV(row[h])).join(',')
    );
    
    return BOM + [headerRow, ...dataRows].join('\n');  // ✅ ADD BOM
};
```

### Testing
```javascript
// Test data with special characters
const testData = {
    data: [
        { name: 'John "Johnny" Doe', notes: 'Line 1\nLine 2', salary: '1,000' },
        { name: 'Jane O\'Brien', notes: 'Normal text', salary: '2,000' }
    ]
};

const csv = toCSV(testData);
console.log(csv);

// Expected output:
// name,notes,salary
// "John ""Johnny"" Doe","Line 1
// Line 2","1,000"
// Jane O'Brien,Normal text,"2,000"
```

**Time:** 30 minutes  
**Risk:** MEDIUM - Data corruption in exports

---

## Bug #4: jsPDF Version Mismatch

### Location
**File:** `client/package.json`

### Current Code (WRONG VERSION)
```json
{
  "dependencies": {
    "jspdf": "^3.0.4",  // ❌ Version 3.x doesn't exist!
    "jspdf-autotable": "^5.0.2"
  }
}
```

### Fixed Code ✅
```json
{
  "dependencies": {
    "jspdf": "^2.5.2",  // ✅ Latest stable version
    "jspdf-autotable": "^3.8.2"  // ✅ Compatible version
  }
}
```

### Fix Steps
```bash
cd client

# Remove old versions
npm uninstall jspdf jspdf-autotable

# Install correct versions
npm install jspdf@2.5.2 jspdf-autotable@3.8.2

# Test PDF export
npm run dev
# Navigate to Reports > Generate Report > Export PDF
```

### Verify Fix
```javascript
// In browser console after loading app
import jsPDF from 'jspdf';
console.log(jsPDF.version);  // Should show "2.5.2"
```

**Time:** 30 minutes  
**Risk:** MEDIUM - PDF export failures

---

## Bug #5: Missing Input Validation

### Location
**File:** `server/routes/reports.js` - All date range endpoints

### Current Code (NO VALIDATION)
```javascript
router.get('/monthly-summary', async (req, res) => {
    try {
        const now = new Date();
        const { year, month, department_id } = req.query;

        // ❌ No validation! User can query year 1900 to 9999
        const report = await reports.generateMonthlySummary(
            parseInt(year) || now.getFullYear(),
            parseInt(month) || now.getMonth() + 1,
            department_id ? parseInt(department_id) : null
        );

        res.json(report);
    } catch (err) {
        console.error('Monthly Summary Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});
```

### Fixed Code ✅
```javascript
// Add validation middleware
const validateDateRange = (req, res, next) => {
    const { start_date, end_date, year, month } = req.query;
    
    // Validate date range
    if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format' });
        }
        
        if (start > end) {
            return res.status(400).json({ error: 'Start date must be before end date' });
        }
        
        const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365) {
            return res.status(400).json({ 
                error: 'Date range cannot exceed 1 year. Use smaller ranges for better performance.' 
            });
        }
    }
    
    // Validate year/month
    if (year) {
        const y = parseInt(year);
        const currentYear = new Date().getFullYear();
        if (y < 2020 || y > currentYear + 1) {
            return res.status(400).json({ 
                error: `Year must be between 2020 and ${currentYear + 1}` 
            });
        }
    }
    
    if (month) {
        const m = parseInt(month);
        if (m < 1 || m > 12) {
            return res.status(400).json({ error: 'Month must be between 1 and 12' });
        }
    }
    
    next();
};

// Apply to routes
router.get('/monthly-summary', validateDateRange, async (req, res) => {
    try {
        const now = new Date();
        const { year, month, department_id } = req.query;

        const report = await reports.generateMonthlySummary(
            parseInt(year) || now.getFullYear(),
            parseInt(month) || now.getMonth() + 1,
            department_id ? parseInt(department_id) : null
        );

        res.json(report);
    } catch (err) {
        console.error('Monthly Summary Report Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Apply to all date range routes
router.get('/late-early', validateDateRange, async (req, res) => { /* ... */ });
router.get('/absent', validateDateRange, async (req, res) => { /* ... */ });
router.get('/overtime', validateDateRange, async (req, res) => { /* ... */ });
```

### Testing
```bash
# Should fail - date range too large
curl "http://localhost:3001/api/reports/late-early?start_date=2020-01-01&end_date=2025-12-31"
# Response: 400 Bad Request - Date range cannot exceed 1 year

# Should fail - invalid year
curl "http://localhost:3001/api/reports/monthly-summary?year=1900&month=1"
# Response: 400 Bad Request - Year must be between 2020 and 2027

# Should work
curl "http://localhost:3001/api/reports/monthly-summary?year=2024&month=3"
# Response: Report data
```

**Time:** 1 hour  
**Risk:** HIGH - Performance issues, DoS attacks

---

## Bug #6: PDF Export Row Limit

### Location
**File:** `client/src/utils/pdfExport.js`

### Current Code (NO LIMIT)
```javascript
export const exportToPDF = (options) => {
    const { data, filename, title, ... } = options;

    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    // ❌ No check for large datasets!
    // Will crash browser with 5000+ rows
    
    const doc = new jsPDF({ ... });
    // ... generate PDF
};
```

### Fixed Code ✅
```javascript
export const exportToPDF = (options) => {
    const { data, filename, title, ... } = options;

    if (!data || data.length === 0) {
        alert('No data to export');
        return;
    }

    // ✅ Add row limit check
    const MAX_PDF_ROWS = 1000;
    
    if (data.length > MAX_PDF_ROWS) {
        const proceed = window.confirm(
            `⚠️ Large Dataset Warning\n\n` +
            `This report contains ${data.length.toLocaleString()} rows.\n` +
            `PDF export is limited to ${MAX_PDF_ROWS.toLocaleString()} rows for performance.\n\n` +
            `Recommendations:\n` +
            `• Use Excel export for full dataset\n` +
            `• Use CSV export for maximum compatibility\n` +
            `• Filter data to reduce row count\n\n` +
            `Continue with first ${MAX_PDF_ROWS.toLocaleString()} rows?`
        );
        
        if (!proceed) {
            return;
        }
        
        // Truncate data
        options.data = data.slice(0, MAX_PDF_ROWS);
        
        // Add warning to PDF
        options.watermark = `TRUNCATED: Showing ${MAX_PDF_ROWS} of ${data.length} rows`;
    }

    // Continue with PDF generation
    const doc = new jsPDF({ ... });
    // ... rest of code
};
```

### Testing
```javascript
// Test with large dataset
const largeData = Array.from({ length: 5000 }, (_, i) => ({
    id: i + 1,
    name: `Employee ${i + 1}`,
    department: 'Engineering',
    date: '2024-03-24'
}));

exportToPDF({
    data: largeData,
    filename: 'large_report.pdf',
    title: 'Large Report Test'
});

// Should show warning dialog
// If user clicks OK, should export first 1000 rows with watermark
```

**Time:** 30 minutes  
**Risk:** HIGH - Browser crashes

---

## Bug #7: Missing Error Boundaries

### Location
**File:** `client/src/pages/AdvancedReports.jsx`

### Current Code (NO ERROR BOUNDARY)
```javascript
// ❌ If PDF export crashes, entire app crashes
const AdvancedReports = () => {
    // ... component code
    
    const exportToPDF = () => {
        // If this throws, app crashes
        exportPDF({ ... });
    };
    
    return (
        <Box>
            {/* No error boundary */}
        </Box>
    );
};
```

### Fixed Code ✅

**Step 1:** Create Error Boundary Component
```javascript
// File: client/src/components/ReportErrorBoundary.jsx
import React from 'react';
import { Alert, Button, Box, Typography } from '@mui/material';
import { RefreshCw } from 'lucide-react';

class ReportErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Report Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Alert severity="error" sx={{ mb: 2 }}>
                        <Typography variant="h6" gutterBottom>
                            Report Generation Failed
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2 }}>
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<RefreshCw size={16} />}
                            onClick={() => {
                                this.setState({ hasError: false, error: null });
                                window.location.reload();
                            }}
                        >
                            Reload Page
                        </Button>
                    </Alert>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ReportErrorBoundary;
```

**Step 2:** Wrap Component
```javascript
// File: client/src/pages/AdvancedReports.jsx
import ReportErrorBoundary from '../components/ReportErrorBoundary';

const AdvancedReportsWrapper = () => {
    return (
        <ReportErrorBoundary>
            <AdvancedReports />
        </ReportErrorBoundary>
    );
};

export default AdvancedReportsWrapper;
```

**Step 3:** Add Try-Catch to Export Functions
```javascript
const exportToPDF = () => {
    try {
        if (!reportData?.data || reportData.data.length === 0) {
            setError('No data to export. Please generate the report first.');
            return;
        }

        exportPDF({
            data: reportData.data,
            filename: `${selectedReport}_${dateRangeText}.pdf`,
            title: config?.name || 'Report',
            // ... rest of options
        });
    } catch (err) {
        console.error('PDF Export Error:', err);
        setError(`Failed to export PDF: ${err.message}`);
        
        // Show user-friendly error
        alert(
            'PDF Export Failed\n\n' +
            'This could be due to:\n' +
            '• Dataset too large (try filtering)\n' +
            '• Browser memory limit\n' +
            '• Invalid data format\n\n' +
            'Try using Excel or CSV export instead.'
        );
    }
};
```

**Time:** 1 hour  
**Risk:** MEDIUM - Poor user experience

---

## Bug #8: FirstLastReport Code Duplication

### Location
**File:** `client/src/pages/reports/FirstLastReport.jsx`

### Current Code (DUPLICATED)
```javascript
const exportToExcel = () => {
    if (data.length === 0) return;

    // ❌ DUPLICATED CODE - Should use utility
    const excelData = data.map(r => ({
        "Employee Id": r.employee_code,
        "First Name": r.first_name,
        // ... mapping
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `First_Last_Report_${startDate}_${endDate}.xlsx`);
};
```

### Fixed Code ✅
```javascript
import { exportToExcel } from '../../utils/excelExport';
import { exportToPDF } from '../../utils/pdfExport';

const [exporting, setExporting] = useState(false);
const [exportProgress, setExportProgress] = useState(0);

const handleExportExcel = async () => {
    if (data.length === 0) {
        alert('No data to export. Please generate the report first.');
        return;
    }

    setExporting(true);
    setExportProgress(0);

    try {
        await exportToExcel({
            data: data.map(r => ({
                'Employee Id': r.employee_code,
                'First Name': r.first_name,
                'Last Name': r.last_name || '',
                'Department': r.department,
                'Date': r.date,
                'Weekday': r.weekday,
                'First Punch': r.first_punch || '-',
                'Last Punch': r.last_punch || '-',
                'Total Time': r.total_time
            })),
            filename: `First_Last_Report_${startDate}_${endDate}.xlsx`,
            sheetName: 'First & Last Punch',
            metadata: {
                'Report Type': 'First & Last Punch Report',
                'Date Range': `${startDate} to ${endDate}`,
                'Total Records': data.length,
                'Generated At': new Date().toLocaleString()
            },
            onProgress: (progress) => setExportProgress(progress),
            onSuccess: ({ filename, recordCount }) => {
                alert(`✅ Export successful!\n\nFile: ${filename}\nRecords: ${recordCount}`);
            },
            onError: (err) => {
                alert(`❌ Export failed: ${err.message}`);
            }
        });
    } finally {
        setExporting(false);
        setExportProgress(0);
    }
};

// Update button
<button
    onClick={handleExportExcel}
    disabled={exporting || data.length === 0}
    className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
>
    {exporting ? (
        <>
            <RefreshCw size={16} className="animate-spin" />
            Exporting... {exportProgress}%
        </>
    ) : (
        <>
            <FileSpreadsheet size={16} />
            Excel Export
        </>
    )}
</button>
```

**Time:** 1 hour  
**Risk:** LOW - Code maintainability

---

## Implementation Checklist

### Day 1 (3 hours)
```markdown
Morning:
- [ ] Bug #1: Fix SQL injection (15 min)
- [ ] Bug #2: Add authentication (5 min)
- [ ] Bug #3: Fix CSV escaping (30 min)
- [ ] Test all fixes (30 min)

Afternoon:
- [ ] Bug #4: Fix jsPDF version (30 min)
- [ ] Bug #5: Add input validation (1 hour)
- [ ] Test validation (30 min)
```

### Day 2 (3 hours)
```markdown
Morning:
- [ ] Bug #6: Add PDF row limit (30 min)
- [ ] Bug #7: Add error boundaries (1 hour)
- [ ] Test error handling (30 min)

Afternoon:
- [ ] Bug #8: Refactor FirstLastReport (1 hour)
- [ ] Final testing (30 min)
- [ ] Deploy to staging (30 min)
```

---

## Testing Script

```bash
#!/bin/bash
# File: test_critical_fixes.sh

echo "Testing Critical Bug Fixes..."

# Test 1: SQL Injection
echo "\n1. Testing SQL Injection Fix..."
curl -s "http://localhost:3001/api/reports/first-last?startDate=2024-01-01&endDate=2024-01-31" | jq .
curl -s "http://localhost:3001/api/reports/first-last?startDate=2024-01-01'; DROP TABLE employees; --" | jq .

# Test 2: Authentication
echo "\n2. Testing Authentication..."
curl -s http://localhost:3001/api/reports/daily-attendance | jq .
# Should return 401

# Test 3: Input Validation
echo "\n3. Testing Input Validation..."
curl -s "http://localhost:3001/api/reports/monthly-summary?year=1900&month=1" | jq .
# Should return 400

# Test 4: Date Range Validation
echo "\n4. Testing Date Range Validation..."
curl -s "http://localhost:3001/api/reports/late-early?start_date=2020-01-01&end_date=2025-12-31" | jq .
# Should return 400

echo "\n✅ All tests complete!"
```

---

## Deployment Steps

### 1. Backup Database
```bash
pg_dump -U postgres attendance_db > backup_$(date +%Y%m%d).sql
```

### 2. Apply Fixes
```bash
# Pull latest code
git pull origin main

# Install dependencies
cd client && npm install
cd ../server && npm install

# Run tests
npm test

# Build client
cd client && npm run build
```

### 3. Deploy
```bash
# Restart server
pm2 restart attendance-server

# Clear cache
redis-cli FLUSHALL

# Monitor logs
pm2 logs attendance-server
```

### 4. Verify
```bash
# Run test script
./test_critical_fixes.sh

# Check error logs
tail -f server/logs/error.log
```

---

## Rollback Plan

If issues occur:

```bash
# 1. Restore database
psql -U postgres attendance_db < backup_YYYYMMDD.sql

# 2. Revert code
git revert HEAD
git push origin main

# 3. Redeploy
pm2 restart attendance-server

# 4. Notify team
echo "Rollback completed at $(date)" | mail -s "Deployment Rollback" team@company.com
```

---

## Success Criteria

- [ ] All SQL injection vulnerabilities fixed
- [ ] All report endpoints require authentication
- [ ] CSV exports work with special characters
- [ ] PDF exports don't crash with large datasets
- [ ] Input validation prevents invalid queries
- [ ] Error boundaries catch and display errors gracefully
- [ ] No code duplication in export functions
- [ ] All tests pass
- [ ] No new errors in production logs

---

**CRITICAL: Test thoroughly in staging before production deployment!**
