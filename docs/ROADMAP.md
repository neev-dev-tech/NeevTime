# NeevTime — Roadmap

**What to build, in what order, and why that order**

Revised 16 August 2026 · companion to the Market Readiness assessment

---

## How this is ordered

By what unblocks the next thing, not by effort or appeal.

Phase 0 is not optional and not negotiable — each item is something that makes the product unsellable or unsafe while it is outstanding. Phase 1 is what the first customers will ask for. Phase 2 is what makes a fifth customer as cheap to serve as the first.

Sizes are relative, not calendar estimates: **S** is a day or two, **M** is a week, **L** is several weeks. They assume one person who knows this codebase.

---

## What changed on 16 August 2026

Phase 0 went from four items open to one and a half. It also gained an item that the original list did not anticipate, and that is the more important half of the day.

A routine deploy brought the database up on the wrong Docker volume — a stale copy five months old — and the application served it without complaint. Every reading taken from it was internally consistent and completely wrong, to the point that a five-month attendance outage was diagnosed, and reported to the owner as data loss, from data that had never been lost. In the same afternoon: nightly backups were found to be writing into a container filesystem that every rebuild deleted, and the single-container image was found to run Node in the background under nginx, so a dead backend was proxied to indefinitely while the container reported healthy.

None of those were on this roadmap. All three had been true for months. They are now fixed, and **0.5** exists so the class of problem is named rather than rediscovered at a customer site.

---

## Phase 0 — Before a first paying customer

*Nothing in Phase 1 matters while any of these are open.*

### 0.1 · TLS on, HTTP redirected — **DONE**

HTTPS serves the application; port 80 redirects browser paths. `/iclock` deliberately stays clear text on port 80, because the readers are embedded HTTP clients that cannot follow a redirect — a check in CI now fails if that path ever starts redirecting.

Passwords no longer cross the network in clear text.

### 0.2 · Backup and a rehearsed restore — **NEARLY**

Done: the restore has been performed end to end and matched — 91 employees, 92,644 punches, 9,480 summaries. Backups now persist on a named volume, verified by rebuilding the container and confirming the files survive.

That verification mattered more than expected. Backups were enabled, scheduled and succeeding the whole time, into a directory with no mount — so every deploy deleted them, and the only surviving file was one from March that happened to sit in the build context. The scheduler was never broken; the storage was never persistent.

**Still open: an off-machine copy.** Database, backups and application all live on one VM. Blocked only on naming a destination host.

*The single most valuable next hour on this list.*

### 0.3 · See the product — **PARTLY**

Done: CI now boots the entire compose stack and asserts that `/api/health` answers, `/iclock` does not return 502 through nginx, HTTPS serves the app, and nginx's configuration parses. Every route and service module is loaded, so a syntax error fails in a second rather than at container boot. Every SQL statement the application issues is prepared or executed against a real Postgres.

Still open: the browser-level pass. Roughly forty dialogs and two compliance screens have never been rendered by a person or a script. The database and the deployment are now verified; the user interface is not.

### 0.4 · Decide the tenancy model — **UNCHANGED**

Two honest answers:

**One deployment per customer.** Fits the self-hosted positioning, sellable immediately, no further work. Cost is operational — every customer is a machine to update.

**Shared, properly.** Requires: the application stops connecting to Postgres as a superuser (a superuser bypasses row-level security, so isolation is currently defeated), `/iclock` device ingest made tenant-aware or it stops collecting attendance entirely, and the four timer-driven jobs likewise.

*Choosing the first closes this today. Do not enable the tenancy branch without the second.*

*The only Phase 0 item untouched, and the only one that needs a decision rather than work.*

### 0.5 · A deployment that cannot lie — **MOSTLY DONE**

New. Every item below was a real production state on 16 August, and none of them announced itself:

- The database volume is now pinned by name and declared `external`, so a missing volume **fails the deploy** instead of silently starting a blank database. A blank database is indistinguishable from catastrophic data loss from the outside, and presented exactly that way.
- Node runs in its own container with `restart: always`. Previously it ran backgrounded under nginx as PID 1, so its death left a healthy-looking container proxying to nothing.
- The deploy check probes `/iclock` through the address the readers use, and fails on a stale last punch or an empty attendance table on a working day. It previously printed `punches recorded today: 0` as a pass.
- The dashboard counts punches with a `COUNT(*)`; it previously displayed the length of a `limit: 100` fetch, which read 100 every day regardless of reality.
- `ensureSchema` no longer logs failures that are not failures. A boot log with standing errors in it is a log nobody reads — and a genuinely broken statement sat in that stream unnoticed.

Still open: an alert that reaches a person. SMTP has never been configured, so six alerts are currently open and undeliverable. **Detection without delivery is not monitoring.**

*The unifying fault: a signal that cannot change carries no information. A count that was always 100, a zero printed as a pass, a healthcheck asking nginx about Node, boot errors that fired every restart. Each looked like monitoring and none could ever report a problem.*

