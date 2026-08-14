import { useState } from 'react';
import PropTypes from 'prop-types';
import { Sun, Moon, Palette, RefreshCw, Check, Monitor, Save, Users } from 'lucide-react';
import { useTheme } from './Theme';
import api from '../api';
import { useToast } from './Toast';

/**
 * Appearance settings, as a Settings tab.
 *
 * The controls already existed, in a slide-over panel behind a small palette
 * icon in the header. That is where nobody looks: reported as "the theme toggle
 * doesn't work", when the mechanism was fine and the control was simply not
 * where anyone expected it. Settings is where people go to change how the app
 * behaves, so the same controls live here.
 *
 * Two kinds of preference live here, and the split is deliberate.
 *
 * Light and dark are per-browser, in localStorage: someone working at night
 * should not darken the app for the whole company, and there is no per-user
 * profile to hang it on.
 *
 * The colour scheme is the company's, in app_settings, and is applied with the
 * button at the bottom. It began as localStorage too, which was wrong in a way
 * that only showed up across machines — an uploaded logo appeared for everyone
 * while a palette change followed one browser around, so the same account on a
 * second laptop rendered in different colours.
 */

const SWATCHES = [
    { key: 'primary', label: 'Primary', hint: 'Buttons, links, the active nav pill' },
    { key: 'accent', label: 'Accent', hint: 'Highlights and emphasis' },
    { key: 'success', label: 'Success', hint: 'Present, synced, healthy' },
    { key: 'warning', label: 'Warning', hint: 'Late, pending, needs attention' },
    { key: 'error', label: 'Error', hint: 'Absent, failed, destructive actions' },
    { key: 'info', label: 'Info', hint: 'Neutral notices' }
];

function ModeCard({ active, icon: Icon, title, subtitle, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex-1 min-w-[150px] p-4 rounded-xl border text-left transition-ui ${
                active
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-600 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 hover:border-orange-200 dark:hover:border-orange-800'
            }`}
        >
            <div className="flex items-center justify-between mb-1">
                <Icon size={20} className={active ? 'text-orange-500' : 'text-slate-400'} />
                {active && <Check size={16} className="text-orange-500" />}
            </div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </button>
    );
}

ModeCard.propTypes = {
    active: PropTypes.bool,
    icon: PropTypes.elementType.isRequired,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    onClick: PropTypes.func.isRequired
};

export default function ThemeSettings() {
    const {
        isDarkMode, toggleDarkMode,
        currentTheme, setTheme,
        themeColors, customColors, setCustomColor,
        resetTheme, presets
    } = useTheme();
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    /**
     * Publish the palette to everyone.
     *
     * Colour changes apply to this browser as you make them — that is the
     * preview. They are not the company's colours until they are saved here,
     * which is the distinction that was missing: the logo was a server setting
     * and appeared everywhere, while the palette only ever lived in one
     * browser's localStorage, so the same account on a second laptop showed
     * different colours with no way to reconcile them.
     */
    const publish = async () => {
        setSaving(true);
        try {
            await api.put('/api/settings/company', {
                theme_preset: customColors ? 'custom' : currentTheme,
                theme_custom_colors: customColors ? JSON.stringify(customColors) : ''
            });
            toast.success('Colour scheme saved for everyone in the company');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not save the colour scheme');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">

            {/* ── Light / dark ────────────────────────────────────────────── */}
            <section className="space-y-3">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Appearance</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        A per-browser choice — it will not change the app for anyone else.
                    </p>
                </div>

                <div className="flex gap-3 flex-wrap">
                    <ModeCard
                        active={!isDarkMode}
                        icon={Sun}
                        title="Light"
                        subtitle="Best in a bright office"
                        onClick={() => { if (isDarkMode) toggleDarkMode(); }}
                    />
                    <ModeCard
                        active={isDarkMode}
                        icon={Moon}
                        title="Dark"
                        subtitle="Easier at night, less glare"
                        onClick={() => { if (!isDarkMode) toggleDarkMode(); }}
                    />
                </div>

                <p className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <Monitor size={13} />
                    Without a saved choice the app follows your operating system.
                </p>
            </section>

            {/* ── Presets ─────────────────────────────────────────────────── */}
            <section className="space-y-3">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Colour scheme</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Used across buttons, charts and status badges. Preview here, then apply it to the
                        whole company at the bottom of this tab.
                    </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Object.entries(presets).map(([key, preset]) => {
                        const active = !customColors && currentTheme === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTheme(key)}
                                aria-pressed={active}
                                className={`p-3 rounded-xl border text-left transition-ui ${
                                    active
                                        ? 'border-orange-400 shadow-sm bg-orange-50/60 dark:bg-orange-900/20 dark:border-orange-600'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-orange-200 dark:hover:border-orange-800'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 mb-2">
                                    {['primary', 'success', 'warning', 'error'].map(k => (
                                        <span
                                            key={k}
                                            className="w-5 h-5 rounded-full border border-black/5"
                                            style={{ backgroundColor: preset[k] }}
                                        />
                                    ))}
                                </div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                    {preset.name}
                                </p>
                                {active && (
                                    <p className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">In use</p>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* ── Custom colours ──────────────────────────────────────────── */}
            <section className="space-y-3">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Custom colours</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Match the app to your own branding. Changing any colour switches the scheme to Custom.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SWATCHES.map(({ key, label, hint }) => (
                        <label
                            key={key}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 cursor-pointer hover:border-orange-200 dark:hover:border-orange-800"
                        >
                            {/* A native colour input keeps the OS picker, which
                                handles eyedroppers and hex entry better than
                                anything hand-rolled. */}
                            <input
                                type="color"
                                value={themeColors[key] || '#000000'}
                                onChange={(e) => setCustomColor(key, e.target.value)}
                                className="field w-10 h-10 cursor-pointer bg-transparent"
                                aria-label={label}
                            />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</p>
                            </div>
                            <code className="ml-auto text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                                {(themeColors[key] || '').toUpperCase()}
                            </code>
                        </label>
                    ))}
                </div>
            </section>

            {/* ── Preview and reset ───────────────────────────────────────── */}
            <section className="space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Preview</h3>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
                    <div className="flex gap-2 flex-wrap">
                        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: themeColors.primary }}>Primary</span>
                        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: themeColors.success }}>Present</span>
                        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: themeColors.warning }}>Late</span>
                        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: themeColors.error }}>Absent</span>
                        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: themeColors.info }}>Info</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Body text on a card, as it will appear in {isDarkMode ? 'dark' : 'light'} mode.
                    </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={publish}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60"
                    >
                        <Save size={15} />
                        {saving ? 'Saving…' : 'Apply to everyone'}
                    </button>
                    <button
                        type="button"
                        onClick={resetTheme}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-500 hover:bg-slate-600 text-white dark:bg-slate-600 dark:hover:bg-slate-500"
                    >
                        <RefreshCw size={15} />
                        Reset to defaults
                    </button>
                </div>
                <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Users size={13} className="mt-0.5 shrink-0" />
                    Colour changes preview in this browser straight away. Press <strong>Apply to everyone</strong> to
                    make them the company&apos;s colours — the same scheme will then load on every machine and for
                    every user, exactly as the logo does. Reset restores the original orange scheme here only.
                </p>
            </section>

            <p className="flex items-start gap-2 text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700">
                <Palette size={13} className="mt-0.5 shrink-0" />
                Light and dark stay a per-browser choice — someone working at night should not darken the
                app for the whole company. The colour scheme, once applied, is shared by everyone.
            </p>
        </div>
    );
}
