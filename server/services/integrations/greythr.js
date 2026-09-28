/**
 * greytHR Integration — push attendance swipes via greytHR's Attendance Swipe API.
 *
 *   POST <base>/v2/attendance/asca/swipes
 *     header: X-Requested-With: XMLHttpRequest
 *     form  : id=<API_ID>  swipes=<CRLF-joined csv lines>  sign=<base64 RSA-SHA1 of swipes>
 *   swipe line: <ISO-datetime+offset>,<employee-code>,<door-name>,<1=IN|0=OUT>
 *
 * Auth: API ID + an RSA-SHA1 signature of the swipes string (greytHR holds the
 * public key; we sign with the private key). Verified against greytHR's Node.js
 * sample and their sandbox (HTTP 200). This is the RSA "Attendance Swipe" API
 * — NOT the OAuth2 REST API at api-docs.greythr.com, which is a separate thing.
 *
 * Raw swipe push only — greytHR derives attendance/payroll itself — so the only
 * declared capability is PUSH_ATTENDANCE. Pulling employees/shifts/leave from
 * greytHR is a separate job and is deliberately not pretended here.
 *
 * Config: Base URL (or greytHR Domain), API ID, RSA private key (PEM).
 * Optional: door_name, tz_offset, test_employee, batch_size.
 *
 * API reference: https://api-docs.greythr.com/
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseIntegration, CAPABILITY } = require('../hrms-integration');
const { formatLocal, decodeDirection, resolveDeviceDirections } = require('./punch_format');
const db = require('../../db');

class GreytHRIntegration extends BaseIntegration {
    // Raw swipe push only — greytHR derives attendance/payroll itself.
    static capabilities = [CAPABILITY.PUSH_ATTENDANCE];

    constructor(config) {
        super(config);
        const c = this.config || {};
        this.domain = String(c.domain || '').trim().replace(/\.greythr\.com.*$/i, '');
        this.apiId = String(c.api_id || '').trim();
        this.privateKey = this._normalizePem(c.private_key);
        this.doorName = String(c.door_name || '').trim();
        this.tzOffset = String(c.tz_offset || '+05:30');
        this.testEmployee = String(c.test_employee || '2122').trim();
        this.batchSize = Number.parseInt(c.batch_size, 10) > 0 ? Number.parseInt(c.batch_size, 10) : 200;

        // URL: the Base URL field (this.baseUrl) wins; else greytHR Domain builds
        // https://<domain>.greythr.com. Base URL lets you point at the sandbox
        // (http://<domain>.greythr.com) or any host.
        const host = (this.baseUrl && String(this.baseUrl).trim())
            || (this.domain ? `https://${this.domain}.greythr.com` : '');
        this.swipeUrl = host ? host.replace(/\/+$/, '') + '/v2/attendance/asca/swipes' : '';

        this.client = axios.create({ timeout: 30000, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    }

    /**
     * A private key pasted into a web form often loses its line breaks (becomes
     * one line, or arrives with literal "\n"). OpenSSL then throws
     * DECODER routines::unsupported. Rebuild a canonical PEM: keep the BEGIN/END
     * label, strip all whitespace from the body, re-wrap at 64 chars.
     */
    _normalizePem(key) {
        let s = String(key || '').trim();
        if (!s) return s;
        if (s.includes('\\n')) s = s.replace(/\\n/g, '\n');
        const m = s.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/);
        if (!m) return s;
        const label = m[1].trim();
        const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '');
        const wrapped = (body.match(/.{1,64}/g) || []).join('\n');
        return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
    }

    _swipeLine(record, direction) {
        const local = formatLocal(record.punch_time);
        const iso = `${local.date}T${local.time}.000${this.tzOffset}`;
        const inOut = direction === 'IN' ? '1' : '0';
        const door = this.doorName || record.device_serial || 'Main Door';
        return `${iso},${record.employee_code},${door},${inOut}`;
    }

    _sign(swipesString) {
        const signer = crypto.createSign('RSA-SHA1');
        signer.write(swipesString);
        signer.end();
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
     * greytHR has no read/ping endpoint, so a connection test IS a real push:
     * one swipe for a test employee (default 2122) at the current time. A 200
     * means signing, format, credentials and the endpoint all work end to end.
     */
    async testConnection() {
        try {
            if (!this.swipeUrl) throw new Error('Set the greytHR Domain or a Base URL');
            if (!this.apiId) throw new Error('API ID is required');
            if (!this.privateKey) throw new Error('RSA private key (PEM) is required');
            // Build "now" in the configured offset explicitly, independent of the
            // server process timezone. pushAttendance() reads naive wall-clock
            // times straight from the DB, but a live `new Date()` is a real
            // instant, so format it against tzOffset here instead of _swipeLine.
            const m = /([+-])(\d{2}):(\d{2})/.exec(this.tzOffset) || ['', '+', '00', '00'];
            const offMin = (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
            const w = new Date(Date.now() + offMin * 60000); // shift so UTC getters read wall clock
            const p = (n) => String(n).padStart(2, '0');
            const iso = `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}T`
                + `${p(w.getUTCHours())}:${p(w.getUTCMinutes())}:${p(w.getUTCSeconds())}.000${this.tzOffset}`;
            const door = this.doorName || 'Main Door';
            const line = `${iso},${this.testEmployee},${door},1`;
            const res = await this._postSwipes(line);
            const ok = res.status >= 200 && res.status < 300;
            return {
                success: ok,
                message: ok
                    ? `greytHR accepted a test swipe for employee ${this.testEmployee} (HTTP ${res.status}) at ${this.swipeUrl}`
                    : `greytHR returned HTTP ${res.status}`,
            };
        } catch (err) {
            const detail = err.response
                ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 200)}`
                : err.message;
            return { success: false, message: detail, error: err.message };
        }
    }

    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        if (!records || records.length === 0) return stats;
        if (!this.swipeUrl) { stats.failed = stats.processed = records.length; console.error('greytHR: no URL configured'); return stats; }

        const directions = await resolveDeviceDirections(records);

        for (let i = 0; i < records.length; i += this.batchSize) {
            const chunk = records.slice(i, i + this.batchSize);
            const lines = [], ids = [];
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
                await this._postSwipes(lines.join('\r\n'));
                await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = ANY($1)`, [ids]);
                stats.success += ids.length;
            } catch (err) {
                const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                stats.failed += ids.length;
                if (!stats.failed_details) stats.failed_details = [];
                if (stats.failed_details.length < 5) stats.failed_details.push({ batch: `${ids[0]}..${ids[ids.length - 1]}`, err: String(body).slice(0, 300) });
                console.error(`greytHR swipe push failed (ids ${ids[0]}..${ids[ids.length - 1]}): ${body}`);
            }
        }
        return stats;
    }
}

module.exports = GreytHRIntegration;
