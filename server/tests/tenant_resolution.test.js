/**
 * Which customer a request belongs to, and what happens when that is unclear.
 *
 * The dangerous answer to "I cannot tell whose request this is" is to pick one.
 * Every assertion here is really the same assertion: an unresolved tenant is
 * refused, never defaulted.
 */

const test = require('node:test');
const assert = require('node:assert');

const load = (env) => {
    for (const k of ['TENANT_MODE', 'SINGLE_TENANT_ID']) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[require.resolve('../utils/tenant')];
    return require('../utils/tenant');
};

test('a host is reduced to the customer it names', () => {
    const t = load({ TENANT_MODE: 'multi' });
    assert.strictEqual(t.subdomainOf('acme.neevtime.app'), 'acme');
    assert.strictEqual(t.subdomainOf('ACME.NeevTime.app'), 'acme', 'host matching is case sensitive');
    assert.strictEqual(t.subdomainOf('acme.neevtime.app:3001'), 'acme', 'the port confuses it');

    // None of these name a customer, and each must resolve to nothing rather
    // than to the first label that happens to be present.
    assert.strictEqual(t.subdomainOf('neevtime.app'), null, 'the bare domain resolved to a customer');
    assert.strictEqual(t.subdomainOf('www.neevtime.app'), null, 'www resolved to a customer');
    assert.strictEqual(t.subdomainOf('localhost:5173'), null);
    assert.strictEqual(t.subdomainOf('192.168.1.237'), null, 'an IP address resolved to a customer');
    assert.strictEqual(t.subdomainOf(''), null);
    assert.strictEqual(t.subdomainOf(undefined), null);
});

test('on-premise resolves to its single company whatever the host says', async () => {
    const t = load({ TENANT_MODE: 'single' });
    assert.strictEqual(await t.resolve({ headers: { host: '192.168.1.237' } }), 1);
    assert.strictEqual(await t.resolve({ headers: {} }), 1,
        'an on-premise request without a Host header failed to resolve');
    // Someone else's subdomain must not change who an on-premise box serves.
    assert.strictEqual(await t.resolve({ headers: { host: 'acme.neevtime.app' } }), 1);
});

test('on-premise honours a configured company id', async () => {
    const t = load({ TENANT_MODE: 'single', SINGLE_TENANT_ID: '7' });
    assert.strictEqual(await t.resolve({ headers: { host: 'anything' } }), 7);
});

test('a hosted request with no recognisable customer is refused, not defaulted', async () => {
    const t = load({ TENANT_MODE: 'multi' });
    const id = await t.resolve({ headers: { host: 'neevtime.app' } });
    assert.strictEqual(id, null,
        'a hosted request that names no customer resolved to one anyway — every ' +
        'such request would be served from whichever account that is');
});

test('an unresolved tenant produces a refusal, and no database work', async () => {
    const t = load({ TENANT_MODE: 'multi' });
    let nextCalled = false;
    const res = {
        code: null, body: null,
        status(c) { this.code = c; return this; },
        json(b) { this.body = b; return this; }
    };
    await t.withTenantContext({ headers: { host: 'neevtime.app' } }, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'the request continued without a tenant');
    assert.strictEqual(res.code, 404);
});

test('a token issued for one customer does not work at another address', () => {
    const t = load({ TENANT_MODE: 'multi' });
    assert.strictEqual(t.tokenMatchesTenant({ tenantId: 2, user: { company_id: 2 } }), true);
    assert.strictEqual(
        t.tokenMatchesTenant({ tenantId: 3, user: { company_id: 2 } }), false,
        "a session issued for company 2 was accepted at company 3's address"
    );
    // Strings arrive from JSON; the comparison must not be identity-strict.
    assert.strictEqual(t.tokenMatchesTenant({ tenantId: 2, user: { company_id: '2' } }), true);
});

test('a token predating multi-tenancy is accepted on-premise and refused hosted', () => {
    const single = load({ TENANT_MODE: 'single' });
    assert.strictEqual(
        single.tokenMatchesTenant({ tenantId: 1, user: { id: 5, role: 'admin' } }), true,
        'existing sessions on an on-premise box were invalidated by the upgrade'
    );

    const multi = load({ TENANT_MODE: 'multi' });
    assert.strictEqual(
        multi.tokenMatchesTenant({ tenantId: 1, user: { id: 5, role: 'admin' } }), false,
        'a token carrying no company at all was accepted by a hosted deployment'
    );
});
