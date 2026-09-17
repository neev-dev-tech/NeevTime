/**
 * greytHR Integration — push attendance swipes via greytHR's Attendance Swipe API.
 *
 * This is the RSA-signed Swipe API (per greytHR's help doc + their sample
 * Java/Python client), NOT the OAuth2 V2 REST API:
 *
 *   POST https://<domain>.greythr.com/v2/attendance/asca/swipes
 *     header: X-Requested-With: XMLHttpRequest
 *     form  : id=<API_ID>  swipes=<csv lines>  sign=<base64 RSA-SHA1 of swipes>
 *   swipe line: <ISO-datetime+offset>,<employee-code>,<door-name>,<1=IN|0=OUT>
 *     e.g. 2026-09-17T09:09:00.000+05:30,40,Main Door,1
 *
 * Auth is a per-account **API ID** plus an **RSA signature**: greytHR holds the
 * public key; we sign the swipes string with the matching private key. There is
 * no OAuth token.
 *
 * Config: domain (subdomain), api_id, private_key (PEM). Optional: door_name,
 * tz_offset, batch_size.
 *
 * CONFIRM against greytHR's sample script (centralised so it's a one-line
 * change): the signing detail in `_sign` (algorithm, what exactly is signed),
 * the line separator and datetime precision in `_swipeLine`. Node's crypto does
 * RSA-SHA1 (a.k.a. SHA1withRSA) natively — a direct port of their client.
 * Direction is greytHR's convention here: 1 = IN, 0 = OUT.
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseIntegration } = require('../hrms-integration');
const { formatLocal, decodeDirection, resolveDeviceDirections } = require('./punch_format');
const db = require('../../db');

class GreytHRIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        const c = this.config || {};
        this.domain = String(c.domain || '').trim().replace(/\.greythr\.com.*$/i, '');
        this.apiId = String(c.api_id || '').trim();
        this.privateKey = c.private_key || '';           // RSA private key, PEM
        this.doorName = String(c.door_name || '').trim(); // optional; else device serial
        this.tzOffset = String(c.tz_offset || '+05:30');  // deployment is IST
        this.batchSize = Number.parseInt(c.batch_size, 10) > 0 ? Number.parseInt(c.batch_size, 10) : 200;

        this.swipeUrl = this.domain ? `https://${this.domain}.greythr.com/v2/attendance/asca/swipes` : '';
        this.client = axios.create({
            timeout: 30000,
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
    }

    /** One greytHR swipe line for a punch. */
    _swipeLine(record, direction) {
        const local = formatLocal(record.punch_time);
        const iso = `${local.date}T${local.time}.000${this.tzOffset}`; // 2026-09-17T09:09:00.000+05:30
        const inOut = direction === 'IN' ? '1' : '0';                  // greytHR: 1=IN, 0=OUT
        const door = this.doorName || record.device_serial || 'Main Door';
        return `${iso},${record.employee_code},${door},${inOut}`;
    }

    /** base64( RSA-SHA1( swipesString ) ) — greytHR's signature over the swipes payload. */
    _sign(swipesString) {
        const signer = crypto.createSign('RSA-SHA1');
        signer.update(swipesString, 'utf8');
        return signer.sign(this.privateKey, 'base64');
    }

    async _postSwipes(swipesString) {
        const form = new URLSearchParams();
        form.append('id', this.apiId);
        form.append('swipes', swipesString);
        form.append('sign', this._sign(swipesString));
        return this.client.post(this.swipeUrl, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
    }

    /**
     * No cheap read endpoint on the Swipe API, so a "test" validates the config
     * and that the private key actually signs. The real proof is a small push.
     */
    async testConnection() {
        try {
            if (!this.domain) throw new Error('greytHR domain is required');
            if (!this.apiId) throw new Error('API ID is required');
            if (!this.privateKey) throw new Error('RSA private key is required');
            this._sign('test'); // throws if the key is not a usable PEM
            return {
                success: true,
                message: `Config OK. Swipes will POST to ${this.swipeUrl}. Run a small push to confirm greytHR accepts them.`,
            };
        } catch (err) {
            return { success: false, message: err.message, error: err.message };
        }
    }

    /**
     * Push new punches as swipes, in batches (the API takes many swipe lines per
     * call). A batch is marked synced only if greytHR accepted it, so a failure
     * is retried next run and nothing is lost or double-sent.
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        if (!records || records.length === 0) return stats;
        if (!this.swipeUrl) { stats.failed = records.length; stats.processed = records.length; console.error('greytHR: domain not configured'); return stats; }

        const directions = await resolveDeviceDirections(records);

        for (let i = 0; i < records.length; i += this.batchSize) {
            const chunk = records.slice(i, i + this.batchSize);
            const lines = [];
            const ids = [];
            for (const r of chunk) {
                stats.processed++;
                const local = formatLocal(r.punch_time);
                if (!local) { stats.failed++; continue; }
                const dir = decodeDirection(r.punch_state, directions[r.device_serial] || 'in');
                lines.push(this._swipeLine(r, dir));
                ids.push(r.id);
            }
            if (lines.length === 0) continue;

            try {
                await this._postSwipes(lines.join('\n'));
                await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = ANY($1)`, [ids]);
                stats.success += ids.length;
            } catch (err) {
                const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                stats.failed += ids.length;
                if (!stats.failed_details) stats.failed_details = [];
                if (stats.failed_details.length < 5) {
                    stats.failed_details.push({ batch: `${ids[0]}..${ids[ids.length - 1]}`, err: String(body).slice(0, 300) });
                }
                console.error(`greytHR swipe push failed (ids ${ids[0]}..${ids[ids.length - 1]}): ${body}`);
            }
        }
        return stats;
    }
}

module.exports = GreytHRIntegration;
