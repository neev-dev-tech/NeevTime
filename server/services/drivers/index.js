/**
 * Driver resolver. Given a vendor name or a device row, return the driver that
 * implements operations for it.
 *
 * Default matters: for the entire history of this system every device was
 * treated as ZKTeco, and ADMS auto-registration still stamps vendor='ZKTeco'.
 * So an unknown/empty vendor resolves to the ZKTeco driver — the non-breaking
 * choice that keeps existing behaviour byte-for-byte. Only an explicitly
 * different vendor, a receive-only integration, or a virtual device diverges.
 *
 * A virtual device (MOBILE_APP) and a token-ingest device are receive-only: they
 * never poll an ADMS command queue, so they get the receive-only driver, which
 * refuses to queue commands instead of letting them pile up undrained — the
 * concrete fix for the long-standing stuck-command trap.
 */

const ZktecoDriver = require('./zkteco');
const ReceiveOnlyDriver = require('./receive_only');
const { HikvisionDriver, SupremaDriver } = require('./stubs');

const norm = (v) => String(v || '').trim().toLowerCase();

const ZK_ALIASES = new Set(['', 'zkteco', 'essl', 'zk', 'unknown', 'null']);
const RECEIVE_ONLY_ALIASES = new Set(['generic', 'mobile', 'mobile_app', 'android', 'ios', 'vendor']);

/**
 * @param {string|object} vendorOrDevice - a vendor name, or a device row with
 *        { vendor, is_virtual } fields.
 * @returns {DeviceDriver}
 */
function getDriver(vendorOrDevice) {
    let vendor = vendorOrDevice;
    let isVirtual = false;

    if (vendorOrDevice && typeof vendorOrDevice === 'object') {
        vendor = vendorOrDevice.vendor;
        isVirtual = vendorOrDevice.is_virtual === true;
    }

    // A device that cannot poll a command queue is receive-only regardless of the
    // brand printed on it.
    if (isVirtual) return new ReceiveOnlyDriver(vendor || 'virtual');

    const v = norm(vendor);
    if (ZK_ALIASES.has(v)) return new ZktecoDriver(vendor || 'ZKTeco');
    if (RECEIVE_ONLY_ALIASES.has(v)) return new ReceiveOnlyDriver(vendor);
    if (v === 'hikvision') return new HikvisionDriver();
    if (v === 'suprema') return new SupremaDriver();

    // A named vendor we have no driver for: receive-only is the safe default —
    // it refuses to queue ADMS commands to a device that may not understand them,
    // rather than silently creating dead queue rows.
    return new ReceiveOnlyDriver(vendor);
}

module.exports = { getDriver };
