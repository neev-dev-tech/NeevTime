import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, Users, TabletSmartphone, FileBarChart, Settings2, ArrowRight, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import keyboardShortcuts from '../utils/keyboardShortcuts';
import api from '../api';

// Static navigable pages included in search results
const PAGE_INDEX = [
    { id: 'page-dashboard', type: 'settings', title: 'Dashboard', subtitle: 'Overview & live monitor', path: '/' },
    { id: 'page-employees', type: 'employees', title: 'Employees', subtitle: 'Personnel management', path: '/employees' },
    { id: 'page-devices', type: 'devices', title: 'Devices', subtitle: 'Biometric device management', path: '/devices' },
    { id: 'page-reports', type: 'reports', title: 'Reports', subtitle: 'All attendance reports', path: '/reports' },
    { id: 'page-daily-att', type: 'reports', title: 'Daily Attendance Report', subtitle: 'Reports', path: '/reports/daily-attendance' },
    { id: 'page-late', type: 'reports', title: 'Late Coming Report', subtitle: 'Reports', path: '/reports/late-coming' },
    { id: 'page-absent', type: 'reports', title: 'Absent Report', subtitle: 'Reports', path: '/reports/absent' },
    { id: 'page-overtime', type: 'reports', title: 'Overtime Report', subtitle: 'Reports', path: '/reports/overtime' },
    { id: 'page-monthly', type: 'reports', title: 'Monthly Summary', subtitle: 'Reports', path: '/reports/att-summary' },
    { id: 'page-first-last', type: 'reports', title: 'First & Last Report', subtitle: 'Reports', path: '/reports/first-last' },
    { id: 'page-device-health', type: 'reports', title: 'Device Health Report', subtitle: 'Reports', path: '/reports/device-health' },
    { id: 'page-register', type: 'reports', title: 'Attendance Register', subtitle: 'Day-wise register', path: '/attendance-register' },
    { id: 'page-leave', type: 'settings', title: 'Leave Applications', subtitle: 'Leave management', path: '/leaves' },
    { id: 'page-settings', type: 'settings', title: 'Settings', subtitle: 'System settings', path: '/settings' },
];

const searchCategories = {
    employees: {
        icon: Users,
        label: 'Employees',
        color: 'text-blue-600 dark:text-blue-300',
        bgColor: 'bg-blue-50 dark:bg-blue-900/30'
    },
    devices: {
        icon: TabletSmartphone,
        label: 'Devices',
        color: 'text-green-600 dark:text-green-300',
        bgColor: 'bg-green-50 dark:bg-green-900/30'
    },
    reports: {
        icon: FileBarChart,
        label: 'Reports',
        color: 'text-purple-600 dark:text-purple-300',
        bgColor: 'bg-purple-50 dark:bg-purple-900/30'
    },
    settings: {
        icon: Settings2,
        label: 'Settings',
        color: 'text-slate-600 dark:text-slate-400',
        bgColor: 'bg-slate-50 dark:bg-slate-900/50'
    }
};

