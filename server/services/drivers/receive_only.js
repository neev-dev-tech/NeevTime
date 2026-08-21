/**
 * Receive-only driver — for any vendor integrated through the vendor-neutral
 * JSON intake (routes/vendor_ingest.js). Those devices authenticate with a token
 * and PUSH punches to us; there is no channel to push a command back.
 *
 * So this driver deliberately implements NONE of the command verbs: it inherits
 * the base's truthful refusals, which report "receive-only integration" rather
 * than pretending an enrol or reboot was queued. This is the guard that stopped
 * ADMS commands from silently piling up against a device that can never drain
 * them (the MOBILE_APP / non-ADMS stuck-command trap).
 */

const { DeviceDriver } = require('./base');

class ReceiveOnlyDriver extends DeviceDriver {
    constructor(vendor = 'generic') {
        super({ vendor, transport: 'push-ingest' });
    }
    // capabilities inherit from base: everything false, receiveOnly true.
}

module.exports = ReceiveOnlyDriver;
