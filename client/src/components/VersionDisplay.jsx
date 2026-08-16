import React from 'react';
import { Info } from 'lucide-react';
import { APP_VERSION, BUILD_DATE } from '../constants/version';
import { formatDate } from '../utils/dateFormat';

/**
 * Version Display Component
 * Shows app version and build date
 * Can be added to Settings page or footer
 */
export default function VersionDisplay({ className = '' }) {
    const buildDate = formatDate(BUILD_DATE);

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
