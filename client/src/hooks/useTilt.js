import { useRef, useCallback } from 'react';

/**
 * Pointer-tracked 3D tilt. The card leans toward the cursor — depth you can
 * feel without WebGL, a dependency, or a byte of texture.
 *
 * Three refusals built in, because restraint is the difference between depth
 * and gimmick on a payroll tool:
 *   - touch devices get nothing (no cursor, and the portal runs on shop-floor
 *     phones where a wobbling card is jank, not delight)
 *   - prefers-reduced-motion gets nothing
 *   - the angle is capped low; a KPI card is not a game menu
 *
 * Usage: const tilt = useTilt(); <div {...tilt} className="tilt-3d">…
 */
export default function useTilt(maxDeg = 4) {
    const frame = useRef(null);

    const reset = useCallback((e) => {
        const el = e.currentTarget;
        cancelAnimationFrame(frame.current);
        el.style.transform = '';
    }, []);

    const move = useCallback((e) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (window.matchMedia('(hover: none)').matches) return;
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            el.style.transform =
                `perspective(900px) rotateX(${(-py * maxDeg).toFixed(2)}deg)` +
                ` rotateY(${(px * maxDeg).toFixed(2)}deg) translateY(-2px)`;
        });
    }, [maxDeg]);

    return { onMouseMove: move, onMouseLeave: reset };
}
