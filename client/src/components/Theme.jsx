/**
 * Theme Customization System
 * 
 * Provides:
 * - Theme context and provider
 * - Color scheme customization
 * - Dark mode toggle
 * - Preset themes
 * - Custom accent colors
 * 
 * @author DevTeam
 * @version 1.0.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Palette, Check, RotateCcw } from 'lucide-react';

// Theme presets
const THEME_PRESETS = {
    default: {
        name: 'NeevTime Orange',
        primary: '#F97316',
        primaryDark: '#EA580C',
        primaryLight: '#FFEDD5',
        accent: '#F97316',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
    },
    blue: {
        name: 'Ocean Blue',
        primary: '#3B82F6',
        primaryDark: '#2563EB',
        primaryLight: '#DBEAFE',
        accent: '#3B82F6',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#06B6D4'
    },
    purple: {
        name: 'Royal Purple',
        primary: '#8B5CF6',
        primaryDark: '#7C3AED',
        primaryLight: '#EDE9FE',
        accent: '#8B5CF6',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
    },
    green: {
        name: 'Forest Green',
        primary: '#22C55E',
        primaryDark: '#16A34A',
        primaryLight: '#DCFCE7',
        accent: '#22C55E',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
    },
    rose: {
        name: 'Rose Pink',
        primary: '#F43F5E',
        primaryDark: '#E11D48',
        primaryLight: '#FFE4E6',
        accent: '#F43F5E',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#DC2626',
        info: '#3B82F6'
    },
    teal: {
        name: 'Teal',
        primary: '#14B8A6',
        primaryDark: '#0D9488',
        primaryLight: '#CCFBF1',
        accent: '#14B8A6',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6'
    }
};

// Color swatches for custom picker
const COLOR_SWATCHES = [
    '#F97316', '#EF4444', '#F43F5E', '#EC4899', '#D946EF',
    '#8B5CF6', '#6366F1', '#3B82F6', '#0EA5E9', '#06B6D4',
    '#14B8A6', '#10B981', '#22C55E', '#84CC16', '#EAB308',
    '#F59E0B', '#78716C', '#64748B', '#475569', '#1E293B'
];

// Theme Context
const ThemeContext = createContext(null);

/**
 * Theme Provider
 */
