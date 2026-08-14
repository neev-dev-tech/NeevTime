import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

/**
 * One dialog, replacing 26 hand-rolled ones.
 *
 * The 26 differed in more than appearance. Across all of them: none trapped
 * focus, so Tab walked straight out of the dialog into the page behind it; none
 * locked scrolling, so the page moved under the dialog; and exactly one closed
 * on Escape. Four different backdrop treatments were in use.
 *
 * Rendered through a portal onto document.body. A dialog nested inside the page
 * is trapped in whatever stacking context its ancestors create — the Timetable
 * dialog showed content through its own backdrop for that reason, and no z-index
 * fixes it from inside.
 */

const SIZES = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
};

/** Everything focusable inside `root`, in tab order. */
const focusables = (root) => [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)].filter(el => el.offsetParent !== null);

export default function Modal({
    open,
    onClose,
    title,
    description,
    size = 'md',
    closeOnBackdrop = true,
    hideClose = false,
    footer,
    children
}) {
    const panelRef = useRef(null);
    const returnTo = useRef(null);
    const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 9)}`).current;

    const close = useCallback(() => { if (onClose) onClose(); }, [onClose]);

    // Escape, and a focus trap.
    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
            if (e.key !== 'Tab' || !panelRef.current) return;

            // Without this, Tab leaves the dialog and walks the page behind it —
            // which for a keyboard or screen-reader user means the dialog is
            // modal in appearance only.
            const items = focusables(panelRef.current);
            if (!items.length) { e.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;

            if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault(); first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [open, close]);

    // Scroll lock, and returning focus where it came from.
    useEffect(() => {
        if (!open) return undefined;

        returnTo.current = document.activeElement;

        // The padding compensates for the scrollbar the lock removes. Without
        // it the whole page shifts sideways as the dialog opens, which reads as
        // the layout breaking.
        const { overflow, paddingRight } = document.body.style;
        const gap = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        if (gap > 0) document.body.style.paddingRight = `${gap}px`;

        // After paint, so the panel exists to focus into.
        const t = setTimeout(() => {
            const items = panelRef.current ? focusables(panelRef.current) : [];
            // Skip the close button. It is first in the DOM, so focusing the
            // literal first focusable puts the cursor on "dismiss" — opening a
            // form and landing on the way out of it. The first real control is
            // what someone opened the dialog to use.
            const target = items.find(el => el.dataset.modalClose === undefined) || items[0];
            (target || panelRef.current)?.focus();
        }, 0);

        return () => {
            clearTimeout(t);
            document.body.style.overflow = overflow;
            document.body.style.paddingRight = paddingRight;
            // Returning focus matters most for the keyboard user who opened
            // this from a row in a table: without it they land back at the top
            // of the document.
            if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
        >
            {/* The backdrop is its own element rather than a background on the
                container, so a click on the panel cannot bubble to it and close
                the dialog the user is filling in. */}
            <div
                className="absolute inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-[2px] animate-fade-in"
                onClick={closeOnBackdrop ? close : undefined}
                aria-hidden="true"
            />

            <div
                ref={panelRef}
                tabIndex={-1}
                className={`relative w-full ${SIZES[size] || SIZES.md} max-h-[85vh] flex flex-col
                            bg-white dark:bg-slate-800 rounded-xl shadow-2xl
                            ring-1 ring-slate-900/[0.08] dark:ring-white/[0.08]
                            animate-slide-up focus:outline-none`}
            >
                {(title || !hideClose) && (
                    <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="min-w-0">
                            {title && (
                                <h2 id={titleId} className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                    {title}
                                </h2>
                            )}
                            {description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                            )}
                        </div>
                        {!hideClose && (
                            <button
                                type="button"
                                onClick={close}
                                data-modal-close=""
                                aria-label="Close"
                                className="shrink-0 p-1.5 -m-1 rounded-lg text-slate-400
                                           hover:text-slate-600 dark:hover:text-slate-200
                                           hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                )}

                {/* The body scrolls, not the dialog, so the header and footer
                    stay put on a long form. */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {children}
                </div>

                {footer && (
                    <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-slate-700">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

Modal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.node,
    description: PropTypes.node,
    size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
    closeOnBackdrop: PropTypes.bool,
    hideClose: PropTypes.bool,
    footer: PropTypes.node,
    children: PropTypes.node
};
