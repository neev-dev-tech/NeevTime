/**
 * Scaffolded vendor probes.
 *
 * Each speaks the same probe contract as the working ZKTeco probe — async
 * probe(ctx) => candidate[] — so the orchestrator runs them uniformly and a real
 * implementation drops in without touching anything else. They return [] today
 * because implementing a vendor's discovery protocol without one of its devices
 * to test against would be dishonest guesswork.
 *
 * These vendors are NOT invisible in the meantime: the ARP/OUI backbone already
 * surfaces a Hikvision or Suprema box by its MAC. What a real probe here would
 * ADD is the serial number and model, read over that vendor's own protocol:
 *
 *   - Hikvision: SADP, UDP multicast 239.255.255.250:37020 (XML announce/inquiry)
 *   - ONVIF:     WS-Discovery, UDP multicast 239.255.255.250:3702 (SOAP Probe)
 *   - Suprema:   BioStar device search, TCP 51211
 *
 * To implement one: replace its probe body, keep the { name, probe } shape.
 */

const makeStub = (name, note) => ({
    name,
    async probe(ctx = {}) {
        const log = ctx.log || (() => {});
        log(`[${name}] not implemented (${note}); relying on ARP/OUI for this vendor`);
        return [];
    },
});

module.exports = {
    hikvision: makeStub('hikvision-sadp', 'SADP UDP 37020'),
    onvif: makeStub('onvif-wsd', 'WS-Discovery UDP 3702'),
    suprema: makeStub('suprema-biostar', 'BioStar TCP 51211'),
};
