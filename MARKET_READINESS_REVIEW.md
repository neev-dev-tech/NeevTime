# NeevTime — Market Readiness, Revenue & Feature-Gap Review

**Date:** 17 August 2026
**Basis:** codebase review (client, server, database schema, deployment config), `ROADMAP.md` (revised 16 Aug 2026), project documentation, and current market research (sources dated 2025–2026).

---

## 1. Executive summary

NeevTime is **sellable now to a narrow, well-defined buyer** — an India-based SME or factory that owns ZKTeco/eSSL biometric readers, needs statutory compliance registers, and prefers self-hosting. It is **not ready for broad SaaS-style selling** until five items are closed (mostly operations, not features).

| Dimension | Verdict | Why |
|---|---|---|
| Security | ✅ Good | SQL injection fixed, auth on all report routes, validation middleware, TLS done, password hashing |
| Core functionality | ✅ Good | 53 tables, 57 routes, device sync (ADMS + ZKTeco TCP), attendance engine, leaves, approvals, payroll export |
| Reliability/ops | ⚠️ Needs 1-2 days | Off-machine backup still open; websocket falls back to polling; ~40 dialogs untested in CI |
| Sales readiness | ⚠️ Needs work | No public site/pricing, no trial flow, no billing, tenancy decision open, install procedure not single-doc |
| Product-market fit (India factory/compliance niche) | ✅ Strong | Statutory registers + ZKTeco ecosystem + self-host are defensible against SaaS competitors |
| Product-market fit (broad HRMS / hourly workforce) | ❌ Weak | No native mobile app, no offline capture, no contractor entity, no face recognition — Truein/eSSL win there |

**Market:** Global time & attendance software ≈ **USD 3.3–4.3 B (2025)**, growing to ≈ USD 5.7–7 B by 2032–34 (CAGR 6.3–9.5%) — sources: imarcgroup.com, marknteladvisors.com, mordorintelligence.com, maximizemarketresearch.com. India segment ≈ **USD 204 M (2024) → USD 662 M (2035)** — marketresearchfuture.com (Feb 2026). This is a growing, fragmented market with room for a focused self-hosted player.

**Recommended monetization (3 models, in order):**
1. **Self-hosted one-time license + AMC** (₹40K–1.5L license, 15–20% annual maintenance) — matches today's product, sells immediately.
2. **Per-employee SaaS tier** (₹20–35/employee/month, ~$2.25/user/mo benchmark) — for buyers who won't self-host.
3. **Reseller/white-label channel** through ZKTeco/eSSL dealers — the distribution path that actually moves units in this market.

---

## 2. What the product actually is today

### 2.1 Verified current state (from code, not claims)

- **Backend:** Node.js/Express + PostgreSQL (53 tables), Socket.io, JWT auth, bcrypt, Nodemailer, morgan logging.
- **Device layer:** ADMS protocol handler + ZKTeco TCP (`zkteco-tcp.js`), command queue, device registry/capabilities, punch ingest, real-time sync, `/iclock` endpoint (ZKTeco push protocol).
- **Frontend:** React 18 + Vite, MUI v7 + Tailwind, Zustand, Recharts; 57 routes ≈ 47 authenticated screens + employee portal.
- **Modules:** employees (incl. deleted-employee restore), departments/positions/areas, devices, attendance rules (global & department), shifts, timetables, break times, grace, OT calc, schedules (dept/employee/temp) + calendar, holidays + holiday locations, geofences, leaves (types/balances/applications), approval workflows (flows/nodes/roles), regularizations, mobile punch (GPS), manual entry, statutory registers, payroll export, 10+ reports + scheduled reports + report history, export center (CSV/PDF/Excel), import wizard, HRMS integrations (ERPNext, Odoo, Horilla, SAP SuccessFactors, Workday, BambooHR, Zoho People, webhook), backup destinations (S3/SFTP/SharePoint/mounted), audit trail, system logs, alerts/health monitor, employee portal (ESS), Docker + nginx + PM2 deployment.

### 2.2 What was fixed recently (verified in code)

