/**
 * ZKTeco / eSSL active probe — UDP broadcast on port 4950.
 *
 * ZKTeco (and eSSL, which is the same hardware rebadged) standalone readers
 * answer a LAN "search" broadcast with a small payload carrying their serial
 * number, model and MAC. This is what the vendor's own ZKAccess/ZKTime "Search
 * Device" button does. When it works it gives us the one thing ARP cannot: the
 * serial number, which is the device's identity in the ADMS protocol.
 *
 * HONEST LIMITATION: the exact search payload varies across firmware, and this
 * runs blind to your specific units. So this probe is treated as ENRICHMENT, not
 * the source of truth. If a reader does not answer, it is not lost — the ARP/OUI
 * backbone still surfaces it by MAC, labelled ZKTeco, ready to register. Nothing
 * here throws; a silent LAN yields an empty list, never an error.
 *
 * The reply format is not rigidly specified, so parsing is deliberately lenient:
 * we scan the datagram for the recognisable fields rather than assuming offsets.
 */

const dgram = require('dgram');

const NAME = 'zkteco-udp';
const ZK_SEARCH_PORT = 4950;

/**
 * The ZK protocol fixed 8-byte header: command, checksum, session, reply — all
 * little-endian uint16 — followed by an optional payload. CMD_CONNECT (1000) is
 * the packet a client sends to begin a conversation; broadcast, it prompts
 * listening devices to announce themselves.
 */
const CMD_CONNECT = 1000;

function checksum(buf) {
    // ZK's ones-complement 16-bit sum over the packet with the checksum field
    // zeroed. Matches the algorithm node-zklib/pyzk use.
    let sum = 0;
    for (let i = 0; i + 1 < buf.length; i += 2) sum += buf.readUInt16LE(i);
    if (buf.length % 2) sum += buf[buf.length - 1];
    sum = (sum & 0xffff) + (sum >> 16);
    return (~sum) & 0xffff;
}

function buildSearchPacket() {
    const buf = Buffer.alloc(8);
    buf.writeUInt16LE(CMD_CONNECT, 0);
    buf.writeUInt16LE(0, 2); // checksum placeholder
    buf.writeUInt16LE(0, 4); // session id
    buf.writeUInt16LE(0, 6); // reply id
    buf.writeUInt16LE(checksum(buf), 2);
    return buf;
}

// A serial number in these replies is printable ASCII, usually 8+ chars of
// letters/digits. Pull the longest such run out of the payload rather than
// trusting a fixed offset that differs by model.
function extractSerial(payload) {
    const ascii = payload.toString('latin1');
    const runs = ascii.match(/[A-Za-z0-9]{6,}/g) || [];
    if (runs.length === 0) return null;
    return runs.sort((a, b) => b.length - a.length)[0];
}

/**
 * @param {object} ctx
 * @param {number} ctx.timeoutMs  how long to listen for replies (default 2500)
 * @param {function} [ctx.log]
 * @returns {Promise<Array>} candidate rows { source, ip, mac, vendor, serial, model }
 */
function probe(ctx = {}) {
    const log = ctx.log || (() => {});
    const timeoutMs = ctx.timeoutMs || 2500;

    return new Promise((resolve) => {
        const found = new Map(); // ip -> row
        let done = false;

        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        const finish = () => {
            if (done) return;
            done = true;
            try { socket.close(); } catch { /* already closing */ }
            const out = [...found.values()];
            log(`[${NAME}] ${out.length} device(s) answered the broadcast`);
            resolve(out);
        };

        // Any socket error (no permission to broadcast, no network) ends the
        // probe cleanly with whatever was collected — discovery must not fail
        // just because one probe could not open a socket.
        socket.on('error', (err) => {
            log(`[${NAME}] socket error: ${err.message}`);
            finish();
        });

        socket.on('message', (msg, rinfo) => {
            const serial = extractSerial(msg);
            found.set(rinfo.address, {
                source: NAME,
                ip: rinfo.address,
                mac: null, // paired with the ARP row by the orchestrator
                vendor: 'ZKTeco',
                serial,
                model: null,
            });
        });

        socket.bind(() => {
            try {
                socket.setBroadcast(true);
                const pkt = buildSearchPacket();
                socket.send(pkt, 0, pkt.length, ZK_SEARCH_PORT, '255.255.255.255');
            } catch (err) {
                log(`[${NAME}] broadcast failed: ${err.message}`);
                return finish();
            }
            setTimeout(finish, timeoutMs);
        });
    });
}

module.exports = { name: NAME, probe };
