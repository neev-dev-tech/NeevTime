import { useEffect, useState } from 'react';
import axios from 'axios';
import LegalLayout, { Section } from './LegalLayout';

/**
 * Accessibility statement. States the target and the known gaps as they are
 * (docs/compliance/COMPLIANCE_AUDIT.md), not a conformance claim — NeevTime
 * has not been audited by a third party or tested with assistive-technology
 * users. Update the list as gaps are closed.
 */
export default function AccessibilityStatement() {
    const [contact, setContact] = useState(null);
    useEffect(() => {
        axios.get('/api/privacy-notice').then(r => setContact(r.data?.contact || null)).catch(() => {});
    }, []);

    return (
        <LegalLayout title="Accessibility">
            <p>
                NeevTime aims to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, so it can be used with a
                keyboard alone, with a screen reader, at up to 200% zoom, and with reduced motion. It does not fully meet that
                standard yet, and it has not been independently audited.
            </p>

            <Section title="What works">
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>Text and controls meet AA colour contrast in the light and dark themes.</li>
                    <li>Keyboard focus is always visible. Dialogs keep focus inside them, close with Escape and return focus when they close.</li>
                    <li>Animation is reduced when your device asks for reduced motion.</li>
                    <li>The layout adapts to narrow screens and zoom without scrolling sideways.</li>
                    <li>Pages are organised with landmarks and headings, and each has its own title.</li>
                </ul>
            </Section>

            <Section title="Known problems">
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>Many form fields in the administration screens show a label that is not yet connected to the field for screen readers.</li>
                    <li>Some menus and tab lists open and close with the keyboard but do not yet support moving between items with the arrow keys.</li>
                    <li>Some table rows that open details can only be clicked, not reached with the keyboard.</li>
                    <li>A few icon-only buttons do not yet have a spoken name.</li>
                </ul>
                <p>These are being worked on.</p>
            </Section>

            <Section title="Report a problem">
                <p>
                    If something does not work for you, tell your HR team
                    {contact?.email ? <> or write to <a className="underline underline-offset-2" href={`mailto:${contact.email}`}>{contact.email}</a></> : null}.
                    Say which page and what you were trying to do.
                </p>
            </Section>
        </LegalLayout>
    );
}