- SQL injection in first-last report → parameterized with `$${n}` ✅
- Missing auth on reports routes → `router.use(authenticateToken)` ✅
- Date-range validation middleware ✅
- Stale-volume disaster class → named external volume, node runs as own container, deploy probes `/iclock` and punch counts ✅
- Backup pipeline (pg_dump binary, volume mount, `.dump` format acceptance) ✅
- Browser CI covering all screens ✅ (found a live defect on first run)

### 2.3 What is still open (from ROADMAP.md, 16 Aug 2026)

| Item | Size | Blocking what |
|---|---|---|
| Off-machine backup copy | S | "Any sale" — one disk failure away from no backup at all |
| Tenancy decision (per-customer deploy vs shared multi-tenant) | S/L | Deployment model, pricing, sales |
| Single installation procedure (one doc, tested on clean machine) | S | Every customer after the first |
| Websocket through nginx (currently polling fallback) | M | Live-screen freshness |
| ~40 dialogs untested in CI | M | Trust in "everything works" |
| Photo at punch | S | Competitive parity (largest gap) |
| Native mobile app | L | Employee self-service on mobile |
| Contractor as entity | M | Contract-workforce segment |
| Offline capture | M | Low-connectivity sites |

---

## 3. Market readiness scorecard

Scored against: security, core function, ops reliability, sales motion, and competitive positioning. Scale 0–100.

| Area | Score | Notes |
|---|---|---|
| Security | 85 | Good baseline. No rate limiting, no CSRF, sensitive-data logging hygiene, no pen test. Docs (March 2026) flagged these as open. |
| Core functionality | 80 | Attendance + devices + leaves + approvals + registers are genuinely deep. Report breadth (10+ of ~35 listed) is thinner than the UI implies. |
| Reliability & ops | 60 | Backup restore proven; off-machine copy open; monitoring alert `checkNoPunches` never fired once; websocket degraded. |
| Sales readiness | 40 | No pricing page, no trial/onboarding, no billing, no multi-tenancy decision, install procedure is 8 overlapping docs. |
| Competitive moat (niche) | 75 | ZKTeco ecosystem + statutory registers + self-host = real differentiation in India factory/SME segment. |
| Competitive moat (broad) | 35 | SaaS incumbents (Truein, greytHR, Keka, Zoho People, Jibble) beat it on mobile, face recognition, offline, contractor tooling, and zero-friction onboarding. |

**Bottom line:** readiness ≈ **functional product, unready business**. The roadmap's own Phase 0 framing is right: nothing in Phase 1 matters while ops items are open. Estimated closure: ~1 week of focused work for the S items, plus a tenancy decision.

---

## 4. How to generate revenue

### 4.1 Pricing benchmarks (market data, 2025–2026)

| Product | Model | Price (source) |
|---|---|---|
| ZKTeco BioTime | One-time license per device | ~₹16.5K–₹30K+ / 5-device license (ryans.com BD, newgen.pk); free tier limited to 2 devices |
| Truein | SaaS per user | $2.25/user/mo billed annually (truein.com/pricing); from $12/user/yr (softwareadvice.com) |
| greytHR | SaaS per company | Essential ₹2,495/mo for 50 employees ≈ ₹50/emp/mo (greythr.com blog, Jul 2026) |
| Keka | SaaS per company | Custom, from ~₹4,950/mo for 50 employees (greythr.com/alternatives, Apr 2026) |
| Zoho People | SaaS per user | $1.25–$4.50/user/mo (tinyteam.io, Mar 2026) |
| BambooHR | SaaS per user | $10–25/employee/mo, $250/mo floor (pin.com, Dec 2025) |
| Jibble | Freemium SaaS | Free tier; plans from ~$1.25/user/mo |

**Positioning insight:** NeevTime sits naturally **below BambooHR, beside Truein/Zoho, above the BioTime free tier** — and uniquely *above* all SaaS vendors on data ownership (self-hosted) and compliance depth (registers).

### 4.2 Model A — Self-hosted license + AMC (recommended #1, ready now)

Match the BioTime licensing motion, but priced as software:

