import PropTypes from 'prop-types';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * Same shell as the stat tiles below it: identical radius, ring, glass surface
 * and hover. That is the point. An earlier version drew these as open slanted
 * frames, which made the top of the page look like it belonged to a different
 * product than the row underneath — two card languages stacked on top of each
 * other.
 *
 * The emphasis comes from weight rather than from shape: a larger figure in the
 * accent colour, a filled icon tile, and a coloured edge down the left. Those
 * read as "this line matters more" without becoming a separate design.
 *
 * `accent` is a resolved colour string, not a Tailwind class. It has to be:
 * Tailwind only ships the classes it can see at build time, so a custom hex
 * from the Settings colour picker would compile to nothing at all.
 */
export default function HeroStat({ icon: Icon, label, value, accent, hint, trend, onClick }) {
    const interactive = typeof onClick === 'function';

    return (
        <div
            onClick={onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={interactive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
            } : undefined}
            className={`group relative overflow-hidden rounded-xl p-3.5 flex items-center gap-3
                        bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl
                        shadow-sm ring-1 ring-slate-900/[0.06] dark:ring-white/[0.07]
                        transition-all duration-300
                        ${interactive
                            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2'
                            : ''}`}
            style={interactive ? { '--tw-ring-color': accent } : undefined}
        >
            {/* The one thing that separates these from the tiles below: a
                coloured edge, and a wash that only appears on hover. */}
            <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ backgroundColor: accent }}
            />
            <span
                aria-hidden="true"
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(110deg, ${accent}14, transparent 65%)` }}
            />

            <div className="relative flex items-center gap-3 min-w-0">
                <span
                    className="shrink-0 grid place-items-center w-10 h-10 rounded-lg transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundColor: `${accent}1F`, color: accent }}
                >
                    <Icon size={20} strokeWidth={2.2} />
                </span>

                <div className="min-w-0">
                    <p
                        className="text-2xl leading-none font-bold tabular-nums tracking-tight"
                        style={{ color: accent }}
                    >
                        {value}
                    </p>
                    <p className="mt-1 text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">
                        {label}
                    </p>
                    {hint && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">{hint}</p>
                    )}
                    {trend && (
                        <p className="text-[10px] font-semibold truncate leading-tight" style={{ color: accent }}>
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
    onClick: PropTypes.func
};
