-- Audit the table that decides what everyone is paid.
--
-- 003 attached a trigger to `settings`. No such table exists in this codebase
-- and never has — it is `app_settings`. The attach loop skips tables that are
-- not present, deliberately and correctly, so the migration reported success
-- and settings changes have been unaudited since.
--
-- That is the worst table to have missed. Shift start, grace period, overtime
-- threshold, full-day hours and the timezone all live in app_settings, and a
-- change to any of them silently re-scores every day the engine recomputes.
-- Moving shift start by fifteen minutes changes what a workforce is paid, and
-- until now nothing recorded who did it.
--
-- geofences too, added here because it is the same class: it decides where a
-- mobile punch is accepted, so widening one is how somebody punches from home.

DO $attach$
DECLARE
    spec record;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            ('app_settings', 'INSERT OR UPDATE OR DELETE'),
            ('geofences',    'INSERT OR UPDATE OR DELETE')
        ) AS t(table_name, events)
    LOOP
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
