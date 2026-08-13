import PropTypes from 'prop-types';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * These are deliberately louder than the StatCard tiles further down the
 * dashboard. That page had ten tiles of identical weight, so nothing was
 * headline and the eye had no entry point; the counts people actually came for
 * (who is in, who is missing, who was late) sat in the same visual register as
 * the verification count.
 *
 * The angled edge is the one decorative element and it earns its place by
 * grouping: four slanted frames read as one band of headline figures, which a
 * row of plain rectangles does not.
 *
 * `accent` is a resolved colour string, not a Tailwind class, because these
 * follow the palette chosen in Settings → Appearance. A class name could not —
 * Tailwind only ships the classes it can see at build time, so a custom hex
 * from the colour picker would silently render as no colour at all.
 */
export default function HeroStat({ icon: Icon, label, value, accent, hint, onClick }) {
    const interactive = typeof onClick === 'function';

    return (
        <div
            onClick={onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={interactive ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
            } : undefined}
            className={`relative overflow-hidden rounded-2xl border bg-white dark:bg-slate-800
                        border-slate-200 dark:border-slate-700 px-5 py-4
                        transition-all duration-200
                        ${interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900' : ''}`}
            style={interactive ? { '--tw-ring-color': accent } : undefined}
        >
            {/* The slanted band. Sits behind the content at low opacity so the
                figure stays the highest-contrast thing in the card — the shape
                is there to group the row, not to be looked at. */}
            <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-28 opacity-[0.13] dark:opacity-25"
                style={{ backgroundColor: accent, clipPath: 'polygon(38% 0, 100% 0, 100% 100%, 0% 100%)' }}
            />
            <span
                aria-hidden="true"
                className="absolute left-0 inset-y-0 w-1"
                style={{ backgroundColor: accent }}
            />

            <div className="relative flex items-center gap-4">
                <span
                    className="grid place-items-center w-12 h-12 rounded-xl shrink-0"
                    style={{ backgroundColor: `${accent}1F`, color: accent }}
                >
                    <Icon size={24} />
                </span>

                <div className="min-w-0">
                    <p className="text-3xl font-bold leading-none tabular-nums" style={{ color: accent }}>
                        {value}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {label}
                    </p>
                    {hint && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{hint}</p>
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
    onClick: PropTypes.func
};
