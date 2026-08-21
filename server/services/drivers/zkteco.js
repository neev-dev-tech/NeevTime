/**
 * ZKTeco / eSSL driver — the fully-implemented reference.
 *
 * Transport is ADMS pull: the device polls /iclock/getrequest and drains its
 * command queue, so every operation here resolves to "insert a row into
 * device_commands" and lets the device pick it up. eSSL hardware is ZKTeco
 * rebadged and speaks the same protocol, so it uses this driver unchanged.
 *
 * This is deliberately thin — it wraps the queue the rest of the system already
 * uses. The point is not to reimplement enrolment, but to give every vendor the
 * SAME set of verbs, with ZKTeco's versions actually doing something.
 */

const db = require('../../db');
const { DeviceDriver } = require('./base');
const cmd = require('./zk_commands');

class ZktecoDriver extends DeviceDriver {
    constructor(vendor = 'ZKTeco') {
        super({ vendor, transport: 'adms-pull' });
    }

    get capabilities() {
        return {
            ...super.capabilities,
            canQueueCommands: true,
            canEnrollUsers: true,
            canDeleteUsers: true,
            canReboot: true,
            canClear: true,
            receiveOnly: false,
        };
    }

    async _enqueue(serial, command, sequence = 0) {
        if (!serial) throw new Error('a device serial is required');
        const { rows } = await db.query(
            `INSERT INTO device_commands (device_serial, command, status, sequence)
             VALUES ($1, $2, 'pending', $3) RETURNING *`,
            [serial, command, sequence]
        );
        return rows[0];
    }

    async queueRaw(serial, command) {
        // The command has already been validated against the allowlist at the API
        // boundary; the driver's job is only to place it on this device's queue.
        return this._enqueue(serial, String(command));
    }

    async enrollUser(serial, user) {
        return this._enqueue(serial, cmd.updateUser(user), 1);
    }

    async deleteUser(serial, pin) {
        return this._enqueue(serial, cmd.deleteUser(pin));
    }

    async reboot(serial) {
        return this._enqueue(serial, cmd.reboot());
    }

    async clearAttendanceLogs(serial) {
        return this._enqueue(serial, cmd.clearAttendanceLogs());
    }

    async clearAllData(serial) {
        return this._enqueue(serial, cmd.clearAllData());
    }
}

module.exports = ZktecoDriver;
