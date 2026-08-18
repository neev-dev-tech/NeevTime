-- Stop the audit trail filling with reader heartbeats.
--
-- Within a minute of 003 going live on the pilot deployment, audit_logs held
-- nothing but rows like these, roughly one per second:
--
--     devices | UPDATE |  |  |
--
-- Each reader posts a heartbeat every few seconds and services/adms.js answers
-- it with `UPDATE devices SET status = 'online', last_activity = NOW()`. Five
-- readers produce on the order of ten thousand audit rows a day, none of which
-- records a decision anybody made.
--
-- That is not merely wasteful. An audit trail is read by someone looking for
-- one change in a payroll dispute, and a page of machine noise is how a log
-- stops being read at all — which costs more than not having one, because the
-- log is still there to be pointed at.
--
-- So: a change confined to housekeeping columns is not a change. If a real
-- edit touches a device — a rename, an IP change, a deletion — the other
-- columns differ too and it is recorded in full, heartbeat column included.

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $audit$
DECLARE
    actor        integer := NULLIF(current_setting('app.user_id', true), '')::integer;
    changed_id   integer;
    before_row   jsonb;
    after_row    jsonb;
    -- Written by the system on its own schedule, never by a person deciding
    -- something. Kept in the recorded row when the row is worth recording; they
    -- just cannot be the REASON it is recorded.
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

        -- An UPDATE that changed nothing is noise. Routes that write every
        -- column on every save would otherwise fill this table with rows saying
        -- a value stayed the same.
        IF before_row = after_row THEN
            RETURN NULL;
        END IF;

        -- And an UPDATE whose only differences are housekeeping is the same
        -- thing wearing a timestamp.
        IF (before_row - housekeeping) = (after_row - housekeeping) THEN
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


-- Clear what has already accumulated.
--
-- Deliberately narrow: device rows, recorded by nobody, where the only
-- difference between old and new is housekeeping. A row recording a real change
-- does not match this and is kept. Audit history is not something to tidy up
-- broadly — the whole value of it is that it was not edited.
DELETE FROM audit_logs
 WHERE table_name = 'devices'
   AND action = 'UPDATE'
   AND user_id IS NULL
   AND (old_data - ARRAY['last_activity','last_seen','last_heartbeat','last_sync','updated_at'])
     = (new_data - ARRAY['last_activity','last_seen','last_heartbeat','last_sync','updated_at']);
