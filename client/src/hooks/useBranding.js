import { useEffect, useState } from 'react';
import api from '../api';
import { getCompanyInfo, loadReportSettings } from '../utils/reportSettings';

/**
 * The company's own logo and name, for anywhere the app shows its identity.
 *
 * Reads the cache that report exports already populate, so the settings request
 * is not repeated per component. The cache is filled once after sign-in; a
 * component mounting before that finishes triggers the load itself and updates
 * when it lands, which is why this is a hook rather than a plain getter.
 *
 * Falls back to the built-in NeevTime mark. An install with no logo uploaded
 * must look deliberate, not broken.
 */
export default function useBranding() {
    const [branding, setBranding] = useState(() => getCompanyInfo() || null);

    useEffect(() => {
        let cancelled = false;
        if (branding) return undefined;

        // Signed in: reuse the cache the report exports already fill.
        // Signed out — the sign-in page — /api/settings needs a token, so fall
        // back to the public branding endpoint. Without this the sign-in page
        // would always show the default mark, which is the one screen where a
        // customer most wants to see their own.
        const load = localStorage.getItem('token')
            ? loadReportSettings().then(() => getCompanyInfo())
            : api.get('/api/branding').then(res => res.data);

        load
            .then(data => { if (!cancelled && data) setBranding(data); })
            .catch(() => { /* fall back to the defaults below */ });

        return () => { cancelled = true; };
    }, [branding]);

    return {
        logo: branding?.logo || '',
        hasLogo: Boolean(branding?.logo),
        name: branding?.name || 'NeevTime'
    };
}
