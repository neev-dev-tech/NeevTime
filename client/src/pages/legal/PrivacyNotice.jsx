import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import LegalLayout, { Section } from './LegalLayout';
import { formatDate } from '../../utils/dateFormat';

/**
 * Privacy notice for the people whose attendance NeevTime records.
 *
 * Written from what the application actually does (see
 * docs/compliance/COMPLIANCE_AUDIT.md). The employer running NeevTime is
 * responsible for this data, so who to contact and how long records are kept
 * come from Settings > Privacy contact; anything not set is shown as not set,
 * never filled with a plausible guess.
 *
 * Integrations are described as possible, not as in use: whether this install
 * sends data to a payroll system, a directory or a backup destination is the
 * employer's configuration, and the notice must not claim either way.
 */

function Unset({ children = 'not yet stated by your employer' }) {
    return <span className="font-medium text-amber-800 dark:text-amber-300">[{children}]</span>;
}
Unset.propTypes = { children: PropTypes.node };

const ROWS = [
    ['Who you are at work', 'Name, employee code, department, designation, area, joining date, employment type and status; gender and date of birth if your employer records them; work contact details (mobile, email, address).', 'To identify you and keep your attendance and HR records.'],
    ['Attendance', 'Each punch (time, reader or app, in or out), shifts, daily hours, lateness, overtime, leave, corrections you ask for, and swaps.', 'To record working time, pay correctly and keep the registers employers must keep.'],
    ['Biometric templates', 'Fingerprint or face templates enrolled at a reader — a mathematical representation, not a photograph — and card numbers or reader PINs.', 'To recognise you at the readers, and to copy your enrolment between readers.'],
    ['Location (app punches only)', 'Your phone’s location at the moment you punch in the app, saved with that punch.', 'To check you are at an approved site. Readers on the wall do not record location.'],
    ['Photo (app punches, optional)', 'A photo you choose to take when punching in the app.', 'To show who made the punch if it is questioned.'],
    ['Documents', 'Documents HR attaches to your record, such as contracts or ID proofs.', 'To keep your employment records.'],
    ['Requests', 'Reasons you give for leave, corrections, swaps or resignation.', 'To decide and record those requests.'],
    ['Sign-in and activity', 'Your sign-in method, password (stored only as a one-way hash), and the network address and browser of sign-ins and changes.', 'To keep accounts secure and to show who changed what.'],
];

