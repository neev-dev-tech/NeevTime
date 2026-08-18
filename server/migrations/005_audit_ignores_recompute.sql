-- A recalculation is not an edit.
--
-- With heartbeats out of the way, audit_logs filled instead with:
--
--     attendance_daily_summary | UPDATE |  |
--
-- one per punch. Every punch rebuilds that employee's day, so ~900 a day arrive
-- recording that the machine recalculated a total it derives from punches that
-- are themselves already recorded. Nobody decided anything.
--
-- The rows worth keeping in that table are the opposite case, and they are the
-- reason the trail exists: Manual Entry creating attendance from nothing, an
-- approved regularization changing a day, somebody adjusting hours before
-- payroll. A dozen a month, currently buried under thirty thousand.
--
-- The discriminator is last_calculated_at. attendance_engine stamps it NOW() on
-- every row it writes, and nothing else in this codebase writes it — not Manual
-- Entry, not the regularization approval, not a person at a psql prompt. So an
-- unattributed update that advanced it came from the engine, and an
-- unattributed update that did NOT is a hand edit, which is exactly the case
-- worth catching.
--
-- Stated plainly because it is a real limit: a change made directly in the
-- database that also sets last_calculated_at would pass unrecorded. That is a
-- deliberate trade for a log somebody will actually read.

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $audit$
DECLARE
    actor        integer := NULLIF(current_setting('app.user_id', true), '')::integer;
    changed_id   integer;
    before_row   jsonb;
    after_row    jsonb;
    housekeeping text[] := ARRAY[
        'last_activity', 'last_seen', 'last_heartbeat', 'last_sync',
        'last_calculated_at', 'updated_at', 'upload_time'
    ];
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

        IF before_row = after_row THEN
            RETURN NULL;
        END IF;

        -- Only housekeeping changed: a heartbeat wearing a timestamp.
        IF (before_row - housekeeping) = (after_row - housekeeping) THEN
            RETURN NULL;
        END IF;

        -- Nobody triggered it and the engine's own stamp moved: a recompute.
        -- A person's edit keeps the stamp where it was and is still recorded.
        IF actor IS NULL
           AND after_row ? 'last_calculated_at'
           AND (before_row ->> 'last_calculated_at') IS DISTINCT FROM (after_row ->> 'last_calculated_at')
        THEN
            RETURN NULL;
        END IF;
    END IF;

    BEGIN
        changed_id := COALESCE((after_row ->> 'id')::integer, (before_row ->> 'id')::integer);
    EXCEPTION WHEN others THEN
        changed_id := NULL;
    END;

    before_row := before_row - 'password' - 'password_hash' - 'api_key' - 'api_secret' - 'token';
    after_row  := after_row  - 'password' - 'password_hash' - 'api_key' - 'api_secret' - 'token';

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, changed_id, TG_OP, before_row, after_row, actor);

    RETURN NULL;
END;
$audit$ LANGUAGE plpgsql SECURITY DEFINER;


-- Clear the recomputes already recorded. Narrow, for the same reason as before:
-- no actor, and the engine's stamp moved. A human edit matches neither.
DELETE FROM audit_logs
 WHERE table_name = 'attendance_daily_summary'
   AND action = 'UPDATE'
   AND user_id IS NULL
   AND (old_data ->> 'last_calculated_at') IS DISTINCT FROM (new_data ->> 'last_calculated_at');
