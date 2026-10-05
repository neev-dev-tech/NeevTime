/**
 * HRMS integration credentials, encrypted at rest.
 *
 * hrms_integrations.api_secret and .password are the keys to the payroll /
 * HR system — with them anyone can read or rewrite every employee there. They
 * were stored in plain text, so any database dump or backup carried them. They
 * now go through utils/secrets (AES-256-GCM, key from SECRETS_KEY, falling
 * back to JWT_SECRET) on the way in, and are decrypted only where a
 * connection is actually made.
 *
 * Values written before this change are plain text; decrypt() returns those
 * unchanged, so nothing breaks before scripts/encrypt_integration_secrets.js
 * has been run, and the next save encrypts them anyway.
 */

const { encrypt, decrypt, isEncrypted } = require('./secrets');

const SECRET_COLUMNS = ['api_secret', 'password'];

/** Encrypt a submitted secret. The form's mask and empty values pass through. */
const sealSecret = (value) => {
    if (value === null || value === undefined || value === '' || value === '****') return value;
    return encrypt(String(value));
};

/**
 * A row with its secrets decrypted, for building a connection. A secret that
 * no longer decrypts (the key changed) fails with a message that says what to
 * do, rather than a crypto stack trace in the sync log.
 */
const openIntegration = (row) => {
    if (!row) return row;
    const out = { ...row };
    for (const col of SECRET_COLUMNS) {
        if (!isEncrypted(out[col])) continue;
        try {
            out[col] = decrypt(out[col]);
        } catch {
            throw new Error(
                `The stored ${col.replace('_', ' ')} for integration "${row.name || row.id}" cannot be decrypted — `
                + 'SECRETS_KEY (or JWT_SECRET, if SECRETS_KEY is not set) has changed. Enter it again under Integrations.'
            );
        }
    }
    return out;
};

/** What a response may show: whether a secret is set, never the secret. */
const maskIntegration = (row) => {
    if (!row) return row;
    return {
        ...row,
        api_key: row.api_key ? '***' + String(row.api_key).slice(-4) : null,
        api_secret: row.api_secret ? '****' : null,
        password: row.password ? '****' : null,
    };
};

module.exports = { SECRET_COLUMNS, sealSecret, openIntegration, maskIntegration };
