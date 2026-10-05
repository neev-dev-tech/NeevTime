# Owner input required

Decisions and facts the code cannot supply. Nothing here has been invented;
where the application needs a value, it shows "[not yet stated]" until one is
set. See [COMPLIANCE_AUDIT.md](COMPLIANCE_AUDIT.md) for the findings behind
each item.

## A. Before the next production deploy

| # | Item | Why | Where |
|---|---|---|---|
| A1 | Run migration 021 on every install: `node migrations/runner.js up` from the server directory inside the app container (`verify-deploy.sh` warns while it is pending) | Removes portal hashes, tokens and identity numbers from the audit trail (finding S-6) | Server |
| A2 | ~~Confirm production `.env` does not use the `JWT_SECRET` from `env.example`~~ — it did; **rotated on 5 Oct 2026** (S-22). Check any other install the same way | That value is public in the repository history | Each install's `.env` |
| A3 | Check whether any install runs nginx and Node in separate containers; if so set `TRUST_PROXY` to that hop (e.g. `uniquelocal`) | Real client IPs for rate limiting and logs (S-9) | `.env` |

## B. Per employer (each customer running NeevTime)

Set in **Settings → Privacy contact**:

| # | Item | Shown in |
|---|---|---|
| B1 | Responsible organisation (legal name of the employer) | Privacy notice |
| B2 | Privacy / grievance contact: name or role, email, phone, postal address | Privacy notice, accessibility statement |
| B3 | How long attendance and HR records are kept | Privacy notice |
| B4 | Date the notice was last reviewed | Privacy notice |
| B5 | Photo retention days (Settings → Attendance defaults; default 90) | Privacy notice, punch screen |

## C. Decisions

| # | Decision | Options / notes |
|---|---|---|
| C1 | **Lawful basis** for each purpose under DPDP (employment "legitimate use" vs consent) — especially biometrics and location | Legal review |
| C2 | **Retention schedule**: attendance records, audit trail, system activity log, backups | Statutory registers have minimum periods; logs currently have no limit (S-12) |
| C3 | **Erasure**: what may be erased when an employee leaves or asks, given register retention; purge biometric templates on delete? (they are kept today, S-10) | Purging means re-enrolment if a deleted record is restored |
| C4 | **Unused sensitive columns**: drop `aadhaar_no`, `passport_no`, licences, `religion`, `temperature`, `mask_flag`? | Irreversible migration; nothing uses them |
| C5 | **Viewer role**: should read-only users see contact details, DOB and address? (S-16) | Field-level restriction is a code change once decided |
| C6 | **Document access**: admin and HR may download employee documents; viewers may not. Confirm | S-3 |
| C7 | **Password and lockout defaults**: lockout is off; minimum length 6 (S-15) | Recommend 5 attempts / 15 min, length ≥ 10 |
| C8 | **Import assistant**: keep sending two real sample values per column to TypeSafe, switch to headers only, or disable | Needs a processor agreement if kept |
| C9 | Product name and brand assets: NeevTime vs "Simplicity Attendance" vs VayuTime logo (C-3) | Also remove `timenexa_*` and `ADD_LOGO_HERE.md` |
| C10 | Sign-in page "Secure" feature tile: remove or substantiate (C-1) | |
| C11 | Default alert recipient `it@innopay.in` is seeded in product code (C-4) | Seed empty before giving the product to other customers |

## D. Legal and contractual

| # | Item |
|---|---|
| D1 | Legal review of the privacy notice text (`client/src/pages/legal/PrivacyNotice.jsx`) |
| D2 | Processor agreements with each service in use: HRMS (ERPNext / greytHR / Odoo / Horilla), email provider, backup destination, TypeSafe |
| D3 | Breach-response procedure: who decides, how the Data Protection Board and affected people are told, within what time |
| D4 | Whether the Significant Data Fiduciary duties apply to any customer |
| D5 | Notice translations, if employees ask for an Eighth Schedule language |
| D6 | **If NeevTime is sold**: vendor legal name, address, support contact; customer licence or subscription terms; a data processing agreement between vendor and customer (if hosted); SLA. These are contract documents, not in-app pages |
| D7 | **Ownership** of the code and brand before selling (see the business guide discussed separately) |

## E. Assets

| # | Asset | Needed |
|---|---|---|
| E1 | `client/src/assets/login_illustration.png` | Source and licence, or replace |
| E2 | `client/public/logo.png`, `vayutime_logo.png` | Confirm ownership of the artwork |
| E3 | Fonts (Inter, Public Sans, Sora, IBM Plex Mono) | Add the SIL OFL 1.1 licence text alongside `client/src/assets/fonts` |
