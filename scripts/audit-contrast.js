/**
 * Dark-mode / contrast audit for whatever page is on screen.
 *
 * Paste the whole file into the browser console on any NeevTime page, in either
 * theme. It reports every piece of visible text whose contrast against what is
 * actually painted behind it falls below the WCAG AA threshold.
 *
 * Written because most of this app is behind a login, so the pages could not be
 * checked directly. Three real bugs came out of running it by hand on /login and
 * reasoning about the rest: six strings on the login screen at 1.71:1, the
 * header profile dropdown at 1.48:1, and three search fields rendering
 * near-white text on a near-white background. There are almost certainly more on
 * the pages that could not be reached.
 *
 *   auditContrast()               audit the page as it stands
 *   auditContrast({ verbose: 1 }) also list what it could not score
 *
 * Two traps this already accounts for, both of which produced wrong answers
 * before they were handled:
 *
 * A gradient is a background-IMAGE. backgroundColor stays transparent on a
 * gradient panel, so walking ancestors for a colour sails straight past it and
 * scores the text against <body> instead — which reported a 1.06:1 failure on
 * the login hero that was never real. Gradients are scored against their own
 * colour stops, worst stop first.
 *
 * Translucent backgrounds are composited, not substituted. bg-white/70 over a
 * dark page is not white, and scoring it as white is wrong in the forgiving
 * direction. Alpha is blended down the ancestor chain before scoring.
 */

(function () {
    const luminance = (rgb) => {
        const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const ratio = (fg, bg) => {
        const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
    };

    const parse = (c) => {
        const p = (c.match(/[\d.]+/g) || []).map(Number);
        return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p.length > 3 ? p[3] : 1 };
    };

    /** Composite `top` over `bottom`, both rgb/rgba strings. */
    const over = (top, bottom) => {
        const t = parse(top), b = parse(bottom);
        const a = t.a + b.a * (1 - t.a);
        if (a === 0) return 'rgb(255,255,255)';
        const ch = (x, y) => Math.round((x * t.a + y * b.a * (1 - t.a)) / a);
        return `rgb(${ch(t.r, b.r)}, ${ch(t.g, b.g)}, ${ch(t.b, b.b)})`;
    };

    const gradientStops = (image) => image.match(/rgba?\([^)]+\)/g) || [];

    /**
     * What is actually painted behind `el`: walk up compositing every
     * translucent layer, and stop at the first gradient (reported separately, so
     * it can be scored against each of its stops).
     *
     * Starts at `el` itself, not its parent. A button holds both its label and
     * its own background, so starting at the parent scores the label against
     * whatever is behind the button — which reported the primary button as
     * white-on-white at 1.0:1 rather than white on saffron at 2.8:1.
     */
    const surfaceBehind = (el) => {
        let node = el;
        let acc = null;
        while (node) {
            const cs = getComputedStyle(node);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') {
                const stops = gradientStops(cs.backgroundImage);
                if (stops.length) return { kind: 'gradient', stops, acc };
            }
            const bg = cs.backgroundColor;
            if (bg && parse(bg).a > 0) {
                acc = acc ? over(acc, bg) : bg;
                if (parse(acc).a >= 1 || parse(bg).a >= 1) return { kind: 'color', color: acc };
            }
            node = node.parentElement;
        }
        return { kind: 'color', color: acc || getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)' };
    };

    const label = (el) => {
        const tag = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 6).join(' ') : '';
        return cls ? `${tag}.${cls}` : tag;
    };

    window.auditContrast = function auditContrast({ verbose = false } = {}) {
        const failures = [];
        const unscored = [];

        document.querySelectorAll('body *').forEach((el) => {
            if (el.children.length) return;                       // leaf text only
            const text = (el.textContent || '').trim();
            if (!text) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') return;
            if (!el.getClientRects().length) return;              // not laid out
            if (parseFloat(cs.opacity) < 0.15) return;            // deliberately ghosted

            const size = parseFloat(cs.fontSize);
            const weight = parseInt(cs.fontWeight, 10) || 400;
            const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
            const required = isLarge ? 3.0 : 4.5;

            const surface = surfaceBehind(el);
            let worst, against;
            if (surface.kind === 'gradient') {
                const scored = surface.stops.map((s) => ({ s, r: ratio(cs.color, s) }));
                const min = scored.reduce((a, b) => (a.r < b.r ? a : b));
                worst = min.r;
                against = `gradient stop ${min.s}`;
            } else {
                worst = ratio(cs.color, surface.color);
                against = surface.color;
            }

            if (!isFinite(worst)) { unscored.push({ el: label(el), text: text.slice(0, 40) }); return; }
            if (worst >= required) return;

            failures.push({
                text: text.slice(0, 44),
                element: label(el),
                color: cs.color,
                against,
                ratio: Number(worst.toFixed(2)),
                required,
                size: `${size}px/${weight}`
            });
        });

        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        console.log(`%cContrast audit — ${location.pathname} — ${theme} mode — ${window.innerWidth}px`,
            'font-weight:bold');
        if (!failures.length) {
            console.log('%cNo failures.', 'color:#16a34a;font-weight:bold');
        } else {
            failures.sort((a, b) => a.ratio - b.ratio);
            console.table(failures);
            console.log(`${failures.length} below AA. Check the same page in the other theme too — ` +
                'most of these only appear in one.');
        }
        if (verbose && unscored.length) console.table(unscored);
        return failures;
    };

    console.log('%cauditContrast() ready.', 'color:#f97316;font-weight:bold',
        '\nRun it in both themes, and at a desktop width — panels hidden below lg: are skipped when not laid out.');
})();
