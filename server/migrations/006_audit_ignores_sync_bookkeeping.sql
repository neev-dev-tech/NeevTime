-- Sync bookkeeping is not a change either.
--
-- Third pass at the same fault, so it is worth naming the pattern rather than
-- just the instance. Each time, a machine wrote a column to remember what it
-- had done, and the trail recorded it as though a person had decided something:
--
--   004  devices.last_activity          — reader heartbeats, ~10,000/day
--   005  attendance_daily_summary       — a recompute after every punch, ~900/day
--   006  attendance_logs.sync_status    — the HRMS sync marking each punch
--                                         'synced' one row at a time, ~900/day
--
-- The rows that matter in attendance_logs are edits and deletions of a punch —
-- what a payroll dispute turns on, and why INSERT is not audited there at all.
-- A punch being marked as delivered to ERPNext is not one.
--
-- The employee_code, punch_time and punch_state of that row are untouched by the
-- sync, so any real edit still differs in a column that is not on this list and
-- is recorded in full.

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $audit$
DECLARE
    actor        integer := NULLIF(current_setting('app.user_id', true), '')::integer;
    changed_id   integer;
    before_row   jsonb;
    after_row    jsonb;
    -- Written by the system to remember what it has done. Never a decision.
    housekeeping text[] := ARRAY[
        'last_activity', 'last_seen', 'last_heartbeat', 'last_sync',
        'last_calculated_at', 'updated_at', 'upload_time',
        'sync_status', 'synced_at', 'sync_error', 'sync_attempts',
        'last_sync_at', 'last_sync_status', 'last_sync_message'
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

        IF (before_row - housekeeping) = (after_row - housekeeping) THEN
            RETURN NULL;
        END IF;

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


-- Clear what the sync already recorded. Narrow, as before: no actor, and the
-- rows differ only in bookkeeping.
DELETE FROM audit_logs
 WHERE table_name = 'attendance_logs'
   AND action = 'UPDATE'
   AND user_id IS NULL
   AND (old_data - ARRAY['sync_status','synced_at','sync_error','sync_attempts','upload_time'])
     = (new_data - ARRAY['sync_status','synced_at','sync_error','sync_attempts','upload_time']);
