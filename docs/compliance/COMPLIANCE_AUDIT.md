# NeevTime — legal, privacy, accessibility and compliance audit

Audit date: 2 October 2026. Branch `feat/audit-fixes`. Method: repository
inspection (client, server, migrations, config), live checks against a local
install (API responses, browser rendering, contrast measurement in light and
dark), and the existing test suites.

This report records findings and what was changed. **It does not establish
legal compliance with any law.** Several items need decisions or legal review
by the people who run NeevTime; those are collected in
[OWNER_INPUT_REQUIRED.md](OWNER_INPUT_REQUIRED.md).

---

## 1. What the application is

| Question | Answer (evidence) |
|---|---|
| What it does | Biometric attendance and HR administration: ZKTeco/eSSL readers push punches (ADMS), shifts, leave, regularisation, payroll export, statutory registers, approvals, employee self-service portal with phone punching. |
| Who runs it | An employer, about its own staff, on its own server (self-hosted Docker; `install.sh`). The employer is the data fiduciary; the software vendor is not in the data path. |
| Users | Staff accounts (admin, HR, read-only viewer) and employees (portal). |
| Accounts / authentication | Yes. Staff: username + bcrypt password, JWT (12 h). Employees: employee code + password set via single-use activation code, or OIDC (Microsoft/Google/Okta) or LDAP/AD. |
| Payments | None. No gateway, pricing, subscription or checkout code. |
| Refunds / cancellations | Not applicable (no transactions in the product). |
| Cookies | One: `portal_oidc`, httpOnly, SameSite=Lax, 10 minutes, during single sign-on only. |
| Browser storage | localStorage: `token`, `user` (name/code, role), theme preferences, `recentSearches`, `setup-checklist-dismissed`. |
| Analytics / tracking | None found (GA, GTM, Meta, Clarity, Hotjar, Mixpanel, Amplitude, Segment, PostHog, Sentry, LogRocket, beacons, fingerprinting: absent). |
| Third-party embeds | None in the UI after this audit (Google Fonts removed — see T-1). No maps, CAPTCHA, chat, video, CDNs. |
| Forms collecting personal data | Employee add/edit, document upload, CSV import, user management, sign-in/activation/reset, portal leave/regularisation/swap requests, resignation, phone punch (location + optional photo). |
| Uploads | Employee documents (contracts, ID proofs; base64 in DB), punch photos (JPEG/PNG on disk). |
| Marketing claims | Sign-in page copy only (see C-1). No testimonials, ratings or customer counts. |
| Jurisdiction | India (Asia/Kolkata, statutory registers under the Factories Act, Indian HRMS integrations). India's Digital Personal Data Protection Act 2023 is the relevant privacy law. |
| Stack | React 18 + Vite + Tailwind (client); Node/Express + PostgreSQL 15 (server); Socket.IO; nginx in front; Docker Compose. |

### Personal data inventory

| Category | Where | Sensitivity |
|---|---|---|
| Identity and employment | `employees` (name, code, department, designation, area, gender, DOB, mobile, email, address, joining date, status) | Personal data |
| Biometric templates | `biometric_templates.template_data` (fingerprint/face, base64, unencrypted) | **Biometric** |
| Punch records | `attendance_logs` (time, device, state) | Personal data |
| Location | `attendance_logs.latitude/longitude` (phone punches) | **Location** |
| Punch photos | `server/uploads/punch-photos` (deleted after `punch_photo_retention_days`, default 90) | Image of a person |
| Documents | `employee_docs.file_path` (contracts, ID proofs) | Likely government IDs |
| Requests | leave / regularisation / resignation reasons | May reveal health |
| Credentials | `users.password_hash`, `employees.portal_password_hash`, `portal_setup_hash`, device PIN `employees.password` (plaintext — required by readers) | Credentials |
| Logs | `system_logs` (user, IP, user agent, request summary), `audit_logs` (before/after row copies), log files (7–30 day rotation) | Personal data |
| **Unused columns** | `aadhaar_no`, `passport_no`, `motorcycle_license`, `automobile_license`, `religion`, `temperature`, `mask_flag` — no code writes them | Government IDs, special-category, health |

