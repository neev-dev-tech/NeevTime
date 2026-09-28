# NeevTime — Product Upgrade Plan (Complete Integration & Device Framework)

Goal: make NeevTime a **complete product** where supporting a new HRMS vendor, a new
device vendor, or a new method (push/pull) is **filling a template + one registry
entry**, not custom engineering each time. "Complete" = the *framework* is complete,
generic adapters cover the long tail, and the top vendors ship in-box.

All work is **local-first**. No production server (innopay / omniware) is touched
until a phase passes locally.

---

## 1. Principles

1. **Build the framework, not every vendor.** ~80% of vendors should need zero or
   config-only work via generic adapters.
2. **Capability contracts.** Every adapter declares what it genuinely supports; the
   core engine never special-cases a vendor. Unsupported methods are hidden in the
   UI, never broken.
3. **Config over code.** Vendors that differ only in endpoints/fields/auth are handled
   by a generic adapter + a config blob, not a new class.
4. **Two separate layers.** HRMS/payroll integrations and physical-device drivers are
   different problems (business API vs hardware protocol) — separate registries,
   separate contracts.
5. **Self-service onboarding.** A conformance test suite + adapter template let your
   team (or a client's integrator) add a vendor without deep help.

---

## 2. Current State (baseline — Suresh-Projects-78)

- **HRMS layer:** `server/services/hrms-integration.js` resolves adapters via a
  **switch** on `INTEGRATION_TYPE` (erpnext, odoo, horilla, webhook, sap, workday,
  bamboohr, zoho, greytHR). `BaseIntegration` base class. Adapters live in
  `server/services/integrations/`. greytHR (RSA swipe push) just added.
- **Device layer:** `server/services/adms.js` — ADMS/iclock push only (ZKTeco/eSSL),
  plus cross-device biometric mirror + `device_pin_map` aliases + a trusted-command
  choke point.
- **Gaps:** vendor add touches ~4 places (enum, switch, picker, capability list); no
  formal capability model; HRMS is push-only (no pull employees/leave/shifts); device
  layer is a single ADMS monolith — no driver abstraction, no SDK/cloud/file drivers.
- **Reference:** the `neev-dev-tech` repo already has a registry + `CAPABILITY` model —
  we port that pattern in (Phase 0), we do not switch repos.

---

## 3. Target Architecture

### 3.1 HRMS Integration layer (extend what exists)
```
registry.js            → one entry per vendor (type, name, fields, load())
BaseIntegration        → base class; adapters override the methods they support
CAPABILITY             → employees, shifts, holidays, leave,
                         push_attendance, push_daily_attendance, push_leave,
                         + NEW: pull_employees, pull_leave, pull_shifts
GenericRestAdapter     → NEW: config-driven (base_url, auth, endpoint paths,
                         field mappings) — covers many vendors with no new class
```
Adding an HRMS vendor = write an adapter (or configure GenericRest) + declare
capabilities + one registry entry.

### 3.2 Device Driver layer (new — mirror the HRMS pattern)
```
server/services/devices/
  registry.js          → one entry per device family/protocol
  BaseDriver           → base class; connection + capability contract
  drivers/
    adms.js            → ADMS/iclock push (ZKTeco, eSSL, most Indian vendors)
    sdk-pull.js        → SDK/TCP pull (poll device for logs/templates)
    cloud-rest.js      → vendor cloud API (Hikvision, newer vendors)
    file-sftp.js       → file/SFTP log dumps
```
Device capabilities: `realtime_push`, `pull_logs`, `enroll`, `remote_open`,
credential types `face | finger | palm | card | mobile`.

### 3.3 Credential abstraction
Model biometrics as **credential types** so modality differences (face/finger/palm/
card/mobile) never fork driver logic — one `templates` concept, typed.

### 3.4 Capability matrix
The UI reads declared capabilities and shows a support grid per vendor. Methods a
vendor lacks are hidden. One source of truth (the adapter class), no duplicated lists.

---

## 4. Adapter Contract (what each must implement)

HRMS adapter (`extends BaseIntegration`):
```
static capabilities = [...]
testConnection()                         // required
pushAttendance(records)                  // if push_attendance
pushDailyAttendance(days)                // if push_daily_attendance
pullEmployees()                          // if pull_employees   (NEW)
pullLeave() / pullShifts() / pullHolidays()
```
Device driver (`extends BaseDriver`):
```
static capabilities = [...]
connect() / healthCheck()
onRealtimePunch(cb)                      // if realtime_push
pullLogs(since)                          // if pull_logs
enroll(employee, credential)             // if enroll
remoteOpen(door)                         // if remote_open
```

---

## 5. Vendor-Onboarding Checklist (how to figure out ANY new vendor)

Answer 5 questions → maps directly to the adapter:
1. **Protocol** — REST / OAuth2 / SOAP / SDK / ADMS-TCP / file-SFTP / webhook
2. **Direction** — push / pull / both
3. **Auth** — API key / OAuth2 / RSA-sign / basic / bearer token
4. **Data available** — employees / attendance / leave / shifts / holidays
5. **Gating** — plan tier, rate limits, partner approval

If protocol=REST and it only differs in endpoints/fields → **GenericRest + config**,
no new class.

---

## 6. Self-Service Onboarding (so new vendors don't need a rebuild)

1. **Conformance test suite** — for each adapter, assert declared capabilities match
   implemented methods, run each method against a mock/sandbox, validate the payload
   shape. An adapter that passes is safe to ship.
2. **Adapter template** — `templates/adapter.template.js` with the 5-question header
   and stubbed methods. Copy → fill → test.
3. **Docs** — `docs/ADD_A_VENDOR.md` walking the checklist end to end.
4. **Mock servers** — local mock HRMS + mock device (see §8) so onboarding needs no
   real vendor account.

---

## 7. Phased Roadmap (local-first, each phase gated by local tests)

**Phase 0 — Contracts & tests (foundation)**
- Add pull capabilities to `CAPABILITY`.
- Write the conformance test harness + adapter template.
- Backfill tests for existing adapters (erpnext, greytHR, webhook).

**Phase 1 — Generic REST adapter (HRMS long tail)**
- Config-driven adapter: auth strategies (api key / OAuth2 / RSA / basic), endpoint
  map, field mappings. Covers many vendors with zero new classes.

**Phase 2 — HRMS pull**
- Implement `pullEmployees` / `pullLeave` / `pullShifts` on the adapters whose API
  supports it (start with ERPNext + greytHR REST/OAuth2). Wire the sync engine +
  conflict/ownership rules (who is master).

**Phase 3 — Device driver layer**
- Extract `adms.js` behind `BaseDriver` + `devices/registry.js`.
- Add `sdk-pull` and `cloud-rest` drivers (one real vendor each).
- Capability-drive the device UI.

**Phase 4 — Capability matrix UI + polish**
- Support grid per vendor, guided config, health dashboard.

**Phase 5 — Ship top vendors**
- The 5–10 HRMS + device vendors your clients actually use, each with a conformance
  test. Everything else = fill the template.

---

## 8. Local Testing Strategy (no production)

- **Everything in `docker compose` locally** — app + Postgres, seeded with fixtures.
- **Mock HRMS server** — a small Express app that mimics vendor REST endpoints
  (employees/leave/attendance) so pull/push are testable without a real account.
- **Mock/emulated device** — a script that POSTs ADMS/iclock payloads to the local
  `/iclock` endpoint (already proven), plus a fake SDK/cloud endpoint for the new
  drivers. No physical hardware needed for CI.
- **Conformance tests run in CI** on every adapter.
- **Promotion:** a phase reaches innopay/omniware only after it is green locally.

---

## 9. Definition of "Complete"

- Any HRMS vendor with a documented API → onboarded via template or GenericRest,
  push **and** pull, no core changes.
- Any device speaking ADMS → works today; SDK/cloud/file devices → a driver each,
  same contract.
- New vendor onboarding is a documented, test-gated checklist your team runs
  independently.
- Capability matrix tells clients exactly what each vendor supports.

---

## 10. Framework Decision & Immediate Next Steps

**Go-forward repo: `Suresh-Projects-78/NeevTime` (switch-based) — the main product.**
The `neev-dev-tech` repo (registry-based) is a design reference only; we take its good
ideas (the registry pattern, the `CAPABILITY` model, cleaner adapters) *into* the main
repo rather than switching repos.

The switch statement is not a blocker — it resolves adapters fine. But adding a vendor
today touches ~4 places (INTEGRATION_TYPE enum, the switch case, the types picker, the
capability list). Phase 0 adopts a small **registry table** so a vendor is **one entry**
— this ports the best part of the other framework's design into your main repo, and
every later phase builds on it.

**Immediate next steps (all local, on Suresh-Projects-78):**
1. **Phase 0a — registry pattern:** introduce `integrations/registry.js` (one entry per
   vendor) + a `CAPABILITY` enum; have the resolver read the registry instead of the
   switch. Backfill the existing adapters (erpnext, greytHR, webhook, …).
2. **Phase 0b — contracts & tests:** add pull capabilities, the conformance harness, and
   the adapter template.
3. **Local mocks:** stand up the mock HRMS + mock device so onboarding/tests need no real
   account or hardware.
4. Then proceed Phase 1 → 5.
