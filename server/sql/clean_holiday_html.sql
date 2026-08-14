-- Strip the ERPNext editor markup out of holiday names already imported.
--
-- ERPNext's holiday description is a rich-text field, so it arrives as
--   <div class="ql-editor read-mode"><p>Republic Day</p></div>
-- and the first import stored it verbatim. It renders literally on the
-- Holidays screen, in the upcoming-holidays cards, and in any report naming
-- the day.
--
-- The sync no longer stores markup, but its upsert only overwrites `name` when
-- the incoming value is non-null, so existing rows keep the old text until
-- something clears it. This is that something.
--
--   docker exec -i attendance_db psql -U postgres -d attendance_db < clean_holiday_html.sql
--
-- Safe to run twice: a row with no '<' is left alone.

BEGIN;

-- Show what will change before changing it.
SELECT id, date, name AS before
FROM holidays
WHERE name LIKE '%<%'
ORDER BY date;

UPDATE holidays
SET name = NULLIF(BTRIM(regexp_replace(
        -- Block-level closers become a space so a two-line description does
        -- not run its words together, then every remaining tag is dropped.
        regexp_replace(name, '<\s*(br|/p|/div|/li)\s*/?>', ' ', 'gi'),
        '<[^>]*>', '', 'g')), '')
WHERE name LIKE '%<%';

UPDATE holidays
SET description = NULLIF(BTRIM(regexp_replace(
        regexp_replace(description, '<\s*(br|/p|/div|/li)\s*/?>', ' ', 'gi'),
        '<[^>]*>', '', 'g')), '')
WHERE description LIKE '%<%';

-- Collapse the double spaces the tag removal can leave behind.
UPDATE holidays SET name = regexp_replace(name, '\s+', ' ', 'g') WHERE name ~ '\s{2,}';
UPDATE holidays SET description = regexp_replace(description, '\s+', ' ', 'g') WHERE description ~ '\s{2,}';

SELECT id, date, name AS after
FROM holidays
ORDER BY date;

COMMIT;
