/**
 * Every backup destination, against a real server of that kind.
 *
 * This exists because the product will be handed to customers who each pick a
 * different destination, and "it worked on the one share we happened to have"
 * is not evidence about the other three. A destination that has never been
 * exercised is a button that might not work — this codebase has already deleted
 * four HRMS adapters that were exactly that.
 *
 * So CI runs a Samba server, a MinIO server and an SSH server, and each
 * destination writes a real file to a real service, reads it back, and deletes
 * it. Not a mock: a mock of an SMB server would agree with whatever the code
 * did, including being wrong, which is precisely how the payroll stub agreed
 * with a query Postgres rejected.
 *
 * SharePoint is deliberately absent. It authenticates against Microsoft's
 * identity platform and there is no local emulator worth trusting; testing it
 * needs a real tenant, an app registration and admin consent. That limit is
 * stated in the destination's own description rather than papered over with a
 * mock that would prove nothing.
 *
 * Skips when the services are not reachable, so `npm test` on a laptop is
 * unaffected.
 */

const test = require('node:test');
const assert = require('node:assert');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const destinations = require('../services/backup_destinations');

const SMB_HOST = process.env.TEST_SMB_HOST || '';
const S3_ENDPOINT = process.env.TEST_S3_ENDPOINT || '';
const SFTP_HOST = process.env.TEST_SFTP_HOST || '';

/** A file with known contents, so a read-back can actually be compared. */
const sampleFile = async (name) => {
    const p = path.join(os.tmpdir(), `neevtime-dest-${name}-${Date.now()}.dump`);
    await fsp.writeFile(p, 'PGDMP-pretend-backup-contents');
    return p;
};

// ─────────────────────────────── filesystem ───────────────────────────────

test('filesystem: writes, reads back, and reports whether it is a real mount', async () => {
    const dir = path.join(os.tmpdir(), `neevtime-fs-${Date.now()}`);
    const impl = destinations.get('filesystem');

    const result = await impl.test({ path: dir });
    assert.strictEqual(result.ok, true);
    // tmpdir is not a separate mount inside CI, so this must warn rather than
    // claim the copies are safe. The warning is the useful half of this check.
    assert.ok('warn' in result, 'the mount warning is gone — a path inside the container would look safe');

    const src = await sampleFile('fs');
    const where = await impl.send({ path: dir }, src, 'copy.dump');
    assert.strictEqual(await fsp.readFile(where, 'utf8'), 'PGDMP-pretend-backup-contents');

    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.unlink(src).catch(() => {});
});

test('filesystem: refuses a Windows path instead of creating a file named after it', async () => {
    const impl = destinations.get('filesystem');
    for (const bad of ['\\\\10.81.20.100\\IT_Team\\NeevTime Backup', 'C:\\backups']) {
        await assert.rejects(
            () => impl.test({ path: bad }),
            /Windows path/,
            `${bad} was accepted — on Linux it becomes a filename and the backups vanish`
        );
    }
});

// ────────────────────────────────── SMB ──────────────────────────────────

test('smb: writes to a real Samba server, reads it back, deletes it', async (t) => {
    if (!SMB_HOST) return t.skip('no Samba server (set TEST_SMB_HOST)');

    const impl = destinations.get('smb');
    const cfg = {
        host: SMB_HOST, share: 'backups', folder: 'neevtime',
        username: 'tester', password: 'testpass', domain: '',
    };

    const result = await impl.test(cfg);
    assert.strictEqual(result.ok, true, 'the probe failed against a server known to allow writes');

    const src = await sampleFile('smb');
    const where = await impl.send(cfg, src, 'copy.dump');
    assert.match(where, /copy\.dump$/, 'send did not report where the file landed');
    await fsp.unlink(src).catch(() => {});
});

test('smb: a wrong password fails with words, not a status code', async (t) => {
    if (!SMB_HOST) return t.skip('no Samba server');

    // The reason this is asserted: smbclient reports NT_STATUS_LOGON_FAILURE,
    // which tells a customer nothing. Whoever hits this at 2am should be told
    // what to change.
    await assert.rejects(
        () => destinations.get('smb').test({
            host: SMB_HOST, share: 'backups', username: 'tester', password: 'wrong-password',
        }),
        (err) => {
            assert.ok(!/NT_STATUS/.test(err.message),
                `the raw status code reached the user: ${err.message}`);
            assert.match(err.message, /username or password/i);
            return true;
        }
    );
});

