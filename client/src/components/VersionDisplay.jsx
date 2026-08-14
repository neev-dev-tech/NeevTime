import React from 'react';
import { Info } from 'lucide-react';
import { APP_VERSION, BUILD_DATE } from '../constants/version';
import Button from './ui/Button';
import Modal from './Modal';

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
    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Version Information"
            footer={<Button variant="primary" onClick={onClose}>Close</Button>}
        >
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
        </Modal>
    );
}