- **License:** ₹40,000–₹1,50,000 one-time per site, tiered by device count (up to 5 / up to 20 / unlimited) and employee count (≤100 / ≤500 / unlimited).
- **AMC (Annual Maintenance Contract):** 15–20% of license/yr — updates, support, backup verification.
- **Implementation fee:** ₹10,000–₹25,000 (setup, reader configuration, register verification, training).
- **Revenue math (illustrative):** 1 site at ₹1L license + ₹20K AMC + ₹15K setup = **₹1.35L year 1, ₹20K/yr recurring**. 20 sites = ₹27L cumulative year 1, ~₹4L/yr recurring. No hosting cost, near-100% margin.
- **Why it fits:** product is self-hosted today; no tenancy work needed; buyers in this segment are used to paying once for software they run.

### 4.3 Model B — SaaS subscription (recommended #2, needs tenancy decision)

- **Pricing:** ₹25–35/employee/month (annual billing) or $1.50–2.50/user/mo, free trial 14 days, floor ₹1,500/mo.
- **Tiers:** Lite (attendance only) / Pro (attendance + leaves + approvals + registers) / Enterprise (integrations + scheduled reports + priority support).
- **Revenue math:** 100-employee company at ₹30/emp/mo = ₹3,000/mo = ₹36K/yr. 100 customers = **₹36L ARR**; 300 customers ≈ ₹1 Cr ARR. Churn control matters more than price.
- **Requires:** shared multi-tenant mode done *properly* (non-superuser DB role, RLS, tenant-aware `/iclock` and cron jobs) — or per-customer deployments sold as "private cloud" at higher price.

### 4.4 Model C — Reseller / white-label channel (recommended #3, fastest volume)

