const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
require('dotenv').config();

/**
 * The tenant a piece of work belongs to, carried without threading it through
 * every function.
 *
 * The alternative was adding a company_id argument to 614 query sites across 84
 * files. Async local storage keeps it on the execution context instead: the
 * request middleware puts it here, and every query underneath — however deep,
 * through however many awaits — sets it on the connection it borrows. Postgres
 * does the filtering from there.
 */
const tenantContext = new AsyncLocalStorage();

/** Run `fn` with every query inside it scoped to `tenantId`. */
const withTenant = (tenantId, fn) => tenantContext.run({ tenantId }, fn);

/** The tenant in scope, or null outside a request (a scheduler, a migration). */
const currentTenant = () => tenantContext.getStore()?.tenantId ?? null;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || process.env.DB_SERVER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
});

// Set session timezone for all new connections
pool.on('connect', (client) => {
  client.query("SET TIMEZONE = 'Asia/Kolkata'");
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Stamp the tenant onto a connection before it is used.
 *
 * Written on every checkout rather than once per connection, because the pool
 * hands the same connection to different requests. A value left behind by the
 * previous borrower is the one bug this whole design exists to prevent, so the
 * value is always set — to the empty string when there is no tenant, never left
 * as it was.
 *
 * An empty setting makes `current_setting('app.tenant_id', true)::int` NULL, and
 * NULL never matches a company_id. Work that forgets to establish a tenant sees
 * nothing at all. That is the intended failure: an empty screen is recoverable,
 * one customer's roster on another customer's screen is not.
 */
const applyTenant = async (client) => {
  const tenantId = currentTenant();
  await client.query('SELECT set_config($1, $2, false)', [
    'app.tenant_id',
    tenantId === null || tenantId === undefined ? '' : String(tenantId)
  ]);
};

const query = async (text, params) => {
  const client = await pool.connect();
  try {
    await applyTenant(client);
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

/**
 * A connection held across several statements, for transactions.
 *
 * The tenant is applied before the caller gets it, and `release` is wrapped so
 * the setting is cleared on the way back to the pool. Belt and braces: the next
 * borrower sets it again anyway.
 */
const getClient = async () => {
  const client = await pool.connect();
  try {
    await applyTenant(client);
  } catch (err) {
    client.release();
    throw err;
  }

  const release = client.release.bind(client);
  client.release = (...args) => {
    client.query('SELECT set_config($1, $2, false)', ['app.tenant_id', ''])
      .catch(() => { /* the connection is going back regardless */ })
      .finally(() => release(...args));
  };
  return client;
};

/**
 * Run work for one tenant outside a request — a scheduled sync, a migration, a
 * script. Named rather than allowing a bare tenantless query so that "this runs
 * for everyone" is always a decision someone wrote down.
 */
const asTenant = (tenantId, fn) => withTenant(tenantId, fn);

module.exports = {
  query,
  getClient,
  withTenant,
  asTenant,
  currentTenant,
  pool,
};
