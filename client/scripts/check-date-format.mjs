/**
 * Dates are DD/MM/YYYY everywhere, and only one file decides that.
 *
 * Before this, 26 call sites across 16 files called `toLocaleDateString()`
 * directly. A bare call follows the *viewer's browser locale*, so the same
 * muster roll rendered 4/3/2026 on a machine set to US English and 3/4/2026 on
 * one set to en-GB, with nothing on screen to say which was in force. Several
 * other sites passed 'en-US' explicitly and rendered "Aug 16, 2026" beside
 * tables showing 8/16/2026.
 *
 * For an Indian attendance system this is not cosmetic. A muster roll is a
 * statutory document, and a date an inspector can read two ways is a finding.
 *
 * So: no call site formats a date itself. Import formatDate / formatDateTime /
 * formatDateWithWeekday from utils/dateFormat instead. If a new format is
 * genuinely needed, add it there where every page picks it up at once.
 *
 * A weekday- or month-name-only call (a chart axis reading "Mon") is not a date
 * and is allowed.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src', import.meta.url).pathname;

// The one file allowed to format dates.
const OWNER = 'utils/dateFormat.js';

// Options that produce a weekday or month name on its own — a label, not a date.
const LABEL_ONLY = /toLocaleDateString\([^)]*\{\s*(weekday|month)\s*:\s*'[^']*'\s*\}\s*\)/;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
});

const offenders = [];

for (const file of walk(SRC)) {
    if (!/\.(jsx?|mjs)$/.test(file)) continue;
    const rel = relative(SRC, file);
    if (rel === OWNER) continue;

    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!line.includes('toLocaleDateString')) return;
        if (LABEL_ONLY.test(line)) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
}

if (offenders.length) {
    console.error(
        `\n${offenders.length} call site(s) format a date locally instead of using utils/dateFormat:\n`
    );
    offenders.forEach((o) => console.error(`  ${o}`));
    console.error(
        '\nUse formatDate / formatDateTime / formatDateWithWeekday so every screen agrees.' +
        '\nA date that reads differently per browser is not a display detail on a' +
        '\nstatutory register.\n'
    );
    process.exit(1);
}

console.log('Date formatting: all call sites use utils/dateFormat');
