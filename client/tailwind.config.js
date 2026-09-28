/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Enable class-based dark mode
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Neev One platform tokens — now theme variables (see index.css
                // :root / [data-theme="black"]). Values swap per theme; light is
                // unchanged from the previous hardcoded hex.
                cream: {
                    50: 'rgb(var(--surface-2) / <alpha-value>)', // hover row → canvas tint
                    100: 'rgb(var(--bg) / <alpha-value>)', // canvas
                },
                app: {
                    bg: 'rgb(var(--bg) / <alpha-value>)', // canvas
                    surface: 'rgb(var(--surface) / <alpha-value>)', // cards/forms
                    hover: 'rgb(var(--surface-2) / <alpha-value>)', // hover
                },
                // Kept the name `saffron` so 300+ call sites recolour at once;
                // now the theme brand (black in light, white in the black theme).
                saffron: {
                    light: 'rgb(var(--brand-light) / <alpha-value>)',
                    DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
                    dark: 'rgb(var(--brand-active) / <alpha-value>)',
                },
                charcoal: {
                    DEFAULT: 'rgb(var(--text) / <alpha-value>)', // text-primary
                },
                'slate-grey': 'rgb(var(--text-muted) / <alpha-value>)', // secondary text
                border: 'rgb(var(--border) / <alpha-value>)',
                // Status Colors (from modern design)
                success: {
                    DEFAULT: '#10B981', // Emerald-500 - Success states
                    light: '#34D399', // Emerald-400
                    dark: '#059669', // Emerald-600
                    bg: '#D1FAE5', // Emerald-100
                    text: '#065F46', // Emerald-800
                },
                warning: {
                    DEFAULT: '#F59E0B', // Amber-500
                    light: '#FBBF24', // Amber-400
                    dark: '#D97706', // Amber-600
                    bg: '#FEF3C7', // Amber-100
                    text: '#92400E', // Amber-800
                },
                error: {
                    DEFAULT: '#EF4444', // Red-500
                    light: '#F87171', // Red-400
                    dark: '#DC2626', // Red-600
                    bg: '#FEE2E2', // Red-100
                    text: '#991B1B', // Red-800
                },
                info: {
                    DEFAULT: '#3B82F6', // Blue-500
                    light: '#60A5FA', // Blue-400
                    dark: '#2563EB', // Blue-600
                    bg: '#DBEAFE', // Blue-100
                    text: '#1E40AF', // Blue-800
                },
            },
            fontFamily: {
                // Public Sans for everything you read, Sora for what you scan.
                // `display` is the opt-in for headings and headline figures;
                // `sans` stays the default so no existing markup changes meaning.
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['Inter', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
            },
            boxShadow: {
                'soft-orange': '0 4px 12px rgba(249, 115, 22, 0.3)',
                'soft-green': '0 4px 12px rgba(16, 185, 129, 0.3)',
                'card': '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.1)',
                'elevated': '0 1px 2px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(255, 160, 60, 0.1)',
                'hover-card': '0 12px 24px rgba(255, 160, 60, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)',
                'modern': '0 2px 8px rgba(0, 0, 0, 0.08)',
                'modern-hover': '0 8px 16px rgba(0, 0, 0, 0.12)',
            },
            spacing: {
                '18': '4.5rem',
                '88': '22rem',
            },
            backgroundImage: {
                'saffron-gradient': 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
            },
            transitionTimingFunction: {
                'snappy': 'cubic-bezier(0.25, 0.8, 0.25, 1)',
            },
            transitionDuration: {
                'fast': '200ms',
                'normal': '400ms',
            },
        },
    },
    plugins: [],
}
