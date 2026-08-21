'use strict';

/**
 * LAN discovery (Layer 2) — unit tests for the pieces that have no hardware or
 * network dependency: OUI labelling, ARP parsing, and the orchestrator's merge.
 * The live UDP broadcast and ping sweep are exercised on real hardware, not here.
 */

const test = require('node:test');
const assert = require('node:assert');

const { vendorForMac, OUI_TO_VENDOR } = require('../services/discovery/oui_vendors');
const { normalizeMac } = require('../services/discovery/net');

test('OUI lookup labels a known vendor and tolerates separators/case', () => {
    const [prefix, vendor] = Object.entries(OUI_TO_VENDOR)[0];
    const p = prefix.toLowerCase();
    const withColons = `${p.slice(0, 2)}:${p.slice(2, 4)}:${p.slice(4, 6)}:11:22:33`;
    assert.equal(vendorForMac(withColons), vendor);
    assert.equal(vendorForMac(withColons.toUpperCase()), vendor);
});

test('an unknown OUI returns null, never throws — the host is still surfaced', () => {
    // A missing entry must not hide a device; the sweep shows it unlabelled.
    assert.equal(vendorForMac('02:00:00:aa:bb:cc'), null);
    assert.equal(vendorForMac(''), null);
    assert.equal(vendorForMac(null), null);
    assert.equal(vendorForMac('zz'), null);
});

test('MAC normalization pads BSD/macOS short octets so keys are stable', () => {
    // macOS arp prints 0:17:61:a:b:c; the OUI lookup needs 00:17:61:0a:0b:0c.
    assert.equal(normalizeMac('0:17:61:a:b:c'), '00:17:61:0a:0b:0c');
    assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF'), 'aa:bb:cc:dd:ee:ff');
});

test('a padded ZKTeco MAC still resolves to the ZKTeco family', () => {
    const zk = Object.entries(OUI_TO_VENDOR).find(([, v]) => v === 'ZKTeco');
    assert.ok(zk, 'seed table lost its ZKTeco entry');
    const p = zk[0].toLowerCase();
    const bsdStyle = `${String(parseInt(p.slice(0, 2), 16))}:${p.slice(2, 4)}:${p.slice(4, 6)}:1:2:3`;
    assert.equal(vendorForMac(normalizeMac(bsdStyle)), 'ZKTeco');
});

test('every probe exposes the { name, probe } contract so the orchestrator is uniform', () => {
    const { PROBES } = require('../services/discovery');
    assert.ok(PROBES.length >= 4, 'expected the ARP backbone plus vendor probes');
    for (const p of PROBES) {
        assert.equal(typeof p.name, 'string');
        assert.equal(typeof p.probe, 'function');
    }
});

test('a stub vendor probe resolves to an empty list, never rejects', async () => {
    const stubs = require('../services/discovery/probes/stubs');
    const out = await stubs.hikvision.probe({ log: () => {} });
    assert.deepEqual(out, []);
});

test('discovery is admin-gated and never registers a device by itself', () => {
    const fs = require('fs');
    const path = require('path');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    // The scan opens a broadcast socket and sweeps the LAN — not for a read-only
    // role or an anonymous caller.
    assert.match(server, /devices\/discover',\s*authenticateToken,\s*requireAdmin/,
        'the discover endpoint is not behind authenticateToken + requireAdmin');
    // Surfacing a candidate must not create a device; registration stays a
    // separate, explicit POST /api/devices.
    const block = server.slice(server.indexOf("devices/discover'"), server.indexOf("devices/discover'") + 800);
    assert.ok(!/INSERT INTO devices/i.test(block),
        'the discover endpoint inserts a device — discovery must only surface, not register');
});
