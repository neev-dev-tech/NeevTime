/**
 * Personal data and secrets that responses, logs and the audit trail must not
 * carry. Each of these was found handed out to any signed-in role (viewer
 * included) or copied somewhere with no retention.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('employee responses drop credentials and identity numbers', () => {
    const { publicEmployee } = require('../utils/employeeFields');
    const row = {
        id: 1, employee_code: '001', name: 'A', mobile: '98',
        password: '1234', portal_password_hash: '$2b$x', portal_setup_hash: '$2b$y',
        portal_setup_expires: 'x', directory_subject: 'sub',
        aadhaar_no: '1111', passport_no: 'P1', motorcycle_license: 'M', automobile_license: 'C', religion: 'R',
    };
    const out = publicEmployee(row);
    for (const k of ['password', 'portal_password_hash', 'portal_setup_hash', 'portal_setup_expires',
        'directory_subject', 'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion']) {
        assert.ok(!(k in out), `${k} is returned`);
    }
    assert.strictEqual(out.has_device_password, true);
    assert.strictEqual(out.mobile, '98');
    assert.strictEqual(publicEmployee({ id: 2, password: '' }).has_device_password, false);
});

test('every employee route answers through publicEmployee', () => {
    const src = read('server.js');
    // The list, the single read, create, update and patch.
    assert.match(src, /res\.json\(publicEmployees\(result\.rows\)\)/);
    assert.ok((src.match(/publicEmployee\(result\.rows\[0\]\)/g) || []).length >= 4,
        'an employee route returns the raw row again');
});

test('saving an employee keeps the device PIN the browser never received', () => {
    assert.match(read('server.js'), /password = COALESCE\(\$6, password\)/);
});

test('device command text masks PINs and biometric templates', () => {
    const { redactCommandText } = require('../utils/commandRedaction');
    const user = redactCommandText('DATA UPDATE USERINFO PIN=7\tName=A\tPasswd=4321\tCard=9');
    assert.ok(!user.includes('4321'));
    assert.match(user, /PIN=7/);
    const tmp = redactCommandText('DATA UPDATE FINGERTMP PIN=7\tFID=1\tTmp=QUJDREVGR0hJSktM');
    assert.ok(!tmp.includes('QUJDREVGR0hJSktM'));
    assert.match(tmp, /Tmp=\[template, 16 chars\]/);
    assert.match(read('server.js'), /res\.json\(redactCommands\(result\.rows\)\)/);
    const sync = read('routes/device_sync.js');
    assert.match(sync, /res\.json\(redactCommands\(items\)\)/);
    assert.match(sync, /res\.json\(redactCommands\(history\)\)/);
});

test('document lists carry no file content; the file is admin/HR only', () => {
    const src = read('routes/personnel_expansion.js');
    assert.ok(!/SELECT ed\.\*/.test(src), 'a document list selects ed.* (file content) again');
    assert.match(src, /router\.get\('\/employee-docs\/file\/:id', requireRole\('admin', 'hr'\)/);
    assert.match(src, /DOC_MAX_BYTES/);
});

test('the request log keeps that a file was sent, not the file', () => {
    const { redact } = require('../utils/systemLogger');
    const out = redact({
        file_data: 'x'.repeat(2000), photo: 'y'.repeat(50), aadhaar_no: '1234',
        latitude: 12.97, longitude: 77.59, reason: 'sick', password: 'p', note: 'z'.repeat(800),
    });
    assert.strictEqual(out.file_data, '[2000 chars]');
    assert.strictEqual(out.photo, '[50 chars]');
    assert.strictEqual(out.aadhaar_no, '[redacted]');
    assert.strictEqual(out.latitude, '[location]');
    assert.strictEqual(out.password, '[redacted]');
    assert.strictEqual(out.note, '[800 chars]');
    assert.strictEqual(out.reason, 'sick');
});

test('portal refuses deleted and terminated staff, at sign-in and on every request', () => {
    const src = read('routes/portal.js');
    assert.ok(!/IS DISTINCT FROM 'resigned'/.test(src), 'a portal check excludes only resigned staff again');
    const guard = src.slice(src.indexOf('const requireEmployee'), src.indexOf('router.use(requireEmployee)'));
    assert.match(guard, /NOT IN \('resigned', 'deleted', 'terminated'\)/,
        'the per-request guard no longer re-checks the account');
});

test('the live socket needs a staff token', () => {
    const src = read('server.js');
    assert.match(src, /io\.use\(\(socket, next\) =>/);
    assert.match(src, /payload\.role === 'employee'/);
});

test('the audit trail drops secrets and identity numbers', () => {
    const sql = read('migrations/021_audit_drops_secrets_and_ids.sql');
    for (const k of ['portal_password_hash', 'portal_setup_hash', 'ingest_token', 'aadhaar_no', 'religion']) {
        assert.ok(sql.includes(`'${k}'`), `${k} is not removed from the audit copy`);
    }
});

test('the example environment ships no usable secrets', () => {
    const env = fs.readFileSync(path.join(__dirname, '../../env.example'), 'utf8');
    for (const key of ['JWT_SECRET', 'DB_PASSWORD', 'ADMIN_PASSWORD']) {
        const line = env.split('\n').find(l => l.startsWith(`${key}=`));
        assert.ok(line, `${key} is missing from env.example`);
        assert.strictEqual(line, `${key}=`, `${key} has a value in env.example`);
    }
});

test('Node trusts only the loopback proxy by default', () => {
    assert.match(read('server.js'), /app\.set\('trust proxy', process\.env\.TRUST_PROXY \|\| 'loopback'\)/);
});

test('the privacy notice facts are public, and never invented', () => {
    const src = read('server.js');
    const mount = src.indexOf("app.use('/api/privacy-notice'");
    const gate = src.indexOf("app.use('/api', authenticateToken);");
    assert.ok(mount > -1 && gate > -1 && mount < gate,
        'the notice must be readable before sign-in: mount it above the auth layer');
    // Who answers privacy questions is the employer's decision — seeded empty.
    const seeds = [...src.matchAll(/\['privacy', '(\w+)', '([^']*)'/g)];
    assert.ok(seeds.length >= 6, 'privacy settings are not seeded');
    for (const [, key, value] of seeds) assert.strictEqual(value, '', `${key} is seeded with a value`);
    const route = read('routes/privacy.js');
    assert.ok(!/employees|attendance_logs|users/.test(route.replace(/\/\*[\s\S]*?\*\//g, '')),
        'the public notice route reads personal data');
});
