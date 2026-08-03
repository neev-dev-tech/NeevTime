/**
 * Username matching at sign-in.
 *
 * An admin account created as "Mukesh" could not be signed into as "mukesh".
 * Sign-in returns the same message for a missing user and a wrong password — by
 * design, so the form cannot be used to discover which usernames exist — so from
 * the outside the new account simply appeared broken, and the only way to tell
 * the two cases apart was to notice that the failed-attempt counter had not
 * moved.
 *
 * These are structural: they read the source rather than open a connection, so
 * they run anywhere. The behaviour they protect is a single SQL predicate that
 * is easy to "tidy" back into a plain equality.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const authSrc = () => fs.readFileSync(path.join(__dirname, '../routes/auth.js'), 'utf8');
const serverSrc = () => fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

test('sign-in looks users up case-insensitively', () => {
    const src = authSrc();
    assert.ok(
        /lower\(username\)\s*=\s*lower\(\$1\)/.test(src),
        'getUserByUsername no longer folds case — "Mukesh" and "mukesh" are different accounts again'
    );
});

test('no user lookup compares username with plain equality', () => {
    // The exact shape of the regression. reset_admin_password.js is excluded:
    // it hardcodes the literal 'admin' rather than taking user input.
    const offenders = authSrc().split('\n')
        .map((line, i) => ({ line: line.trim(), no: i + 1 }))
        .filter(l => /WHERE\s+username\s*=\s*\$/i.test(l.line));

    assert.deepStrictEqual(offenders, [],
        'case-sensitive username lookup:\n' + offenders.map(o => `  auth.js:${o.no} — ${o.line}`).join('\n'));
});

test('surrounding whitespace does not create a different account', () => {
    // A trailing space pasted into the form is invisible and would otherwise
    // fail the lookup for reasons nobody can see on screen.
    assert.ok(/username\.trim\(\)/.test(authSrc()), 'usernames are not trimmed');
});

test('creating and renaming a user rejects a case-only duplicate', () => {
    // Two accounts differing only by case would make the sign-in lookup pick
    // between them arbitrarily, leaving one of the two permanently unreachable.
    const src = authSrc();
    const checks = src.match(/lower\(username\)\s*=\s*lower\(\$1\)/g) || [];
    assert.ok(checks.length >= 3,
        `expected the case-folded comparison in lookup, create and update; found ${checks.length}`);
    assert.ok(/AND id <> \$2/.test(src),
        'renaming a user does not exclude itself from the duplicate check, so saving a user unchanged would fail');
});

test('the database enforces case-insensitive uniqueness too', () => {
    // Application checks race: two simultaneous creates both see no clash. The
    // index is what actually makes the pair impossible.
    assert.ok(
        /CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uniq ON users \(lower\(username\)\)/.test(serverSrc()),
        'the unique index on lower(username) is missing from ensureSchema'
    );
});

test('a blank or non-string username is refused before it reaches SQL', () => {
    assert.ok(/typeof username !== 'string' \|\| !username\.trim\(\)/.test(authSrc()),
        'an empty or non-string username is passed straight to the query');
});
