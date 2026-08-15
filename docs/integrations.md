# HRMS integrations

Where employee records, shifts, holidays and leave come from, and where
attendance goes back to. The device side — how punches arrive — is a separate
concern with its own document on the `feature/multi-vendor-adapters` branch.

Every service is declared in one place, `server/services/integrations/registry.js`.
The resolver, the picker route and the capability checks all read from it.

## What each integration can actually do

Capabilities are declared on the adapter class and read off it at runtime, so
this table cannot drift from the code — `server/tests/integration_capabilities.test.js`
checks the declaration against the implementation in both directions.

| | Employees | Shifts | Holidays | Leave | Push attendance |
|---|---|---|---|---|---|
| ERPNext / Frappe HR | yes | yes | yes | yes | yes |
| Odoo | yes | — | — | — | yes |
| Horilla | yes | — | — | — | yes |
| Generic Webhook | yes | — | — | — | yes |

**Only ERPNext is complete, and only ERPNext is running in production here.**

The gaps in that table are not cosmetic. Without shifts, every employee is
measured against one fallback start time, so anyone not on that shift is late
every day they work. Without holidays and leave, every public holiday and every
approved day off becomes an absence. On this deployment that combination
produced 409 absences in a month for 70 people before it was found.

Until recently those gaps were invisible: the base class returns `[]` from the
optional pulls, which is indistinguishable from "this HRMS has none of those", so
the sync ran them, received nothing and logged success. It now skips what an
adapter has not declared and says so, naming the consequence.

## Adding a service

1. Write the adapter in `server/services/integrations/`, extending
   `BaseIntegration`, declaring `static capabilities` for what it genuinely
   implements.
2. Add one entry to `registry.js`.
3. Run `npm test` in `server/`. The tests will fail if the declaration and the
   implementation disagree, in either direction — a capability claimed but not
   written, or written but not claimed and therefore never run.

Nothing else needs editing. The picker and the resolver both read the registry.

## What is not supported, and why

SAP SuccessFactors, Workday, BambooHR and Zoho People each gate their API behind
a partner agreement, a reviewed OAuth application, or a paid tier. A self-hosted
attendance system cannot satisfy any of those on a customer's behalf, so an
adapter for them is a button that can never work. Adapters for all four existed
and were removed.

They are listed in `RETIRED_TYPES`, so an integration still saved with one of
those types gets that explanation rather than "Unsupported integration type".

**The route for any of them is the Webhook integration**, which asks nothing of
the far end beyond posting JSON. A nightly export from a closed HRMS into that
endpoint gets employee records in without a partner agreement.

## Completing Odoo and Horilla

Both model the missing concepts — Odoo has `resource.calendar` for working
schedules and `hr.leave` for time off; Horilla has both. Neither is pulled.

The blocker is verification, not effort. Writing a pull against an API shape
nobody has exercised produces code that looks right and fails on contact, which
is how two regressions reached production on 14 August. The device adapters on
`feature/multi-vendor-adapters` solve this by splitting each adapter in two: a
pure transform from the vendor's payload to our shape, covered by tests against
recorded payloads, and a thin network layer that is honestly marked unproven
until someone points a real system at it.

The same split applies here, and is the recommended way in:

1. Write `mapShifts(payload)` and `mapLeave(payload)` as pure functions.
2. Test them against payloads captured from a real Odoo or Horilla instance.
3. Only then add `CAPABILITY.SHIFTS` and `CAPABILITY.LEAVE` to the declaration —
   the declaration is what causes the sync to run it.

Step 3 last is the point. Declaring a capability before its transform is proven
puts the old silent-no-op behaviour back, one adapter at a time.
