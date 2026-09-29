import PropTypes from 'prop-types';
import useReveal from '../hooks/useReveal';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * The ring is the point of the card. "13 Absent" is a number you have to do
 * arithmetic on before it means anything — against 93 people that is a normal
 * Tuesday, against 20 it is a crisis — so the share is drawn as a gauge and
 * stated as a fraction underneath. The figure answers "how many", the ring
 * answers "out of how many", and neither needs the other explained.
 *
 * Where a share would be meaningless the icon takes the ring's place, at the
 * same size. Headcount is not a proportion of anything, and a full ring beside
 * it would imply 100% of some total that does not exist. Keeping the slot
 * occupied is what holds the four cards to one height.
 *
 * `accent` is a resolved colour string, not a Tailwind class. It has to be:
 * Tailwind only ships the classes it can see at build time, so a custom hex
 * from the Settings colour picker would compile to nothing at all.
 */

const SIZE = 46;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

function Gauge({ pct, accent }) {
    return (
        <span className="relative shrink-0 grid place-items-center" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90">
                <circle
                    cx={SIZE / 2} cy={SIZE / 2} r={R}
                    fill="none" strokeWidth={STROKE}
                    className="stroke-slate-200 dark:stroke-slate-700"
                />
                <circle
                    cx={SIZE / 2} cy={SIZE / 2} r={R}
                    fill="none" stroke={accent} strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    // Drawn from the full circumference downwards, so 0% is an
                    // empty track rather than a full ring.
                    strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)}
                    style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
                />
            </svg>
            <span className="absolute text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {Math.round(pct)}%
            </span>
        </span>
    );
}

Gauge.propTypes = { pct: PropTypes.number.isRequired, accent: PropTypes.string.isRequired };

export default function HeroStat({
    icon: Icon, label, value, accent, hint, trend, share, shareLabel, onClick
}) {
    const revealRef = useReveal();
    const interactive = typeof onClick === 'function';
    const pct = typeof share === 'number' ? Math.max(0, Math.min(1, share)) * 100 : null;

    return (
        <div
            ref={revealRef}
            onClick={onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={interactive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
            } : undefined}
            className={`reveal group relative rounded-xl p-4
                        bg-app-surface/75 dark:bg-slate-800/60 backdrop-blur-xl
                        shadow-sm ring-1 ring-slate-900/[0.06] dark:ring-white/[0.07]
                        transition-[transform,box-shadow] duration-300
                        ${interactive
                            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500'
                            : ''}`}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400 truncate">
                    {label}
                </p>
                <span
                    className="shrink-0 grid place-items-center w-6 h-6 rounded-md"
                    style={{ backgroundColor: `${accent}1A`, color: accent }}
                >
                    <Icon size={13} strokeWidth={2.4} />
                </span>
            </div>

            {/* Premium: the icon appears once (header chip). The gauge stays
                where a share is meaningful; otherwise the figure takes the
                space — grid rows already hold the four cards to one height.
                The number is neutral; colour lives in the icon and gauge. */}
            <div className="mt-3 flex items-center gap-3">
                {pct !== null && <Gauge pct={pct} accent={accent} />}

                <div className="min-w-0">
                    <p className="text-[28px] leading-none font-bold tabular-nums tracking-tight text-charcoal">
                        {value}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                        {shareLabel || hint}
                    </p>
                    {trend && (
                        <p className="mt-0.5 text-xs font-semibold leading-snug" style={{ color: accent }}>
                            {trend}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

HeroStat.propTypes = {
    icon: PropTypes.elementType.isRequired,
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    accent: PropTypes.string.isRequired,
    hint: PropTypes.string,
    trend: PropTypes.string,
    /** 0–1. Draws the gauge; omit where a share is meaningless. */
    share: PropTypes.number,
    shareLabel: PropTypes.string,
    onClick: PropTypes.func
};