---

## 2. Findings

Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO. "Safe code change" means the
fix could be determined from the repository without a business decision.

### Security and privacy engineering

| ID | Sev | Issue | Location / evidence | Risk | Fix | Safe code change | Owner/legal input | Status |
|---|---|---|---|---|---|---|---|---|
| S-1 | CRITICAL | Employee API returned `e.*` to every role, including **portal password hash, activation-code hash, plaintext device PIN, SSO subject, Aadhaar/passport/licence numbers, religion** | `GET/POST/PUT/PATCH /api/employees` (`server.js`), confirmed live | Offline password cracking; identity-number exposure to read-only users | `utils/employeeFields.publicEmployee` on all five routes; `has_device_password` instead of the PIN; PUT keeps the stored PIN (`COALESCE`) | Yes | No | **Fixed** (cdf44d1) |
| S-2 | CRITICAL | Device command lists returned raw command text: `Passwd=<PIN>` and base64 biometric templates (`Tmp=`) | `/api/device-commands`, dead-letter queue, per-employee history | Biometric template and PIN exposure | `utils/commandRedaction` masks both in responses; stored commands unchanged | Yes | No | **Fixed** |
| S-3 | CRITICAL | Document lists returned every document's full content to any role | `GET /api/employee-docs[/:code]` | Every ID proof on file in one request | Lists are metadata only; `GET /api/employee-docs/file/:id` for admin/HR; server-side type and 10 MB checks | Yes | Which roles may read documents (currently admin + HR) | **Fixed** |
| S-4 | HIGH | Deleted and terminated employees could still sign in to the portal; existing portal tokens kept working after the account ended | `routes/portal.js` checked only `resigned`, and only at sign-in | Ex-staff punching / reading data | Status and app access checked at sign-in, activation, SSO and on every portal request | Yes | No | **Fixed** |
| S-5 | HIGH | Request log copied whole bodies: documents, punch selfies, identity numbers, coordinates into `system_logs` (no retention) | `utils/systemLogger.redact` | Defeats photo retention; uncontrolled copies of sensitive data | File/photo/long values become a size note; IDs and location masked | Yes | No | **Fixed** |
| S-6 | HIGH | Audit trigger copied portal hashes, SSO subject, ingest tokens and identity numbers into `audit_logs` (kept indefinitely) | `audit_row_change()` (migrations 003–006) | Same as S-1, permanently | Migration `021_audit_drops_secrets_and_ids.sql`: drops those keys from new rows and cleans existing ones (tested in a rolled-back transaction) | Yes | **Must be run** on each install: `node migrations/runner.js up` | **Fixed, pending deploy** |
| S-7 | HIGH | `env.example` contained a real-looking `JWT_SECRET`, a default DB password and `DEFAULT_ADMIN_PASSWORD=admin` | `env.example` | Anyone copying the example signs tokens with a published key | All blank, with notes; `.env.*` gitignored (an untracked `.env.bak.screenshots` existed) | Yes | **Confirm production does not use the old example secret** | **Fixed** (owner check open) |
| S-8 | MEDIUM | Socket.IO broadcast every live punch (code, time, in/out) to any connection | `server.js` `io` | Live staff movements to unauthenticated listeners | Handshake requires a staff JWT; four client connections send it | Yes | No | **Fixed** |
| S-9 | MEDIUM | Express did not trust nginx: every caller appeared as 127.0.0.1 | `server.js` | Per-IP login limit was one bucket for the whole company (lockout DoS); logs recorded nginx; SSO cookie lost `Secure` behind TLS | `trust proxy = loopback` (env `TRUST_PROXY` for split deployments) | Yes | Split-container deployments set `TRUST_PROXY` | **Fixed** |
| S-10 | HIGH | Biometric templates stored unencrypted and kept after an employee is deleted (soft delete); no erasure path | `biometric_templates`, `server.js` delete routes | Biometric data retained without purpose | Purge templates on delete (and photos/location after a period); encrypt at rest | Partly | **Yes** — erasure vs. restore, statutory retention | Open |
| S-11 | MEDIUM | No per-person data export (access request) or hard erasure | — | Cannot answer DPDP access/erasure requests from the app | Admin "export this person" and "erase where lawful" functions | Partly | **Yes** — what may be erased given register retention | Open |
| S-12 | MEDIUM | `system_logs` and `audit_logs` have no retention limit | schema | Indefinite retention | Retention setting + purge job | Partly | **Yes** — period | Open |
| S-13 | MEDIUM | Auth token in localStorage (XSS-readable), 12 h, not revocable | `Login.jsx`, `api.js`, `auth.js` | Token theft via XSS | httpOnly cookie session or short token + refresh; CSP enforcement | No (architecture) | No | Open |
| S-14 | MEDIUM | CSP is report-only | `nginx-security-headers.conf` | XSS not blocked | Enforce after a clean report period (fonts are now same-origin, removing one blocker) | Needs testing | No | Open |
| S-15 | MEDIUM | Lockout off by default (`max_login_attempts = 0`); no per-account portal lockout; min password length 6; bcrypt cost 10 | `auth.js`, `portal.js` | Online guessing | Defaults: lockout 5/15 min, length ≥ 10, cost 12 | Yes, but changes behaviour | **Yes** — policy | Open |
| S-16 | MEDIUM | Read-only "viewer" role can read every employee's contact details, DOB, address | `utils/rbac.js` (reads open to all roles) | Over-broad access | Field-level limits for viewer | Partly | **Yes** — what viewers need | Open |
| S-17 | LOW | Password-reset token in the URL | `auth.js` | Leaks via logs/Referer | Mitigated by `Referrer-Policy: no-referrer`; single-use, short-lived token | — | No | Accepted |
| S-18 | LOW | `SECRETS_KEY` falls back to `JWT_SECRET` | `utils/secrets.js` | One secret protects two things | Require a separate key | Yes | No | Open |
| S-19 | LOW | ADMS payloads (first 200 chars) and unknown tables written to log files | `server.js`, `services/adms.js` | Device data in logs (rotated 7–14 days) | Trim to metadata | Yes | No | Open |
| S-21 | HIGH | HRMS integration API secret and password stored in plain text; create/update responses returned them (`RETURNING *`) | `hrms_integrations`, `routes/integrations.js` | Payroll/HR system credentials in every dump and backup | Encrypted at rest (`utils/integrationSecrets`, AES-256-GCM via `utils/secrets`); decrypted only to connect; all responses masked; `scripts/encrypt_integration_secrets.js` converts existing rows; `SECRETS_KEY` now passed by compose and generated by `install.sh` | Yes | Set `SECRETS_KEY` before encrypting | **Fixed** (5 Oct) |
| S-22 | CRITICAL | Production `JWT_SECRET` was the value once published in `env.example` | VM `.env` | Anyone with the repository could forge an admin token | Rotated on the VM on 5 Oct 2026; a token forged with the old value now gets 401 | — | — | **Fixed in production** |
| S-20 | INFO | SQL parameterised throughout; punch-photo upload validated by magic bytes and size, random names, served only behind auth | — | — | — | — | — | Good |

