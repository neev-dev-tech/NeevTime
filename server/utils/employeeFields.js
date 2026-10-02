/**
 * What an employee row may say when it leaves the server.
 *
 * The employee routes answered with `e.*` / `RETURNING *`, and reads are open
 * to every signed-in role, viewer included. That handed out the portal
 * password hash and the activation-code hash (both offline-crackable), the
 * device PIN in plain text, the SSO subject, and identity-document columns
 * (Aadhaar, passport, licences) plus religion — none of which any screen
 * shows. A sensitive column must be opted out here; anything added to the
 * table later is still returned, which is the safer default for a page that
 * depends on it and the reason this list is explicit rather than an allowlist.
 *
 * The device PIN is replaced by `has_device_password`, so a screen can say
 * whether one is set without ever receiving it. PUT /api/employees/:id keeps
 * the stored PIN when none is sent, so the edit form round-tripping this
 * response cannot wipe it.
 */

const SECRET_FIELDS = [
    'password',                // device PIN, stored in plain text for the readers
    'portal_password_hash',
    'portal_setup_hash',
    'portal_setup_expires',
    'directory_subject',       // the identity provider's immutable user id
];

// Identity documents and a special category of personal data. No screen
// reads or writes them; they stay in the database and out of responses.
const IDENTITY_FIELDS = [
    'aadhaar_no',
    'passport_no',
    'motorcycle_license',
    'automobile_license',
    'religion',
];

const HIDDEN = new Set([...SECRET_FIELDS, ...IDENTITY_FIELDS]);

const publicEmployee = (row) => {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) {
        if (!HIDDEN.has(key)) out[key] = value;
    }
    if ('password' in row) out.has_device_password = Boolean(row.password);
    return out;
};

const publicEmployees = (rows) => (rows || []).map(publicEmployee);

module.exports = { publicEmployee, publicEmployees, SECRET_FIELDS, IDENTITY_FIELDS };