export function ThemeProvider({ children }) {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme-dark-mode');
            if (saved !== null) return JSON.parse(saved);
            return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches || false;
        }
        return false;
    });

    const [currentTheme, setCurrentTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme-preset') || 'default';
        }
        return 'default';
    });

    const [customColors, setCustomColors] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme-custom-colors');
            return saved ? JSON.parse(saved) : null;
        }
        return null;
    });

    // Get active theme colors
    const themeColors = customColors || THEME_PRESETS[currentTheme] || THEME_PRESETS.default;

    /**
     * Adopt the company's saved palette.
     *
     * The colour scheme is a property of the deployment, not of the machine
     * looking at it — the same account on a second laptop was showing different
     * colours, while an uploaded logo appeared everywhere, because the logo was
     * a server setting and the palette was localStorage.
     *
     * localStorage stays as the first paint, so the app does not flash the
     * default orange on every load while this request is in flight; the server
     * is what settles the question. Dark mode is deliberately not included: one
     * person preferring dark should not darken the app for the whole company.
     */
    useEffect(() => {
        let cancelled = false;
        fetch('/api/branding')
            .then(res => (res.ok ? res.json() : null))
            .then(cfg => {
                if (cancelled || !cfg) return;
                if (cfg.theme_custom_colors) {
                    setCustomColors(cfg.theme_custom_colors);
                    localStorage.setItem('theme-custom-colors', JSON.stringify(cfg.theme_custom_colors));
                } else if (cfg.theme_preset) {
                    setCurrentTheme(cfg.theme_preset);
                    setCustomColors(null);
                    localStorage.removeItem('theme-custom-colors');
                }
            })
            .catch(() => { /* keep whatever localStorage gave us */ });
        return () => { cancelled = true; };
    }, []);

    // Apply theme to CSS variables
    useEffect(() => {
        const root = document.documentElement;

        // Apply colors
        root.style.setProperty('--color-primary', themeColors.primary);
        root.style.setProperty('--color-primary-dark', themeColors.primaryDark);
        root.style.setProperty('--color-primary-light', themeColors.primaryLight);
        root.style.setProperty('--color-accent', themeColors.accent);
        root.style.setProperty('--color-success', themeColors.success);
        root.style.setProperty('--color-warning', themeColors.warning);
        root.style.setProperty('--color-error', themeColors.error);
        root.style.setProperty('--color-info', themeColors.info);

        // Apply dark mode
        if (isDarkMode) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        // Save preferences
        localStorage.setItem('theme-dark-mode', JSON.stringify(isDarkMode));
        localStorage.setItem('theme-preset', currentTheme);
        if (customColors) {
            localStorage.setItem('theme-custom-colors', JSON.stringify(customColors));
        }
    }, [themeColors, isDarkMode, currentTheme, customColors]);

    const toggleDarkMode = useCallback(() => {
        setIsDarkMode(prev => !prev);
    }, []);

    const setTheme = useCallback((themeName) => {
        setCurrentTheme(themeName);
        setCustomColors(null);
        localStorage.removeItem('theme-custom-colors');
    }, []);

    const setCustomColor = useCallback((colorKey, value) => {
        setCustomColors(prev => ({
            ...(prev || THEME_PRESETS[currentTheme]),
            [colorKey]: value,
            name: 'Custom'
        }));
    }, [currentTheme]);

    const resetTheme = useCallback(() => {
        setCurrentTheme('default');
        setCustomColors(null);
        setIsDarkMode(false);
        localStorage.removeItem('theme-custom-colors');
    }, []);

    const contextValue = {
        isDarkMode,
        toggleDarkMode,
        currentTheme,
        setTheme,
        themeColors,
        customColors,
        setCustomColor,
        resetTheme,
        presets: THEME_PRESETS
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * useTheme Hook
 */
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

/**
 * Dark Mode Toggle Button
 */
export function DarkModeToggle({ className = '' }) {
    const { isDarkMode, toggleDarkMode } = useTheme();

    return (
        <button
            onClick={toggleDarkMode}
            className={`
                relative w-14 h-7 rounded-full p-1
                transition-colors duration-300
                ${isDarkMode ? 'bg-slate-700' : 'bg-orange-100'}
                ${className}
            `}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
            <div
                className={`
                    absolute w-5 h-5 rounded-full
                    transform transition-ui duration-300
                    flex items-center justify-center
                    ${isDarkMode
                        ? 'translate-x-7 bg-slate-900'
                        : 'translate-x-0 bg-orange-500'
                    }
                `}
            >
                {isDarkMode ? (
                    <Moon size={12} className="text-yellow-300" />
                ) : (
                    <Sun size={12} className="text-white" />
                )}
            </div>
        </button>
    );
}

/**
 * Theme Customization Panel
 */
export function ThemePanel({ isOpen, onClose }) {
    const {
        isDarkMode,
        toggleDarkMode,
        currentTheme,
        setTheme,
        themeColors,
        setCustomColor,
        resetTheme,
        presets
    } = useTheme();

    const [activeTab, setActiveTab] = useState('presets'); // 'presets', 'custom'

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-slate-900 shadow-2xl z-50 
                transform transition-transform duration-300 overflow-hidden flex flex-col">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Palette size={20} className="text-orange-500" />
                            <h2 className="font-semibold text-slate-800 dark:text-white">Theme Settings</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="text-xl text-slate-500">&times;</span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Dark Mode Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <div>
                            <p className="font-medium text-slate-800 dark:text-white">Dark Mode</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {isDarkMode ? 'Currently dark' : 'Currently light'}
                            </p>
                        </div>
                        <DarkModeToggle />
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('presets')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors
                                ${activeTab === 'presets'
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                    : 'text-slate-500'
                                }`}
                        >
                            Presets
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors
                                ${activeTab === 'custom'
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                    : 'text-slate-500'
                                }`}
                        >
                            Custom
                        </button>
                    </div>

                    {/* Presets Tab */}
                    {activeTab === 'presets' && (
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(presets).map(([key, preset]) => (
                                <button
                                    key={key}
                                    onClick={() => setTheme(key)}
                                    className={`
                                        relative p-4 rounded-xl border-2 transition-ui
                                        ${currentTheme === key && !themeColors.name?.includes('Custom')
                                            ? 'border-slate-800 dark:border-white'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                        }
                                    `}
                                >
                                    <div
                                        className="w-8 h-8 rounded-full mb-2 mx-auto shadow-md"
                                        style={{ backgroundColor: preset.primary }}
                                    />
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 text-center">
                                        {preset.name}
                                    </p>
                                    {currentTheme === key && !themeColors.name?.includes('Custom') && (
                                        <div className="absolute top-2 right-2">
                                            <Check size={14} className="text-green-500" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Custom Colors Tab */}
                    {activeTab === 'custom' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Primary Color
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_SWATCHES.map(color => (
                                        <button
                                            key={color}
                                            onClick={() => setCustomColor('primary', color)}
                                            className={`
                                                w-8 h-8 rounded-lg shadow-sm transition-transform hover:scale-110
                                                ${themeColors.primary === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}
                                            `}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Or enter custom color
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={themeColors.primary}
                                        onChange={(e) => setCustomColor('primary', e.target.value)}
                                        className="field w-12 h-10 cursor-pointer border-0"
                                    />
                                    <input
                                        type="text"
                                        value={themeColors.primary}
                                        onChange={(e) => setCustomColor('primary', e.target.value)}
                                        className="field flex-1 font-mono"
                                        placeholder="#F97316"
                                    />
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">Preview</p>
                                <div className="space-y-2">
                                    <button
                                        className="w-full py-2 rounded-lg text-white font-medium text-sm"
                                        style={{ backgroundColor: themeColors.primary }}
                                    >
                                        Primary Button
                                    </button>
                                    <div className="flex gap-2">
                                        <div
                                            className="flex-1 h-8 rounded-lg"
                                            style={{ backgroundColor: themeColors.primaryLight }}
                                        />
                                        <div
                                            className="flex-1 h-8 rounded-lg"
                                            style={{ backgroundColor: themeColors.primary }}
                                        />
                                        <div
                                            className="flex-1 h-8 rounded-lg"
                                            style={{ backgroundColor: themeColors.primaryDark }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={resetTheme}
                        className="w-full flex items-center justify-center gap-2 py-2.5 
                            text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white
                            border border-slate-200 dark:border-slate-700 rounded-xl
                            transition-colors"
                    >
                        <RotateCcw size={16} />
                        Reset to Default
                    </button>
                </div>
            </div>
        </>
    );
}

/**
 * Theme Button - Opens theme panel
 */
export function ThemeButton({ className = '' }) {
    const [isOpen, setIsOpen] = useState(false);
    const { themeColors } = useTheme();

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={`
                    p-2 rounded-lg border border-slate-200 dark:border-slate-700
                    hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors
                    flex items-center gap-2
                    ${className}
                `}
                title="Customize Theme"
            >
                <div
                    className="w-5 h-5 rounded-full shadow-inner"
                    style={{ backgroundColor: themeColors.primary }}
                />
                <Palette size={16} className="text-slate-500" />
            </button>
            <ThemePanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}

export default ThemeProvider;
