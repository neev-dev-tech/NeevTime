/**
 * The list of things this application can connect to.
 *
 * Adding a service used to mean editing four places: a constant in
 * INTEGRATION_TYPE, a pair of cases in a switch, an entry in the picker route,
 * and — if you remembered — the capability list. Miss the last one and the
 * adapter runs pulls it has not implemented, receives nothing from the base
 * class, and reports success. Miss the picker and nobody can select it.
 *
 * One entry per service, here. The resolver, the picker and the capability
 * checks all read from this, so they cannot disagree with each other.
 *
 * To add a service:
 *   1. write the adapter, extending BaseIntegration, declaring `static
 *      capabilities` for what it genuinely implements;
 *   2. add one entry below;
 *   3. run the tests — they check the declaration against the code.
 *
 * Deliberately not here: SAP SuccessFactors, Workday, BambooHR and Zoho People.
 * Each gates its API behind a partner agreement, a reviewed OAuth application
 * or a paid tier. A self-hosted attendance system cannot satisfy those on a
 * customer's behalf, so an adapter for them is a button that can never work.
 * They go through the Webhook adapter, which asks nothing of the far end beyond
 * posting JSON. RETIRED_TYPES in hrms-integration.js says so to anyone who
 * still has one configured.
 */

const ADAPTERS = [
    {
        type: 'erpnext',
        name: 'ERPNext / Frappe HR',
        description: 'Open source ERP with a full HR module',
        documentation: 'https://frappeframework.com/docs/user/en/api',
        load: () => require('./erpnext'),
        aliases: [],
        required_fields: ['base_url', 'api_key', 'api_secret'],
        icon: '🧾',
        color: '#0089FF'
    },
    {
        type: 'odoo',
        name: 'Odoo',
        description: 'Open source ERP. Employees and attendance only — see capabilities.',
        documentation: 'https://www.odoo.com/documentation/master/developer/reference/external_api.html',
        load: () => require('./odoo'),
        aliases: [],
        required_fields: ['base_url', 'username', 'password'],
        icon: '🟣',
        color: '#875A7B'
    },
    {
        type: 'horilla',
        name: 'Horilla',
        description: 'Open source HRMS. Employees and attendance only — see capabilities.',
        documentation: 'https://github.com/horilla-opensource/horilla',
        load: () => require('./horilla'),
        aliases: [],
        required_fields: ['base_url', 'username', 'password'],
        icon: '🌿',
        color: '#4CAF50'
    },
    {
        type: 'webhook',
        name: 'Generic Webhook / API',
        description: 'Any system that can post JSON. The way to connect a vendor with a closed API.',
        load: () => require('./webhook'),
        // custom_api was a separate type in the old switch, resolving to the
        // same class. Kept as an alias so existing rows keep working.
        aliases: ['custom_api'],
        required_fields: ['base_url'],
        icon: '🔗',
        color: '#64748B'
    }
];

const byType = new Map();
for (const entry of ADAPTERS) {
    byType.set(entry.type, entry);
    for (const alias of entry.aliases || []) byType.set(alias, entry);
}

/** The adapter entry for a stored integration type, or undefined. */
const find = (type) => byType.get(String(type || '').trim().toLowerCase());

/**
 * What this adapter can do, read off the class rather than duplicated here.
 * Two lists that must agree is one list that eventually will not.
 */
const capabilitiesOf = (entry) => {
    try {
        const Adapter = entry.load();
        return Adapter.capabilities || [];
    } catch {
        return [];
    }
};

/** Every service, with its real capabilities. For the picker and the UI. */
const list = () => ADAPTERS.map(entry => ({
    type: entry.type,
    name: entry.name,
    description: entry.description,
    documentation: entry.documentation,
    required_fields: entry.required_fields,
    icon: entry.icon,
    color: entry.color,
    capabilities: capabilitiesOf(entry)
}));

module.exports = { ADAPTERS, find, list, capabilitiesOf };
