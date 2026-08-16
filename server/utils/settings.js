/**
 * Typed reader for the app_settings table.
 *
 * Settings are edited rarely and read on hot paths (every login, every punch),
 * so values are cached in memory and invalidated when the Settings API writes.
 */

const db = require('../db');

const TTL_MS = 60 * 1000;
let cache = null;
let cachedAt = 0;

const load = async () => {
    const res = await db.query('SELECT category, setting_key, setting_value, data_type FROM app_settings');
    const map = {};
    for (const row of res.rows) {
        (map[row.category] = map[row.category] || {})[row.setting_key] = {
            value: row.setting_value,
            type: row.data_type
        };
    }
    cache = map;
    cachedAt = Date.now();
    return cache;
};

const all = async () => {
    if (!cache || Date.now() - cachedAt > TTL_MS) await load();
    return cache;
};

/** Drop the cache so the next read reflects a just-saved value. */
const invalidate = () => { cache = null; };

const coerce = (raw, type, fallback) => {
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (type === 'boolean') return raw === true || raw === 'true';
    if (type === 'number') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }
    return raw;
};

/**
 * Read one setting, coerced to its declared data_type.
 * Falls back when the key is missing, blank, or unparseable — callers always
 * get a usable value, so a half-configured install still behaves sanely.
 */
const get = async (category, key, fallback = null) => {
    const map = await all();
    const entry = map[category]?.[key];
    if (!entry) return fallback;
    return coerce(entry.value, entry.type, fallback);
};

/** Read a whole category as a plain {key: coercedValue} object. */
const getCategory = async (category, fallbacks = {}) => {
    const map = await all();
    const entries = map[category] || {};
    const out = { ...fallbacks };
    for (const [key, entry] of Object.entries(entries)) {
        out[key] = coerce(entry.value, entry.type, fallbacks[key] ?? null);
    }
    return out;
};

/**
 * Write one setting.
 *
 * Upsert on (category, setting_key), which app_settings declares UNIQUE. The
 * cache is invalidated rather than patched: a stale read here decides whether a
 * backup is copied off the machine, and cache-patching bugs are the kind that
 * only show up under the exact conditions nobody tests.
 *
 * description is only set when the row is created, so a value written at
 * runtime never overwrites the explanation seeded for the settings screen.
 */
const set = async (category, key, value, dataType = 'string', description = null) => {
    await db.query(
        `INSERT INTO app_settings (category, setting_key, setting_value, data_type, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (category, setting_key) DO UPDATE
            SET setting_value = EXCLUDED.setting_value,
                data_type     = EXCLUDED.data_type,
                updated_at    = NOW()`,
        [category, key, value === null || value === undefined ? '' : String(value), dataType, description]
    );
    invalidate();
};

module.exports = { get, getCategory, invalidate, set };
