-- Who changed this record, and what did it say before.
--
-- audit_logs has existed since the first schema and nothing has ever written a
-- row to it. Meanwhile Manual Entry lets a user create attendance out of
-- nothing, and the Employees page can change someone's status or switch off
-- their attendance tracking — all without leaving a trace.
--
-- In a payroll dispute the first question is who changed the record. Every
-- competitor can answer it. Until this, the honest answer here was "nobody
-- knows", which is a reason to lose a deal that has nothing to do with the
-- product's strengths.
--
-- Triggers, not application code.
--
-- The alternative was writing an audit row beside each of 614 write sites. That
-- makes the log only as complete as whoever remembered, and a log with gaps is
-- worse than no log: it invites people to trust it. A trigger cannot be
-- forgotten, and it also catches writes that never went through the API — a
-- script, a sync, someone at a psql prompt.
--
-- The actor arrives on the connection, set by db/index.js from the request. Work
-- with no actor — a device posting a punch, a scheduled sync — records NULL,
-- which is true and more useful than a guess.

-- The table itself, because it cannot be assumed.
--
-- This migration was written believing audit_logs had existed since the first
-- schema. It has — in database/000_schema.sql, which is loaded only into an
-- EMPTY data directory. The pilot deployment's database predates every schema
-- file in this repository, so it has never seen that file and has no such
-- table: the migration got as far as CREATE INDEX and rolled back.
--
-- Same lesson as the trigger loop below, which already skips tables that are
-- not present. An install is not defined by the schema file; it is defined by
-- what is actually in it.
CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    table_name  VARCHAR(100),
    record_id   INTEGER,
    action      VARCHAR(20),
    old_data    JSONB,
    new_data    JSONB,
    user_id     INTEGER,
    created_at  TIMESTAMP DEFAULT now()
);

-- Older databases may hold an audit_logs of a different shape — the column set
-- has drifted across this codebase's history. Add what the trigger writes, and
-- leave anything else alone.
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS table_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS record_id  INTEGER,
    ADD COLUMN IF NOT EXISTS action     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS old_data   JSONB,
    ADD COLUMN IF NOT EXISTS new_data   JSONB,
    ADD COLUMN IF NOT EXISTS user_id    INTEGER,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now();


CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $audit$
DECLARE
    actor        integer := NULLIF(current_setting('app.user_id', true), '')::integer;
    changed_id   integer;
    before_row   jsonb;
    after_row    jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        before_row := to_jsonb(OLD);
        after_row  := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        before_row := NULL;
        after_row  := to_jsonb(NEW);
    ELSE
        before_row := to_jsonb(OLD);
        after_row  := to_jsonb(NEW);

        -- An UPDATE that changed nothing is noise. Routes that write every
        -- column on every save would otherwise fill this table with rows saying
        -- a value stayed the same.
        IF before_row = after_row THEN
            RETURN NULL;
        END IF;
    END IF;

    -- Most tables key on id. Those that do not record NULL rather than failing:
    -- an audit trigger must never be the reason a write is rejected.
    BEGIN
        changed_id := COALESCE((after_row ->> 'id')::integer, (before_row ->> 'id')::integer);
    EXCEPTION WHEN others THEN
        changed_id := NULL;
    END;

    -- Secrets do not belong in an audit log. A password hash copied into
    -- new_data would sit there in plain sight of anyone allowed to read the
    -- history, which is a wider audience than the users table.
    before_row := before_row - 'password' - 'password_hash' - 'api_key' - 'api_secret' - 'token';
    after_row  := after_row  - 'password' - 'password_hash' - 'api_key' - 'api_secret' - 'token';

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, changed_id, TG_OP, before_row, after_row, actor);

    RETURN NULL;  -- AFTER trigger; the return value is ignored
END;
$audit$ LANGUAGE plpgsql SECURITY DEFINER;


DO $attach$
DECLARE
    spec record;
BEGIN
    -- Chosen, not universal. Auditing every table would double the write volume
    -- of an application that takes ~900 punches a day, and most of it would be
    -- noise nobody will ever read.
    --
    -- attendance_logs is audited on UPDATE and DELETE only. An INSERT there is a
    -- person putting their finger on a reader, which is the normal case and
    -- already recorded by the punch itself. An edit or a deletion is the thing a
    -- payroll dispute turns on.
    FOR spec IN
        SELECT * FROM (VALUES
            ('attendance_logs',            'UPDATE OR DELETE'),
            ('attendance_daily_summary',   'UPDATE OR DELETE'),
            ('attendance_regularizations', 'INSERT OR UPDATE OR DELETE'),
            ('employees',                  'INSERT OR UPDATE OR DELETE'),
            ('users',                      'INSERT OR UPDATE OR DELETE'),
            ('leaves',                     'INSERT OR UPDATE OR DELETE'),
            ('resignations',               'INSERT OR UPDATE OR DELETE'),
            ('devices',                    'INSERT OR UPDATE OR DELETE'),
            ('settings',                   'INSERT OR UPDATE OR DELETE'),
            ('shifts',                     'INSERT OR UPDATE OR DELETE'),
            ('holidays',                   'INSERT OR UPDATE OR DELETE')
        ) AS t(table_name, events)
    LOOP
        -- Tables differ between deployments: some come from schema files, some
        -- from ensureSchema. Skip what is not here rather than failing the whole
        -- migration, which is the mistake the tenancy migration made first time.
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = spec.table_name
        ) THEN
            RAISE NOTICE 'skipping %, not present on this database', spec.table_name;
            CONTINUE;
        END IF;

        EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$I', spec.table_name);
        EXECUTE format(
            'CREATE TRIGGER audit_%1$s AFTER %2$s ON %1$I '
            'FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
            spec.table_name, spec.events);
    END LOOP;
END;
$attach$;


-- Reading the log is a search over time, a table, or a person.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created  ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table    ON audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user     ON audit_logs (user_id, created_at DESC);
