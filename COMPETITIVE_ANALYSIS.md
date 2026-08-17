# NeevTime vs the Market — Feature Comparison & "How to Beat Them" Plan

**Date:** 17 August 2026
**Basis:** codebase review + competitor research (sources dated 2024–2026, cited inline). ✅ = ships it, ◐ = partial/limited, ❌ = doesn't.

---

## 1. The competitive landscape (current players)

| Product | Type | Position (2026) | Pricing (source) |
|---|---|---|---|
| **ZKTeco BioTime 9.5 / UTime** | Hardware-ecosystem software | Official software for ZKTeco readers; dashboard, schedules, ESS via web+mobile app (zkteco.me; nobleframetechnologies.com, Jun 2026) | Per-device one-time license; free tier capped at 2 devices |
| **Truein** | AI face-recognition SaaS (India) | Built for hourly/multi-site contract workforce: face clock-ins, geofencing, runs on any tablet/mobile (truein.com; Google Play/App Store) | $2.25/user/mo annual (truein.com/pricing); from $12/user/yr (softwareadvice.com) |
| **eSSL** | Biometric + access control (India) | India's biometric market leader since 2002, 4M+ customers; devices + own software suite (esslsecurity.com) | Hardware + software bundles |
| **greytHR** | SME HRMS + payroll (India) | Attendance via biometric/mobile + ESS + PF/ESI/tax compliance (greythr.com, Jul 2026) | Essential ₹2,495/mo for 50 employees; Growth ₹4,495/mo |
| **Keka** | SME/enterprise HRMS + payroll (India) | Mobile attendance + full HR/payroll; custom pricing (greythr.com/alternatives, Apr 2026) | Custom, from ~₹4,950/mo for 50 |
| **Jibble** | Freemium global time tracker | Face recognition, kiosk mode, GPS, geofencing, NFC/RFID/PIN, offline sync, desktop app (jibble.io; work-management.org, 2026) | Free tier; paid from ~$1.25/user/mo |
| **Zoho People** | Global HRMS | Geofencing, self-service, time tracking (tinyteam.io, Mar 2026) | $1.25–$4.50/user/mo |
| **BambooHR** | US HRMS | Time tracking, no biometric device depth, no India compliance (pin.com, Dec 2025) | $10–25/employee/mo, $250/mo floor |

---

## 2. Feature comparison matrix

| Feature | **NeevTime** | BioTime | Truein | eSSL | greytHR | Keka | Jibble | Zoho |
|---|---|---|---|---|---|---|---|---|
| ZKTeco/eSSL device-native sync (ADMS/TCP/iclock) | ✅ deep | ✅ native | ◐ app-based | ✅ native | ◐ via integ. | ◐ via integ. | ❌ | ❌ |
| Unlimited devices, no per-device license | ✅ | ❌ per-device | n/a (app) | ❌ per-device | n/a | n/a | n/a | n/a |
| Statutory registers (Factories Act) | ✅ unique | ❌ | ❌ | ◐ | ◐ | ◐ | ❌ | ❌ |
| Leaves + multi-level approval workflows | ✅ deep | ◐ | ◐ | ◐ | ✅ | ✅ | ◐ | ✅ |
| Attendance rules / shifts / schedules / OT | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ◐ | ✅ |
| Real-time dashboards + scheduled reports | ✅ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ |
| Mobile punch (GPS + geofence, no app) | ✅ | ❌ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ |
| Native iOS/Android app | ❌ web-only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Face recognition | ❌ | ✅ (devices) | ✅ core | ✅ (devices) | ❌ | ❌ | ✅ | ❌ |
| Photo at punch (anti-buddy-punching) | ❌ planned | ◐ | ✅ | ◐ | ❌ | ❌ | ✅ selfie | ❌ |
| Offline capture & sync | ❌ | ◐ device buffer | ✅ | ◐ | ❌ | ❌ | ✅ | ❌ |
| Kiosk/tablet time-clock mode | ❌ | ◐ | ✅ | ◐ | ❌ | ❌ | ✅ | ❌ |
| Contractor / multi-vendor workforce mgmt | ❌ single flag | ❌ | ✅ core | ◐ | ◐ | ◐ | ❌ | ❌ |
| Full payroll (PF/ESI/income tax) | ❌ export only | ❌ | ❌ | ◐ | ✅ | ✅ | ❌ | ◐ |
| HRMS integrations (ERPNext, Odoo, SAP, Workday, BambooHR, Zoho, webhook) | ✅ 8 types | ❌ | ◐ | ❌ | ◐ | ◐ | ❌ | native |
| Audit trail (who changed what) | ✅ built | ◐ | ❌ | ◐ | ◐ | ◐ | ❌ | ◐ |
| Backup/restore + health monitoring | ✅ unusual | ◐ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self-hosted / data ownership | ✅ | ✅ on-prem | ❌ | ◐ | ❌ | ❌ | ❌ | ❌ |
| WhatsApp-based punch | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Price | ₹40K–1.5L license + AMC **or** ₹25–35/emp/mo | per-device one-time | $2.25/emp/mo | bundle | ₹50/emp/mo | ~₹99/emp/mo | free / $1.25 | $1.25–4.50/emp/mo |

