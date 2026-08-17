# NeevTime — Business Model, Compliance & Battle Cards

**Date:** 17 August 2026
**Purpose:** fills the gaps not covered in the market-readiness, GTM, and competitive reviews — the money math, the data-law position, the demo objections, and the 12-month business plan.

---

## 1. Unit economics (all figures are planning estimates — validate with real data)

### 1.1 Per-customer economics

| Metric | License customer | SaaS customer |
|---|---|---|
| Average deal | ₹75K one-time + ₹15K implementation + ~₹13K/yr AMC (17.5%) | 100 employees × ₹30 = ₹3,000/mo = ₹36K/yr |
| Gross margin | ~95% (self-host, near-zero COGS) | ~75–80% (hosting ~₹1–2K/mo at this size) |
| CAC (self-serve/SEO) | ~₹5–8K (time + tools; listings nearly free) | ~₹5–8K |
| CAC (partner) | ~₹19K (25% commission on year-1 value) | ~₹9K (25% of year 1) |
| CAC (direct/consultative) | ~₹20–30K (demos, travel) | ~₹20–30K |
| Year-1 value | ~₹1.03L | ₹36K |
| LTV (5-yr, 20% churn) | ~₹3.5–4L | ~₹1.1L (at 80% GM) |
| LTV:CAC (self-serve) | ~40–50:1 | ~14:1 |

**Reading:** both models are healthy on ratios because costs are low. The constraint is not unit economics — it's **deal flow and time**. A solo founder's bottleneck is demos and implementations, not margins.

### 1.2 Three year-1 scenarios (revenue, not profit)

| Scenario | Customers (lic/SaaS) | Year-1 revenue | What it requires |
|---|---|---|---|
| Conservative | 4 / 6 | ₹6–8L (~$8–10K) | SEO + listings only, no partners |
| Base | 10 / 15 | ₹15–16L (~$19–20K) | 2–3 partners active + outbound demos |
| Optimistic | 20 / 30 | ₹30–35L (~$38–44K) | Partner channel working + WhatsApp punch shipped |

Year 2 (base case, 80% retention, same acquisition rate): **₹30–38L** — recurring AMC + SaaS stack up while new license revenue repeats. At ~100 cumulative customers (≈ year 2–3), the run rate reaches **₹60–80L/yr (~$75–100K)**.

**Solo-founder reality check:** the license model is cash-dense but lumpy; the SaaS model is smoother but slower to grow and needs hosting ops. Carry both — license for cash, SaaS for compounding — and let customers self-select.

### 1.3 What to instrument from day 1

Trial sign-ups/wk → trial→paid % → demo→close % → CAC per channel → churn (SaaS) → AMC renewal %. A spreadsheet is fine at this stage; just record every lead's source.

---

## 2. India DPDP Act 2023 — compliance as risk and as moat

**Status:** DPDP Act 2023 is in force; DPDP Rules 2025 notified (dpdpa.com). Attendance apps are directly in scope: employee names, GPS locations, and **biometric templates are personal data** collected by the employer (Data Fiduciary), with the software as Data Processor in SaaS mode.

### 2.1 What NeevTime must provide for its customers to be compliant (and can market)

| DPDP obligation | What the product needs | NeevTime status |
|---|---|---|
| Notice + consent at collection | Consent capture at employee enrollment; per-company privacy notice | ❌ missing — build |
| Purpose limitation | Collect only what attendance needs (already true) | ✅ by design |
| Retention limitation | Delete biometric templates + docs on resignation/exit | ◐ resignation flow exists — add template purge + retention settings |
| Data subject rights (access/correct/erase) | Employee portal request + admin export/delete | ◐ portal exists — add request workflow |
| Breach notification | Alert when something is wrong + audit trail | ✅ alerts + audit trail exist — add breach report template |
| Data localization | Data stays in India | ✅ **self-host = trivially true** — your strongest line |
| Security safeguards | Encryption, access control, backups | ✅ TLS, JWT, backups done |

### 2.2 The sales line

> "Your employees' fingerprints and face data stay **on your server**, not in a SaaS vendor's cloud. Consent is captured at enrollment, templates are purged when an employee exits, and every change is audited. DPDP-ready by design."

