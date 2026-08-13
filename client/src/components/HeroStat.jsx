import PropTypes from 'prop-types';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * The form is an open, slanted frame: a coloured outline that runs along the
 * top and down one side and then stops, rather than a closed box. Four of them
 * in a row read as one band of headline figures, which is the point — the
 * dashboard used to open with ten identical tiles, so nothing was the headline
 * and the counts people actually come for sat in the same visual register as
 * the verification count.
 *
 * The frame is drawn as an inline SVG rather than with borders and a skew
 * transform. A skew would tilt the number and the label with it, and undoing
 * that with a counter-skew on the content leaves the text fractionally blurred
 * on most displays. The SVG tilts only the frame, so the type stays upright and
 * crisp.
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
            className={`group relative px-6 py-5 rounded-lg transition-all duration-300
                        ${interactive
                            ? 'cursor-pointer hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'
                            : ''}`}
            style={interactive ? { '--tw-ring-color': accent } : undefined}
        >
            {/* The slanted frame. preserveAspectRatio="none" lets it stretch to
                whatever width the grid gives the card while the stroke stays an
                even weight, because vectorEffect keeps it in screen pixels
                rather than scaling it with the viewBox. */}
            <svg
                aria-hidden="true"
                className="absolute inset-0 w-full h-full overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <path
                    d="M 12 2 L 100 2 L 100 98 L 88 98"
                    fill="none"
                    stroke={accent}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="square"
                />
                <path
                    d="M 12 2 L 0 98 L 88 98"
                    fill="none"
                    stroke={accent}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="square"
                    className="opacity-45"
                />
            </svg>

            {/* A wash that deepens on hover, so the card responds without the
                frame having to thicken and shift the layout. */}
            <span
                aria-hidden="true"
                className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(120deg, ${accent}14, transparent 70%)` }}
            />

            <div className="relative flex items-center gap-4">
                <span
                    className="shrink-0 grid place-items-center w-12 h-12 rounded-xl transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${accent}1F`, color: accent }}
                >
                    <Icon size={26} strokeWidth={2} />
                </span>

                <div className="min-w-0">
                    <p
                        className="text-[2.4rem] leading-none font-bold tabular-nums tracking-tight"
                        style={{ color: accent }}
                    >
                        {value}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {label}
                    </p>
                    {hint && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</p>
                    )}
                    {trend && (
                        <p className="text-[11px] font-semibold truncate" style={{ color: accent }}>{trend}</p>
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
