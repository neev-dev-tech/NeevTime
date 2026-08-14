/**
 * Generic Webhook Integration
 * 
 * Flexible webhook-based integration for any HRMS/ERP:
 * - Push events to custom webhook endpoints
 * - Pull data from REST APIs
 * - Configurable field mappings
 * - Support for various auth methods
 * 
 * Works with:
 * - Zoho People
 * - BambooHR
 * - SAP SuccessFactors
 * - Workday
 * - Custom HRMS
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const axios = require('axios');
const crypto = require('crypto');
const https = require('https');
const { BaseIntegration, CAPABILITY } = require('../hrms-integration');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class WebhookIntegration extends BaseIntegration {
    /**
     * Whatever the far end chooses to send. Shifts, holidays and leave have no
 * agreed shape over a generic webhook, so they are not claimed.
     *
     * Anything not listed here is skipped by the sync with a reason, rather
     * than running, returning nothing and reporting success.
     */
    static capabilities = [CAPABILITY.EMPLOYEES, CAPABILITY.PUSH_ATTENDANCE, CAPABILITY.PUSH_LEAVE];

    constructor(config) {
        super(config);

        // Webhook configuration from config JSON
        this.webhookConfig = config.config || {};
        this.authType = this.webhookConfig.auth_type || 'api_key';  // api_key, bearer, basic, oauth2, hmac
        this.endpoints = this.webhookConfig.endpoints || {};
        this.headers = this.webhookConfig.headers || {};
    }

    /**
     * Build authentication headers
     */
    getAuthHeaders() {
        const headers = { ...this.headers };

        switch (this.authType) {
            case 'bearer':
                headers['Authorization'] = `Bearer ${this.apiKey}`;
                break;
            case 'basic':
                const basicAuth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
                headers['Authorization'] = `Basic ${basicAuth}`;
                break;
            case 'api_key':
                if (this.webhookConfig.api_key_header) {
                    headers[this.webhookConfig.api_key_header] = this.apiKey;
                } else {
                    headers['X-API-Key'] = this.apiKey;
                }
                break;
            case 'oauth2':
                // OAuth2 requires token refresh logic
                if (this.token) {
                    headers['Authorization'] = `Bearer ${this.token}`;
                }
                break;
        }

        return headers;
    }

    /**
     * Sign request with HMAC (for systems like Zoho)
     */
    signRequest(payload) {
        if (!this.apiSecret) return null;

        const hmac = crypto.createHmac('sha256', this.apiSecret);
        hmac.update(JSON.stringify(payload));
        return hmac.digest('hex');
    }

    /**
     * Make HTTP request
     */
    async request(method, url, data = null) {
        const headers = this.getAuthHeaders();

        if (this.authType === 'hmac' && data) {
            headers['X-Webhook-Signature'] = this.signRequest(data);
        }

        try {
            const response = await axios({
                method,
                url: url.startsWith('http') ? url : `${this.baseUrl}${url}`,
                data,
                headers,
                timeout: 30000,
                httpsAgent: httpsAgent
            });
            return response.data;
        } catch (err) {
            throw new Error(err.response?.data?.message || err.message);
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            const testEndpoint = this.endpoints.test || this.endpoints.employees || '/api/test';
            const response = await this.request('GET', testEndpoint);
            return {
                success: true,
                message: 'Connection successful',
                data: response
            };
        } catch (err) {
            return {
                success: false,
                message: err.message,
                error: err.message
            };
        }
    }

    /**
     * Pull employees from configured endpoint
     */
    async pullEmployees() {
        const endpoint = this.endpoints.employees || '/api/employees';

        try {
            const response = await this.request('GET', endpoint);

            // Extract employees array from response
            let employees = response;
            if (this.webhookConfig.employees_path) {
                // Navigate to nested path like "data.employees"
                const pathParts = this.webhookConfig.employees_path.split('.');
                for (const part of pathParts) {
                    employees = employees[part];
                }
            }

            // Apply field mappings
            return Array.isArray(employees) ? employees.map(emp => this.mapFields('employee', emp)) : [];
        } catch (err) {
            throw new Error(`Webhook pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to webhookendpoint
     */
    async pushAttendance(records) {
        const endpoint = this.endpoints.attendance || '/api/attendance';
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        // Check if batch mode is enabled
        if (this.webhookConfig.batch_mode) {
            // Send all records in one request
            try {
                const payload = {
                    records: records.map(r => this.mapFields('attendance', r)),
                    timestamp: new Date().toISOString()
                };

                await this.request('POST', endpoint, payload);

                // Mark all as synced. sync_status is VARCHAR, not boolean
                const ids = records.map(r => r.id);
                // sync_status is VARCHAR; writing a boolean stored 'true', which
                // never matches the != 'synced' filter, so the record was re-pushed
                // on every cycle and duplicated in the HR system
                await db.query(`
                    UPDATE attendance_logs SET sync_status = 'synced' WHERE id = ANY($1)
                `, [ids]);

                stats.processed = records.length;
                stats.success = records.length;
            } catch (err) {
                stats.processed = records.length;
                stats.failed = records.length;
                console.error('Webhook batch attendance push failed:', err.message);
            }
        } else {
            // Send individual records
            for (const record of records) {
                stats.processed++;
                try {
                    const payload = this.mapFields('attendance', record);
                    await this.request('POST', endpoint, payload);

                    // sync_status is VARCHAR; writing a boolean stored 'true', which
                // never matches the != 'synced' filter, so the record was re-pushed
                // on every cycle and duplicated in the HR system
                    await db.query(`
                        UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1
                    `, [record.id]);

                    stats.success++;
                } catch (err) {
                    stats.failed++;
                    console.error(`Webhook attendance push failed:`, err.message);
                }
            }
        }

        return stats;
    }

    /**
     * Push employee event (create/update/delete)
     */
    async pushEmployeeEvent(eventType, employee) {
        const endpoint = this.endpoints.employee_events || this.endpoints.employees || '/api/employees';

        try {
            const payload = {
                event: eventType,
                data: this.mapFields('employee', employee),
                timestamp: new Date().toISOString()
            };

            return await this.request('POST', endpoint, payload);
        } catch (err) {
            throw new Error(`Webhook employee event failed: ${err.message}`);
        }
    }

    /**
     * Push leave request
     */
    async pushLeaves(records) {
        const endpoint = this.endpoints.leaves || '/api/leaves';
        const stats = { processed: 0, success: 0, failed: 0 };

        for (const record of records) {
            stats.processed++;
            try {
                const payload = this.mapFields('leave', record);
                await this.request('POST', endpoint, payload);
                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`Webhook leave push failed:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Send real-time attendance event (for live sync)
     */
    async sendRealtimeEvent(eventType, data) {
        const endpoint = this.endpoints.realtime || this.endpoints.events || '/api/events';

        try {
            const payload = {
                event_type: eventType,
                data: data,
                timestamp: new Date().toISOString(),
                source: 'attendance_system'
            };

            if (this.authType === 'hmac') {
                payload.signature = this.signRequest(payload);
            }

            return await this.request('POST', endpoint, payload);
        } catch (err) {
            console.error('Webhook realtime event failed:', err.message);
        }
    }
}

module.exports = WebhookIntegration;
