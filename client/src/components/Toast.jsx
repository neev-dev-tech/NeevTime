/**
 * Toast Notification System
 * 
 * A modern toast notification system with:
 * - Multiple positions
 * - Auto-dismiss with progress
 * - Stacking animations
 * - Action buttons
 * - Custom icons
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

// Toast Context
const ToastContext = createContext(null);

// Toast types configuration
const TOAST_TYPES = {
    success: {
        icon: CheckCircle,
        className: 'bg-gradient-to-r from-green-500 to-emerald-500',
        progressColor: 'bg-green-300'
    },
    error: {
        icon: AlertCircle,
        className: 'bg-gradient-to-r from-red-500 to-rose-500',
        progressColor: 'bg-red-300'
    },
    warning: {
        icon: AlertTriangle,
        className: 'bg-gradient-to-r from-amber-500 to-orange-500',
        progressColor: 'bg-amber-300'
    },
    info: {
        icon: Info,
        className: 'bg-gradient-to-r from-blue-500 to-indigo-500',
        progressColor: 'bg-blue-300'
    },
    loading: {
        icon: Loader2,
        className: 'bg-gradient-to-r from-slate-600 to-slate-700',
        progressColor: 'bg-slate-400'
    }
};

// Toast positions
const POSITIONS = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2'
};

/**
 * Individual Toast Component
 */
function Toast({
    id,
    type = 'info',
    title,
    message,
    duration = 5000,
    onClose,
    action,
    actionLabel,
    dismissible = true,
    showProgress = true
}) {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);
    const config = TOAST_TYPES[type] || TOAST_TYPES.info;
    const Icon = config.icon;

    // Auto-dismiss timer
    useEffect(() => {
        if (duration && type !== 'loading') {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
                setProgress(remaining);

                if (remaining <= 0) {
                    handleClose();
                }
            }, 50);

            return () => clearInterval(interval);
        }
    }, [duration, type]);

    const handleClose = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 300);
    }, [id, onClose]);

    return (
        <div
            className={`
                relative overflow-hidden
                min-w-[320px] max-w-md
                rounded-xl shadow-2xl
                transform transition-ui duration-300 ease-out
                ${isExiting ? 'opacity-0 translate-x-4 scale-95' : 'opacity-100 translate-x-0 scale-100'}
                ${config.className}
            `}
            role="alert"
        >
            <div className="flex items-start gap-3 p-4 text-white">
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                    <Icon
                        size={22}
                        className={type === 'loading' ? 'animate-spin' : ''}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {title && (
                        <p className="font-semibold text-sm">{title}</p>
                    )}
                    {message && (
                        <p className={`text-sm opacity-90 ${title ? 'mt-0.5' : ''}`}>
                            {message}
                        </p>
                    )}
                    {action && actionLabel && (
                        <button
                            onClick={() => {
                                action();
                                handleClose();
                            }}
                            className="mt-2 text-sm font-medium underline underline-offset-2 
                                hover:no-underline transition-ui"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>

                {/* Close button */}
                {dismissible && type !== 'loading' && (
                    <button
                        onClick={handleClose}
                        className="flex-shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Progress bar */}
            {showProgress && duration && type !== 'loading' && (
                <div className="h-1 bg-black/10">
                    <div
                        className={`h-full ${config.progressColor} transition-ui duration-50 ease-linear`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * Toast Container
 */
function ToastContainer({ toasts, position, onClose }) {
    const positionClass = POSITIONS[position] || POSITIONS['top-right'];
    const isBottom = position.startsWith('bottom');

    return (
        <div
            className={`fixed ${positionClass} z-[9999] flex flex-col gap-3 pointer-events-none`}
            style={{
                flexDirection: isBottom ? 'column-reverse' : 'column'
            }}
        >
            {toasts.map((toast, index) => (
                <div
                    key={toast.id}
                    className="pointer-events-auto"
                    style={{
                        animationDelay: `${index * 50}ms`
                    }}
                >
                    <Toast {...toast} onClose={onClose} />
                </div>
            ))}
        </div>
    );
}

/**
 * Toast Provider
 */
export function ToastProvider({
    children,
    position = 'top-right',
    maxToasts = 5
}) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((options) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toast = {
            id,
            duration: 5000,
            dismissible: true,
            showProgress: true,
            ...options
        };

        setToasts(prev => {
            const newToasts = [toast, ...prev];
            // Limit max toasts
            return newToasts.slice(0, maxToasts);
        });

        return id;
    }, [maxToasts]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const updateToast = useCallback((id, options) => {
        setToasts(prev => prev.map(t =>
            t.id === id ? { ...t, ...options } : t
        ));
    }, []);

    const clearToasts = useCallback(() => {
        setToasts([]);
    }, []);

    // Shorthand methods
    const toast = useCallback((message, options = {}) => {
        return addToast({ message, type: 'info', ...options });
    }, [addToast]);

    toast.success = (message, options = {}) =>
        addToast({ message, type: 'success', title: 'Success', ...options });

    toast.error = (message, options = {}) =>
        addToast({ message, type: 'error', title: 'Error', ...options });

    toast.warning = (message, options = {}) =>
        addToast({ message, type: 'warning', title: 'Warning', ...options });

    toast.info = (message, options = {}) =>
        addToast({ message, type: 'info', title: 'Info', ...options });

    toast.loading = (message, options = {}) =>
        addToast({ message, type: 'loading', title: 'Loading...', duration: 0, dismissible: false, ...options });

    toast.promise = async (promise, { loading, success, error }) => {
        const id = toast.loading(loading);
        try {
            const result = await promise;
            updateToast(id, {
                type: 'success',
                title: 'Success',
                message: typeof success === 'function' ? success(result) : success,
                duration: 5000,
                dismissible: true
            });
            return result;
        } catch (err) {
            updateToast(id, {
                type: 'error',
                title: 'Error',
                message: typeof error === 'function' ? error(err) : error,
                duration: 5000,
                dismissible: true
            });
            throw err;
        }
    };

    const contextValue = {
        toast,
        addToast,
        removeToast,
        updateToast,
        clearToasts,
        toasts
    };

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <ToastContainer
                toasts={toasts}
                position={position}
                onClose={removeToast}
            />
        </ToastContext.Provider>
    );
}

/**
 * useToast Hook
 */
export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    // Return the toast function (with .success/.error/.warning/.info/.loading/.promise
    // attached) so `const toast = useToast(); toast.error(...)` works as used across the app.
    return context.toast;
}

export default ToastProvider;
