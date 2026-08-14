# Multi-tenancy — state of the branch

Branch: `feature/multi-tenancy`. **Not merged, not deployed.** `main` is untouched
and production is unaffected.

## Why migrations exist separately from `ensureSchema`

`ensureSchema` runs at boot, so anything placed there reaches production the next
time an unrelated fix is deployed. That is fine for adding a nullable column and
unacceptable for a change that can empty a table or alter who may read it.

These run when a person decides they should:

```
node migrations/runner.js status     # what is applied, what is pending
node migrations/runner.js up         # apply everything pending
node migrations/runner.js up 002     # apply up to and including 002
```

Each migration runs in one transaction — a failure leaves nothing behind. An
already-applied migration whose file has since changed is refused rather than
skipped.

## What works

- **Row-level isolation.** `company_id` on 39 tables, defaulted from the
  connection rather than named by the statement, which is why 614 existing
  `INSERT`s did not have to change. `ENABLE` plus `FORCE ROW LEVEL SECURITY`.
- **Tenant context.** `AsyncLocalStorage` in `db/index.js` carries the tenant to
  whichever pooled connection each query borrows. `db.asTenant(id, fn)` for work
  outside a request.
- **Tenant resolution.** `TENANT_MODE=single` (on-premise, one company) or
  `multi` (hosted, from the host's subdomain). Unresolved means refused, never
  defaulted.
- **Session binding.** `company_id` in the token; a session is rejected where the
  token and the host disagree.
- **Per-customer uniqueness.** Two customers may each have an `admin` and an
  `EMP001`.

Proven against a real Postgres in `tests/tenancy.test.js` — including that an
unqualified `UPDATE` by one tenant leaves another's rows untouched, and that a
pooled connection carries no stale tenant.

## What does not work yet

Two things run outside any request, so they have no tenant and will fail with
`no tenant in scope`. Both must be resolved before this is merged.

**1. Device ingest — this one stops attendance.**

The readers post to `/iclock/*`, which is not under `/api`, so the tenant
middleware does not cover it. With RLS enabled the punch ingest would raise on
every punch.

The device serial identifies the customer, but `devices` is itself
tenant-scoped — the same chicken-and-egg as logging in. The fix that matches the
existing design is a `SECURITY DEFINER` function resolving serial to company,
callable without a tenant, exactly as `companies` is readable without one.

**2. Background jobs.**

The scheduled HRMS sync, the auto-backup, the alert checks and the report
scheduler all run on timers. Each needs wrapping in `db.asTenant(...)` — and in
a hosted deployment, looping over companies rather than assuming one.

## Preconditions for deploying this, whenever that happens

1. **The application must stop connecting as `postgres`.** A superuser bypasses
   row-level security entirely. Measured on the test database: as a superuser the
   same query returns 12 rows where the application role sees 0. Without a
   non-superuser role the policies are decoration.

2. **`ensureSchema` still creates the old global username index.** It is dropped
   by migration 002 and recreated at the next boot. The `ensureSchema` line comes
   out in the same release that adopts tenancy — not before, or an unrelated
   deploy carries the change early.

3. **Existing rows all become company 1.** Migration 001 backfills and seeds
   Innopay as that company, so an on-premise upgrade is a no-op from the user's
   side.

## Rebuilding the test database

```
createdb neevtime_tenancy
for f in database/00_init_all.sql database/schema.sql \
         database/schema_easytime.sql database/schema_expansion.sql; do
  psql -q -d neevtime_tenancy -f "$f"
done
# boot once so ensureSchema runs, then:
node migrations/runner.js up
```

Then create a **non-superuser** role, grant it the tables, sequences and
`EXECUTE` on `app_current_tenant()`, and run:

```
TENANCY_TEST_DB=neevtime_tenancy TENANCY_TEST_USER=... \
TENANCY_TEST_PASSWORD=... node --test tests/tenancy.test.js
```

The first test asserts the role is not a superuser. Without that check the whole
file would pass against a database with no isolation at all.
