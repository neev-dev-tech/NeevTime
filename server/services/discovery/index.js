/**
 * LAN discovery orchestrator (Layer 2).
 *
 * Runs every registered probe in parallel, merges their candidates into one row
 * per physical device, and annotates each with whether it is already known to
 * the system. The probes are deliberately uneven in what they can report:
 *
 *   - the ARP/OUI backbone sees every host (IP + MAC + vendor guess) but no serial
 *   - a vendor probe (e.g. ZKTeco UDP) may report a serial but no MAC
 *
 * so merging is by IP: a serial from the ZKTeco probe and a MAC from the ARP
 * sweep for the same address become a single, richer row. This is what lets a
 * device carry both its network identity (MAC/OUI) and its protocol identity
 * (serial) into the register step.
 *
 * Adding a vendor is adding one entry to PROBES. Nothing else changes: the API,
 * the merge, and the UI are all vendor-neutral.
 */

const db = require('../../db');
const arpOui = require('./probes/arp_oui');
const zkteco = require('./probes/zkteco');
const stubs = require('./probes/stubs');

// Order matters only for logging; results are merged, not ranked by position.
const PROBES = [arpOui, zkteco, stubs.hikvision, stubs.onvif, stubs.suprema];

const mergeInto = (target, row) => {
    // Fill gaps without overwriting a good value with a null. A serial or MAC,
    // once known from any probe, sticks; vendor prefers a concrete name over null.
    for (const k of ['mac', 'serial', 'model']) {
        if (!target[k] && row[k]) target[k] = row[k];
    }
    if ((!target.vendor || target.vendor === null) && row.vendor) target.vendor = row.vendor;
    if (!target.sources.includes(row.source)) target.sources.push(row.source);
};

/**
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] per-probe listen budget (default 3000)
 * @param {boolean} [opts.skipPing] reuse the ARP cache from a recent scan
 * @param {function} [opts.log]
 * @returns {Promise<{ scanned_at, candidates: Array }>}
 */
async function discover(opts = {}) {
    const log = opts.log || (() => {});
    const ctx = { timeoutMs: opts.timeoutMs || 3000, skipPing: !!opts.skipPing, log };

    // One slow or broken probe must not sink the scan: settle all, keep the
    // fulfilled ones, log the rest.
    const settled = await Promise.allSettled(PROBES.map((p) => p.probe(ctx)));
    const rows = [];
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') rows.push(...(r.value || []));
        else log(`[discovery] probe ${PROBES[i].name} failed: ${r.reason?.message || r.reason}`);
    });

    // Merge by IP (the one key every probe can supply).
    const byIp = new Map();
    for (const row of rows) {
        if (!row.ip) continue;
        if (!byIp.has(row.ip)) {
            byIp.set(row.ip, {
                ip: row.ip,
                mac: row.mac || null,
                serial: row.serial || null,
                vendor: row.vendor || null,
                model: row.model || null,
                sources: [row.source],
            });
        } else {
            mergeInto(byIp.get(row.ip), row);
        }
    }

    const candidates = [...byIp.values()];
    await annotateKnown(candidates);

    candidates.sort((a, b) => {
        // Unregistered devices first (the actionable ones), then by IP numerically.
        if (a.known !== b.known) return a.known ? 1 : -1;
        return ipNum(a.ip) - ipNum(b.ip);
    });

    return { scanned_at: new Date().toISOString(), candidates };
}

const ipNum = (ip) =>
    ip.split('.').reduce((acc, o) => (acc << 8) + (parseInt(o, 10) || 0), 0) >>> 0;

/**
 * Mark which candidates are already registered, matching on serial first (the
 * authoritative ADMS identity) and IP second. Known devices are still returned —
 * seeing "this IP is already device X" is useful — just flagged and sorted last.
 */
async function annotateKnown(candidates) {
    if (candidates.length === 0) return;
    let rows = [];
    try {
        const res = await db.query(
            `SELECT serial_number, ip_address, device_name, approval_status, status
               FROM devices WHERE is_virtual IS NOT TRUE`
        );
        rows = res.rows;
    } catch {
        // Discovery still returns candidates if the devices table cannot be read;
        // they simply come back unannotated rather than failing the whole scan.
        return;
    }
    const bySerial = new Map(rows.filter((r) => r.serial_number).map((r) => [r.serial_number, r]));
    const byIp = new Map(rows.filter((r) => r.ip_address).map((r) => [r.ip_address, r]));

    for (const c of candidates) {
        const match = (c.serial && bySerial.get(c.serial)) || byIp.get(c.ip) || null;
        c.known = !!match;
        c.registered_as = match ? match.serial_number : null;
        c.device_name = match ? match.device_name : null;
        c.approval_status = match ? match.approval_status : null;
    }
}

module.exports = { discover, PROBES };