export default function PrivacyNotice() {
    const [facts, setFacts] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        // Public endpoint; no token needed.
        axios.get('/api/privacy-notice').then(r => setFacts(r.data)).catch(() => setFailed(true));
    }, []);

    const operator = facts?.operator || null;
    const c = facts?.contact || {};

    return (
        <LegalLayout title="Privacy notice">
            {failed && (
                <p role="alert" className="px-4 py-3 rounded-lg bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 text-sm">
                    The contact details could not be loaded. Ask your HR team who handles privacy requests.
                </p>
            )}
            {facts && !facts.configured && (
                <p className="px-4 py-3 rounded-lg bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 text-sm">
                    Your employer has not yet named a privacy contact. Until they do, ask your HR team.
                </p>
            )}

            <p>
                This notice explains what information NeevTime keeps about you, why, who can see it and what you can ask for.
                NeevTime is attendance software. It is run by {operator ? <strong>{operator}</strong> : <Unset>your employer</Unset>},
                which decides how it is used and is responsible for your information.
            </p>

            <Section title="What is kept, and why">
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                        <caption className="sr-only">Information kept about you and the reason for each</caption>
                        <thead className="bg-slate-50 dark:bg-slate-900/60 text-left">
                            <tr>
                                <th scope="col" className="px-3 py-2 font-semibold">Information</th>
                                <th scope="col" className="px-3 py-2 font-semibold">What it includes</th>
                                <th scope="col" className="px-3 py-2 font-semibold">Why</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 align-top">
                            {ROWS.map(([what, detail, why]) => (
                                <tr key={what}>
                                    <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">{what}</th>
                                    <td className="px-3 py-2">{detail}</td>
                                    <td className="px-3 py-2">{why}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p>
                    Location and photos are used only when you punch in the app. The app asks your phone for permission to use
                    location; the photo is optional, and you can punch without one. Nothing is used for advertising.
                </p>
            </Section>

            <Section title="Who can see it">
                <p>
                    People your employer has given an account: administrators and HR, and read-only users your employer has
                    allowed. Your approvers see the requests you send them. You can see your own attendance and requests in the
                    employee portal.
                </p>
                <p>
                    Your employer can connect NeevTime to other services. Only if they have, your information is shared with:
                    their payroll or HR system (for example ERPNext, greytHR, Odoo or Horilla); their email provider, to send
                    notifications and reports; their sign-in directory (for example Microsoft, Google, Okta or Active Directory),
                    if you sign in through it; and the place where they keep backup copies. When an administrator imports a
                    spreadsheet with the optional import assistant, the column names and two sample values from each column
                    are sent to an outside service (TypeSafe) to match the columns.
                </p>
            </Section>

            <Section title="How long it is kept">
                <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                        Photos taken when punching in the app are deleted automatically after{' '}
                        <strong>{facts ? `${facts.photo_retention_days} days` : '…'}</strong>. The punch itself is kept.
                    </li>
                    <li>
                        Attendance and HR records:{' '}
                        {facts?.attendance_record_retention ? <strong>{facts.attendance_record_retention}</strong> : <Unset />}.
                        Some attendance registers must by law be kept for a number of years.
                    </li>
                    <li>
                        The record of who changed what, and the activity log, are kept until your employer removes them; there is
                        no automatic time limit.
                    </li>
                    <li>Backup copies hold the same information until those backups are replaced.</li>
                    <li>
                        When your employer records that you have left, you can no longer sign in. If your record is deleted, your
                        enrolment is also removed from the readers. Your records are kept for as long as stated above.
                    </li>
                </ul>
            </Section>

            <Section title="Your rights">
                <p>
                    You can ask for a summary of the information kept about you and who it has been shared with; ask for anything
                    wrong or incomplete to be corrected; ask for information to be erased once it is no longer needed and the law
                    does not require it to be kept; withdraw a choice you made, such as taking a photo when punching (this does
                    not affect what was done before); name someone to act for you if you cannot; and raise a complaint.
                </p>
                <p>
                    Contact your employer&rsquo;s privacy contact below. If you are not satisfied with the answer, you may be able
                    to complain to the Data Protection Board of India.
                </p>
            </Section>

            <Section title="Privacy contact">
                <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-slate-600 dark:text-slate-400">Responsible</dt>
                    <dd>{operator || <Unset>your employer</Unset>}</dd>
                    <dt className="text-slate-600 dark:text-slate-400">Contact</dt>
                    <dd>{c.name || <Unset />}</dd>
                    <dt className="text-slate-600 dark:text-slate-400">Email</dt>
                    <dd>{c.email ? <a className="underline underline-offset-2" href={`mailto:${c.email}`}>{c.email}</a> : <Unset />}</dd>
                    <dt className="text-slate-600 dark:text-slate-400">Phone</dt>
                    <dd>{c.phone || <Unset />}</dd>
                    <dt className="text-slate-600 dark:text-slate-400">Address</dt>
                    <dd className="whitespace-pre-line">{c.address || <Unset />}</dd>
                </dl>
            </Section>

            <Section title="Cookies and browser storage">
                <p>
                    NeevTime uses no advertising or analytics cookies and loads no tracking scripts. To keep you signed in, your
                    browser stores your sign-in token and name until you sign out or the session expires. It also stores display
                    choices such as dark mode, and, for administrators, recent searches (cleared on sign-out). Single sign-on sets
                    one short-lived cookie for up to ten minutes while you sign in. Because all of this is needed for the app to
                    work, NeevTime does not ask for cookie consent.
                </p>
            </Section>

            <Section title="Keeping it secure">
                <p>
                    Passwords are stored only as one-way hashes. Each account sees only what its role allows. Changes to records are
                    logged with who made them. How the system is hosted, including whether connections are encrypted, is set up by
                    your employer.
                </p>
            </Section>

            <p className="text-sm text-slate-600 dark:text-slate-400">
                Last reviewed: {facts?.updated ? formatDate(facts.updated) : <Unset>not yet reviewed by your employer</Unset>}
            </p>
        </LegalLayout>
    );
}
