/**
 * SAP SuccessFactors Integration
 * 
 * Integrates with SAP SuccessFactors Employee Central:
 * - Pull employees via OData API
 * - Push attendance/time records
 * - Support for various SAP SF modules
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const axios = require('axios');
const https = require('https');
const { BaseIntegration } = require('../hrms-integration');
const { formatLocal, localDate, isCheckIn, resolveDeviceDirections } = require('./punch_format');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class SAPSuccessFactorsIntegration extends BaseIntegration {
    constructor(config) {
        super(config);
        this.companyId = config.config?.company_id;
        this.apiVersion = config.config?.api_version || 'v2';
        this.token = null;
        this.tokenExpiry = null;
    }

    /**
     * Get OAuth token
     */
    async authenticate() {
        try {
            // SAP uses OAuth2 with assertion
            const tokenUrl = `${this.baseUrl}/oauth/token`;

            const response = await axios.post(tokenUrl, new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:saml2-bearer',
                company_id: this.companyId,
                client_id: this.apiKey,
                client_secret: this.apiSecret,
                user_id: this.username,
                assertion: this.generateSAMLAssertion()
            }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                httpsAgent: httpsAgent
            });

            this.token = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return this.token;
        } catch (err) {
            // Fallback to basic auth if OAuth fails
            console.warn('SAP OAuth failed, using basic auth:', err.message);
            return null;
        }
    }

    /**
     * Generate SAML assertion (simplified)
     */
    generateSAMLAssertion() {
        // In production, this would generate a proper SAML2 assertion
        // For now, return a placeholder
        return Buffer.from(`${this.username}:${this.password}`).toString('base64');
    }

    /**
     * Get authorization header
     */
    async getAuthHeader() {
        // Check if token is valid
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return `Bearer ${this.token}`;
        }

        // Try OAuth
        const token = await this.authenticate();
        if (token) {
            return `Bearer ${token}`;
        }

        // Fallback to basic auth
        return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }

    /**
     * Make OData request
     */
    async odata(path, method = 'GET', data = null) {
        const authHeader = await this.getAuthHeader();

        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/odata/${this.apiVersion}/${path}`,
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data,
                timeout: 30000,
                httpsAgent: httpsAgent
            });

            return response.data;
        } catch (err) {
            throw new Error(`SAP OData error: ${err.response?.data?.error?.message || err.message}`);
        }
    }

    /**
     * Test connection
     */
    async testConnection() {
        try {
            const authHeader = await this.getAuthHeader();
            const response = await axios.get(`${this.baseUrl}/odata/v2/User?$top=1`, {
                headers: { 'Authorization': authHeader },
                httpsAgent: httpsAgent
            });

            return {
                success: true,
                message: 'Connected to SAP SuccessFactors',
                data: { records: response.data.d?.results?.length || 0 }
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
     * Pull employees from SAP SuccessFactors
     */
    async pullEmployees() {
        try {
            const response = await this.odata(
                `User?$select=userId,username,firstName,lastName,email,cellPhone,department,jobCode,status&$filter=status eq 'active'`
            );

            const employees = (response.d?.results || []).map(emp => ({
                employee_code: emp.userId,
                name: `${emp.firstName} ${emp.lastName}`.trim(),
                email: emp.email,
                mobile: emp.cellPhone,
                department_name: emp.department,
                designation: emp.jobCode,
                sap_user_id: emp.userId
            }));

            return employees;
        } catch (err) {
            throw new Error(`SAP pull employees failed: ${err.message}`);
        }
    }

    /**
     * Push attendance to SAP SuccessFactors Time Management
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        const directions = await resolveDeviceDirections(records);

        // Group by employee and local calendar date
        const grouped = {};
        for (const record of records) {
            const recordDate = localDate(record.punch_time);
            if (!recordDate) continue;
            const key = `${record.employee_code}_${recordDate}`;
            if (!grouped[key]) {
                grouped[key] = { employee: record.employee_code, date: recordDate, records: [] };
            }
            grouped[key].records.push(record);
        }

        for (const [key, group] of Object.entries(grouped)) {
            stats.processed++;
            try {
                // Sort records
                group.records.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

                const dirOf = (r) => directions[r.device_serial] || 'in';
                const firstIn = group.records.find(r => isCheckIn(r.punch_state, dirOf(r)));
                // reverse() mutates, so copy first — the original sorted the array
                // in place and then searched the reversed copy of itself
                const lastOut = [...group.records].reverse().find(r => !isCheckIn(r.punch_state, dirOf(r)));

                // Create time entry in SAP
                await this.odata('EmployeeTime', 'POST', {
                    userId: group.employee,
                    timeType: 'ATTENDANCE',
                    startDate: `/Date(${new Date(group.date).getTime()})/`,
                    startTime: firstIn ? formatLocal(firstIn.punch_time).time : null,
                    endTime: lastOut ? formatLocal(lastOut.punch_time).time : null
                });

                const ids = group.records.map(r => r.id);
                // Mark as synced (sync_status is boolean)
                await db.query(`UPDATE attendance_logs SET sync_status = true WHERE id = ANY($1)`, [ids]);

                stats.success++;
            } catch (err) {
                stats.failed++;
                console.error(`SAP attendance push failed for ${group.employee}:`, err.message);
            }
        }

        return stats;
    }

    /**
     * Get departments from SAP
     */
    async getDepartments() {
        const response = await this.odata('FODepartment?$select=externalCode,name');
        return response.d?.results || [];
    }
}

module.exports = SAPSuccessFactorsIntegration;
