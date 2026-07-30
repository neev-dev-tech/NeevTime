import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from './ui/Button';

let resolveCallback = null;
let rejectCallback = null;

export const confirm = (options) => {
    return new Promise((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
        
        // Trigger dialog render
        const event = new CustomEvent('showConfirmDialog', { detail: options });
        window.dispatchEvent(event);
    });
};

export default function ConfirmDialog() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [options, setOptions] = React.useState({
        title: 'Confirm Action',
        message: 'Are you sure you want to proceed?',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        type: 'warning', // 'warning', 'danger', 'info'
        confirmButtonColor: 'bg-blue-600 hover:bg-blue-700'
    });

    React.useEffect(() => {
        const handleShow = (event) => {
            // Functional update — the effect runs once, so spreading a captured
            // `options` would reuse stale values from the first render
            setOptions(prev => ({ ...prev, confirmButtonColor: undefined, ...event.detail }));
            setIsOpen(true);
        };

        window.addEventListener('showConfirmDialog', handleShow);
        return () => window.removeEventListener('showConfirmDialog', handleShow);
    }, []);

    const handleConfirm = () => {
        setIsOpen(false);
        if (resolveCallback) {
            resolveCallback(true);
            resolveCallback = null;
            rejectCallback = null;
        }
    };

    const handleCancel = () => {
        setIsOpen(false);
        // Cancel resolves false — rejecting would throw inside callers' try
        // blocks and surface as a bogus error toast
        if (resolveCallback) {
            resolveCallback(false);
            resolveCallback = null;
            rejectCallback = null;
        }
    };

    if (!isOpen) return null;

    const colorSchemes = {
        warning: {
            icon: 'text-yellow-600 dark:text-yellow-300',
            bg: 'bg-yellow-50 dark:bg-yellow-900/30',
            border: 'border-yellow-200 dark:border-yellow-800'
        },
        danger: {
            icon: 'text-red-600 dark:text-red-300',
            bg: 'bg-red-50 dark:bg-red-900/30',
            border: 'border-red-200 dark:border-red-800'
        },
        info: {
            icon: 'text-blue-600 dark:text-blue-300',
            bg: 'bg-blue-50 dark:bg-blue-900/30',
            border: 'border-blue-200 dark:border-blue-800'
        }
    };

    const scheme = colorSchemes[options.type] || colorSchemes.warning;

    // Confirm button follows the dialog type unless explicitly overridden
    const confirmColorByType = {
        danger: 'bg-rose-600 hover:bg-rose-700',
        warning: 'bg-orange-600 hover:bg-orange-700',
        info: 'bg-blue-600 hover:bg-blue-700'
    };
    const confirmColor = options.confirmButtonColor || confirmColorByType[options.type] || confirmColorByType.warning;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-[9998] transition-opacity"
                onClick={handleCancel}
            />
            
            {/* Dialog */}
            <div 
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-description"
            >
                <div
                    className={`bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 pointer-events-auto transform transition-all ${
                        isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start gap-4">
                        <div className={`${scheme.bg} ${scheme.border} border-2 rounded-full p-2 flex-shrink-0`}>
                            <AlertTriangle className={scheme.icon} size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                                {options.title}
                            </h3>
                            <p id="confirm-dialog-description" className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                {options.message}
                            </p>
                            <div className="flex gap-3 justify-end">
                                <Button variant="secondary" onClick={handleCancel}>
                                    {options.cancelText}
                                </Button>
                                <button
                                    onClick={handleConfirm}
                                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${confirmColor}`}
                                >
                                    {options.confirmText}
                                </button>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={X}
                            onClick={handleCancel}
                            className="flex-shrink-0"
                            aria-label="Close dialog"
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

