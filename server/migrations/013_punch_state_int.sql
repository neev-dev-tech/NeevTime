-- A punch_state the reports can always read as a number.
--
-- Reports cast punch_state::int to tell entries from exits. The column also
-- holds 'check_in' and 'check_out' — written by the mobile routes before they
-- shared the ingest, and kept deliberately as evidence of what the old code
-- did. One such row inside a report's date range threw
-- "invalid input syntax for type integer" and took the ENTIRE report down:
-- Attendance Summary and Attendance Status both died for any range covering
-- 17 August, over two rows.
--
-- Numeric states pass through unchanged, so ZK's 2–5 (break out, overtime in,
-- and so on) keep meaning what they meant. Text containing "out" maps to 1,
-- anything else to 0 — the same reading normalizeState gives those strings on
-- the way in.
CREATE OR REPLACE FUNCTION punch_state_int(s text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN s ~ '^[0-9]+$'        THEN s::int
        WHEN lower(s) LIKE '%out%' THEN 1
        ELSE 0
    END
$$;
