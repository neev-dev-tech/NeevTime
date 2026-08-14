/**
 * HRMS Integration Routes
 * 
 * API endpoints for managing HRMS integrations:
 * - Configure integrations (ERPNext, Odoo, Horilla, Webhooks)
 * - Test connections
 * - Trigger manual sync
 * - View sync logs
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const hrmsIntegration = require('../services/hrms-integration');

// ==========================================
// INTEGRATION MANAGEMENT
// ==========================================

// Get all integrations
router.get('/integrations', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                i.*,
                (SELECT COUNT(*) FROM integration_sync_logs WHERE integration_id = i.id AND status = 'success') as success_count,
                (SELECT COUNT(*) FROM integration_sync_logs WHERE integration_id = i.id AND status = 'failed') as failed_count
            FROM hrms_integrations i
            ORDER BY i.created_at DESC
        `);

        // Mask sensitive fields
        const integrations = result.rows.map(i => ({
            ...i,
            api_key: i.api_key ? '***' + i.api_key.slice(-4) : null,
            api_secret: i.api_secret ? '****' : null,
            password: i.password ? '****' : null
        }));

        res.json(integrations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get integration by ID
router.get('/integrations/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM hrms_integrations WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Integration not found' });
        }

        const integration = result.rows[0];
        // Mask sensitive fields
        integration.api_key = integration.api_key ? '***' + integration.api_key.slice(-4) : null;
        integration.api_secret = integration.api_secret ? '****' : null;
        integration.password = integration.password ? '****' : null;

        res.json(integration);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create integration
router.post('/integrations', async (req, res) => {
    try {
        const {
            name, type, base_url, api_key, api_secret, username, password,
            database_name, sync_employees, sync_attendance, sync_leaves,
            sync_interval_minutes, config
        } = req.body;

        const result = await db.query(`
            INSERT INTO hrms_integrations 
            (name, type, base_url, api_key, api_secret, username, password, database_name,
             sync_employees, sync_attendance, sync_leaves, sync_interval_minutes, config)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            name, type, base_url, api_key, api_secret, username, password, database_name,
            sync_employees ?? true, sync_attendance ?? true, sync_leaves ?? true,
            sync_interval_minutes || 30, JSON.stringify(config || {})
        ]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update integration
router.put('/integrations/:id', async (req, res) => {
    try {
        const {
            name, type, base_url, api_key, api_secret, username, password,
            database_name, is_active, sync_employees, sync_attendance, sync_leaves,
            sync_interval_minutes, config
        } = req.body;

        const result = await db.query(`
            UPDATE hrms_integrations SET
                name = COALESCE($2, name),
                type = COALESCE($3, type),
                base_url = COALESCE($4, base_url),
                api_key = CASE WHEN $5 LIKE '***%' OR $5 = '****' THEN api_key ELSE COALESCE($5, api_key) END,
                api_secret = CASE WHEN $6 = '****' THEN api_secret ELSE COALESCE($6, api_secret) END,
                username = COALESCE($7, username),
                password = CASE WHEN $8 = '****' THEN password ELSE COALESCE($8, password) END,
                database_name = COALESCE($9, database_name),
                is_active = COALESCE($10, is_active),
                sync_employees = COALESCE($11, sync_employees),
                sync_attendance = COALESCE($12, sync_attendance),
                sync_leaves = COALESCE($13, sync_leaves),
                sync_interval_minutes = COALESCE($14, sync_interval_minutes),
                config = COALESCE($15, config),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            req.params.id, name, type, base_url, api_key, api_secret, username, password,
            database_name, is_active, sync_employees, sync_attendance, sync_leaves,
            sync_interval_minutes, config ? JSON.stringify(config) : null
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Integration not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete integration
router.delete('/integrations/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM hrms_integrations WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Integration not found' });
        }
        res.json({ success: true, message: 'Integration deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CONNECTION TESTING
// ==========================================

// Test integration connection
router.post('/integrations/:id/test', async (req, res) => {
    try {
        const integration = await hrmsIntegration.getIntegrationInstance(req.params.id);
        const result = await integration.testConnection();
        res.json(result);
    } catch (err) {
        console.error('Integration test error:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ==========================================
// MANUAL SYNC
// ==========================================

// Trigger manual sync for employees
router.post('/integrations/:id/sync/employees', async (req, res) => {
    try {
        const integration = await hrmsIntegration.getIntegrationInstance(req.params.id);
        const stats = await hrmsIntegration.syncEmployeesFromHRMS(integration);
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Trigger manual sync for attendance
router.post('/integrations/:id/sync/attendance', async (req, res) => {
    try {
        const integration = await hrmsIntegration.getIntegrationInstance(req.params.id);
        const stats = await hrmsIntegration.syncAttendanceToHRMS(integration);
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Trigger full sync (all types)
router.post('/integrations/:id/sync/full', async (req, res) => {
    try {
        const integration = await hrmsIntegration.getIntegrationInstance(req.params.id);
        const results = {};

        // Pull employees
        try {
            results.employees = await hrmsIntegration.syncEmployeesFromHRMS(integration);
        } catch (err) {
            console.error('Employee sync error:', err);
            results.employees = { error: err.message };
        }

        // Push attendance
        try {
            results.attendance = await hrmsIntegration.syncAttendanceToHRMS(integration);
        } catch (err) {
            console.error('Attendance sync error:', err);
            results.attendance = { error: err.message };
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('Full sync error:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ==========================================
// SYNC LOGS
// ==========================================

// Get sync logs for integration
router.get('/integrations/:id/logs', async (req, res) => {
    try {
        const { limit = 50, sync_type, status } = req.query;
        let whereClause = 'integration_id = $1';
        const params = [req.params.id, parseInt(limit)];

        if (sync_type) {
            params.push(sync_type);
            whereClause += ` AND sync_type = $${params.length}`;
        }
        if (status) {
            params.push(status);
            whereClause += ` AND status = $${params.length}`;
        }

        const result = await db.query(`
            SELECT * FROM integration_sync_logs
            WHERE ${whereClause}
            ORDER BY started_at DESC
            LIMIT $2
        `, params);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// FIELD MAPPINGS
// ==========================================

// Get field mappings for integration
router.get('/integrations/:id/mappings', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM integration_field_mappings
            WHERE integration_id = $1
            ORDER BY entity_type, local_field
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set field mappings for integration
router.post('/integrations/:id/mappings', async (req, res) => {
    try {
        const { mappings } = req.body;  // Array of { entity_type, local_field, remote_field, ... }

        // Delete existing mappings
        await db.query('DELETE FROM integration_field_mappings WHERE integration_id = $1', [req.params.id]);

        // Insert new mappings
        for (const mapping of mappings) {
            await db.query(`
                INSERT INTO integration_field_mappings
                (integration_id, entity_type, local_field, remote_field, transform_function, is_required, default_value)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                req.params.id, mapping.entity_type, mapping.local_field, mapping.remote_field,
                mapping.transform_function, mapping.is_required || false, mapping.default_value
            ]);
        }

        res.json({ success: true, count: mappings.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// INTEGRATION TYPES
// ==========================================

// Get available integration types with documentation
router.get('/integration-types', (req, res) => {
    res.json([
        {
            type: 'erpnext',
            name: 'ERPNext / Frappe',
            description: 'Connect to ERPNext HRMS or Frappe Framework based systems',
            documentation: 'https://frappeframework.com/docs/user/en/api',
            required_fields: ['base_url', 'api_key', 'api_secret'],
            features: ['pull_employees', 'push_attendance', 'push_leaves'],
            icon: '🏢',
            color: '#0089FF'
        },
        {
            type: 'odoo',
            name: 'Odoo',
            description: 'Connect to Odoo ERP/HRMS (versions 14-17)',
            documentation: 'https://www.odoo.com/documentation/17.0/developer/reference/external_api.html',
            required_fields: ['base_url', 'database_name', 'username', 'password'],
            // Matches OdooIntegration.capabilities. resource.calendar and
            // hr.leave exist in Odoo but are not pulled yet.
            features: ['pull_employees', 'push_attendance'],
            unsupported: ['shifts', 'holidays', 'leave'],
            icon: '🟣',
            color: '#714B67'
        },
        {
            type: 'horilla',
            name: 'Horilla',
            description: 'Connect to Horilla Open Source HRMS',
            documentation: 'https://github.com/horlocom/horilla',
            required_fields: ['base_url', 'username', 'password'],
            // Matches HorillaIntegration.capabilities. Horilla models shifts and
            // leave; this adapter does not pull them yet, and claiming otherwise
            // in the picker is how someone ends up with a deployment that counts
            // every public holiday as an absence.
            features: ['pull_employees', 'push_attendance'],
            unsupported: ['shifts', 'holidays', 'leave'],
            icon: '🌿',
            color: '#4CAF50'
        },
        {
            type: 'webhook',
            name: 'Generic Webhook / API',
            description: 'Connect to any system via webhooks or REST API',
            required_fields: ['base_url'],
            optional_fields: ['api_key', 'api_secret', 'username', 'password'],
            features: ['configurable_endpoints', 'field_mappings', 'multiple_auth_methods'],
            icon: '🔗',
            color: '#FF9800'
        }
    ]);
});

module.exports = router;