export default function GlobalSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [recentSearches, setRecentSearches] = useState([]);
    const inputRef = useRef(null);
    const navigate = useNavigate();
    const indexRef = useRef(null); // cached searchable records for this open session

    // Load employees + devices once per open, merge with static page index
    const loadIndex = async () => {
        if (indexRef.current) return indexRef.current;
        try {
            const [empRes, devRes] = await Promise.all([
                api.get('/api/employees'),
                api.get('/api/devices')
            ]);
            const employees = (empRes.data || []).map(emp => ({
                id: `emp-${emp.id}`,
                type: 'employees',
                title: emp.name,
                subtitle: `${emp.employee_code}${emp.department_name ? ' · ' + emp.department_name : ''}`,
                path: `/employees/${emp.id}`
            }));
            const devices = (devRes.data || []).map(dev => ({
                id: `dev-${dev.serial_number}`,
                type: 'devices',
                title: dev.device_name || dev.serial_number,
                subtitle: `${dev.serial_number}${dev.status ? ' · ' + dev.status : ''}`,
                path: '/devices'
            }));
            indexRef.current = [...employees, ...devices, ...PAGE_INDEX];
        } catch (err) {
            console.error('Search index load failed:', err);
            indexRef.current = [...PAGE_INDEX];
        }
        return indexRef.current;
    };

    // Debounce search for performance
    const debouncedSearch = React.useMemo(
        () => {
            const searchFn = async (searchQuery) => {
                const q = searchQuery.trim().toLowerCase();
                if (!q) {
                    setResults([]);
                    return;
                }
                const index = await loadIndex();
                const matches = index.filter(item =>
                    item.title?.toLowerCase().includes(q) ||
                    item.subtitle?.toLowerCase().includes(q)
                ).slice(0, 12);
                setResults(matches);
                setSelectedIndex(0);
            };

            let timeoutId;
            return (searchQuery) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => searchFn(searchQuery), 300);
            };
        },
        []
    );

    // Refresh the index each time the palette opens
    useEffect(() => {
        if (isOpen) indexRef.current = null;
    }, [isOpen]);

    // Load recent searches from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('recentSearches');
        if (saved) {
            setRecentSearches(JSON.parse(saved));
        }
    }, []);

    // Register keyboard shortcut (Cmd+K or Ctrl+K)
    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        keyboardShortcuts.register('ctrl+k', handleOpen, { description: 'Open global search' });
        keyboardShortcuts.register('meta+k', handleOpen, { description: 'Open global search' });

        return () => {
            keyboardShortcuts.unregister('ctrl+k');
            keyboardShortcuts.unregister('meta+k');
        };
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Debounced search functionality
    useEffect(() => {
        debouncedSearch(query);
    }, [query, debouncedSearch]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && results[selectedIndex]) {
                e.preventDefault();
                handleSelectResult(results[selectedIndex]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex]);

    const handleSelectResult = (result) => {
        // Save to recent searches (icon is a React component — not serializable)
        const { icon: _icon, ...serializable } = result;
        const updated = [
            { ...serializable, timestamp: Date.now() },
            ...recentSearches.filter(r => r.id !== result.id)
        ].slice(0, 5);
        setRecentSearches(updated);
        localStorage.setItem('recentSearches', JSON.stringify(updated));

        // Navigate
        navigate(result.path);
        setIsOpen(false);
        setQuery('');
    };

    const handleClose = () => {
        setIsOpen(false);
        setQuery('');
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-[9998] transition-opacity"
                onClick={handleClose}
            />

            {/* Search Modal */}
            <div 
                className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] px-4 pointer-events-none"
                role="dialog"
                aria-modal="true"
                aria-label="Global search"
            >
                <div
                    className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden pointer-events-auto transform transition-ui"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Search Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                        <Search className="text-slate-400" size={20} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search employees, devices, reports..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="flex-1 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-transparent"
                            aria-label="Search input"
                            aria-describedby="search-help"
                        />
                        <div className="flex items-center gap-2">
                            <kbd className="px-2 py-1 text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded" aria-label="Keyboard shortcut">
                                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+K
                            </kbd>
                            <button
                                onClick={handleClose}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                aria-label="Close search"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <div id="search-help" className="sr-only">
                        Use arrow keys to navigate, Enter to select, Escape to close
                    </div>

                    {/* Results */}
                    <div 
                        className="max-h-96 overflow-y-auto"
                        role="listbox"
                        aria-label="Search results"
                    >
                        {query.trim() ? (
                            results.length > 0 ? (
                                <div className="py-2">
                                    {results.map((result, index) => {
                                        const category = searchCategories[result.type] || searchCategories.settings;
                                        const Icon = result.icon || category.icon;
                                        const isSelected = index === selectedIndex;

                                        return (
                                            <button
                                                key={result.id}
                                                onClick={() => handleSelectResult(result)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                                                    isSelected ? 'bg-slate-50 dark:bg-slate-900/50' : ''
                                                }`}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                            >
                                                <div className={`p-2 rounded-lg ${category.bgColor}`}>
                                                    <Icon className={category.color} size={18} />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="font-medium text-slate-900 dark:text-slate-100">{result.title}</div>
                                                    <div className="text-sm text-slate-500 dark:text-slate-400">{result.subtitle}</div>
                                                </div>
                                                <ArrowRight className="text-slate-400" size={16} />
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                                    <p className="text-sm">No results found for "{query}"</p>
                                </div>
                            )
                        ) : (
                            <div className="py-4">
                                {recentSearches.length > 0 && (
                                    <>
                                        <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                            Recent Searches
                                        </div>
                                        {recentSearches.map((result, index) => {
                                            const category = searchCategories[result.type] || searchCategories.settings;
                                            const Icon = result.icon || category.icon;

                                            return (
                                                <button
                                                    key={result.id}
                                                    onClick={() => handleSelectResult(result)}
                                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                                >
                                                    <div className={`p-2 rounded-lg ${category.bgColor}`}>
                                                        <Icon className={category.color} size={18} />
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <div className="font-medium text-slate-900 dark:text-slate-100">{result.title}</div>
                                                        <div className="text-sm text-slate-500 dark:text-slate-400">{result.subtitle}</div>
                                                    </div>
                                                    <Clock className="text-slate-400" size={14} />
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                                <div className="px-4 py-8 text-center text-slate-400">
                                    <Search size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">Start typing to search...</p>
                                    <p className="text-xs mt-1">Use ↑↓ to navigate, Enter to select, Esc to close</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

