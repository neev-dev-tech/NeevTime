/**
 * greytHR Integration — push raw attendance swipes to greytHR (cloud SaaS).
 *
 * Built for THIS deployment's (older) integration framework: extends
 * BaseIntegration, resolved by the switch in hrms-integration.js. greytHR owns
 * payroll and the attendance rules; NeevTime owns the punches — so this uploads
 * raw swipes and lets greytHR build the muster.
 *
 * Auth is OAuth2 client-credentials: POST client id + secret (with the API key)
 * to /uas/v1/oauth2/client-token, cache the bearer, refresh before expiry.
 *
 * CONFIRM against the customer's greytHR "API Details" page (centralised so it's
 * a one-line change): swipe endpoint (`config.swipe_path`), swipe field names
 * (`_buildSwipe`), token/header shape (`_getToken`/`_authHeaders`).
 * Reference: https://api-docs.greythr.com/
 */

const axios = require('axios');
const { BaseIntegration } = require('../hrms-integration');
const { formatLocal, decodeDirection, resolveDeviceDirections } = require('./punch_format');
const db = require('../../db');

const DEFAULT_BASE = 'https://api.greythr.com';
const TOKEN_PATH = '/uas/v1/oauth2/client-token';
const DEFAULT_SWIPE_PATH = '/attendance/v2/swipe';

class GreytHRIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.baseUrl = (this.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
        this.clientId = (this.config && this.config.client_id) || this.username;
        this.clientSecret = (this.config && this.config.client_secret) || this.apiSecret;
        this.domain = (this.config && this.config.domain) || '';
        this.swipePath = (this.config && this.config.swipe_path) || DEFAULT_SWIPE_PATH;

        this.client = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
        this._token = null;
        this._tokenExpiresAt = 0;
    }

    async _getToken(force = false) {
        const now = Date.now();
        if (!force && this._token && now < this._tokenExpiresAt - 60000) return this._token;

        const res = await this.client.post(
            TOKEN_PATH,
            { client_id: this.clientId, client_secret: this.clientSecret },
            { headers: { 'access-token': (this.apiKey || '').trim(), 'Content-Type': 'application/json' } }
        );
        const token = res.data && (res.data.access_token || res.data.token);
        if (!token) throw new Error('greytHR client-token response carried no access_token');

        this._token = token;
        this._tokenExpiresAt = now + ((Number(res.data.expires_in) || 3600) * 1000);
        return token;
    }

    _authHeaders(token) {
        const h = {
            'Authorization': `Bearer ${token}`,
            'access-token': (this.apiKey || '').trim(),
            'Content-Type': 'application/json',
        };
        if (this.domain) h['x-greythr-domain'] = this.domain;
        return h;
    }

    async testConnection() {
        try {
            await this._getToken(true);
            return { success: true, message: 'greytHR authenticated (client-token acquired)' };
        } catch (err) {
            return {
                success: false,
                message: (err.response && err.response.data) ? JSON.stringify(err.response.data) : err.message,
                error: err.message,
            };
        }
    }

    _buildSwipe(record, direction) {
        const local = formatLocal(record.punch_time);
        return {
            employeeNo: record.employee_code,
            date: local.date,   // YYYY-MM-DD (local IST)
            time: local.time,   // HH:mm:ss   (local IST)
            inOut: direction,   // 'IN' | 'OUT'
        };
    }

    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        if (!records || records.length === 0) return stats;

        let token = await this._getToken();
        const directions = await resolveDeviceDirections(records);

        for (const record of records) {
            stats.processed++;
            try {
                const local = formatLocal(record.punch_time);
                if (!local) { stats.failed++; continue; }

                const direction = decodeDirection(record.punch_state, directions[record.device_serial] || 'in');

                try {
                    await this.client.post(this.swipePath, this._buildSwipe(record, direction), { headers: this._authHeaders(token) });
                } catch (err) {
                    if (err.response && err.response.status === 401) {
                        token = await this._getToken(true);
                        await this.client.post(this.swipePath, this._buildSwipe(record, direction), { headers: this._authHeaders(token) });
                    } else {
                        throw err;
                    }
                }

                await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`, [record.id]);
                stats.success++;
            } catch (err) {
                const body = (err.response && err.response.data) ? JSON.stringify(err.response.data) : err.message;
                if (/duplicate|already exists|already recorded|already present/i.test(body)) {
                    await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`, [record.id]);
                    stats.success++;
                } else {
                    stats.failed++;
                    if (!stats.failed_details) stats.failed_details = [];
                    if (stats.failed_details.length < 5) stats.failed_details.push({ emp: record.employee_code, err: String(body).slice(0, 200) });
                    console.error(`greytHR swipe push failed for ${record.employee_code}: ${body}`);
                }
            }
        }
        return stats;
    }
}

module.exports = GreytHRIntegration;