---

## 3. Where NeevTime wins and loses today

### Wins (defensible today)
1. **Device depth × compliance × self-host** — a combination no single competitor has (see §5).
2. **Unlimited devices, one price** — BioTime charges per device; NeevTime doesn't. The #1 replacement trigger.
3. **Statutory registers** — Factories Act formats nearly absent from SaaS competitors; greytHR/Keka do PF/ESI filings, not register books.
4. **Leaves + approval workflow depth** — beats BioTime and Truein outright.
5. **Audit trail + backup + monitoring** — legal-record credibility that SaaS vendors don't offer at any price.
6. **Price** — 5–6× cheaper than Truein per employee; cheaper than greytHR/Keka; no per-device cost vs BioTime.

### Losses (what competitors currently beat you with)
1. **Native mobile apps** — every serious competitor ships iOS/Android; you're web-only.
2. **Face recognition + photo at punch** — Truein/Jibble sell on this; your anti-buddy-punching story is absent.
3. **Offline capture** — factory sites with poor connectivity default to Jibble/Truein.
4. **Contractor management** — Truein's core segment is contract/multi-site workforce.
5. **Full payroll** — greytHR/Keka bundle payroll; you only export templates.
6. **Kiosk mode, desktop apps, NFC/RFID** — Jibble's breadth.

---

## 4. The additions that beat them (ranked by impact × feasibility)

### Tier 1 — Ship these first (S size, days each)

**A1. Photo at punch** — capture a still with mobile punch, store against the record.
- Beats: Truein & Jibble's anti-fraud story at 5% of the cost; greytHR/Keka (no such feature).
- Marketing line: "Buddy punching ends here — no face-matching AI needed."

**A2. Free BioTime/UTime migration tool** — import employees, schedules, and attendance history from ZKTeco exports.
- Beats: BioTime itself. No competitor offers a zero-friction migration path. This is the highest-converting replacement weapon.
- Marketing line: "Keep your readers. Switch the software. We move your data for free."

**A3. Kiosk mode for tablets** — a lock-screen clock-in UI (PIN/QR/photo) turning any tablet into a time clock.
- Beats: Jibble's kiosk and Truein's tablet mode; also gives BioTime owners a modern front desk without new hardware.

**A4. WhatsApp-based punch** — employees send "IN"/"OUT" (or a photo) to a WhatsApp number; geo-tagged, logged.
- Beats: everyone — no mainstream competitor does WhatsApp attendance well for Indian SMBs.
- Why it matters: zero app download, works on any phone, India-native habit. Huge greenfield SMB reach.

### Tier 2 — Segment unlockers (M size, 1–2 weeks each)

**B1. Contractor as an entity** — per-vendor reporting, multi-vendor management, contractor-wise registers.
- Beats: Truein on its home turf (contract/multi-site workforce) — with registers + device sync Truein can't offer.
- This is where India's workforce growth is (staffing, security, housekeeping, drivers).

**B2. Offline capture** — mobile punch queues punches locally and syncs when connectivity returns.
- Beats: Jibble/Truein on factory/remote sites; unblocks much of the addressable market.

