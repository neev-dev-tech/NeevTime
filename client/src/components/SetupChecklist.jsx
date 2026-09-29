import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Circle, X } from 'lucide-react';
import api from '../api';
import { usePermissions } from '../hooks/usePermissions';

/**
 * First-run checklist on the dashboard.
 *
 * A new install has an order to it that the menu does not show: name the
 * company, connect a reader, bring in people, define a shift, assign it. Each
 * step is read off data the app already holds, so the list ticks itself as the
 * work gets done and disappears once everything is in place. Dismissal is per
 * browser, since it is a convenience and not a setting.
 */

const DISMISS_KEY = 'setup-checklist-dismissed';

export default function SetupChecklist() {
    const { canAdminister } = usePermissions();
    const [steps, setSteps] = useState(null);
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
    });

    useEffect(() => {
        if (dismissed) return;
        let cancelled = false;
        const requests = [
            api.get('/api/branding'),
            api.get('/api/devices'),
            api.get('/api/employees'),
            api.get('/api/shifts'),
            api.get('/api/schedules/employee'),
            canAdminister ? api.get('/api/hrms/integrations') : Promise.resolve(null)
        ];
        Promise.allSettled(requests).then(([brand, devices, employees, shifts, schedules, hrms]) => {
            if (cancelled) return;
            const rows = (r) => (r.status === 'fulfilled' && Array.isArray(r.value?.data) ? r.value.data : null);
            const known = (r) => r.status === 'fulfilled' && r.value !== null;
            // A step whose data could not be read is left out rather than shown
            // as undone — an error is not evidence the work was skipped.
            const list = [];
            if (known(brand)) list.push({
                label: 'Set your company name and logo',
                done: Boolean(brand.value.data?.name && brand.value.data.name !== 'My Company'),
                to: '/settings/company'
            });
            if (rows(devices)) list.push({
                label: 'Connect a biometric device',
                // The self-service mobile app registers itself as a pseudo-device.
                done: rows(devices).some(d => d.serial_number !== 'MOBILE_APP'),
                to: '/devices'
            });
            if (rows(employees)) list.push({
                label: 'Add or import employees',
                done: rows(employees).length > 0,
                to: '/import'
            });
            if (rows(shifts)) list.push({
                label: 'Define a shift',
                done: rows(shifts).length > 0,
                to: '/shifts'
            });
            if (rows(schedules)) list.push({
                label: 'Assign shifts to employees',
                done: rows(schedules).length > 0,
                to: '/schedule/employee'
            });
            if (canAdminister && rows(hrms)) list.push({
                label: 'Connect your HRMS (optional)',
                done: rows(hrms).length > 0,
                to: '/integrations'
            });
            setSteps(list);
        });
        return () => { cancelled = true; };
    }, [dismissed, canAdminister]);

    if (dismissed || !steps || steps.length === 0) return null;
    const done = steps.filter(s => s.done).length;
    if (done === steps.length) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage unavailable */ }
        setDismissed(true);
    };

    return (
        <section aria-labelledby="setup-title" className="card-base">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 id="setup-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Finish setting up</h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{done} of {steps.length} done</p>
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Hide setup checklist"
                >
                    <X size={16} />
                </button>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-[rgb(var(--brand))] transition-[width] duration-300" style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <ol className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {steps.map(step => (
                    <li key={step.label}>
                        <Link
                            to={step.to}
                            className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                            {step.done
                                ? <CheckCircle size={16} className="shrink-0 text-emerald-500" aria-label="Done" />
                                : <Circle size={16} className="shrink-0 text-slate-300 dark:text-slate-600" aria-label="Not done" />}
                            <span className={step.done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}>
                                {step.label}
                            </span>
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}
