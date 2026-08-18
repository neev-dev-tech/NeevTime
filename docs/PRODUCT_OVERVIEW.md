# NeevTime

**Attendance, shift, leave and payroll-input management — self-hosted, built for Indian workplaces**

Product Overview

---

## What NeevTime is

NeevTime turns raw punches — from biometric readers at your gates and from your employees' phones — into everything an Indian employer is asked to produce: scored working days, statutory registers ready for a labour inspection, payroll input sheets, leave balances, and an audit trail that can answer *who changed this record* when a dispute asks.

It runs on **your own server, on your own premises**. Attendance data includes biometric identifiers and drives payroll; NeevTime's position is that this data should never live in someone else's cloud. The system runs fully on a closed LAN with no internet dependency — an air-gapped factory floor is a supported configuration, not a compromise.

## Who it is for

- Factories and plants running biometric readers at gates, including **multi-vendor workforces** — own staff alongside agency-supplied drivers, security and housekeeping
- Offices on Microsoft 365 or Google Workspace who want employees signing in with the accounts they already have
- Operations running **night shifts and rotating crews**
- Any employer who must produce muster rolls, overtime registers and leave registers on demand

---

## Capturing attendance — multi-vendor by design

| Source | How |
|---|---|
| **ZKTeco / eSSL and compatible readers** | Native ADMS push protocol — the readers deliver punches to NeevTime themselves, with enrolment sync, fingerprint/face template management, remote device commands, and per-device health monitoring |
| **Any other manufacturer** (Hikvision, Suprema, Matrix, Anviz, …) | A documented **vendor-neutral JSON intake**: any device, middleware or vendor cloud that can POST JSON feeds attendance in through one contract |
| **Employee phones** | The self-service portal: GPS + geofence validation ensures the punch happens at a configured work location, with an optional selfie stored against the record |
| **Manual entry** | Admin-entered attendance for exceptions, fully audited |

Every source converges on **one ingestion path**, so deduplication, timezone handling, day scoring, live dashboards and HR-system sync behave identically regardless of where a punch came from. Readers that lose network connectivity buffer locally and deliver when it returns.

**On the mobile selfie:** NeevTime deliberately uses *reviewable photos*, not face recognition. A supervisor can see who actually punched — which removes most buddy-punching — without the accuracy claims and the heavier biometric-consent obligations that automated face matching carries under India's DPDP Act. Photos expire on a retention schedule you control; the attendance record outlives the image.

---

## Feature modules

### The attendance engine

Each employee-day is scored against **that employee's assigned shift** — start time, grace period, half-day and overtime thresholds — falling back to company-wide rules where no shift is assigned.

- **Night shifts handled properly:** a 22:00–06:00 shift is one worked day, not two broken halves; an arrival after midnight is late against the previous evening's start; someone mid-shift at 3 a.m. is never scored "absent" prematurely
- Direction-aware statuses: a day that ends on an entry punch is flagged **Miss Punch** for correction rather than silently recorded as a short day
- Weekly offs (Sundays, configurable nth Saturdays), location-aware holidays, and leave all resolved in a consistent order of precedence
- Live recomputation: a punch updates the day's summary within seconds, visible on the dashboard immediately

### Shifts, schedules and rotations

- Shifts with individual grace periods, thresholds and night flags
- Department, employee and temporary schedules with calendar views
- **Rotation patterns**: define a repeating sequence — week A days, week B nights — assign crews with stagger offsets so coverage never gaps, and NeevTime generates the actual schedule weeks ahead, automatically, every night. A hand-entered schedule always overrides the pattern: a person's decision beats a rule's
- **Shift swaps**: an employee proposes a swap, the colleague accepts, management countersigns — and the schedule updates itself for exactly those days

### Leave management

- Leave types with annual quotas, paid/unpaid, encashable, and carry-forward with an explicit cap
- **Automatic accrual**: quota ÷ 12 credited monthly, prorated from each person's joining date; previewable before it applies, and it never claws back after a policy change without a human deciding
- **Year-end processing**: carry-forward within the cap, with expired days recorded — "where did my days go" always has an answer
- Half-day leave; working-day counting (a leave spanning a weekend costs only working days); balances derived from approved applications so imported history counts

### Approvals — from simple to multi-step

- **Out of the box**: leave and attendance corrections route to the employee's reporting manager, their department's approvers, and HR — as a pool, so one person's absence never blocks a team. Nobody can approve their own request. Every decision records who made it and in what capacity
- **Multi-step workflows** when you need them: build ordered approval flows (e.g. Line Manager → Department Head → HR) per request type and per department. Requests advance step by step; a rejection at any step settles the matter; every step's signature is kept
- Rejections require nothing of the approver but *allow* a reason — which the employee then sees on their application

### The employee self-service portal

Mobile-first, on a separate security realm from the admin application — an employee's session structurally cannot act as anyone else.

- Punch in/out with geofence + selfie
- Own attendance history with monthly export
- Leave balances and applications
- Attendance correction requests and shift swaps
- Approvals inbox (only for those who approve)
- Own shift, upcoming schedule, and the holiday list for their location
- Own profile (read-only — pay-relevant fields change through HR, deliberately)

### Sign-in options — mix and match per site