---

## Phase 1 — First customers

*Ordered by how often each will be asked for.*

### 1.1 · Photo at the point of punch — **S**

Capture a still with the mobile punch and store it against the record. No face matching — a reviewable image removes most buddy punching on its own.

The permission flow and submit path already exist; GPS is captured today. This is the cheapest closure of the largest competitive gap.

### 1.2 · One installation procedure — **S**

One document, tested by someone following it on a clean machine, replacing eight overlapping deployment files.

Now also has to state the two deliberate steps a new install needs: `docker volume create neevtime_postgres_data`, and configuring SMTP. Both fail loudly rather than silently, which is the intent.

*Blocks every customer after the first.*

### 1.3 · Merge the audit trail — **S**

Built on a branch. A system of legal record should say who changed what.

### 1.4 · Verify the registers against a real inspection — **S**

The content is right. The layout each state's Factories Rules require has not been checked by anyone who has sat through an inspection. Ask a customer's compliance officer to mark up one month.

*Cheap, and it converts a claim into a reference.*

### 1.5 · Native mobile app — **L**

Employee self-service is a web page; eSSL and Truein both ship iOS and Android. Large, and worth deferring until a customer asks — but expect them to ask.

### 1.6 · Contractor as an entity — **M**

Today it is a single flag. Competitors sell contractor-wise reporting and multi-vendor management as a category.

The pilot site is already running this case: staff of a co-located company, plus drivers, security and housekeeping. Design against that rather than guessing.

---

## Phase 2 — Making the fifth customer cheap

### 2.1 · Offline capture — **M**

Readers buffer; the application does not. Matters for sites with poor connectivity, which is much of the addressable market.

### 2.2 · Odoo and Horilla brought up to parity — **M**

Both currently sync employees and push attendance only. Neither pulls shifts, holidays or leave, which means every public holiday reads as an absence on those deployments — the exact fault that produced 409 phantom absences here.

The capability declarations already say this honestly rather than pretending. Needs a test instance; the device simulator on the multi-vendor branch is the pattern to copy.

### 2.3 · Accessibility pass — **S**

The primary button and link colour measure 2.8:1 against a 4.5:1 requirement, across the whole product. `orange-700` reaches 5.18:1 and stays recognisably the same colour. Then run the contrast audit script across every page.

*Increasingly a procurement question, not only a courtesy.*

### 2.4 · Remove MUI — **M**

`Integrations.jsx` is the only file using it and costs 286 KB, 16% of the bundle.

### 2.5 · Payroll connectors on demand — **S each**

The export renders templates defined as data, so a new payroll format is one entry and no release. Add them as customers name them, written by whoever has seen that import screen — not speculatively.

---

## Sequencing at a glance

| Phase | Item | Size | Status | Blocks |
|---|---|---|---|---|
| 0 | TLS | S | Done | Any sale |
| 0 | Backup and restore | S | Off-machine copy open | Any sale |
| 0 | See the product | M | Deployment verified, UI not | Trusting the rest |
| 0 | Tenancy decision | S / L | Open — needs a decision | Deployment model |
| 0 | Deployment cannot lie | M | Alert delivery open | Operating any install |
| 1 | Photo at punch | S | — | Competitive parity |
| 1 | Installation procedure | S | — | Customer two onward |
| 1 | Audit trail | S | — | — |
| 1 | Register verification | S | — | Compliance claim |
| 1 | Mobile app | L | — | — |
| 1 | Contractor entity | M | — | — |
| 2 | Offline | M | — | Low-connectivity sites |
| 2 | Odoo / Horilla parity | M | — | Non-ERPNext customers |
| 2 | Accessibility | S | — | Procurement |
| 2 | Remove MUI | M | — | — |
| 2 | Payroll formats | S each | — | On request |

---

## What is deliberately not on this list

- **Automatic shift detection, compensatory off, on-duty category.** Real gaps against competitors. None changes a buying decision on its own, and each is straightforward once someone asks.
- **API integrations with paid payroll or HRMS vendors.** They gate access behind partner agreements a self-hosted product cannot obtain. Four such adapters were removed from this codebase for being buttons that could never work. Those systems are served by the file export and the webhook adapter.
- **Face recognition.** A stored image reviewed after the fact removes most buddy punching. Matching is a much larger commitment — infrastructure, accuracy claims, and a far heavier consent obligation for biometric data. Defer until a customer requires it specifically.

---

## The single most valuable next hour

**Copy a backup off the machine.**

The previous edition of this document said *enable TLS*, and that is done. The database, every backup and the application now sit on one VM, and 16 August demonstrated how confidently this system can report success while writing into a void. A backup nobody has copied elsewhere is one disk failure from being no backup at all.

It needs a destination host and an SSH key. Nothing else on this list is blocked on so little.
