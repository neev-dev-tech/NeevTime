import PropTypes from 'prop-types';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * Same shell as the stat tiles below it, so the page reads as one set of cards
 * rather than two designs stacked on each other. The emphasis is carried by
 * weight and by a single accent element, not by a heavier frame.
 *
 * The bar is the part that earns its space. "13 Absent" is a number you have to
 * do arithmetic on before it means anything; the bar shows the share of the
 * workforce at a glance, and the caption under it states the fraction outright.
 * That is the difference between reporting a figure and answering the question
 * someone opened the page with.
 *
 * `accent` is a resolved colour string, not a Tailwind class. It has to be:
 * Tailwind only ships the classes it can see at build time, so a custom hex
 * from the Settings colour picker would compile to nothing at all.
 *
 * Note there is no inline `--tw-ring-color`. Setting it to style the focus ring
 * also repainted the base `ring-1`, because that is the variable Tailwind's
 * ring utilities read — every card ended up outlined in its accent colour,
 * which is exactly the heavy framed look this is meant to avoid.
 */
export default function HeroStat({
    icon: Icon, label, value, accent, hint, trend, share, shareLabel, onClick
}) {
    const interactive = typeof onClick === 'function';
    const pct = typeof share === 'number' ? Math.max(0, Math.min(1, share)) * 100 : null;

    return (
        <div
            onClick={onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={interactive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
            } : undefined}
            className={`group relative overflow-hidden rounded-xl p-4
                        bg-white/75 dark:bg-slate-800/60 backdrop-blur-xl
                        shadow-sm ring-1 ring-slate-900/[0.06] dark:ring-white/[0.07]
                        transition-all duration-300
                        ${interactive
                            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500'
                            : ''}`}
        >
            {/* The only always-on colour: a short rule above the figure. Enough
                to tie the card to its meaning without ringing the whole box. */}
            <span
                aria-hidden="true"
                className="absolute top-0 left-4 h-[3px] w-10 rounded-b"
                style={{ backgroundColor: accent }}
            />

            <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">
                    {label}
                </p>
                <span
                    className="shrink-0 grid place-items-center w-7 h-7 rounded-lg transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${accent}1A`, color: accent }}
                >
                    <Icon size={15} strokeWidth={2.4} />
                </span>
            </div>

            <p
                className="mt-1.5 text-[28px] leading-none font-bold tabular-nums tracking-tight"
                style={{ color: accent }}
            >
                {value}
            </p>

            {pct !== null && (
                <div className="mt-2.5">
                    {/* aria-hidden: the caption below states the same fraction in
                        words, so the bar would only repeat it to a screen reader. */}
                    <div
                        aria-hidden="true"
                        className="h-1 w-full rounded-full bg-slate-200/70 dark:bg-slate-700/70 overflow-hidden"
                    >
                        <span
                            className="block h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${pct}%`, backgroundColor: accent }}
                        />
                    </div>
                    {shareLabel && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {shareLabel}
                        </p>
                    )}
                </div>
            )}

            {pct === null && hint && (
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</p>
            )}

            {trend && (
                <p className="mt-0.5 text-[10px] font-semibold truncate" style={{ color: accent }}>
                    {trend}
                </p>
            )}
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
    /** 0–1. Draws the proportion bar; omit where a share is meaningless. */
    share: PropTypes.number,
    shareLabel: PropTypes.string,
    onClick: PropTypes.func
};