### Tracking and third parties

| Tracker / service | Purpose | Where loaded | Data sent | Consent required? | Control | Status |
|---|---|---|---|---|---|---|
| **T-1 Google Fonts (Inter)** | Typeface | `client/src/index.css` `@import` on every page | Visitor IP, user agent, referrer to Google | Would be, as a non-essential third party | — | **Removed**: Inter self-hosted (1f151d9); built CSS references no third-party origin |
| TypeSafe AI (server) | Column matching in the CSV import assistant | `server/routes/import_assist.js`, only when `TYPESAFE_API_KEY` is set and an admin clicks it | Column names + **2 sample values per column** (may be names, phone numbers, IDs) | Notice yes; processor agreement needed | UI note on the import page; disclosed in the privacy notice | Owner: DPA or switch to headers-only |
| ERPNext / greytHR / Odoo / Horilla / webhook | HRMS sync | server, admin-configured | Codes, names, emails, phones, punches | Employer's lawful basis; processor terms | Off unless configured | Disclosed as possible in the notice |
| SMTP provider | Email | server | Recipient addresses, reports | Processor terms | Configurable | Disclosed |
| OIDC / LDAP | Sign-in | server | Identity claims; LDAP bind with user's password (not stored) | — | Off unless enabled | Disclosed |
| Backup destinations (S3 / SFTP / SharePoint) | Off-machine backup | server | Full database dump incl. biometrics | Processor terms; encryption | Admin-configured | Owner: encryption of dumps |

