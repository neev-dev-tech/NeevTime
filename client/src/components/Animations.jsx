/**
 * Animation Components
 * 
 * Micro-animations for enhanced UX:
 * - Button ripple effect
 * - Page transitions
 * - Fade animations
 * - Slide animations
 * - Scale animations
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * Ripple Effect for Buttons
 * Wrap any clickable element to add material-design style ripple
 */
export function Ripple({
    children,
    color = 'rgba(255, 255, 255, 0.4)',
    duration = 600,
    className = '',
    disabled = false
}) {
    const [ripples, setRipples] = useState([]);
    const containerRef = useRef(null);

    const addRipple = (event) => {
        if (disabled) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        const newRipple = {
            id: Date.now(),
            x,
            y,
            size
        };

        setRipples(prev => [...prev, newRipple]);

        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== newRipple.id));
        }, duration);
    };

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden ${className}`}
            onMouseDown={addRipple}
        >
            {children}
            {ripples.map(ripple => (
                <span
                    key={ripple.id}
                    className="absolute rounded-full pointer-events-none animate-ripple"
                    style={{
                        left: ripple.x,
                        top: ripple.y,
                        width: ripple.size,
                        height: ripple.size,
                        backgroundColor: color,
                        transform: 'scale(0)',
                        animation: `ripple ${duration}ms ease-out forwards`
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Ripple Button - Button with built-in ripple effect
 */
export function RippleButton({
    children,
    onClick,
    className = '',
    variant = 'primary', // 'primary', 'secondary', 'outline', 'ghost'
    size = 'md', // 'sm', 'md', 'lg'
    disabled = false,
    loading = false,
    icon,
    iconPosition = 'left',
    fullWidth = false,
    ...props
}) {
    const variantClasses = {
        primary: 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-md hover:shadow-lg',
        secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
        outline: 'border-2 border-orange-500 text-orange-600 hover:bg-orange-50',
        ghost: 'text-slate-600 hover:bg-slate-100',
        danger: 'bg-gradient-to-r from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 shadow-md'
    };

    const sizeClasses = {
        sm: 'px-3 py-1.5 text-sm gap-1.5',
        md: 'px-5 py-2.5 text-sm gap-2',
        lg: 'px-6 py-3 text-base gap-2'
    };

    const rippleColor = variant === 'primary' || variant === 'danger'
        ? 'rgba(255, 255, 255, 0.3)'
        : 'rgba(0, 0, 0, 0.1)';

    return (
        <Ripple color={rippleColor} disabled={disabled || loading}>
            <button
                onClick={onClick}
                disabled={disabled || loading}
                className={`
                    inline-flex items-center justify-center
                    font-medium rounded-xl
                    transform transition-ui duration-200
                    focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                    active:scale-[0.98]
                    ${variantClasses[variant]}
                    ${sizeClasses[size]}
                    ${fullWidth ? 'w-full' : ''}
                    ${className}
                `}
                {...props}
            >
                {loading && (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {!loading && icon && iconPosition === 'left' && icon}
                {children}
                {!loading && icon && iconPosition === 'right' && icon}
            </button>
        </Ripple>
    );
}

/**
 * Page Transition Wrapper
 * Wraps page content for smooth transitions
 */
export function PageTransition({
    children,
    type = 'fade', // 'fade', 'slide-up', 'slide-left', 'scale', 'slide-right'
    duration = 300,
    delay = 0,
    className = ''
}) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);

    const animations = {
        fade: {
            initial: 'opacity-0',
            animate: 'opacity-100'
        },
        'slide-up': {
            initial: 'opacity-0 translate-y-8',
            animate: 'opacity-100 translate-y-0'
        },
        'slide-left': {
            initial: 'opacity-0 translate-x-8',
            animate: 'opacity-100 translate-x-0'
        },
        'slide-right': {
            initial: 'opacity-0 -translate-x-8',
            animate: 'opacity-100 translate-x-0'
        },
        scale: {
            initial: 'opacity-0 scale-95',
            animate: 'opacity-100 scale-100'
        }
    };

    const anim = animations[type] || animations.fade;

    return (
        <div
            className={`
                transform transition-ui ease-out
                ${isVisible ? anim.animate : anim.initial}
                ${className}
            `}
            style={{ transitionDuration: `${duration}ms` }}
        >
            {children}
        </div>
    );
}

/**
 * Stagger Children - Animates children with staggered delay
 */
export function StaggerChildren({
    children,
    staggerDelay = 50,
    initialDelay = 0,
    animation = 'fade-up', // 'fade-up', 'fade', 'slide-left', 'scale'
    className = ''
}) {
    const animations = {
        'fade-up': 'animate-fade-in-up',
        'fade': 'animate-fade-in',
        'slide-left': 'animate-slide-left',
        'scale': 'animate-scale-in'
    };

    return (
        <div className={className}>
            {React.Children.map(children, (child, index) => {
                if (!React.isValidElement(child)) return child;

                return (
                    <div
                        className={animations[animation]}
                        style={{
                            animationDelay: `${initialDelay + (index * staggerDelay)}ms`,
                            animationFillMode: 'backwards'
                        }}
                    >
                        {child}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Hover Scale - Adds scale effect on hover
 */
export function HoverScale({
    children,
    scale = 1.02,
    className = ''
}) {
    return (
        <div
            className={`transform transition-transform duration-200 hover:scale-[${scale}] ${className}`}
            style={{ '--hover-scale': scale }}
        >
            {children}
        </div>
    );
}

/**
 * Animate On Scroll - Triggers animation when element enters viewport
 */
export function AnimateOnScroll({
    children,
    animation = 'fade-up', // 'fade-up', 'fade', 'slide-left', 'slide-right', 'scale'
    threshold = 0.1,
    className = ''
}) {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, [threshold]);

    const animations = {
        'fade-up': {
            initial: 'opacity-0 translate-y-8',
            animate: 'opacity-100 translate-y-0'
        },
        'fade': {
            initial: 'opacity-0',
            animate: 'opacity-100'
        },
        'slide-left': {
            initial: 'opacity-0 translate-x-8',
            animate: 'opacity-100 translate-x-0'
        },
        'slide-right': {
            initial: 'opacity-0 -translate-x-8',
            animate: 'opacity-100 translate-x-0'
        },
        'scale': {
            initial: 'opacity-0 scale-90',
            animate: 'opacity-100 scale-100'
        }
    };

    const anim = animations[animation] || animations['fade-up'];

    return (
        <div
            ref={ref}
            className={`
                transform transition-ui duration-700 ease-out
                ${isVisible ? anim.animate : anim.initial}
                ${className}
            `}
        >
            {children}
        </div>
    );
}

/**
 * Pulse Animation - For attention-grabbing elements
 */
export function Pulse({ children, className = '' }) {
    return (
        <div className={`animate-pulse-attention ${className}`}>
            {children}
        </div>
    );
}

/**
 * Bounce Animation - For playful interactions
 */
export function Bounce({ children, className = '' }) {
    return (
        <div className={`animate-bounce-gentle ${className}`}>
            {children}
        </div>
    );
}

/**
 * Skeleton Loader with shimmer
 */
export function Skeleton({
    width = '100%',
    height = '1rem',
    rounded = 'md',
    className = ''
}) {
    const roundedClasses = {
        none: '',
        sm: 'rounded-sm',
        md: 'rounded-md',
        lg: 'rounded-lg',
        xl: 'rounded-xl',
        full: 'rounded-full'
    };

    return (
        <div
            className={`bg-slate-200 animate-shimmer ${roundedClasses[rounded]} ${className}`}
            style={{ width, height }}
        />
    );
}

export default {
    Ripple,
    RippleButton,
    PageTransition,
    StaggerChildren,
    HoverScale,
    AnimateOnScroll,
    Pulse,
    Bounce,
    Skeleton
};