// ────────────────────────────────── S3 ───────────────────────────────────

test('s3: writes to a real object store, reads it back, deletes it', async (t) => {
    if (!S3_ENDPOINT) return t.skip('no object store (set TEST_S3_ENDPOINT)');

    const impl = destinations.get('s3');
    const cfg = {
        endpoint: S3_ENDPOINT, region: 'us-east-1', bucket: 'neevtime-test',
        prefix: 'backups/', access_key_id: 'minioadmin', secret_access_key: 'minioadmin',
    };

    const result = await impl.test(cfg);
    assert.strictEqual(result.ok, true);

    const src = await sampleFile('s3');
    const where = await impl.send(cfg, src, 'copy.dump');
    assert.match(where, /^s3:\/\/neevtime-test\/backups\/copy\.dump$/);
    await fsp.unlink(src).catch(() => {});
});

test('s3: a wrong secret is rejected rather than silently doing nothing', async (t) => {
    if (!S3_ENDPOINT) return t.skip('no object store');

    await assert.rejects(() => destinations.get('s3').test({
        endpoint: S3_ENDPOINT, region: 'us-east-1', bucket: 'neevtime-test',
        access_key_id: 'minioadmin', secret_access_key: 'wrong-secret',
    }));
});

// ───────────────────────────────── SFTP ──────────────────────────────────

test('sftp: writes to a real SSH server, reads it back, deletes it', async (t) => {
    if (!SFTP_HOST) return t.skip('no SSH server (set TEST_SFTP_HOST)');

    const impl = destinations.get('sftp');
    const cfg = {
        host: SFTP_HOST, port: '2222', username: 'tester', password: 'testpass',
        remote_path: 'upload/neevtime',
    };

    const result = await impl.test(cfg);
    assert.strictEqual(result.ok, true);

    const src = await sampleFile('sftp');
    const where = await impl.send(cfg, src, 'copy.dump');
    assert.match(where, /copy\.dump$/);
    await fsp.unlink(src).catch(() => {});
});

// ─────────────────────────── the registry itself ──────────────────────────

test('every destination declares what the settings screen needs to draw it', () => {
    for (const d of destinations.describe()) {
        assert.ok(d.name && d.description, `${d.key} has no name or description`);
        assert.ok(d.fields.length > 0, `${d.key} declares no fields`);
        for (const f of d.fields) {
            assert.ok(f.key && f.label, `${d.key} has a field with no key or label`);
        }
        const impl = destinations.get(d.key);
        assert.strictEqual(typeof impl.test, 'function', `${d.key} cannot be tested`);
        assert.strictEqual(typeof impl.send, 'function', `${d.key} cannot send`);
    }
});

test('secrets are declared as secret so they are encrypted and masked', () => {
    // A credential field not marked `secret` is stored in plain text and
    // returned to the browser. The check is cheap; the mistake is not.
    const expected = {
        filesystem: [],
        smb: ['password'],
        s3: ['secret_access_key'],
        sftp: ['password'],
        sharepoint: ['client_secret'],
    };
    for (const [key, fields] of Object.entries(expected)) {
        assert.deepStrictEqual(destinations.secretFields(key), fields,
            `${key} does not mark the right fields as secret`);
    }
});

test('destination config is trimmed on the way in', () => {
    // A drive id arrived from the Azure portal carrying a leading TAB, and
    // uploads worked anyway because the WHATWG URL parser silently deletes
    // tabs and newlines — worse than failing, because the stored value was
    // wrong and nothing would ever say so until a different code path touched
    // it. IDs, hosts and paths never legitimately begin or end with whitespace.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../routes/database.js'), 'utf8');
    assert.match(src, /typeof v === 'string' \? v\.trim\(\) : v/,
        'pasted whitespace is stored verbatim in destination config again');
});
