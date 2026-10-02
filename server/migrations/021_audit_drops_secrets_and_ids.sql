-- The audit trail kept copies of secrets and identity numbers.
--
-- audit_row_change() removed 'password', 'password_hash', 'api_key',
-- 'api_secret' and 'token' from every row it recorded. The employees table has
-- grown credentials under other names since — the portal password hash, the
-- activation-code hash, the SSO subject — and devices carry an ingest token,
-- so every change to an employee or reader wrote those into audit_logs, where
-- they are kept indefinitely and are readable by anyone who can open the audit
-- page. Aadhaar, passport and licence numbers and religion were copied the same
-- way; nothing in the application reads them, so the trail has no reason to.
--
-- What changed is still recorded: the keys are removed from the copy, and a
-- change to one of them alone still produces an audit row (the row differs
-- before the keys are dropped), now without the values themselves.
--
-- Existing rows are cleaned with the same list. This edits audit_logs, which is
-- otherwise never done; it removes only these keys and touches no other data.

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
    -- Never copied into the trail.
    never_recorded text[] := ARRAY[
        'password', 'password_hash', 'api_key', 'api_secret', 'token',
        'portal_password_hash', 'portal_setup_hash', 'directory_subject',
        'ingest_token', 'secret', 'client_secret',
        'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion'
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

    before_row := before_row - never_recorded;
    after_row  := after_row  - never_recorded;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, changed_id, TG_OP, before_row, after_row, actor);

    RETURN NULL;
END;
$audit$ LANGUAGE plpgsql SECURITY DEFINER;


UPDATE audit_logs
   SET old_data = old_data - ARRAY[
           'portal_password_hash', 'portal_setup_hash', 'directory_subject',
           'ingest_token', 'secret', 'client_secret',
           'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion'],
       new_data = new_data - ARRAY[
           'portal_password_hash', 'portal_setup_hash', 'directory_subject',
           'ingest_token', 'secret', 'client_secret',
           'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion']
 WHERE (old_data ?| ARRAY['portal_password_hash', 'portal_setup_hash', 'directory_subject',
                          'ingest_token', 'secret', 'client_secret',
                          'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion'])
    OR (new_data ?| ARRAY['portal_password_hash', 'portal_setup_hash', 'directory_subject',
                          'ingest_token', 'secret', 'client_secret',
                          'aadhaar_no', 'passport_no', 'motorcycle_license', 'automobile_license', 'religion']);