- Sell through ZKTeco/eSSL dealers and IT-system integrators who already sell readers. They attach NeevTime as the software that makes hardware useful.
- **Dealer price:** 40–50% off list; dealer marks up.
- White-label option (brand it as the dealer's product) at +30% premium.
- **Why it works:** this market buys through dealers, not self-serve; the app's ADMS/ZKTeco integration is exactly what dealers need.

### 4.5 Add-on revenue (once base is sold)

- **Payroll connectors:** each new format (Tally, QuickBooks, custom) as paid add-on — the export is already data-driven templates (ROADMAP 2.5).
- **Face recognition module** (if ever built): premium tier.
- **Advanced analytics / shift auto-detection:** upsell.
- **Support SLAs:** bronze/silver/gold response tiers.
- **Partner implementation services** for the 30% of buyers who won't self-install.

### 4.6 Revenue readiness checklist

- [ ] Publish pricing page (license + SaaS tiers) — removes the #1 blocker to inbound.
- [ ] Decide tenancy model (ROADMAP 0.4) — gates Model B.
- [ ] Add license-key mechanism for Model A (or trust-based invoicing initially).
- [ ] Build a 14-day trial + onboarding checklist for SaaS tier.
- [ ] Write the one-doc install guide (ROADMAP 1.2) — gates repeatable sales.
- [ ] Name the backup destination host (ROADMAP 0.2) — gates the first sale.

---

## 5. Feature gaps vs the market

### 5.1 Gaps that change buying decisions (high priority)

| Gap | Competitor norm | NeevTime status | Effort | Business impact |
|---|---|---|---|---|
| Photo at punch | Truein, eSSL ship it; kills buddy punching | Planned (ROADMAP 1.1, S) | S | Largest cheap competitive gap — do first |
| Native mobile app (iOS/Android) | Truein, eSSL, Jibble all ship | Web-only ESS | L | Blocks employee-facing selling; defer until a customer asks, but expect them to |
| Contractor as entity (per-vendor reporting, multi-vendor mgmt) | Truein's core market | Single flag today | M | Blocks contract-workforce segment (biggest India growth area) |
| Offline capture (reader buffers, app syncs later) | Standard for factory sites | Not present | M | Blocks low-connectivity sites — much of the addressable market |
| Face recognition | Truein/eSSL default | Deliberately deferred (consent/accuracy burden) | XL | Do NOT rush; photo-at-punch covers most fraud cases |

### 5.2 Gaps that matter later (medium priority)

- **Automatic shift detection, compensatory off, on-duty categories** — ROADMAP notes these as real competitor gaps, none is a standalone buying decision.
- **Odoo/Horilla parity** — currently sync employees + push attendance only; public holidays read as absences (ROADMAP 2.2). Affects credibility of the integration story.
- **Shift swapping, shift bidding** — common in retail/manufacturing SaaS.
- **Geofence + time-window attendance via mobile** — has geofences; verify mobile punch enforces them (checklist item).
- **WhatsApp/Telegram punch** — popular in India SMB segment; cheap to add via webhook.
- **Kiosk/tablet mode** — a lock-screen punch UI for front-desk tablets; cheap, commonly requested.
- **Report breadth** — backend implements ~10 of ~35 report types the UI references; implement the most-used missing ones (transaction, missed punch, time card) before claiming parity.

### 5.3 Gaps that are NOT gaps (defensible advantages)

- **Statutory registers** (Factories Act formats) — almost no SaaS competitor does this properly for Indian states; verify against a real inspection (ROADMAP 1.4) and it becomes a reference case.
- **ZKTeco/eSSL device depth** (ADMS + TCP + `/iclock` + command queue) — Truein/greytHR treat devices as thin integrations; this is native here.
- **Self-hosted + data ownership** — compliance-sensitive factories (biometric data, consent) prefer on-prem.
- **Audit trail** — legal-record systems need it; already built (merge pending, ROADMAP 1.3).

### 5.4 Feature-gap priorities vs revenue (recommendation)

1. **Ship photo-at-punch** (S) — closes the biggest competitive gap cheaply; enables "anti-buddy-punching" marketing.
2. **Verify registers against a real inspection** (S) — converts a compliance claim into a reference; directly supports Model A pricing.
3. **Contractor entity** (M) — unlocks Truein's segment (contract/multi-vendor workforce), which is where India growth is.
4. **Offline capture** (M) — unlocks factory/remote sites.
5. **Native mobile app** (L) — only after 2–4, when a customer asks.

---

## 6. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Selling before ops closed (backup/tenancy/install doc) | High (today) | Reputational, refunds | Close ROADMAP Phase 0 first; don't take money before off-machine backup exists |
| SaaS incumbents win on mobile/face/offline | Medium | Lost segments | Position as self-hosted + compliance + ZKTeco-native; don't fight on their turf |
| Biometric data consent burden | Medium (growing) | Legal exposure | Keep face recognition out; publish data-retention & consent docs; audit trail is a selling point |
| Single-developer bus factor | High | Everything stops | Document the codebase (mostly done); CI is the safety net; consider a second pair of hands for Phase 0 |
| Report parity claims overstate | Medium | Trust erosion | Make the 7→35 report gap explicit in sales collateral; implement top 5 missing reports |

---

## 7. Action plan (next 30 days)

**Week 1 — Close Phase 0 (no sales before this):**
1. Off-machine backup copy (ROADMAP 0.2) — one hour, highest value.
2. Tenancy decision (0.4) — pick per-customer deploy to sell today.
3. Single install doc tested on a clean machine (1.2).
4. Photo at punch (1.1).

**Week 2 — Revenue mechanics:**
5. Pricing page (license + SaaS tiers) and a one-page sales sheet.
6. Registers verified by a real compliance officer (1.4).
7. License/AMC template + invoicing flow.

**Week 3 — Go-to-market:**
8. Dealer outreach (ZKTeco/eSSL distributors) with white-label option.
9. Pilot-site case study (the co-located-company site is already the素材).
10. 14-day trial flow for the SaaS tier (if tenancy chosen) or "managed install" offer.

**Week 4 — Measure:**
11. Track demo→paid conversion; pick 3 reference customers; decide SaaS vs license-led go-to-market based on what converts.

---

## 8. Sources

- Market size: imarcgroup.com (2025); marknteladvisors.com; mordorintelligence.com (Feb 2026); maximizemarketresearch.com (Oct 2025); marketresearchfuture.com — India (Feb 2026).
- Pricing: truein.com/pricing; softwareadvice.com (Truein); greythr.com blog (Jul 2026) & greythr.com/alternatives/keka (Apr 2026); tinyteam.io (Mar 2026); pin.com (Dec 2025); ryans.com / newgen.pk (ZKTeco BioTime); jibble.io.
- Product state: codebase review (17 Aug 2026) + ROADMAP.md (16 Aug 2026) + internal review docs (Mar 2026).

*All market figures are as published by the cited sources on the cited dates; pricing changes frequently — re-verify before quoting to customers.*
