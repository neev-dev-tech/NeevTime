import { useEffect } from 'react';

/**
 * Enter in a field does what the screen is for.
 *
 * A browser submits on Enter only inside a <form> with a submit button. Most
 * screens here are not forms — a filter bar and a "Calculate" button, a dialog
 * whose Save sits in the footer — so typing an employee code and pressing
 * Enter did nothing; the button had to be clicked.
 *
 * One listener for the whole app. On Enter in a text field or select:
 *   - inside a form that has a submit button, the browser already handles it;
 *   - otherwise the button marked `defaultAction` (data-default-action) in the
 *     same scope is pressed — scope being the nearest dialog, form or element
 *     marked data-enter-scope, else the page. A small inline form inside a
 *     larger page (a test-email box on Settings) marks itself as a scope so its
 *     Enter does not press the page's Save, and vice versa.
 *
 * Never acts on: textareas (Enter is a new line), Shift/Ctrl/Alt/Meta+Enter,
 * an IME composition, a field whose own handler already used the key, a
 * combobox with its list open, or a disabled or hidden button.
 */

const SCOPE = '[data-enter-scope], [role="dialog"], form';
const SKIP_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']);

const isField = (el) => {
    if (!el || el.isContentEditable) return false;
    if (el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return !SKIP_INPUT_TYPES.has((el.getAttribute('type') || 'text').toLowerCase());
};

const isUsable = (btn) => !btn.disabled && btn.getAttribute('aria-disabled') !== 'true'
    && btn.offsetParent !== null; // rendered and not display:none

const formHasSubmit = (form) => {
    if (form.querySelector('button:not([type]), button[type="submit"], input[type="submit"]')) return true;
    return Boolean(form.id && document.querySelector(`[type="submit"][form="${CSS.escape(form.id)}"]`));
};

export function findDefaultAction(field) {
    const scope = field.closest(SCOPE) || document.body;
    // A dialog's footer is inside the dialog but outside its <form>, so a field
    // in that form looks in the whole dialog — for the form's own button or
    // the dialog's.
    const dialog = scope.tagName === 'FORM' ? scope.closest('[role="dialog"]') : null;
    const root = dialog || scope;
    const candidates = [...root.querySelectorAll('[data-default-action]')].filter((btn) => {
        // Only buttons that belong to this scope, not to a nested one.
        const owner = btn.closest(SCOPE) || document.body;
        return owner === scope || owner === dialog;
    });
    return candidates.find(isUsable) || null;
}

export default function useEnterToSubmit() {
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
            if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            const field = e.target;
            if (!isField(field)) return;
            if (field.getAttribute('aria-expanded') === 'true') return;
            if (field.dataset.enter === 'off') return;

            const form = field.form || field.closest('form');
            if (form && formHasSubmit(form)) return; // the browser submits it

            const btn = findDefaultAction(field);
            if (!btn) return;
            e.preventDefault();
            btn.click();
        };
        // Bubble phase, so a field's own Enter handler runs first and can claim the key.
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
}
