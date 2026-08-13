import { useEffect, useRef } from 'react';

/**
 * Fade and lift an element once, the first time it scrolls into view.
 *
 * The important property here is that it fails *visible*. The hiding is applied
 * by this hook at runtime — the element ships with no attribute and is fully
 * opaque — so if the observer never runs, the script fails, or the browser is
 * old, the content is simply there. An earlier attempt at page motion hid
 * things in CSS and relied on JavaScript to reveal them, and when the reveal
 * did not fire the page sat permanently dimmed. Hidden-by-default is the wrong
 * default for anything carrying information.
 *
 * `useLayoutEffect` is deliberately not used: the attribute is set in an effect
 * after first paint, so an element already on screen at load is marked and
 * released in the same tick and never visibly flickers.
 *
 * Reveals once and then disconnects. Re-animating on every scroll past is
 * motion for its own sake, and on a dashboard people scroll up and down while
 * reading a single figure.
 */
export default function useReveal() {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;

        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (reduced || typeof IntersectionObserver === 'undefined') return undefined;

        el.dataset.reveal = 'pending';

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.dataset.reveal = 'shown';
                    observer.unobserve(entry.target);
                });
            },
            // A small negative bottom margin so a card animates as it comes up
            // to the edge rather than only once fully inside the viewport.
            { rootMargin: '0px 0px -40px 0px', threshold: 0.01 }
        );
        observer.observe(el);

        // Backstop: if for any reason the callback has not run — an observer
        // that never fires in a background tab, an element in a scroll
        // container it cannot see — show the content anyway rather than leave
        // it hidden.
        const failsafe = setTimeout(() => {
            if (el.dataset.reveal === 'pending') el.dataset.reveal = 'shown';
        }, 1200);

        return () => {
            clearTimeout(failsafe);
            observer.disconnect();
        };
    }, []);

    return ref;
}
