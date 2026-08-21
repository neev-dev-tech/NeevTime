/**
 * Vendor device driver — the interface every brand implements so that device
 * OPERATIONS (enrol a user, remove one, sync everyone, reboot, wipe) are the
 * same verbs everywhere, and only the vendor-specific body differs.
 *
 * The design goal is honesty, not the illusion of universality. A verb a vendor
 * genuinely cannot do (a receive-only integration has no way to push a command
 * back to the device) throws NotSupportedError, which the API surfaces as a
 * clear 422 — never a silent no-op, and never a command queued to a device that
 * will never drain it.
 *
 * Transport describes HOW a verb reaches the device:
 *   - 'adms-pull'    the device polls us and drains a command queue (ZKTeco/eSSL)
 *   - 'push-ingest'  the device only pushes to us; no command channel back
 *   - 'none'         unknown/unimplemented vendor
 */

class NotSupportedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotSupportedError';
        this.code = 'NOT_SUPPORTED';
        this.status = 422; // Unprocessable: a valid request the device cannot honour
    }
}

class DeviceDriver {
    constructor({ vendor = 'unknown', transport = 'none' } = {}) {
        this.vendor = vendor;
        this.transport = transport;
    }

    /**
     * What this driver can actually do. The UI and API use it to show or hide
     * controls instead of hard-coding "if ZKTeco".
     */
    get capabilities() {
        return {
            vendor: this.vendor,
            transport: this.transport,
            canQueueCommands: false,
            canEnrollUsers: false,
            canDeleteUsers: false,
            canReboot: false,
            canClear: false,
            receiveOnly: this.transport === 'push-ingest',
        };
    }

    // Operation verbs. Each subclass overrides the ones it supports; the rest
    // fall through to a truthful refusal.
    async enrollUser() { this._unsupported('enroll a user on'); }
    async deleteUser() { this._unsupported('delete a user from'); }
    async syncAllUsers() { this._unsupported('sync users to'); }
    async reboot() { this._unsupported('reboot'); }
    async clearAttendanceLogs() { this._unsupported('clear logs on'); }
    async clearAllData() { this._unsupported('factory-reset'); }

    /**
     * Queue an already-validated command string. The allowlist lives at the API
     * boundary; this only decides whether the device's transport can carry a
     * command at all — the guard that stops dead ADMS commands piling up on a
     * receive-only device.
     */
    async queueRaw() { this._unsupported('send commands to'); }

    _unsupported(action) {
        throw new NotSupportedError(
            `Cannot ${action} a ${this.vendor} device: ` +
            (this.transport === 'push-ingest'
                ? 'it is a receive-only integration (it pushes punches; it has no remote command channel).'
                : `no driver operation is implemented for ${this.vendor} yet.`)
        );
    }
}

module.exports = { DeviceDriver, NotSupportedError };