No tracker executes before consent because none exists. **No cookie consent
mechanism is required**: only strictly necessary storage is used (stated in
the privacy notice). If analytics are ever added, a consent mechanism must be
added first.

### Consent, notice and forms

| ID | Sev | Issue | Fix | Status |
|---|---|---|---|---|
| P-1 | HIGH | No privacy notice anywhere | `/privacy`, public, written from actual behaviour; operator details from Settings > Privacy contact; unset values shown as unset | **Implemented** — content needs legal review |
| P-2 | HIGH | Phone punch requested location the moment the card opened, with no explanation; photo purpose and retention not stated | Notice shown first; location requested on tap (unless already permitted); retention stated; link to notice. Same notice on admin mobile punch | **Implemented** |
| P-3 | MEDIUM | No privacy contact / grievance mechanism | Settings > Privacy contact (name, email, phone, address, notice date, attendance retention) | **Implemented** — owner must fill it in |
| P-4 | LOW | `recentSearches` (employee names) survived sign-out on shared PCs | Cleared on sign-out | **Implemented** |
| P-5 | INFO | Forms: no mandatory consent checkboxes added | Processing of employee data for attendance is an employment purpose; consent checkboxes would be misleading. The optional selfie is the only consent-based processing, and it is opt-in by action (nothing pre-checked) | By design |
| P-6 | MEDIUM | Employee add/edit has no notice to the employee at collection | The employee portal and sign-in pages link the notice; HR should give the notice at onboarding | Owner process |

### Data minimisation

| Field | Finding | Recommendation |
|---|---|---|
| `aadhaar_no`, `passport_no`, `motorcycle_license`, `automobile_license` | Columns exist; nothing writes or reads them | Drop the columns (migration) unless a planned feature needs them |
| `religion` | Special-category data; unused | Drop |
| `temperature`, `mask_flag` | Health data columns from a device feature; nothing writes them | Drop, or document if a reader model sends them |
| Gender, DOB | Collected on the employee form, optional | Keep optional; needed for some statutory registers |
| Device PIN (`employees.password`) | Plaintext, needed by readers | Keep; never returned (S-1) |
| Import assistant sample values | 2 real values per column sent to a third party | Send headers only, or synthetic samples |

Columns were **not** dropped: dropping is irreversible and needs an owner decision.

### Accessibility (target WCAG 2.2 AA)

| ID | Sev | Issue | Fix | Status |
|---|---|---|---|---|
| A-1 | HIGH | 205 of 315 form controls had no programmatic label | Portal sign-in and portal requests labelled (all employee-facing forms); table search/select-all named | **Partial** — ~190 admin-screen controls remain |
| A-2 | MEDIUM | 12+ icon-only buttons without names; every icon rendered as an unnamed `<svg>` | Names added; icons `aria-hidden` by default in the icon wrapper | **Implemented** |
| A-3 | MEDIUM | No skip link; page `<title>` never changed | Skip link; `<main id>`; title follows each page's heading | **Implemented** |
| A-4 | MEDIUM | Clickable rows/cards not keyboard-reachable (audit-trail rows were the only way into details) | Enter/Space + tab stop | **Implemented** |
| A-5 | MEDIUM | Title-less dialogs had no accessible name (About, search, device confirm) | `Modal label` prop | **Implemented** |
| A-6 | LOW | Sign-in errors not announced | `role="alert"` | **Implemented** |
| A-7 | LOW | framer-motion ignored reduced motion | `MotionConfig reducedMotion="user"` | **Implemented** |
| A-8 | MEDIUM | Menus (`ListMenu`, profile) and tab lists lack arrow-key navigation and focus return; search results lack listbox/option semantics | Roving focus, `aria-activedescendant` | Open |
| A-9 | LOW | Ambiguous labels ("Confirm", "Submit") | Replaced with the action | **Implemented** |
| A-10 | INFO | Shared Modal traps focus, restores it, closes on Escape; global `:focus-visible` ring; CSS honours reduced motion; contrast measured ≥ 4.5:1 on all pages checked in both themes | — | Good |
| A-11 | INFO | Accessibility statement | `/accessibility`, states the target and the known gaps; no conformance claim | **Implemented** |

