import PropTypes from 'prop-types';

/**
 * A headline figure — the four numbers someone opens the app to check.
 *
 * These are deliberately louder than the tiles below them. The dashboard used
 * to open with ten stat cards of identical weight, so nothing was the headline
 * and the eye had no entry point; the counts people actually come for sat in
 * the same visual register as the verification count.
 *
 * The treatment is glass over a soft accent glow: a tinted gradient wash, a
 * blurred bloom in the corner, and a hairline inset ring in the accent colour.
 * It reads as depth rather than decoration, and — the practical reason to build
 * it this way — every layer is derived from a single `accent` value, so the
 * card restyles itself when the brand colour changes instead of needing a
 * hand-picked palette per card.
 *
 * `accent` is a resolved colour string, not a Tailwind class. It has to be:
 * Tailwind only ships the classes it can see at build time, so a custom hex
 * from the Settings colour picker would compile to nothing at all. The eight-
 * digit hex suffixes below (`${accent}14`) are alpha channels — 14 ≈ 8%.
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
            className={`group relative overflow-hidden rounded-2xl p-5
                        bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl
                        shadow-sm transition-all duration-300
                        ${interactive
                            ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'
                            : ''}`}
            style={{
                // Inset ring rather than a border: a border would shift the
                // layout by a pixel on hover when the colour intensifies.
                boxShadow: `inset 0 0 0 1px ${accent}2E`,
                ...(interactive ? { '--tw-ring-color': accent } : {})
            }}
        >
            {/* Accent wash, strongest at the top-right where the bloom sits. */}
            <span
                aria-hidden="true"
                className="absolute inset-0 opacity-90"
                style={{ background: `linear-gradient(135deg, transparent 40%, ${accent}14 100%)` }}
            />
            {/* The bloom. Blurred well past its own bounds and clipped by the
                card, which is what gives the glow rather than a visible disc. */}
            <span
                aria-hidden="true"
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl
                           opacity-40 group-hover:opacity-70 transition-opacity duration-300"
                style={{ backgroundColor: accent }}
            />

            <div className="relative">
                <div className="flex items-start justify-between gap-3">
                    <span
                        className="grid place-items-center w-11 h-11 rounded-xl shrink-0
                                   transition-transform duration-300 group-hover:scale-105"
                        style={{
                            background: `linear-gradient(140deg, ${accent}, ${accent}B3)`,
                            color: '#fff',
                            boxShadow: `0 6px 16px -6px ${accent}`
                        }}
                    >
                        <Icon size={21} strokeWidth={2.3} />
                    </span>

                    <p
                        className="text-[2.6rem] leading-none font-bold tabular-nums tracking-tight"
                        style={{ color: accent }}
                    >
                        {value}
                    </p>
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
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
