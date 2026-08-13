import React from 'react';

/**
 * Ambient background.
 *
 * This was a CSS-3D scene of wireframe cubes, rings and planes on separate Z
 * planes. It was replaced because it did the opposite of what an ambient
 * background is for: hard-edged geometry at full contrast drifted across
 * headings and figures, so it read as something rendering on top of the page
 * rather than depth behind it. Its colours were hardcoded orange and emerald
 * too, so a deployment that rebranded still had orange wireframes moving
 * through it.
 *
 * What is here now is soft-edged and takes its colour from the theme
 * variables, so it recolours with the rest of the app. All the work is in CSS
 * — three heavily blurred washes drifting on long, deliberately mismatched
 * cycles so they never resynchronise into a visible loop. Transform and
 * opacity only, so it composites on the GPU: no canvas, no requestAnimationFrame,
 * nothing running per React render, and no layout or paint while it moves.
 *
 * (Worth recording why this is not a rendered video: Remotion, the obvious tool
 * for motion graphics, renders to MP4. A looping video behind the UI would cost
 * a download and continuous decode on every page of what is a LAN attendance
 * app, and could not follow the company's chosen palette. CSS is both lighter
 * and the only option that stays theme-aware.)
 */
export default function AnimatedBackground() {
    return (
        <div className="app-bg" aria-hidden="true">
            <div className="bg-field">
                <div className="bg-field__wash bg-field__wash--1" />
                <div className="bg-field__wash bg-field__wash--2" />
                <div className="bg-field__wash bg-field__wash--3" />
            </div>

            {/* A very faint grid, for the sense of a surface under the cards. */}
            <div className="app-bg__grid" />

            <div className="app-bg__veil" />
        </div>
    );
}
