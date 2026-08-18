const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
require('dotenv').config();

/**
 * Who is doing the work, carried without threading it through every call.
 *
 * The audit triggers run inside Postgres and cannot see an HTTP request, so the
 * actor has to reach them on the connection. Async local storage keeps it on the
 * execution context: the request middleware puts it here, and every query
 * underneath — however deep, through however many awaits — stamps it on the
 * connection it borrows before running.
 *
 * The alternative was passing a user id into 614 query sites, or writing audit
 * rows by hand at each one. Both mean the audit log is only as complete as
 * whoever remembered, and an audit log with gaps is worse than none: it invites
 * people to trust it.
 */
const requestContext = new AsyncLocalStorage();

/** Run `fn` with everything inside it attributed to `userId`. */
const withActor = (userId, fn) => {
  const parent = requestContext.getStore() || {};
  return requestContext.run({ ...parent, userId }, fn);
};

/** The actor in scope, or null for work nobody triggered (a scheduler, a device). */
const currentActor = () => requestContext.getStore()?.userId ?? null;

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
 * Stamp the actor onto a connection before it is used.
 *
 * Written on every checkout rather than once per connection, because the pool
 * hands the same connection to different requests. A value left behind by the
 * previous borrower would attribute one person's change to another, which is a
 * worse failure than having no attribution at all — so it is always set, to the
 * empty string when nobody is responsible, never left as it was.
 */
const applyContext = async (client) => {
  const userId = currentActor();
  await client.query('SELECT set_config($1, $2, false)', [
    'app.user_id',
    userId === null || userId === undefined ? '' : String(userId)
  ]);
};

const query = async (text, params) => {
  const client = await pool.connect();
  try {
    await applyContext(client);
    return await client.query(text, params);
  } finally {
    client.release();
  }
};

/** A connection held across several statements, for transactions. */
const getClient = async () => {
  const client = await pool.connect();
  try {
    await applyContext(client);
  } catch (err) {
    client.release();
    throw err;
  }

  const release = client.release.bind(client);
  client.release = (...args) => {
    client.query('SELECT set_config($1, $2, false)', ['app.user_id', ''])
      .catch(() => { /* the connection is going back regardless */ })
      .finally(() => release(...args));
  };
  return client;
};

module.exports = {
  query,
  getClient,
  withActor,
  currentActor,
  pool,
};
