'use strict';

/**
 * Vendor driver abstraction — the operations layer that makes device commands
 * dispatch by vendor instead of assuming ZKTeco everywhere.
 */

const test = require('node:test');
const assert = require('node:assert');

const { getDriver } = require('../services/drivers');
const cmd = require('../services/drivers/zk_commands');
const { NotSupportedError } = require('../services/drivers/base');

test('ZKTeco and eSSL resolve to the same fully-capable driver', () => {
    const zk = getDriver('ZKTeco');
    const essl = getDriver('eSSL');
    assert.equal(zk.transport, 'adms-pull');
    assert.equal(essl.constructor.name, 'ZktecoDriver');
    for (const cap of ['canQueueCommands', 'canEnrollUsers', 'canDeleteUsers', 'canReboot']) {
        assert.equal(zk.capabilities[cap], true, `ZKTeco should have ${cap}`);
        assert.equal(essl.capabilities[cap], true, `eSSL should have ${cap}`);
    }
});

test('an unknown/empty vendor falls back to ZKTeco — legacy behaviour is preserved', () => {
    // Every device predating this layer was treated as ZKTeco; null must not
    // suddenly become receive-only or existing fleets would stop taking commands.
    assert.equal(getDriver('').constructor.name, 'ZktecoDriver');
    assert.equal(getDriver(null).constructor.name, 'ZktecoDriver');
    assert.equal(getDriver('unknown').constructor.name, 'ZktecoDriver');
});

test('a virtual device is receive-only regardless of its stamped vendor', () => {
    // MOBILE_APP carries vendor ZKTeco but never polls a command queue; queuing
    // ADMS commands to it is the stuck-command trap.
    const d = getDriver({ vendor: 'ZKTeco', is_virtual: true });
    assert.equal(d.constructor.name, 'ReceiveOnlyDriver');
    assert.equal(d.capabilities.receiveOnly, true);
    assert.equal(d.capabilities.canEnrollUsers, false);
});

test('a named vendor with no driver defaults to receive-only, not silent ADMS queueing', () => {
    const d = getDriver('Acme');
    assert.equal(d.capabilities.canQueueCommands, false);
});

test('a receive-only driver refuses commands with a 422 NotSupportedError, never a silent success', async () => {
    const d = getDriver('Hikvision');
    await assert.rejects(() => d.reboot('SER1'), (e) => {
        assert.ok(e instanceof NotSupportedError);
        assert.equal(e.code, 'NOT_SUPPORTED');
        assert.equal(e.status, 422);
        return true;
    });
    await assert.rejects(() => d.queueRaw('SER1', 'REBOOT'), /command/i);
});

test('the ZKTeco enrol command matches the long-standing ADMS format byte-for-byte', () => {
    // Guards against drift from services/adms.js, where this string also lives.
    const s = cmd.updateUser({ pin: '1001', name: 'Asha', pri: 0, passwd: '', card: '' });
    assert.equal(
        s,
        'DATA UPDATE USERINFO PIN=1001\tName=Asha\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=1\tVerify=0\tFace=1\tFPCount=1'
    );
    assert.equal(cmd.deleteUser('1001'), 'DATA DELETE USERINFO PIN=1001');
    assert.equal(cmd.reboot(), 'REBOOT');
    assert.equal(cmd.clearAttendanceLogs(), 'CLEAR LOG');
    assert.equal(cmd.clearAllData(), 'CLEAR DATA');
});

test('command builders refuse a missing PIN rather than emitting a malformed string', () => {
    assert.throws(() => cmd.updateUser({ name: 'x' }), /pin/i);
    assert.throws(() => cmd.deleteUser(''), /pin/i);
});

test('the device-command endpoint dispatches through the driver and guards transport', () => {
    const fs = require('fs');
    const path = require('path');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const start = server.indexOf("app.post('/api/device-commands'");
    const block = server.slice(start, start + 2600);
    assert.match(block, /getDriver/, 'the command endpoint no longer routes through a vendor driver');
    assert.match(block, /NOT_SUPPORTED/, 'a receive-only refusal is not translated into an HTTP status');
    assert.match(block, /Device not found/, 'the endpoint queues to a serial it never confirmed exists');
});
