/**
 * Date/Time formatting utilities for NeevTime
 *
 * The API returns timestamps in two shapes, and they must be treated
 * differently:
 *
 *  1. A real instant — "2026-07-31T07:41:52.000Z". The database columns are
 *     `timestamp without time zone`, but the pg driver reads them as JS Dates
 *     using the server's timezone, so JSON.stringify emits a correct UTC
 *     instant. These must be converted back to the viewer's local time.
 *  2. A bare wall clock — "2026-07-31 13:11:52" or "2026-07-31", produced by
 *     to_char() in SQL. There is no zone to convert; the text is already what
 *     should be shown, and parsing it as a Date would shift it.
 *
 * This previously stripped the trailing Z and read the UTC clock face
 * literally, which displayed every timestamp one UTC offset early — 5h30m in
 * IST. Detecting the shape is what keeps both cases correct.
 */

const pad = (n) => String(n).padStart(2, '0');

/** True when the string carries a zone (Z or ±HH:MM), i.e. an absolute instant. */
const hasTimezone = (str) => /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str.trim());

/**
 * Format a database timestamp for display.
 * @param {string} timestamp - Database timestamp string
 * @returns {object} { date: 'M/D/YYYY', time: 'h:mm:ss AM/PM', datetime: 'M/D/YYYY h:mm:ss AM/PM' }
 */
export const formatTimestamp = (timestamp) => {
    if (!timestamp) return { date: '-', time: '-', datetime: '-' };

    const str = String(timestamp);
    let datePart, timePart;

    if (str.includes('T') && hasTimezone(str)) {
        // Absolute instant — render it in the viewer's own timezone
        const d = new Date(str);
        if (Number.isNaN(d.getTime())) return { date: '-', time: '-', datetime: '-' };
        datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        timePart = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } else if (str.includes('T')) {
        // ISO shape but no zone: a wall clock, e.g. 2026-01-05T17:52:00
        const [d, t] = str.split('T');
        datePart = d;
        timePart = t.split('.')[0];
    } else if (str.includes(' ')) {
        // Space format: 2026-01-05 17:52:00
        const [d, t] = str.split(' ');
        datePart = d;
        timePart = t ? t.split('.')[0] : '00:00:00';
    } else {
        // Date only: 2026-01-05
        datePart = str;
        timePart = '00:00:00';
    }

    // Format date as M/D/YYYY
    const [year, month, day] = datePart.split('-');
    const formattedDate = `${parseInt(month)}/${parseInt(day)}/${year}`;

    // Format time as h:mm:ss AM/PM
    const timeParts = timePart.split(':');
    const hours = parseInt(timeParts[0] || 0);
    const minutes = timeParts[1] || '00';
    const seconds = timeParts[2] || '00';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const formattedTime = `${h12}:${minutes}:${seconds} ${ampm}`;

    return {
        date: formattedDate,
        time: formattedTime,
        datetime: `${formattedDate} ${formattedTime}`
    };
};

/**
 * YYYY-MM-DD for a Date, in the viewer's own timezone.
 *
 * Use this instead of toISOString().split('T')[0]. toISOString converts to UTC
 * first, so in any zone ahead of UTC every moment before the offset — midnight
 * to 05:30 in IST — reports the previous day. That silently mis-buckets early
 * punches and shifts "today" filters.
 *
 * @param {Date|string|number} value
 * @returns {string} 'YYYY-MM-DD'
 */
export const toLocalDateString = (value = new Date()) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Format time only (for in_time, out_time display)
 * @param {string} timestamp - Database timestamp string
 * @returns {string} 'h:mm:ss AM/PM' or '-' if null
 */
export const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    return formatTimestamp(timestamp).time;
};

/**
 * Format date only
 * @param {string} timestamp - Database timestamp string
 * @returns {string} 'M/D/YYYY' or '-' if null
 */
export const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return formatTimestamp(timestamp).date;
};

/**
 * Format datetime (combined)
 * @param {string} timestamp - Database timestamp string
 * @returns {string} 'M/D/YYYY h:mm:ss AM/PM' or '-' if null
 */
export const formatDateTime = (timestamp) => {
    if (!timestamp) return '-';
    return formatTimestamp(timestamp).datetime;
};

/**
 * Format time in short format (for dashboard)
 * @param {string} timestamp - Database timestamp string
 * @returns {string} 'h:mm AM/PM' or '-' if null
 */
export const formatTimeShort = (timestamp) => {
    if (!timestamp) return '-';
    const { time } = formatTimestamp(timestamp);
    // Remove seconds: "6:02:35 PM" -> "6:02 PM"
    return time.replace(/:\d{2}\s/, ' ');
};
