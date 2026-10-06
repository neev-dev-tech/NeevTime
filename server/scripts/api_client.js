/**
 * Issue, list, rotate and revoke the keys that authenticate /api/export.
 *
 * A command-line tool rather than a screen, deliberately. Issuing a credential
 * to an outside company is rare, irreversible in the sense that matters — the
 * plaintext is shown once and never again — and worth the friction of someone
 * being on the server to do it. A button in the UI invites it being done
 * casually, and there is no undo for a key that has already been emailed.
 *
 *   node scripts/api_client.js list
 *   node scripts/api_client.js issue --name "greytHR" \
 *        --scopes attendance:read,employees:read --ips 103.21.58.0/24
 *   node scripts/api_client.js rotate 1
 *   node scripts/api_client.js revoke 1
 *
 * --ips may be omitted while testing, which leaves the key usable from
 * anywhere. It should not stay that way once the vendor's ranges are known.
 */

const crypto = require('node:crypto');
const db = require('../db');
const { hashToken } = require('../middleware/apiKeyAuth');

const KNOWN_SCOPES = ['attendance:read', 'employees:read'];

const parseArgs = (argv) => {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            out[arg.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
        } else {
            out._.push(arg);
        }
    }
    return out;
};

const list = async () => {
    const { rows } = await db.query(
        `SELECT id, name, token_prefix, scopes, allowed_ips, is_active, revoked_at,
                rate_limit_per_minute, last_used_at, last_used_ip, created_at
           FROM api_clients ORDER BY id`
    );
    if (rows.length === 0) {
        console.log('\n  No API clients issued.\n');
        return;
    }
    console.log('');
    for (const r of rows) {
        const state = r.revoked_at ? 'REVOKED' : (r.is_active ? 'active' : 'disabled');
        console.log(`  [${r.id}] ${r.name}  (${state})`);
        console.log(`       key       ${r.token_prefix}…`);
        console.log(`       scopes    ${(r.scopes || []).join(', ') || '(none — this key can read nothing)'}`);
        console.log(`       addresses ${(r.allowed_ips || []).join(', ') || 'ANY — not restricted'}`);
        console.log(`       rate      ${r.rate_limit_per_minute}/min`);
        console.log(`       last used ${r.last_used_at ? `${r.last_used_at.toISOString().slice(0, 19).replace('T', ' ')} from ${r.last_used_ip}` : 'never'}`);
        console.log('');
    }
};

/** Shown once. There is no endpoint and no command that reads a key back. */
const announce = (name, token, extra = '') => {
    console.log('');
    console.log(`  ${name}${extra}`);
    console.log('');
    console.log(`    ${token}`);
    console.log('');
    console.log('  Copy it now — it is stored as a hash and cannot be shown again.');
    console.log('  Send it over a channel the recipient controls, not email.');
    console.log('');
    console.log('  Usage:  Authorization: Bearer <key>   (or  X-API-Key: <key>)');
    console.log('  Verify: GET /api/export/ping');
    console.log('');
};

const issue = async (args) => {
    const name = args.name;
    if (!name || name === true) throw new Error('--name is required');

    const scopes = String(args.scopes || KNOWN_SCOPES.join(','))
        .split(',').map((s) => s.trim()).filter(Boolean);

    const unknown = scopes.filter((s) => !KNOWN_SCOPES.includes(s));
    if (unknown.length) {
        throw new Error(`Unknown scope(s): ${unknown.join(', ')}. Known: ${KNOWN_SCOPES.join(', ')}`);
    }

    const ips = args.ips && args.ips !== true
        ? String(args.ips).split(',').map((s) => s.trim()).filter(Boolean)
        : null;

    const rate = Number.parseInt(args.rate, 10);

    const token = `nvt_${crypto.randomBytes(32).toString('hex')}`;

    const { rows } = await db.query(
        `INSERT INTO api_clients (name, token_hash, token_prefix, scopes, allowed_ips,
                                  rate_limit_per_minute, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
            name,
            hashToken(token),
            token.slice(0, 12),
            scopes,
            ips,
            Number.isInteger(rate) && rate > 0 ? rate : 120,
            process.env.USER || 'cli'
        ]
    );

    announce(name, token, `  —  client #${rows[0].id}`);
    if (!ips) {
        console.log('  WARNING: no address restriction. Set one with a rotate once the');
        console.log('           vendor confirms the addresses they call from.');
        console.log('');
    }
};

/**
 * Replace the secret, keeping the row. The old key stops working the moment
 * this returns, which is what makes it the response to a key that leaked.
 */
const rotate = async (args) => {
    const id = Number.parseInt(args._[1], 10);
    if (!Number.isInteger(id)) throw new Error('Usage: rotate <client id>');

    const token = `nvt_${crypto.randomBytes(32).toString('hex')}`;
    const fields = ['token_hash = $1', 'token_prefix = $2', 'revoked_at = NULL', 'is_active = true'];
    const params = [hashToken(token), token.slice(0, 12)];

    if (args.ips && args.ips !== true) {
        params.push(String(args.ips).split(',').map((s) => s.trim()).filter(Boolean));
        fields.push(`allowed_ips = $${params.length}`);
    }

    params.push(id);
    const { rows } = await db.query(
        `UPDATE api_clients SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING name`,
        params
    );
    if (rows.length === 0) throw new Error(`No client with id ${id}`);

    announce(rows[0].name, token, '  —  rotated, the previous key is now dead');
};

const revoke = async (args) => {
    const id = Number.parseInt(args._[1], 10);
    if (!Number.isInteger(id)) throw new Error('Usage: revoke <client id>');

    const { rows } = await db.query(
        `UPDATE api_clients SET is_active = false, revoked_at = now()
         WHERE id = $1 RETURNING name`,
        [id]
    );
    if (rows.length === 0) throw new Error(`No client with id ${id}`);
    console.log(`\n  Revoked "${rows[0].name}". Calls with that key now answer 401.\n`);
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const cmd = args._[0];
    try {
        if (cmd === 'issue') await issue(args);
        else if (cmd === 'rotate') await rotate(args);
        else if (cmd === 'revoke') await revoke(args);
        else await list();
        process.exit(0);
    } catch (err) {
        console.error(`\n  ${err.message}\n`);
        process.exit(1);
    }
};

if (require.main === module) main();
