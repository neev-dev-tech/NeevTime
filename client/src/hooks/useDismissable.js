import { useEffect, useRef } from 'react';

/**
 * Close a popover on an outside click or Escape.
 *
 * Every dropdown in the header opened and then stayed open: the profile menu,
 * the notification panel, the theme panel and the search results could only be
 * dismissed by clicking their own trigger again. Clicking elsewhere — including
 * on another dropdown — left them stacked on screen.
 *
 * Two details matter and are easy to get wrong by hand, which is why this is
 * shared rather than repeated:
 *
 * `mousedown`, not `click`. A menu item that navigates or unmounts on mousedown
 * would otherwise disappear before the click completes, and the handler would
 * then test a target that is no longer in the document — so the menu never
 * closes, or closes without running the action.
 *
 * The trigger is excluded. Without that, clicking the button while open runs
 * both this handler and the button's own toggle: closed by one, reopened by the
 * other, and the menu appears stuck.
 *
 * @param {boolean} active     only listen while the popover is open
 * @param {Function} onDismiss called for an outside click or Escape
 * @param {...React.RefObject} refs  the panel, plus the trigger to ignore
 */
export default function useDismissable(active, onDismiss, ...refs) {
    // Held in a ref so callers can pass an inline arrow without this effect
    // detaching and re-attaching the listeners on every single render — the
    // notification bell polls, so that would be several times a minute.
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;

    useEffect(() => {
        if (!active) return undefined;

        const isInside = (target) =>
            refs.some(ref => ref?.current && ref.current.contains(target));

        const onPointerDown = (e) => {
            if (!isInside(e.target)) dismissRef.current();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') dismissRef.current();
        };

        // Capture phase: a panel that stops propagation on its own container
        // would otherwise never let this run, and the popover would stay open.
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, ...refs]);
}
