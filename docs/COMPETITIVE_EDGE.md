# NeevTime — What Actually Beats Them

**A code-grounded review of the competitive plan**

17 August 2026 · companion to COMPETITIVE_ANALYSIS.md

---

## Why this document exists

`COMPETITIVE_ANALYSIS.md` reads the market well. This one reads the codebase, and checks each proposed move against what is actually built. Three things change as a result: one item should be dropped, one is missing entirely and is the most important of all, and the cheapest wins are cheaper than the plan assumes.

---

## The one that must be first, and is not on the list

### Tier 0 · Verify the statutory registers against a real inspection

Every version of the competitive story rests on the same claim: *"Factories Act registers, which the SaaS competitors do not have."* It is the wedge, the moat, and the reason a factory buys this instead of Keka.

**Nobody has ever checked it.** The register content is correct — muster roll, overtime, leave, with holidays and approved leave correctly excluded from absence — but the *layout* each state's Factories Rules require has never been seen by anyone who has sat through an inspection.

That asymmetry is dangerous. Every other gap on the list costs a deal. This one costs a customer *after* they have bought, at the worst possible moment, on the one thing they were promised. A compliance product that fails an inspection is not a weak product; it is a liability.

**It costs almost nothing to close.** Ask the pilot customer's compliance officer to mark up one month of the muster roll. A day of someone's attention converts the central claim from an assertion into a reference — and a reference is what closes the next five deals.

**Then go further, because this is the real moat.** Factories Rules differ by state: Maharashtra, Tamil Nadu, Karnataka and Gujarat each prescribe their own forms. Supporting three or four states properly is domain work, not engineering — which is exactly why no SaaS competitor will do it. Face recognition can be bought. Knowing what Form 25 looks like in Tamil Nadu cannot.

*This is the only item on any list that competitors cannot copy by writing code.*

---

## The one to drop

### A4 · WhatsApp-based punch

The analysis calls this "beats everyone". The mechanics say otherwise, and in a way this project has already been burned by.

WhatsApp messaging requires the WhatsApp Business Platform: a Meta business account, a verified business, a dedicated phone number, and message templates submitted for approval. Conversations are billed per session. None of it is available to a self-hosted application that a customer runs on their own VM.

In practice each customer would need **their own** Meta business account, their own number, their own template approvals, and their own billing relationship — before a single punch could be sent. For an SME that will not happen.

This is the same shape as the SAP SuccessFactors, Workday, BambooHR and Zoho People adapters that were built, shipped as checkboxes, and deleted: **a feature gated behind a vendor relationship the product cannot obtain on the customer's behalf.** It looks like a differentiator on a slide and becomes a support ticket after the sale.

*If the WhatsApp habit is the real insight — and it is a good one — the honest version is outbound only: alerts and daily digests to managers through a number you own, sold as a service you host. That is a different product line, not a punch method.*

---

## The cheapest real wins, re-costed against the code

### A1 · Photo at punch — **cheaper than S**

The plan sizes this as days. It is less. `routes/mobile_attendance.js` already handles the punch, geofence verification and GPS capture; the permission flow exists; `attendance_logs` already carries `latitude`, `longitude`, `punch_source` and `is_geofence_verified`. What is missing is an image column, a storage path, and a thumbnail in the log view.

**Do this first among the features.** It closes the largest competitive gap — anti-buddy-punching — against Truein and Jibble, at a fraction of face recognition's cost, and with none of its consent burden under DPDP.

### A3 · Kiosk mode — **genuinely S**

A React route that takes a PIN or QR, shows a confirmation, and returns to a lock screen. It reuses the punch endpoint that already exists. The hard part is not the code; it is deciding how a shared tablet authenticates without becoming a way to punch for someone else — which photo-at-punch (A1) solves. **Build A1 first, then A3 inherits its anti-fraud story.**

### A2 · Migration from BioTime — **right call, and it is the sales weapon**

The import wizard, the device registry and ADMS ingest already exist. What is missing is a mapping from ZKTeco's export format.

The analysis is right that this converts better than any feature. Worth stating why: it removes the *only* real objection a BioTime owner has, which is not price or features but the years of history they would lose. "Keep your readers, we move your data" is the strongest sentence in the whole plan.

### B1 · Contractor as an entity — **design it against the pilot, not a spec**

This deployment is already running the case: a co-located company's staff on `DE001`–`DE006`, plus drivers, security and housekeeping on the `1010` series, all with `attendance_required = false` so they hold biometric access without being counted.

That is contractor management in miniature, discovered by accident. Whoever builds this should start from those records rather than from a competitor's feature list — Truein's home turf is the segment, but they do not have registers or native device sync to pair with it.

---

## The differentiator nobody in the analysis is pricing correctly

### Self-hosting under the DPDP Act is a weapon, not a limitation

Biometric identifiers are sensitive personal data under India's DPDP Act 2023. Every SaaS competitor processes them on their infrastructure, which makes the customer a data fiduciary who has handed sensitive data to a third party, with consent, notice, breach-reporting and cross-border obligations attached.

NeevTime never sees the data. That is not a footnote on a comparison table; it is the answer to the question a cautious buyer's legal advisor asks first.

**What is missing to use it:** a consent record and a retention policy in the product. Attendance is payroll evidence with a multi-year retention obligation, and biometric templates arguably should not outlive employment. Neither is expressed anywhere today. It is a small piece of work that turns a structural advantage into something demonstrable in a procurement questionnaire.

*Rank this alongside Tier 1. It is cheap, and it sells to the person who can block a deal.*

---

## What the recent reliability work is worth commercially

Two days of work closed a class of problem — a service reading a stale database, backups that had never once succeeded, an ingest silently refusing every punch. None of that is a feature and none of it belongs on a comparison matrix.

It is worth something specific, though: **every claim in the sales material can now be demonstrated.** The backup destinations are verified against real servers on every push. The registers run against real Postgres. The screens render in a browser in CI. When a technical evaluator asks "how do you know", there is an answer that is not "we tested it".

Against a competitor's checkbox matrix, "ours are proven and here is how" is a stronger position than one more checkbox — and it is the natural pairing with the integration story, where four working adapters beat eight that cannot be reached.

---

## Revised order

| | Item | Why now |
|---|---|---|
| **0** | Verify registers against a real inspection | The central claim is unverified. Cheapest thing here, largest downside if wrong. |
| **0** | State-wise register formats (3–4 states) | Domain work competitors will not do. The only uncopyable moat. |
| **1** | Photo at punch | Largest gap, smallest cost, most of it already built. |
| **1** | Consent + retention record (DPDP) | Turns self-hosting into a procurement answer. |
| **2** | BioTime migration tool | Removes the only real objection a replacement buyer has. |
| **2** | Kiosk mode | Inherits A1's anti-fraud story. Cheap. |
| **3** | Contractor entity | Design against the pilot's own data. Opens Truein's segment. |
| **3** | Offline capture | Unblocks low-connectivity sites. |
| **—** | WhatsApp punch | **Drop.** Gated behind a Meta business relationship per customer. |
| **—** | Face recognition, native mobile | Defer until a customer pays for them, as the analysis already says. |

---

## The sentence the product should be sold on

> Your ZKTeco readers, your server, your data — with the statutory registers an inspector actually asks for, and a backup you have watched restore.

Everything above either supports that sentence or should be cut. The competitors can match any single clause; none of them can match the whole line, because doing so would mean giving up the SaaS model that funds them.
