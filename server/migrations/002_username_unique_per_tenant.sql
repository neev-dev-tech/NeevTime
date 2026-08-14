-- Usernames are unique within a customer, not across all of them.
--
-- ensureSchema creates users_username_lower_uniq on lower(username) across the
-- whole table. That is right for one company and wrong for several: the second
-- customer to sign up cannot have an account called 'admin', because the first
-- one already does. They would discover this at the worst possible moment, and
-- the error would say nothing useful about why.
--
-- The replacement is scoped. Two customers may each have an 'admin'; within one
-- customer the name is still unambiguous, which is what the original index was
-- protecting — a login lookup that returns an arbitrary row when two accounts
-- differ only by case.
--
-- Left in place deliberately: ensureSchema still creates the old index at boot.
-- Removing it there would carry this change into production on the next deploy
-- of anything, which is exactly the coupling these migrations exist to break.
-- The DROP below is idempotent, so applying this migration after a boot is
-- correct, and the ensureSchema line is removed in the same release that adopts
-- multi-tenancy — not before.

DROP INDEX IF EXISTS users_username_lower_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_company_uniq
    ON users (company_id, lower(username));

-- Same reasoning for employee codes: two customers will both have an EMP001.
--
-- This one is not a bare index, and it does not come loose on its own.
--
-- employees_employee_code_key is a UNIQUE CONSTRAINT with two foreign keys
-- hanging off it — employee_shifts and employee_docs both reference employees by
-- code — so dropping it alone fails with "cannot drop constraint ... because
-- other objects depend on it". Found by applying this migration to a real
-- database rather than by reading the schema.
--
-- Four upserts also infer their conflict target from it: the HRMS employee sync,
-- the ADMS punch ingest, a server route and the seed script. All four now say
-- ON CONFLICT (company_id, employee_code) and ship with this migration. Left
-- unchanged they would fail with "no unique or exclusion constraint matching the
-- ON CONFLICT specification", which stops the attendance ingest dead.
--
-- The dependent keys are rebuilt as composite, which is what they should have
-- been: a shift row belongs to an employee *of a particular customer*.

ALTER TABLE employee_shifts DROP CONSTRAINT IF EXISTS employee_shifts_employee_code_fkey;
ALTER TABLE employee_docs   DROP CONSTRAINT IF EXISTS employee_docs_employee_code_fkey;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS employees_code_company_uniq
    ON employees (company_id, employee_code);

ALTER TABLE employee_shifts
    ADD CONSTRAINT employee_shifts_employee_fkey
    FOREIGN KEY (company_id, employee_code)
    REFERENCES employees (company_id, employee_code) ON DELETE CASCADE;

ALTER TABLE employee_docs
    ADD CONSTRAINT employee_docs_employee_fkey
    FOREIGN KEY (company_id, employee_code)
    REFERENCES employees (company_id, employee_code) ON DELETE CASCADE;