| Mode | For |
|---|---|
| **Company account (SSO)** — Microsoft Entra ID, Google Workspace, Okta | Offices already on these platforms: employees keep one password, MFA and conditional access come from your identity provider, NeevTime stores no credential at all |
| **On-premises Active Directory (LDAPS)** | Sites with AD but no cloud; works with no internet |
| **Employee code + password** | Shop-floor staff without mailboxes: activation codes (emailed, or handed over on paper) let each person set a password **nobody else ever knows** — including HR |

Directory accounts bind to an immutable identifier after first sign-in, so a name change or domain migration never locks anyone out. Accounts that match no employee are refused — signing in can never create an attendance identity.

### Contractor management

Agencies are first-class entities — name, contact, GST number, optional hourly rate. Employees attach to the agency that supplies them, and a monthly summary answers the month-end question directly: headcount, days, hours and overtime per agency, from the same figures as the register. A billable amount appears only when a rate has actually been agreed.

### Reports, registers and insights

- **Statutory registers**: muster roll (per-day marks with honest handling of no-data days), overtime register, leave register — with retention windows honoured and a documented procedure for your compliance officer to verify layouts against your state's prescribed forms
- Daily attendance, monthly summaries, late/early, absentee, overtime and payroll reports — **every figure computed once**, by the engine, so no two screens can disagree about what "late" or "overtime" means
- **Payroll export** with half-days counted at 0.5 and needs-review days surfaced explicitly, ready for your payroll team
- **Insights**: department × month cross-tabs and multi-month lateness/overtime/absence trends
- CSV and Excel export on effectively every table; print-ready output; scheduled email delivery of any report

### Audit trail

Recorded at the **database level** — not in application code that can be bypassed — covering employee records, attendance edits, settings, shifts, balances, users and more: who changed what, and what it said before. Automated system activity is intelligently excluded so the trail stays readable; secrets never enter it; punch *arrivals* are not audited (the punch is the record) while punch *edits and deletions* always are.

### Monitoring that cannot lie

- Email alerts through a raise/resolve pipeline: one mail when something breaks, one when it recovers, silence in between
- The **outcome checks** matter most: "not one punch recorded on a working day" and "backups enabled but no recent backup exists" fire regardless of *why* — including failure modes no component-level check can see
- A built-in **fire drill** proves the critical alert path end to end, on your installation, on demand
- A post-deploy verification script performs sixteen checks — including that the reader path actually works and that what the browser receives matches what was deployed

### Backups

Nightly database dumps on your local-time schedule, retention-pruned, with a **second copy off the machine**: Windows share (SMB), S3-compatible storage, SFTP, or SharePoint — credentials encrypted at rest, destination tested before saving. Restore works through the UI and the procedure is designed to be rehearsed, not assumed.

### HR-system integration

- **ERPNext**: bidirectional out of the box — attendance pushes automatically, employee and leave data syncs
- **Odoo and Horilla** adapters
- **Generic webhook**: push attendance to any system that accepts JSON
- Payroll platforms are served by file export — deliberately, since a self-hosted product cannot depend on cloud vendors' partner programs

---

## Technology

| | |
|---|---|
| Server | Node.js / Express, PostgreSQL 15 |
| Client | React, mobile-responsive throughout, dark mode |
| Real-time | WebSocket live feeds (dashboard, punch monitor) |
| Packaging | Docker Compose — one command installs the entire stack |
| TLS | On by default; automatic self-signed certificate, or install your own |
| Fonts & assets | Fully self-hosted — no page load ever reports your users to a third party |

### Installation

```
git clone <repository> && ./install.sh
```

The installer generates real secrets (there are **no default passwords anywhere** — the stack refuses to start rather than run weak), creates the data volume, builds, starts, verifies health, and prints the first administrator's password exactly once. The same script is executed automatically on a clean machine for every release, so the documented installation is the continuously-tested installation.

**Requirements:** any Linux host with Docker, 2 GB RAM, 20 GB disk. Readers reach the server on port 80; people use HTTPS on 443. No internet required at runtime.

### Remote access (optional)

For access from outside your LAN without opening firewall ports, NeevTime ships with optional Cloudflare Tunnel support — outbound-only, so your server keeps zero inbound surface from the internet.

---

## Security summary

- Self-hosted: your data never leaves your premises unless you send it somewhere
- No default credentials; generated secrets; encrypted destination credentials
- Two separated authentication realms (administrators vs employees); role-based access control; login lockout; password policy applies to everyone
- TLS for all browser traffic; SSO/LDAPS options that keep passwords out of NeevTime entirely
- Photographs of employees are authentication-gated, never publicly addressable, and retention-limited
- Database-level audit trail that application code cannot skip
- Every SQL statement parameterised; directory queries escaped; a continuous test suite (300+ tests, full-stack installation tests, and a 76-screen browser sweep) runs on every change

---

## The design principles, in one place

1. **One source of truth per number.** Lateness, overtime, hours — computed once, by one engine, read by every screen. Two reports can never disagree.
2. **Decisions are attributable.** Passwords nobody else knows, approvals recorded with capacity, edits recorded with before-and-after.
3. **Silence is treated as a failure mode.** Outcome alerts, fire drills, deploy verification — the system is built to announce its own problems.
4. **A person's decision beats an automated one.** Hand-entered schedules beat rotation patterns; quota cuts never claw back automatically; registers show honest gaps rather than invented data.
5. **Self-hosted is a feature.** Air-gapped operation, self-hosted assets, file-based payroll exports — no silent dependencies on anyone's cloud.
