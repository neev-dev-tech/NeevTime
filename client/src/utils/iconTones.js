/**
 * Icon colour system.
 *
 * Colour is assigned by what a thing *is*, not picked per component. Every page
 * in a module shares its module's colour, so the app is colourful without being
 * arbitrary — and the colour tells you where you are. Nine unrelated pastels on
 * one screen is what made the dashboard read as noise.
 *
 * Class strings are written out in full because Tailwind's scanner cannot see
 * anything built by interpolation — `bg-${tone}-50` produces no CSS at all, a
 * mistake this codebase has already shipped once.
 */

export const TONES = {
    orange: 'bg-orange-50 border-orange-100 text-orange-600 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400',
    blue: 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400',
    violet: 'bg-violet-50 border-violet-100 text-violet-600 dark:bg-violet-900/30 dark:border-violet-800 dark:text-violet-400',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400',
    teal: 'bg-teal-50 border-teal-100 text-teal-600 dark:bg-teal-900/30 dark:border-teal-800 dark:text-teal-400',
    amber: 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-400',
    rose: 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-400',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:border-cyan-800 dark:text-cyan-400',
    pink: 'bg-pink-50 border-pink-100 text-pink-600 dark:bg-pink-900/30 dark:border-pink-800 dark:text-pink-400',
    sky: 'bg-sky-50 border-sky-100 text-sky-600 dark:bg-sky-900/30 dark:border-sky-800 dark:text-sky-400',
    slate: 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-300'
};

/** Bare text colour, for icons that sit inline rather than in a chip. */
export const TEXT_TONES = {
    orange: 'text-orange-500 dark:text-orange-400',
    blue: 'text-blue-500 dark:text-blue-400',
    violet: 'text-violet-500 dark:text-violet-400',
    emerald: 'text-emerald-500 dark:text-emerald-400',
    teal: 'text-teal-500 dark:text-teal-400',
    amber: 'text-amber-500 dark:text-amber-400',
    rose: 'text-rose-500 dark:text-rose-400',
    indigo: 'text-indigo-500 dark:text-indigo-400',
    cyan: 'text-cyan-500 dark:text-cyan-400',
    pink: 'text-pink-500 dark:text-pink-400',
    sky: 'text-sky-500 dark:text-sky-400',
    slate: 'text-slate-500 dark:text-slate-400'
};

/**
 * Module colours. Each entry is a route prefix; the longest match wins, so
 * /schedule/employee can differ from /schedule if that is ever wanted.
 */
const ROUTE_TONES = [
    // Personnel — blue family
    ['/employees', 'blue'],
    ['/departments', 'blue'],
    ['/positions', 'indigo'],
    ['/areas', 'indigo'],
    ['/resign', 'rose'],
    ['/employee-docs', 'sky'],
    ['/workflow', 'indigo'],

    // Devices — violet family
    ['/devices', 'violet'],
    ['/device-commands', 'violet'],
    ['/device-sync', 'violet'],
    ['/device-messages', 'pink'],

    // Attendance — teal / green family
    ['/attendance-rules', 'teal'],
    ['/attendance-register', 'teal'],
    ['/attendance-calendar', 'teal'],
    ['/attendance', 'teal'],
    ['/timetables', 'cyan'],
    ['/shifts', 'cyan'],
    ['/schedule', 'cyan'],
    ['/geofences', 'emerald'],
    ['/break-times', 'emerald'],
    ['/holiday-locations', 'emerald'],
    ['/holidays', 'emerald'],
    ['/leaves', 'amber'],
    ['/leave-types', 'amber'],
    ['/leave-balance', 'amber'],
    ['/regularizations', 'amber'],
    ['/mobile', 'pink'],
    ['/logs', 'slate'],

    // Reports — orange, the brand accent
    ['/reports', 'orange'],
    ['/export', 'orange'],
    ['/import', 'orange'],

    // System — slate, deliberately quiet
    ['/users', 'slate'],
    ['/settings', 'slate'],
    ['/database', 'slate'],
    ['/system-logs', 'slate'],
    ['/integrations', 'slate']
];

/** Resolve a route to its module tone. Falls back to the brand orange. */
export const toneForPath = (pathname = '') => {
    let best = null;
    for (const [prefix, tone] of ROUTE_TONES) {
        if (pathname.startsWith(prefix) && (!best || prefix.length > best[0].length)) {
            best = [prefix, tone];
        }
    }
    return best ? best[1] : 'orange';
};

export const chipClass = (tone) => TONES[tone] || TONES.orange;
export const textClass = (tone) => TEXT_TONES[tone] || TEXT_TONES.orange;