### Images and alt text

All `<img>` elements have alt text. The sign-in illustration is decorative
and now uses `alt=""` (it was "Attendance Management", duplicating the heading).
Punch photos are described ("Punch by {name}"). Decorative inline SVGs
(gauge, select caret, checkmark) are now hidden from screen readers.

### Claims, testimonials, business details

| ID | Sev | Finding | Action |
|---|---|---|---|
| C-1 | LOW | Sign-in feature tile "Secure" — unqualified | Owner review; suggest removing or replacing with a factual description |
| C-2 | INFO | No testimonials, ratings, customer counts, "#1", "certified", "compliant" or "government approved" claims anywhere. Statutory registers already say "not a certified form" | None |
| C-3 | LOW | Product naming is inconsistent: "NeevTime", About text "Simplicity Attendance", default login logo `vayutime_logo.png`, `client/public/ADD_LOGO_HERE.md` ("VayuTime", with a local file path), unused `timenexa_logo*.png` | Owner to settle the product name; remove stale assets |
| C-4 | LOW | Seeded alert recipient `it@innopay.in` in `server.js` — a customer-specific default in product code | Seed empty before distributing to other customers |
| B-1 | INFO | Operator (employer) details now come from Settings; vendor details are not shown in the product (appropriate for self-hosted software) | Owner input for SaaS offering |

### Asset provenance

| Asset | Source | License | Attribution required | Commercial use | Action |
|---|---|---|---|---|---|
| Inter, Public Sans, Sora, IBM Plex Mono (`client/src/assets/fonts`) | Google Fonts, vendored by `scripts/fetch-fonts.mjs` | SIL OFL 1.1 | License text must accompany redistribution | Yes | **Add the OFL text** next to the fonts (not downloaded in this audit) |
| `@phosphor-icons/react` 2.1.10 | npm | MIT | Keep notice in distributions | Yes | None |
| `lucide-react` (installed, aliased away) | npm | ISC | — | Yes | Remove the unused dependency |
| `client/public/logo.png` (wolf mark) | Extracted from a "supplied render" (`index.html` comment) | Unknown | Unknown | Unknown | **Confirm ownership / licence** |
| `client/public/vayutime_logo.png` (777 KB) | Supplied VayuTime artwork | Unknown | Unknown | Unknown | Confirm; replace with the current brand; compress |
| `client/src/assets/login_illustration.png` (JPEG) | Undocumented; likely stock or AI-generated | Unknown | Unknown | Unknown | **Confirm source and licence before selling** |
| `client/src/assets/timenexa_logo*.png` | Earlier brand | Unknown | — | — | Unused — remove |
| `react.svg`, `vite.svg` | Vite scaffold | MIT | — | Yes | Unused — remove |
| `docs/screenshots`, `docs/ui-preview` | Generated from the app | Own | — | Yes | None |

No video, music, Lottie or animation files.

---

## 3. India DPDP Act 2023 — gap assessment

NeevTime is software; the **employer** operating it is the data fiduciary.
Most obligations are the employer's, supported (or not) by the software.

