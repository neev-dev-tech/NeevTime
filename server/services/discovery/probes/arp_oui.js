/**
 * Universal ARP + MAC-OUI probe.
 *
 * This is the vendor-agnostic backbone of discovery. It does not speak any
 * device protocol: it primes the ARP cache with a ping sweep, reads the cache,
 * and labels each MAC by its manufacturer OUI. A ZKTeco reader, an eSSL reader,
 * a Hikvision terminal, a Suprema panel — anything with a network interface on
 * the segment surfaces here, whether or not we have an active probe that speaks
 * its protocol.
 *
 * It cannot report a serial number (ARP only carries IP+MAC), so a vendor probe
 * that CAN read the serial is always preferred when both see the same host; the
 * orchestrator merges them. But this probe alone is enough to answer the real
 * question the admin has — "what devices are on my LAN and who made them" —
 * without any per-vendor code.
 */

const { primeArp, readArpTable, localSubnets } = require('../net');
const { vendorForMac } = require('../oui_vendors');

const NAME = 'arp-oui';

/**
 * @param {object} ctx
 * @param {number} ctx.timeoutMs   overall budget for this probe
 * @param {boolean} ctx.skipPing   reuse the existing ARP cache instead of sweeping
 * @param {function} [ctx.log]
 * @returns {Promise<Array>} candidate rows { source, ip, mac, vendor, serial, model }
 */
async function probe(ctx = {}) {
    const log = ctx.log || (() => {});
    const subnets = localSubnets();
    if (subnets.length === 0) {
        log(`[${NAME}] no usable LAN interface found`);
        return [];
    }

    // Sweep every local /24 to populate ARP, unless the caller asked to reuse the
    // cache (a repeat scan within a minute or two does not need another sweep).
    if (!ctx.skipPing) {
        await Promise.all(
            subnets.map((s) =>
                primeArp(s.address, { concurrency: 64, perPingTimeoutMs: 1000 })
            )
        );
    }

    const rows = await readArpTable();

    // The server's own interfaces are in the ARP table too — drop them so we do
    // not offer the server itself as a device to register.
    const selfIps = new Set(subnets.map((s) => s.address));

    // Docker bridge networks the server is attached to are NOT the office LAN —
    // their only occupants are the other containers (db/client) and the bridge
    // gateway. Offering 172.18.0.2 as a "device to register" is the junk the
    // in-process (bridged) scan produced. Drop any candidate that lives in a
    // bridge subnet the server itself sits on, identified as an interface in
    // Docker's default pool (172.16.0.0/12). A real office LAN is virtually never
    // in that range; if a site genuinely runs there, it should use the host-net
    // discovery agent, whose host interfaces make the real devices visible.
    const asInt = (ip) => ip.split('.').reduce((a, o) => (a << 8) + (parseInt(o, 10) || 0), 0) >>> 0;
    const inDockerPool = (ip) => {
        const n = asInt(ip);
        return n >= asInt('172.16.0.0') && n <= asInt('172.31.255.255');
    };
    const bridgeNets = subnets
        .filter((s) => inDockerPool(s.address))
        .map((s) => ({ base: asInt(s.address) & asInt(s.netmask), mask: asInt(s.netmask) }));
    const inBridge = (ip) => bridgeNets.some((b) => (asInt(ip) & b.mask) === b.base);

    const seen = new Map();
    for (const { ip, mac } of rows) {
        if (selfIps.has(ip)) continue;
        if (inBridge(ip)) continue; // docker container / bridge gateway, not a device
        if (seen.has(ip)) continue; // one row per IP; first resolved MAC wins
        seen.set(ip, {
            source: NAME,
            ip,
            mac,
            vendor: vendorForMac(mac), // may be null — still surfaced
            serial: null,
            model: null,
        });
    }

    const out = [...seen.values()];
    log(`[${NAME}] ${out.length} host(s) on ${subnets.length} subnet(s)`);
    return out;
}

module.exports = { name: NAME, probe };
