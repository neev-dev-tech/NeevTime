/**
 * Company and PDF settings for exports.
 *
 * exportToPDF is synchronous and called from many places, so the values are
 * fetched once after sign-in and cached here. Everything falls back to the
 * previous hardcoded defaults, so an export still works if the fetch fails.
 */

import api from '../api';

let cache = {
    company: null,
    pdf: null
};

const unwrap = (category) => {
    const entries = category || {};
    const out = {};
    for (const [key, config] of Object.entries(entries)) {
        out[key] = config && typeof config === 'object' && 'value' in config ? config.value : config;
    }
    return out;
};

const asBool = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    return v === true || v === 'true';
};

/** Fetch once per session. Safe to call more than once. */
export const loadReportSettings = async () => {
    try {
        const res = await api.get('/api/settings');
        const company = unwrap(res.data?.company);
        const pdf = unwrap(res.data?.pdf);

        cache = {
            company: {
                name: company.company_name || 'NeevTime',
                tagline: 'Attendance Management System',
                address: company.company_address || '',
                phone: company.company_phone || '',
                email: company.company_email || '',
                website: company.company_website || ''
            },
            pdf: {
                orientation: pdf.pdf_orientation || 'landscape',
                format: pdf.pdf_page_size || 'a4',
                showLogo: asBool(pdf.pdf_show_logo, true),
                showSignature: asBool(pdf.pdf_include_signature_line, false),
                showSummary: asBool(pdf.pdf_include_summary, true),
                headerText: pdf.pdf_header_text || '',
                footerText: pdf.pdf_footer_text || ''
            }
        };
    } catch {
        // Leave the cache empty; callers fall back to their own defaults
    }
    return cache;
};

export const getCompanyInfo = () => cache.company;
export const getPdfDefaults = () => cache.pdf || {};