This converts a regulatory burden into the exact reason a compliance-driven factory (your ICP) buys NeevTime over Truein/Jibble, which hold biometric data on foreign clouds. **Do not sell this claim until consent capture + template purge exist** (small builds — see §4).

### 2.3 Risk note

Face recognition would multiply consent obligations (higher scrutiny for sensitive biometrics). This strengthens the existing decision to defer it: photo-at-punch (a stored image, not a biometric match) is a lighter consent story.

---

## 3. Competitive battle cards (objection → response)

**"Truein has face recognition."**
> Truein runs on phones/tablets — your existing ZKTeco readers become useless. NeevTime works with the readers you already own, captures a photo at punch (anti-buddy-punching), and your biometric data never leaves your server. Face matching carries a heavy DPDP consent burden — a reviewable photo covers most fraud without it. And we're 5–6× cheaper per employee.

**"Our dealer set up BioTime."**
> BioTime charges per device and stops at attendance. NeevTime: unlimited devices, one price, plus leaves, approvals, statutory registers and audit trail BioTime doesn't have. We migrate your employee data and attendance history from BioTime for free — keep the hardware, switch the software.

**"greytHR/Keka bundle payroll."**
> We're the attendance + compliance layer that feeds *whatever payroll you already use* — Tally, Zoho Payroll, QuickBooks, or an ERP. You're not locked into one payroll vendor, you pay per site not per employee, and we integrate your ZKTeco devices natively instead of a thin adapter. If you want payroll, keep greytHR for payroll and use us for attendance — it's the cheaper split.

**"Jibble is free."**
> Jibble has no ZKTeco/eSSL device sync, no Indian statutory registers, no PF/ESI-friendly exports, and holds employee data on foreign servers (a DPDP problem for you, not for them). Free is expensive when an inspector asks for registers in the right format.

**"We manage it in Excel."**
> Excel can't talk to your readers in real time, can't geofence mobile punches, can't enforce leave policies, and doesn't produce inspection-ready registers with an audit trail. One inspection is more expensive than our license.

**"Why pay a license when SaaS is cheaper per month?"**
> Over 3–5 years the one-time license beats per-employee subscriptions, your data lives on your server, and there's no per-device or per-headcount creep as you grow. SaaS is available if you prefer — same product.

---

## 4. Twelve-month business roadmap

| Month | Product | Business |
|---|---|---|
| 1–2 | Close Phase 0 (off-machine backup, install doc, tenancy decision); ship **photo at punch** + **BioTime migration tool** | Landing page + pricing live; SoftwareSuggest/G2/Capterra listings; Razorpay checkout; consent capture at enrollment |
| 3–4 | Ship **WhatsApp punch** + **kiosk mode**; template purge on exit | First 10 paid customers; 2–3 partners signed (CA/BPO/staffing); first 5 reviews |
| 5–6 | **Contractor entity**; registers verified by a compliance officer | 25 customers; pilot-site case study published; DPDP claims now fully true |
| 7–9 | **Offline capture**; **payroll connectors** (Tally first) | 50 customers; pricing page v2; decide if native app demand is real |
| 10–12 | Re-evaluate native mobile app + face recognition with real demand data | 100-customer run-rate; first hire (support or sales); annual AMC renewal cycle |

**Do not skip:** (1) off-machine backup — the one operational item that can kill a sale, (2) written terms — customer contract with DPDP addendum and SLA, (3) recording every lead's source — you cannot optimize channels you cannot see.

---

## 5. What "anything else" boils down to

You have: a sellable product (once Phase 0 closes), a revenue model with healthy unit economics, a software-only channel plan, and a beat-them feature list. What remains is **execution discipline**: ship the four S-size features (photo, migration, WhatsApp punch, kiosk) in that order, make the DPDP claim true before marketing it, and run the 90-day channel plan from the sales playbook. The math says the business works at ~25 customers; everything before that is proof.

---

## 6. Sources

- DPDP Act 2023 / DPDP Rules 2025 status: dpdpa.com, wikipedia.org, zscaler.com (Oct 2024).
- Pricing/competitor basis: MARKET_READINESS_REVIEW.md, COMPETITIVE_ANALYSIS.md, GTM_SALES_PLAYBOOK.md (17 Aug 2026).
- All financial figures are planning estimates for internal use, not forecasts to share with customers.
