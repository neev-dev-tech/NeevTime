/**
 * MAC OUI -> device-vendor lookup for LAN discovery.
 *
 * A MAC address begins with a 24-bit Organizationally Unique Identifier that
 * names the manufacturer. Matching it lets the ARP sweep label a host as a
 * likely attendance device — even a brand for which we have no active probe —
 * so the admin sees "unidentified Hikvision at 10.81.20.x" instead of a bare IP.
 *
 * IMPORTANT: this table is an ENRICHMENT, never a filter. The sweep reports
 * every host it finds; an unknown OUI just means vendor = null, not hidden. So a
 * missing or wrong entry can never make a real device disappear — worst case it
 * shows up unlabelled. Extend freely; keys are the first 3 octets, uppercase,
 * no separators.
 *
 * eSSL ships rebadged ZKTeco hardware and shares ZKTeco OUIs, so both resolve to
 * the ZKTeco family here and are driven by the same vendor driver downstream.
 */

// Seed set. Confirmed-enough prefixes for the brands seen in the field; expand
// as real MACs are observed (the discover result prints every raw MAC, which is
// how you harvest new prefixes to add here).
const OUI_TO_VENDOR = {
    // ZKTeco / eSSL family
    '001761': 'ZKTeco',
    '000A00': 'ZKTeco',
    '00157E': 'ZKTeco',
    '1C2FA6': 'ZKTeco',
    // Hikvision
    '4419B6': 'Hikvision',
    '44A642': 'Hikvision',
    'BCAD28': 'Hikvision',
    'C05627': 'Hikvision',
    // Suprema
    '0017FC': 'Suprema',
    // Anviz
    '000B6B': 'Anviz',
    // Matrix Comsec
    '001B10': 'Matrix',
};

const norm = (mac) =>
    typeof mac === 'string'
        ? mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
        : '';

/**
 * @returns {string|null} vendor name, or null when the OUI is not in the table.
 * null is a valid, expected result — the caller still surfaces the host.
 */
function vendorForMac(mac) {
    const hex = norm(mac);
    if (hex.length < 6) return null;
    return OUI_TO_VENDOR[hex.slice(0, 6)] || null;
}

module.exports = { vendorForMac, OUI_TO_VENDOR };
