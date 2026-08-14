-- Multi-tenancy: one database, one boundary the database itself enforces.
--
-- The alternative was adding `WHERE company_id = $n` to 614 query sites across
-- 84 files. Every omission there is one customer's staff appearing on another
-- customer's screen, and the failure is silent. Postgres enforces it instead, so
-- a query that forgets simply returns nothing.
--
-- On-premise is not a different build. It is this, with exactly one company.
--
-- The table list is discovered, not written down. The first version of this
-- migration named all 39 tables, taken from the database on the machine it was
-- written on. It failed in CI on `relation "alert_state" does not exist`,
-- because a database built from the same files elsewhere does not hold the same
-- tables — some come from ensureSchema, some from schema files that may not have
-- been applied. Production's list has never been seen by anyone writing this, so
-- assuming it is not a thing to do.

-- The tenant in scope, or a legible error.
--
-- Comparing against current_setting(...)::int directly casts '' to int when no
-- tenant is set, and Postgres raises "invalid input syntax for type integer" —
-- correct, but it names neither the cause nor the fix.
--
-- Erroring at all is deliberate, and the alternative was considered and
-- rejected. Returning NULL would make a tenantless query yield zero rows, which
-- is silent: a scheduled job would run, find nothing, and log a successful run
-- that did nothing. This repository has shipped that exact bug twice — a leave
-- sync and a shift sync that both reported success while fetching nothing. Work
-- that has lost its tenant should stop, loudly.
--
-- Anything running outside a request must therefore say which tenant it is for,
-- via db.asTenant(id, fn).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS integer AS $fn$
DECLARE
    raw text := current_setting('app.tenant_id', true);
BEGIN
    IF raw IS NULL OR raw = '' THEN
        RAISE EXCEPTION 'no tenant in scope for this query'
            USING HINT = 'Wrap the work in db.asTenant(companyId, fn), or set app.tenant_id on the connection.',
                  ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN raw::integer;
END;
$fn$ LANGUAGE plpgsql STABLE;

-- The tenant every existing row belongs to.
INSERT INTO companies (id, name, code, timezone)
SELECT 1, 'Innopay', 'INNOPAY', 'Asia/Kolkata'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 1);

SELECT setval(pg_get_serial_sequence('companies', 'id'),
              GREATEST((SELECT MAX(id) FROM companies), 1));

DO $tenancy$
DECLARE
    t text;
    touched int := 0;
BEGIN
    FOR t IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          -- companies is the tenant registry: scoping it would mean needing a
          -- tenant in order to look one up. schema_migrations belongs to the
          -- runner and is the same for everyone.
          AND tablename NOT IN ('companies', 'schema_migrations')
        ORDER BY tablename
    LOOP
        -- company_id is defaulted from the connection rather than named by the
        -- statement. That is what allows 614 existing INSERTs to stay as they
        -- are: they do not mention the column, and do not need to.
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id integer', t);
        EXECUTE format('UPDATE %I SET company_id = 1 WHERE company_id IS NULL', t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET DEFAULT app_current_tenant()', t);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN company_id SET NOT NULL', t);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (company_id)',
                       'idx_' || t || '_company', t);

        -- ENABLE alone is not enough: without FORCE the table owner bypasses its
        -- own policies, and for this application that means the policies would
        -- do nothing whatsoever. A SUPERUSER still bypasses regardless, so the
        -- application must connect as a non-superuser role or none of this is
        -- real.
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I '
            'USING (company_id = app_current_tenant()) '
            'WITH CHECK (company_id = app_current_tenant())', t);

        touched := touched + 1;
    END LOOP;

    RAISE NOTICE 'tenant isolation applied to % tables', touched;
END;
$tenancy$;
