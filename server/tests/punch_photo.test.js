/**
 * Photo at the moment of a punch.
 *
 * The competitive gap this closes is buddy punching, which Truein and Jibble
 * sell on. A reviewable image removes most of it without face matching — which
 * would bring an accuracy claim and a far heavier consent obligation for
 * biometric data under the DPDP Act.
 *
 * The validation is security-relevant rather than cosmetic. These are
 * photographs of employees, written to disk from client input and served back
 * to a browser afterwards. Three things matter: the bytes really are an image,
 * the size is bounded, and no filename can escape its directory.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { savePunchPhoto, PHOTO_DIR } = require('../routes/mobile_attendance');

// Real files of each type, so the magic-byte check has something genuine to
// accept rather than a hand-made header that only resembles one.
const JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
    + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

const url = (mime, buf) => `data:image/${mime};base64,${buf.toString('base64')}`;

test.after(async () => {
    try {
        for (const f of await fsp.readdir(PHOTO_DIR)) {
            if (f.startsWith('ZZTEST')) await fsp.unlink(path.join(PHOTO_DIR, f));
        }
    } catch { /* nothing was written */ }
});

test('a real JPEG is stored, and the name gives nothing away', async () => {
    const name = await savePunchPhoto(url('jpeg', JPEG), 'ZZTEST1');
    assert.match(name, /^ZZTEST1-\d+-[a-f0-9]{12}\.jpg$/);

    // Predictable names would let anyone holding one URL walk the directory.
    // These are pictures of people.
    const second = await savePunchPhoto(url('jpeg', JPEG), 'ZZTEST1');
    assert.notStrictEqual(name, second, 'two photos were given the same name');

    assert.deepStrictEqual(
        await fsp.readFile(path.join(PHOTO_DIR, name)), JPEG,
        'the stored bytes are not what was sent'
    );
});

test('a real PNG is stored', async () => {
    assert.match(await savePunchPhoto(url('png', PNG), 'ZZTEST2'), /\.png$/);
});

test('no photo is not an error — the punch still happens', async () => {
    // Attendance is the record that must not be lost. A camera that failed is
    // not a reason to refuse someone's clock-in.
    for (const nothing of [null, '', undefined]) {
        assert.strictEqual(await savePunchPhoto(nothing, 'ZZTEST3'), null);
    }
});

test('the bytes must be an image, whatever the caller calls them', async () => {
    // Any caller can label anything image/jpeg, and this file is later served
    // back to a browser — so the declared type is worth nothing and the header
    // decides.
    await assert.rejects(
        () => savePunchPhoto(url('jpeg', Buffer.from('<script>alert(1)</script>')), 'ZZTEST4'),
        /not a JPEG or PNG/,
        'a script was accepted because it claimed to be a JPEG'
    );
});

test('a data URL that is not an image at all is refused', async () => {
    for (const bad of [
        'not-a-data-url',
        'data:text/html;base64,PGgxPmhpPC9oMT4=',
        'data:image/svg+xml;base64,PHN2Zy8+',   // SVG can carry script
    ]) {
        await assert.rejects(() => savePunchPhoto(bad, 'ZZTEST5'), /JPEG or PNG/);
    }
});

test('an oversized photo is refused, and told what arrived', async () => {
    // The client downscales to roughly 40-80 KB, so anything near the limit did
    // not come from the app. The message names the actual size rather than
    // saying "too large", because the difference tells you which it was.
    const huge = Buffer.concat([JPEG, Buffer.alloc(3 * 1024 * 1024)]);
    await assert.rejects(
        () => savePunchPhoto(url('jpeg', huge), 'ZZTEST6'),
        /KB; the limit is 2 MB/
    );
});

test('the employee code cannot break out of the filename', async () => {
    const name = await savePunchPhoto(url('jpeg', JPEG), '../../etc/ZZTEST7');
    assert.ok(!name.includes('/'), `the name contains a path separator: ${name}`);
    assert.ok(!name.includes('..'), `the name can traverse: ${name}`);
});

test('the route serving photos accepts nothing but a plain filename', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '../routes/mobile_attendance.js'), 'utf8');
    assert.ok(/punch-photo\/:name/.test(src), 'the photo route has moved or gone');
    assert.ok(/\[A-Za-z0-9_-\]\+\\\.\(jpg\|png\)\$/.test(src),
        'the serve route no longer constrains the filename — path traversal is back');

    const allowed = /^[A-Za-z0-9_-]+\.(jpg|png)$/;
    for (const bad of ['../../../etc/passwd', 'a/../../b.jpg', 'x.jpg.exe', 'x.svg', '.env']) {
        assert.ok(!allowed.test(bad), `${bad} would have been served`);
    }
    assert.ok(allowed.test('EMP1-1234567890-abcdef123456.jpg'));
});

test('photos expire — personal data with no end date is a liability', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '../routes/mobile_attendance.js'), 'utf8');
    assert.match(src, /punch_photo_retention_days/,
        'nothing purges punch photos');
    assert.match(src, /UPDATE attendance_logs SET photo_path = NULL/,
        'the file is deleted while the record still points at it');
    // The attendance record itself is payroll evidence with a multi-year
    // obligation and must never be removed by this.
    assert.ok(!/DELETE FROM attendance_logs/.test(src),
        'the photo purge deletes attendance records');
});
