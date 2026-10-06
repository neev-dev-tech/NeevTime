#!/usr/bin/env node
/**
 * Encrypt HRMS integration credentials that were stored in plain text.
 *
 *     node scripts/encrypt_integration_secrets.js
 *
 * Run once after deploying utils/integrationSecrets, with the SECRETS_KEY (or
 * JWT_SECRET) the server uses — inside the server container. Safe to repeat:
 * already-encrypted values are left alone. Prints counts, never values.
 */
const db = require('../db');
const { encrypt, isEncrypted } = require('../utils/secrets');
const { SECRET_COLUMNS } = require('../utils/integrationSecrets');

(async () => {
    let changed = 0;
    const rows = (await db.query(`SELECT id, ${SECRET_COLUMNS.join(', ')} FROM hrms_integrations`)).rows;
    for (const row of rows) {
        for (const col of SECRET_COLUMNS) {
            const v = row[col];
            if (!v || isEncrypted(v)) continue;
            await db.query(`UPDATE hrms_integrations SET ${col} = $1 WHERE id = $2`, [encrypt(v), row.id]);
            changed += 1;
        }
    }
    console.log(`hrms_integrations: ${rows.length} row(s), ${changed} credential(s) encrypted`);
    process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