| Area | Implemented controls | Missing controls | Technical work | Process work | Legal review |
|---|---|---|---|---|---|
| Notice | Privacy notice (`/privacy`) describing data, purposes, recipients, retention, rights, contact; notice at the point of location/photo collection | Notice in Indian languages (the Act allows the notice in English or any Eighth Schedule language on request) | Translations | Give the notice at onboarding | Notice wording |
| Lawful basis / consent | Optional selfie is opt-in by action; no pre-checked consent | Record of consent where consent is relied on | Consent log if consent becomes a basis | Decide basis per purpose (employment "legitimate use" vs consent) | **Yes** |
| Specified purpose | Purposes stated per category | — | — | Keep purposes in sync with features | Yes |
| Data minimisation | Secrets/IDs removed from responses, logs, audit trail | Unused ID/religion/health columns still exist | Drop columns (migration) | Decide | — |
| Withdrawal of consent | Photo can be skipped at any time | — | — | — | — |
| Correction | HR can edit records | Employee-initiated correction request | Portal request type | Handle requests | — |
| Erasure | Device enrolment removed on delete; photos auto-deleted | Hard erasure; biometric templates retained after delete; logs unbounded | Erasure function, template purge, log retention | Retention schedule | **Yes** (registers) |
| Access / summary | Employee sees own attendance and profile; monthly CSV | Full per-person export incl. who it was shared with | Export function | Respond within the required time | — |
| Grievance | Settings > Privacy contact, shown in notice | Contact not yet filled in | — | **Appoint and publish** | — |
| Security safeguards | Hashing, RBAC, audit trail, secrets masked (S-1…S-9), same-origin fonts | Template encryption, CSP enforcement, lockout defaults, backup encryption | S-10, S-13…S-15 | Access reviews | — |
| Processors / third parties | Integrations off unless configured; disclosed in the notice | Processor agreements | — | **Contracts with each processor in use** (HRMS, email, backup, TypeSafe) | **Yes** |
| Retention | Photo retention setting + purge job | Attendance, logs, audit trail, backups | Retention settings + jobs | Define schedule | **Yes** |
| Children | No indication minors' data is processed | Age check not present (DOB not validated) | Optional DOB check | Do not employ/enrol minors without guardian process | — |
| Breach response | Alerts on config/security changes; audit trail | Breach procedure, notification to the Board and affected people | — | **Write and test a breach procedure** | **Yes** |
| Significant data fiduciary duties | — | — | — | Assess whether applicable | Yes |

**No "DPDP compliant" badge or statement has been added, and none should be
until the process and legal items above are complete.**

---

## 4. Not applicable

| Requirement | Reason |
|---|---|
| Refund / cancellation policy | No payments or transactions in the product |
| Cookie consent banner | Only strictly necessary storage; no analytics, advertising or third-party scripts |
| Separate cookie policy page | Covered by the "Cookies and browser storage" section of the privacy notice |
| Terms & Conditions page in the app | Internal tool run by an employer for its staff; users are bound by employment terms. **Required when NeevTime is sold**, as a customer contract (licence / subscription terms, DPA) — see owner input |

---

## 5. Validation

| Check | Result |
|---|---|
| Server tests | 402 tests: 388 pass, 0 fail, 14 skipped (no test database or SFTP server in this environment) — `npm test`; incl. new `privacy_exposure.test.js` (12 tests) |
| Client build (`npm run build`: break-lint, modal-guard check, date-format check, vite build) | Pass |
| Full lint | 485 problems vs 487 before (all pre-existing style rules; none added) |
| Live API | Employee responses contain no hash/PIN/ID fields; socket refuses missing/invalid tokens and accepts staff tokens; document list returns no content; privacy endpoint public and empty-by-default |
| Browser | `/privacy`, `/accessibility`, sign-in, portal sign-in, settings: render; text contrast ≥ 4.5:1 in light and dark; legal links resolve; skip link and `<main>` present; no unnamed icon buttons or SVGs on the pages checked; page titles follow headings |
| Migration 021 | Applied inside a transaction against the local database and rolled back; verified new audit rows omit the removed keys |
| Not run | Screen-reader testing with NVDA/VoiceOver; automated axe scan; external broken-link crawl; production deploy |
