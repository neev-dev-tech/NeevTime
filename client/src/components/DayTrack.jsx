import PropTypes from 'prop-types';

/**
 * A 24-hour track with the working window drawn on it.
 *
 * Reading "22:00 → 06:00" beside "06:00 → 14:00" and "14:00 → 22:00" does not
 * show at a glance that three shifts cover the day end to end, or where two
 * overlap. Drawn on one scale they do. A window that ends at or before it
 * starts crosses midnight and is drawn as two pieces. Optional markers show
 * the late-after and early-before points.
 */

const toMinutes = (t) => {
    if (!t) return null;
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const pct = (min) => `${(min / 1440) * 100}%`;

export default function DayTrack({ start, end, color, lateAfter, earlyBefore, label }) {
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === null || e === null) return <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" />;
    const pieces = e > s ? [[s, e]] : [[s, 1440], [0, e]];
    const late = toMinutes(lateAfter);
    const early = toMinutes(earlyBefore);
    const barStyle = color ? { backgroundColor: color } : undefined;
    return (
        <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800" role="img"
            aria-label={label || `${String(start).slice(0, 5)} to ${String(end).slice(0, 5)}${e <= s ? ', overnight' : ''}`}>
            {/* 6-hour gridlines */}
            {[360, 720, 1080].map(m => (
                <span key={m} aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" style={{ left: pct(m) }} />
            ))}
            {pieces.map(([a, b], i) => (
                <span key={i} aria-hidden="true"
                    className={`absolute top-0 bottom-0 rounded-full ${color ? '' : 'bg-slate-800 dark:bg-slate-200'}`}
                    style={{ left: pct(a), width: pct(b - a), ...barStyle }} />
            ))}
            {late !== null && (
                <span aria-hidden="true" title={`Late after ${String(lateAfter).slice(0, 5)}`}
                    className="absolute -top-1 -bottom-1 w-0.5 rounded bg-amber-500" style={{ left: pct(late) }} />
            )}
            {early !== null && (
                <span aria-hidden="true" title={`Early before ${String(earlyBefore).slice(0, 5)}`}
                    className="absolute -top-1 -bottom-1 w-0.5 rounded bg-rose-500" style={{ left: pct(early) }} />
            )}
        </div>
    );
}

DayTrack.propTypes = {
    start: PropTypes.string,
    end: PropTypes.string,
    color: PropTypes.string,
    lateAfter: PropTypes.string,
    earlyBefore: PropTypes.string,
    label: PropTypes.string
};

/** Hour scale to sit in the column header above a column of DayTracks. */
export function DayTrackScale() {
    return (
        <div className="relative h-3.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium tabular-nums normal-case tracking-normal" aria-hidden="true">
            {['00', '06', '12', '18', '24'].map((h, i) => (
                <span key={h} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${i * 25}%` }}>{h}</span>
            ))}
        </div>
    );
}
