/**
 * A closed <Modal> still builds its children.
 *
 * Modal returns null when `open` is false, but JSX evaluates its children
 * before the component ever decides that. So a body that dereferences state
 * which is null while the dialog is shut runs on every render of the page
 * behind it, not just when the dialog opens.
 *
 * This shipped. The Employees transfer dialog read
 * `transferType.toLowerCase()` with transferType initialised to null, and
 * moving it from `{showTransferModal && (...)}` to `open={showTransferModal}`
 * took the whole Employees page to the error boundary on load:
 * `can't access property "toLowerCase", K is null`.
 *
 * The check that was run at migration time only looked for the body reading its
 * own guard variable. That was too narrow — the guard here was showTransferModal
 * and the crash was in transferType, a different piece of state entirely.
 *
 * Run by `npm run build`, alongside lint:break.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (entry.endsWith('.jsx')) out.push(full);
    }
    return out;
};

/** Protected on its own line: optional chaining, a ternary, a short-circuit. */
const guardedOnLine = (line, name) =>
    line.includes(`${name}?.`) ||
    new RegExp(`\\b${name}\\s*\\?[^.]`).test(line) ||
    new RegExp(`\\b${name}\\s*&&`).test(line);

/**
 * Protected by an enclosing block — `{importResult && (` opened above and still
 * open here. Judged by indentation: a guard that starts further left than this
 * line, with nothing at or left of that column since, is still wrapping it.
 * Without this every line of a guarded block is reported, which is noise loud
 * enough to make the check worth ignoring.
 */
const guardedByBlock = (lines, index, name) => {
    const indentOf = (l) => l.length - l.trimStart().length;
    const here = indentOf(lines[index]);
    for (let i = index - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim()) continue;
        const ind = indentOf(line);
        if (ind >= here) continue;                    // nested deeper: not an enclosing block
        if (new RegExp(`\\{\\s*${name}\\s*&&`).test(line)) return true;
        if (new RegExp(`\\{\\s*${name}\\s*\\?`).test(line)) return true;
        if (ind === 0) break;
    }
    return false;
};

const problems = [];

for (const file of walk('src')) {
    const src = readFileSync(file, 'utf8');

    const nullable = new Set(
        [...src.matchAll(/const \[(\w+),\s*set\w+\]\s*=\s*useState\(\s*(?:null|undefined)\s*\)/g)]
            .map(m => m[1])
    );
    if (!nullable.size) continue;

    // Values a `return` above the JSX has already proved non-null, e.g.
    // `if (!employee) return (...)` in EmployeeProfile.
    const proven = new Set(
        [...src.matchAll(/if\s*\(\s*!(\w+)\s*\)\s*return/g)].map(m => m[1])
    );

    for (const open of [...src.matchAll(/<Modal\b/g)]) {
        // An outer `guard && (` immediately above means the body never builds
        // while closed, which is exactly the fix.
        const before = src.slice(Math.max(0, open.index - 300), open.index);
        if (/&&\s*\(\s*$/.test(before.replace(/\{\/\*[\s\S]*?\*\/\}\s*$/, ''))) continue;

        const close = src.indexOf('</Modal>', open.index);
        if (close < 0) continue;
        const body = src.slice(open.index, close);
        const bodyLine0 = src.slice(0, open.index).split('\n').length;

        const lines = body.split('\n');
        lines.forEach((line, i) => {
            for (const name of nullable) {
                if (proven.has(name)) continue;
                const deref = new RegExp(`(?<![.\\w?])${name}\\.\\w`);
                if (!deref.test(line)) continue;
                if (guardedOnLine(line, name)) continue;
                if (guardedByBlock(lines, i, name)) continue;
                problems.push({ file, line: bodyLine0 + i, name, text: line.trim().slice(0, 90) });
            }
        });
    }
}

if (problems.length) {
    console.error('\nUnguarded <Modal> body reads state that is null while closed:\n');
    for (const p of problems) {
        console.error(`  ${p.file}:${p.line}`);
        console.error(`    ${p.name} is useState(null) — ${p.text}`);
    }
    console.error(
        '\nA closed Modal still builds its children. Either keep the outer\n' +
        '`{guard && state && (` around it, or make the read optional.\n'
    );
    process.exit(1);
}

console.log('modal guards ok');