**B3. Payroll connector pack** — data-driven export templates for Tally, Zoho Payroll, QuickBooks, custom ERP.
- Beats: greytHR/Keka's payroll bundling by being "the attendance layer that feeds whatever payroll you already use."
- You already have the template architecture (ROADMAP 2.5) — this is one entry per format, sold as add-on.

**B4. Shift auto-detection + AI late/absent alerts** — automatic shift inference and WhatsApp/email alerts to managers.
- Beats: the "AI" marketing hook without the face-recognition cost; greytHR/Keka charge for such modules.

### Tier 3 — Strategic, decide deliberately (L size)

**C1. Native mobile app (iOS/Android)** — employee self-service + punch. Build only when a customer pays for it; the web portal + WhatsApp punch covers most needs meanwhile.
**C2. Face recognition module** — premium tier. Deliberately deferred (consent/accuracy burden); photo-at-punch + audit trail covers most fraud.
**C3. Access control module** — door access like BioTime/eSSL. Only after attendance base is solid; it re-enters the hardware-adjacent world you chose to avoid.

---

## 5. The winning wedge (why these additions win)

Plot the market on two axes — **device-native depth** (can it run the readers on your wall?) and **India compliance depth** (registers/PF/ESI):

```
                compliance depth →
     high  |  greytHR · Keka                ** NeevTime (target zone) **
           |  Zoho
           |  Truein · Jibble              BioTime · eSSL
     low   |_________________________________________
                    app-only            device-native →
```

- **BioTime/eSSL**: device-native, zero India compliance, per-device license → you beat them with unlimited-device pricing + registers + migration tool.
- **Truein**: face/contractor/offline but app-based, no registers, no device depth, SaaS only → you beat them with device sync + registers + self-host + price + WhatsApp punch.
- **greytHR/Keka**: payroll + compliance but thin device integration, costlier → you beat them on device depth, license economics, and "attendance + registers + any payroll" positioning.

**No competitor sits in the top-right.** That quadrant — device-native + India compliance + self-host — is NeevTime's to own. The Tier-1 additions (photo, migration, kiosk, WhatsApp) are what make the quadrant claim *visible* to buyers instead of theoretical.

---

## 6. Recommended 90-day feature priority (merge with ROADMAP)

| Order | Addition | Size | Beats | Revenue impact |
|---|---|---|---|---|
| 1 | Photo at punch | S | Truein/Jibble fraud story | Parity — closes a "we don't have it" in demos |
| 2 | BioTime/UTime migration tool | S | BioTime switching friction | Directly converts replacement buyers |
| 3 | WhatsApp punch | S | Everyone (no competitor) | Greenfield SMB acquisition |
| 4 | Kiosk mode | S | Jibble/Truein tablet UX | Enterprise-feel at SMB price |
| 5 | Contractor entity | M | Truein's segment | Unlocks contract-workforce market |
| 6 | Offline capture | M | Jibble/Truein on remote sites | Factory/remote sites |
| 7 | Payroll connectors (Tally etc.) | M | greytHR/Keka bundling | Add-on revenue per format |
| 8 | Shift auto-detection + alerts | M | "AI" marketing hook | Upsell tier |

After these: verify registers against a real inspection (converts the compliance claim into a reference) and re-evaluate the native app with real demand data.

---

## 7. Sources

- BioTime 9.5: zkteco.me, zkteco.sa, nobleframetechnologies.com (Jun 2026), etopme.ae.
- Truein: truein.com, truein.com/pricing, Google Play/App Store listings, softwareadvice.com.
- eSSL: esslsecurity.com, G2 profile.
- greytHR/Keka: greythr.com blog (Jul 2026), greythr.com/alternatives/keka (Apr 2026), saasworthy.com (Jun 2026).
- Jibble: jibble.io (kiosk, offline, telecommunication time tracking), work-management.org review (2026), Apple App Store (Aug 2026).
- Zoho People / BambooHR pricing: tinyteam.io (Mar 2026), pin.com (Dec 2025).
- NeevTime state: codebase review (17 Aug 2026), ROADMAP.md (16 Aug 2026).

*Competitor feature claims are from vendor sites/reviews as of the cited dates and change frequently; verify before quoting in sales collateral.*
