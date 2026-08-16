/**
 * Encryption for credentials held in the database.
 *
 * Backup destinations need secrets — an S3 secret key, an SFTP password, a
 * SharePoint client secret. Each of those can read or overwrite every backup
 * this system takes, which makes them worth more than most rows in the
 * database: an attacker with the dumps has the biometric identifiers and the
 * payroll evidence without needing the application at all.
 *
 * So they are encrypted at rest with a key that lives outside the database. A
 * stolen dump of app_settings is then useless on its own, which is the whole
 * point — the thing being protected IS the dump.
 *
 * AES-256-GCM. Authenticated, so tampering is detected rather than producing
 * plausible garbage.
 *
 * The key comes from SECRETS_KEY. If that is not set it is derived from
 * JWT_SECRET, which every deployment already has — weaker, because two secrets
 * then share one origin, but far better than plaintext and it needs no action
 * from an existing installation. Deployments that care should set SECRETS_KEY
 * and rotate.
 */

const crypto = require('node:crypto');

const PREFIX = 'enc:v1:';

/** 32 bytes, derived so any length of input works. */
const key = () => {
    const source = process.env.SECRETS_KEY || process.env.JWT_SECRET;
    if (!source) {
        throw new Error(
            'Cannot encrypt credentials: neither SECRETS_KEY nor JWT_SECRET is set.'
        );
    }
    // Fixed salt: this must be deterministic across restarts or every stored
    // secret becomes unreadable on the next boot. The salt is not the secret.
    return crypto.scryptSync(source, 'neevtime-secrets-v1', 32);
};

/** True for a value produced by encrypt(). Safe on null and on plaintext. */
const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

/**
 * Encrypt a string. Returns `enc:v1:<iv>:<tag>:<ciphertext>`, all base64.
 *
 * An empty value is returned unchanged — "no secret set" should stay visibly
 * empty rather than becoming an opaque blob that looks configured.
 */
const encrypt = (plain) => {
    if (plain === null || plain === undefined || plain === '') return '';
    if (isEncrypted(plain)) return plain;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);

    return PREFIX + [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join(':');
};

/**
 * Decrypt a value produced by encrypt().
 *
 * A value that was never encrypted is returned as-is. That is deliberate: it
 * lets a deployment that stored a secret in plaintext before this existed keep
 * working, and the next save encrypts it.
 */
const decrypt = (value) => {
    if (!isEncrypted(value)) return value ?? '';

    const [iv, tag, data] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]).toString('utf8');
};

/**
 * What to show in an API response or a form: whether a secret is set, never the
 * secret itself. A form that renders the real value leaks it to anyone who can
 * open the page or read the response in a browser's network tab.
 */
const mask = (value) => (value ? '••••••••' : '');

/** True when a submitted field is the mask, meaning "leave it alone". */
const isMask = (value) => value === '••••••••';

module.exports = { encrypt, decrypt, isEncrypted, mask, isMask };
