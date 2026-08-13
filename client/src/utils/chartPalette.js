/**
 * A categorical palette derived from the deployment's own brand colour.
 *
 * Slices in these charts are days and months. They have no good or bad, so the
 * semantic colours are the wrong tool — a green Tuesday and a red Friday imply
 * a judgement the data does not make, and reusing `error` red for "the 3rd"
 * reads as an alert.
 *
 * What is needed is a set of colours that are merely *distinct*. Rotating hue
 * evenly around the wheel from the brand colour gives that while keeping the
 * saturation and lightness of the original, so the result still looks like the
 * same design system rather than a stock chart palette dropped in.
 *
 * Hue rotation, not a fixed list, because the brand colour is configurable in
 * Settings → Appearance: a hardcoded palette would clash the moment someone
 * picked a scheme it was not designed against.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** #RGB and #RRGGBB to {h, s, l}. Returns null for anything unparseable. */
function hexToHsl(hex) {
    if (typeof hex !== 'string') return null;
    let raw = hex.trim().replace('#', '');
    if (raw.length === 3) raw = raw.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;

    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: l * 100 };

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;

    return { h: h * 60, s: s * 100, l: l * 100 };
}

/**
 * `count` visually distinct colours, the first being the brand colour itself.
 *
 * The rotation deliberately skips a full even split when count is small: two
 * colours 180° apart are complementary and fight, so the span is capped and the
 * set stays within a harmonious arc rather than spanning the whole wheel.
 */
export function buildPalette(baseHex, count) {
    const n = Math.max(1, count);
    const hsl = hexToHsl(baseHex) || { h: 24, s: 95, l: 53 };  // fall back to the default orange

    const span = n <= 2 ? 60 : 300;
    const step = span / n;

    return Array.from({ length: n }, (_, i) => {
        const h = (hsl.h + step * i) % 360;
        // Nudge lightness alternately so neighbouring slices stay apart even
        // where the hue step is small, and so the ring reads on both a white
        // and a slate-900 card.
        const l = clamp(hsl.l + (i % 2 === 0 ? 0 : 8), 30, 70);
        const s = clamp(hsl.s, 45, 90);
        return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
    });
}

export default buildPalette;
