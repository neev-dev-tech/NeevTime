import React from 'react';

/**
 * SaaS-style 3D ambient background.
 *
 * Real CSS 3D: a perspective scene containing wireframe cubes and rings built
 * from transformed faces, each parked at its own Z depth so they parallax
 * against one another as they rotate. Aurora mesh + receding grid sit behind.
 *
 * All motion is GPU-composited transforms — no canvas, no rAF, nothing per
 * React render. Fully disabled under prefers-reduced-motion.
 */

const Cube = ({ className }) => (
    <div className={`bg3d-cube ${className}`}>
        <span className="bg3d-face bg3d-face--front" />
        <span className="bg3d-face bg3d-face--back" />
        <span className="bg3d-face bg3d-face--right" />
        <span className="bg3d-face bg3d-face--left" />
        <span className="bg3d-face bg3d-face--top" />
        <span className="bg3d-face bg3d-face--bottom" />
    </div>
);

export default function AnimatedBackground() {
    return (
        <div className="app-bg" aria-hidden="true">
            {/* aurora mesh */}
            <div className="app-bg__orb app-bg__orb--1" />
            <div className="app-bg__orb app-bg__orb--2" />
            <div className="app-bg__orb app-bg__orb--3" />
            <div className="app-bg__orb app-bg__orb--4" />

            {/* 3D scene */}
            <div className="bg3d-scene">
                <Cube className="bg3d-cube--a" />
                <Cube className="bg3d-cube--b" />
                <Cube className="bg3d-cube--c" />

                <div className="bg3d-ring bg3d-ring--a"><i /><i /><i /></div>
                <div className="bg3d-ring bg3d-ring--b"><i /><i /><i /></div>

                <div className="bg3d-plane bg3d-plane--a" />
                <div className="bg3d-plane bg3d-plane--b" />
            </div>

            {/* receding grid floor */}
            <div className="app-bg__grid" />

            <div className="app-bg__veil" />
        </div>
    );
}
