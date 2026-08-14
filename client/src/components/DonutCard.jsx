import PropTypes from 'prop-types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useReveal from '../hooks/useReveal';

/**
 * A donut breaking one total down by day or by month, with the total in the
 * hole.
 *
 * Two things this deliberately does not do:
 *
 * It does not draw a chart of nothing. A donut whose every slice is zero
 * renders as an empty ring or, worse, as one full-circle slice implying a
 * single busy day. Nine absences and no absences are the two readings someone
 * most needs to tell apart, so zero gets a plain sentence instead.
 *
 * It does not label slices around the rim. The reference design does, and it
 * works there because the numbers were invented to fit; with seven real days,
 * several of them near-zero, the leader lines collide and the labels overlap.
 * The legend lists every bucket with its count, including the zero days a rim
 * label could not show at all.
 *
 * `recharts` was already a dependency but imported nowhere — these are its
 * first use in the app.
 */
export default function DonutCard({ title, subtitle, data, colors, emptyMessage, loading }) {
    const revealRef = useReveal();
    const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
    const slices = data.filter(d => d.value > 0);

    return (
        <div ref={revealRef} className="card-base flex flex-col">
            <div className="mb-1">
                <h3 className="font-semibold text-base text-slate-800 dark:text-slate-100">{title}</h3>
                {subtitle && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
                )}
            </div>

            {loading ? (
                <div className="flex-1 grid place-items-center py-8">
                    <div className="w-36 h-36 rounded-full border-[18px] border-slate-100 dark:border-slate-700 animate-pulse" />
                </div>
            ) : total === 0 ? (
                <div className="flex-1 grid place-items-center py-10 text-center">
                    <div>
                        {/* An empty ring, drawn flat, so the card keeps the shape
                            of its populated siblings instead of collapsing. */}
                        <div className="w-24 h-24 mx-auto rounded-full border-[16px] border-slate-100 dark:border-slate-700/70" />
                        <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                            {emptyMessage || 'Nothing to show'}
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="relative h-48 mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={slices}
                                    dataKey="value"
                                    nameKey="name"
                                    // Pixels, not percentages. recharts 3 renders
                                    // the sector groups but leaves them empty
                                    // when the radii are percentage strings, so
                                    // the ring silently disappears and only the
                                    // centre total is left on the card.
                                    innerRadius={54}
                                    outerRadius={84}
                                    paddingAngle={slices.length > 1 ? 2 : 0}
                                    stroke="none"
                                    // Off deliberately. With the grow-in
                                    // animation the sector groups render empty
                                    // and never fill, leaving a card with a
                                    // centre total and no ring around it.
                                    isAnimationActive={false}
                                >
                                    {slices.map((entry, i) => (
                                        <Cell key={entry.name} fill={colors[i % colors.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value, name) => [`${value}`, name]}
                                    contentStyle={{
                                        borderRadius: '0.75rem',
                                        border: 'none',
                                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                                        fontSize: '12px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>

                        {/* pointer-events-none: the label sits over the ring, and
                            without it the centre would swallow hover and kill the
                            tooltip on the innermost part of every slice. */}
                        <div className="absolute inset-0 grid place-items-center pointer-events-none">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
                                    {total}
                                </p>
                                <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    total
                                </p>
                            </div>
                        </div>
                    </div>

                    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {data.map((d, i) => (
                            <li key={d.name} className="flex items-center gap-2 text-xs">
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{
                                        backgroundColor: d.value > 0
                                            ? colors[slices.findIndex(s => s.name === d.name) % colors.length]
                                            : 'transparent',
                                        border: d.value > 0 ? 'none' : '1px solid currentColor'
                                    }}
                                />
                                {/* Zero rows are deliberately quieter, but not
                                    unreadable: dark:text-slate-600 measured
                                    2.34:1 against the card, which is a label
                                    you cannot actually read. */}
                                <span className={`truncate ${d.value > 0
                                    ? 'text-slate-600 dark:text-slate-300'
                                    : 'text-slate-400 dark:text-slate-500'}`}>
                                    {d.name}
                                </span>
                                <span className={`ml-auto font-semibold tabular-nums ${d.value > 0
                                    ? 'text-slate-700 dark:text-slate-200'
                                    : 'text-slate-400 dark:text-slate-500'}`}>
                                    {d.value}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

DonutCard.propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    data: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        value: PropTypes.number
    })).isRequired,
    colors: PropTypes.arrayOf(PropTypes.string).isRequired,
    emptyMessage: PropTypes.string,
    loading: PropTypes.bool
};
