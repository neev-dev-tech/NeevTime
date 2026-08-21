/**
 * Network primitives for LAN discovery: enumerate local IPv4 subnets, sweep them
 * to populate the kernel ARP cache, and read that cache back as MAC/IP pairs.
 *
 * Why a ping sweep at all: a host only appears in the ARP table after the kernel
 * has resolved its MAC, which happens when something talks to it. A short
 * fan-out of pings across the /24 forces that resolution for every live host, so
 * the subsequent ARP read sees the whole segment — including devices that keep
 * every service port closed and would answer no probe. This is the piece that
 * makes discovery vendor-agnostic.
 *
 * Both code paths are OS-aware: this runs on the Linux server in production and
 * on macOS during development, and the two disagree on ping flags and on the
 * shape of the ARP table.
 */

const os = require('os');
const { execFile } = require('child_process');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const run = (cmd, args, timeoutMs) =>
    new Promise((resolve) => {
        execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
            // A non-zero exit is normal here (a ping to a dead host, an empty ARP
            // table). We want whatever output there was, never a thrown error —
            // one unreachable host must not abort the sweep.
            resolve(stdout || '');
        });
    });

/**
 * Local IPv4 interfaces that look like a real LAN (skip loopback, link-local,
 * and anything without a netmask). Returns one entry per usable interface.
 */
function localSubnets() {
    const out = [];
    const ifaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(ifaces)) {
        for (const a of addrs || []) {
            if (a.family !== 'IPv4' || a.internal) continue;
            if (!a.netmask || a.address.startsWith('169.254.')) continue;
            out.push({ iface: name, address: a.address, netmask: a.netmask, cidr: a.cidr });
        }
    }
    return out;
}

/**
 * Every host address in the /24 that contains `ip`. Discovery is a same-segment
 * L2 operation (ARP does not cross a router), and a /24 is the near-universal
 * office LAN, so we deliberately scan the local /24 rather than honour a wider
 * netmask and spray thousands of pings across a /16.
 */
function hostsInSlash24(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return [];
    const base = `${parts[0]}.${parts[1]}.${parts[2]}.`;
    const hosts = [];
    for (let i = 1; i <= 254; i++) hosts.push(base + i);
    return hosts;
}

function pingArgs(ip) {
    // One packet, short deadline — we are only trying to provoke an ARP entry,
    // not measure latency.
    if (isWindows) return ['-n', '1', '-w', '600', ip];
    if (isMac) return ['-c', '1', '-t', '1', '-W', '600', ip];
    return ['-c', '1', '-w', '1', ip]; // linux
}

/**
 * Ping every host in the /24 around `fromIp`, in bounded-concurrency batches, to
 * force ARP resolution. Best-effort and silent about individual failures.
 */
async function primeArp(fromIp, { concurrency = 64, perPingTimeoutMs = 1200 } = {}) {
    const hosts = hostsInSlash24(fromIp);
    let idx = 0;
    const worker = async () => {
        while (idx < hosts.length) {
            const ip = hosts[idx++];
            await run('ping', pingArgs(ip), perPingTimeoutMs);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
}

const MAC_RE = /([0-9a-fA-F]{1,2}(?::[0-9a-fA-F]{1,2}){5})/;
const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;

function normalizeMac(mac) {
    // The BSD/macOS arp prints octets without leading zeros (e.g. 0:17:61:a:b:c).
    // Pad each to two hex digits so the OUI lookup and dedup keys are stable.
    return mac
        .split(':')
        .map((o) => o.padStart(2, '0'))
        .join(':')
        .toLowerCase();
}

/**
 * Read the ARP table as [{ ip, mac }]. Incomplete entries (no resolved MAC) are
 * dropped. Parsed line-by-line with regexes rather than by column, because the
 * table's columns differ across Linux, macOS, and Windows.
 */
async function readArpTable() {
    const args = isWindows ? ['-a'] : ['-a', '-n'];
    const raw = await run('arp', isWindows ? args : ['-an'], 8000);
    const rows = [];
    for (const line of raw.split(/\r?\n/)) {
        const macM = line.match(MAC_RE);
        const ipM = line.match(IP_RE);
        if (!macM || !ipM) continue;
        const mac = normalizeMac(macM[1]);
        // Skip broadcast / incomplete / all-zero entries.
        if (mac === 'ff:ff:ff:ff:ff:ff' || mac === '00:00:00:00:00:00') continue;
        rows.push({ ip: ipM[1], mac });
    }
    return rows;
}

module.exports = {
    localSubnets,
    hostsInSlash24,
    primeArp,
    readArpTable,
    normalizeMac,
    _run: run,
};
