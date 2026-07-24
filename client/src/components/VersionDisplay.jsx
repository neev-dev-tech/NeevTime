import React from 'react';
import { Info } from 'lucide-react';
import { APP_VERSION, BUILD_DATE } from '../constants/version';

/**
 * Version Display Component
 * Shows app version and build date
 * Can be added to Settings page or footer
 */
export default function VersionDisplay({ className = '' }) {
    const buildDate = new Date(BUILD_DATE).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    return (
        <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
            <Info size={14} aria-hidden="true" />
            <span>Version {APP_VERSION}</span>
            {BUILD_DATE && (
                <>
                    <span>•</span>
                    <span>Built {buildDate}</span>
                </>
            )}
        </div>
    );
}

/**
 * Version Info Modal
 * Shows detailed version information
 */
export function VersionInfoModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
                onClick={onClose}
            />
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">
                        Version Information
                    </h2>
                    <div className="space-y-3 text-sm">
                        <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Version:</span>
                            <span className="ml-2 text-slate-600 dark:text-slate-400">{APP_VERSION}</span>
                        </div>
                        {BUILD_DATE && (
                            <div>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Build Date:</span>
                                <span className="ml-2 text-slate-600 dark:text-slate-400">
                                    {new Date(BUILD_DATE).toLocaleString()}
                                </span>
                            </div>
                        )}
                        <div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">Environment:</span>
                            <span className="ml-2 text-slate-600 dark:text-slate-400">
                                {import.meta.env.MODE || 'production'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="mt-6 w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </>
    );
}

