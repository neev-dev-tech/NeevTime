-- The column the command queue's retry logic counts with.
--
-- services/command-queue.js has read and written retry_count since it was
-- built, and no schema source ever created it — not the schema file, not
-- ensureSchema, not a migration. Every code path touching a retry has thrown
-- "column retry_count does not exist"; the Device Sync screen surfaces it, and
-- the browser sweep caught it the first time it read the page's own error
-- panel instead of only the console.
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
