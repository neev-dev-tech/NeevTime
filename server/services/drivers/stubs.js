/**
 * Scaffolded operation drivers for vendors we don't yet drive.
 *
 * Same contract as the ZKTeco driver, same verbs — but each declares its real
 * transport and leaves the verbs at the base's honest refusal until someone
 * implements them against actual hardware. Wiring is done; behaviour is not, and
 * the driver says so rather than faking success.
 *
 *   - Hikvision: ISAPI over HTTP(S) (per-device digest auth, port 80/8000)
 *   - Suprema:   BioStar 2 device SDK / Gateway API (TCP 51211)
 *
 * To implement one: give it a transport of 'adms-pull'-equivalent for its own
 * protocol and override the verbs to talk to the device. Nothing else changes.
 */

const { DeviceDriver } = require('./base');

class HikvisionDriver extends DeviceDriver {
    constructor() { super({ vendor: 'Hikvision', transport: 'none' }); }
    // TODO: ISAPI /ISAPI/AccessControl/UserInfo/Record etc.
}

class SupremaDriver extends DeviceDriver {
    constructor() { super({ vendor: 'Suprema', transport: 'none' }); }
    // TODO: BioStar device SDK enroll/delete/scan.
}

module.exports = { HikvisionDriver, SupremaDriver };
