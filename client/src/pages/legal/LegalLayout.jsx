import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { ChevronLeft } from 'lucide-react';

/**
 * A readable standalone page for the privacy notice and accessibility
 * statement. Public: these must be open before anyone signs in, so they do not
 * sit inside the app shell.
 */
export default function LegalLayout({ title, children }) {
    useEffect(() => {
        const previous = document.title;
        document.title = `${title} · NeevTime`;
        return () => { document.title = previous; };
    }, [title]);

    return (
        <div className="min-h-screen bg-app-surface text-slate-800 dark:text-slate-200">
            <a href="#legal-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-slate-900 focus:text-white">
                Skip to content
            </a>
            <header className="border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center">
                    <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/login'))}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:underline">
                        <ChevronLeft size={15} /> Back
                    </button>
                </div>
            </header>
            <main id="legal-content" className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-6">{title}</h1>
                <div className="legal-prose space-y-6 text-[15px] leading-relaxed">{children}</div>
            </main>
            <footer className="border-t border-slate-200 dark:border-slate-800">
                <LegalLinks className="max-w-3xl mx-auto px-4 sm:px-6 py-5" />
            </footer>
        </div>
    );
}
LegalLayout.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };

/** The footer links shown on sign-in pages, the employee portal and here. */
export function LegalLinks({ className = '' }) {
    return (
        <nav aria-label="Legal" className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 ${className}`}>
            <Link to="/privacy" className="hover:underline underline-offset-2">Privacy notice</Link>
            <Link to="/accessibility" className="hover:underline underline-offset-2">Accessibility</Link>
        </nav>
    );
}
LegalLinks.propTypes = { className: PropTypes.string };

/** A section of a legal page. */
export function Section({ title, children }) {
    return (
        <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h2>
            <div className="space-y-3">{children}</div>
        </section>
    );
}
Section.propTypes = { title: PropTypes.string.isRequired, children: PropTypes.node };
