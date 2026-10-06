/**
 * Enter in a field performs the screen's main action.
 *
 * Filter bars and dialogs here are not <form>s with submit buttons, so the
 * browser did nothing on Enter: on First & Last Punch you typed an employee
 * code, pressed Enter, and had to reach for "Calculate". One app-wide
 * listener (hooks/useEnterToSubmit) presses the button marked defaultAction.
 * These pin the pieces so a refactor cannot quietly undo it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../client/src', p), 'utf8');

test('the listener is mounted once, at the app root', () => {
    assert.match(read('App.jsx'), /useEnterToSubmit\(\);/);
    const hook = read('hooks/useEnterToSubmit.js');
    // Textareas keep Enter as a new line; modified Enter and IME input are left alone.
    assert.match(hook, /tagName !== 'INPUT'/);
    assert.match(hook, /e\.isComposing/);
    assert.match(hook, /e\.shiftKey \|\| e\.ctrlKey \|\| e\.altKey \|\| e\.metaKey/);
    // A form that already submits on Enter is left to the browser.
    assert.match(hook, /formHasSubmit\(form\)\) return/);
});

test('Button exposes defaultAction as data-default-action', () => {
    const src = read('components/ui/Button.jsx');
    assert.match(src, /defaultAction = false/);
    assert.match(src, /'data-default-action'/);
});

test('the screens whose action is a button respond to Enter', () => {
    const marked = {
        'pages/reports/FirstLastReport.jsx': 'onClick={calculate}',
        'pages/ReportsLegacy.jsx': 'onClick={generateReport}',
        'pages/ExportCenter.jsx': 'onClick={handleExport}',
        'pages/Settings.jsx': 'onClick={handleSave}',
        'pages/ShiftRotations.jsx': 'onClick={saveRotation}',
        'pages/Employees.jsx': 'onClick={submitTransfer}',
    };
    for (const [file, handler] of Object.entries(marked)) {
        const src = read(file);
        const at = src.indexOf(handler);
        assert.ok(at > -1, `${file}: ${handler} not found`);
        const tag = src.slice(src.lastIndexOf('<Button', at), at);
        assert.match(tag, /defaultAction/, `${file}: ${handler} no longer answers Enter`);
    }
});

test('a small inline form on a bigger page is its own Enter scope', () => {
    // Otherwise Enter in the test-email box would press Settings' Save, or
    // Enter in a setting would send a test email.
    assert.match(read('pages/Settings.jsx'), /data-enter-scope className="col-span-full flex gap-2 flex-wrap"/);
});
