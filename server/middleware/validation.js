/**
 * Validation Middleware
 * Input validation for reports and other endpoints
 */

/**
 * Validate date range parameters
 */
const validateDateRange = (req, res, next) => {
    const { start_date, end_date, year, month, date } = req.query;
    
    // Validate date range
    if (start_date && end_date) {
        const start = new Date(start_date);
        const end = new Date(end_date);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
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
    
    // Validate single date
    if (date) {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        }
    }
    
    // Validate year
    if (year) {
        const y = parseInt(year);
        const currentYear = new Date().getFullYear();
        if (isNaN(y) || y < 2020 || y > currentYear + 1) {
            return res.status(400).json({ 
                error: `Year must be between 2020 and ${currentYear + 1}` 
            });
        }
    }
    
    // Validate month
    if (month) {
        const m = parseInt(month);
        if (isNaN(m) || m < 1 || m > 12) {
            return res.status(400).json({ error: 'Month must be between 1 and 12' });
        }
    }
    
    next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
    const { page, limit } = req.query;
    
    if (page) {
        const p = parseInt(page);
        if (isNaN(p) || p < 1) {
            return res.status(400).json({ error: 'Page must be a positive integer' });
        }
    }
    
    if (limit) {
        const l = parseInt(limit);
        if (isNaN(l) || l < 1 || l > 1000) {
            return res.status(400).json({ error: 'Limit must be between 1 and 1000' });
        }
    }
    
    next();
};

/**
 * Sanitize string input to prevent SQL injection
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    // Remove any SQL keywords and special characters
    return str.replace(/[;'"\\]/g, '');
};

module.exports = {
    validateDateRange,
    validatePagination,
    sanitizeString
};
