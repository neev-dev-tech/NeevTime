# Superseded schema files

Nothing loads these. They are kept because they are the only record of how the
schema got its present shape, and because a column whose origin is unknown is a
column nobody dares touch.

Until August 2026 the installer loaded every `.sql` file in `database/` in
filename order. These nine files between them defined seventeen tables more than
once, every definition wrapped in `CREATE TABLE IF NOT EXISTS`:

| table | defined in |
| --- | --- |
| `holiday_locations` | `00_init_all.sql`, `schema.sql`, `schema_easytime.sql`, `schema_timetable.sql` |
| `positions` | `00_init_all.sql`, `schema.sql`, `schema_easytime.sql` |
| `timetables`, `break_times` | `00_init_all.sql`, `schema_timetable.sql`, `timetables_schema.sql` |
| `attendance_rules` | `00_init_all.sql`, `schema.sql`, `schema_timetable.sql` |
| `users`, `departments`, `areas`, `employees`, `devices`, `device_commands`, `attendance_logs`, `shifts` | `00_init_all.sql`, `schema.sql` |
| `attendance_daily_summary`, `leaves` | `00_init_all.sql`, `schema_expansion.sql` |
| `holidays` | `00_init_all.sql`, `schema_phase3.sql` |
| `system_logs` | `00_init_all.sql`, `schema_timetable.sql` |

`IF NOT EXISTS` means the second definition of a table is not an error and not a
merge — it is a no-op that reports success. `00_init_all.sql` sorts first, so it
won every one of the seventeen, and the other definitions were decoration. The
shape a new customer's database ended up with was decided by filename order.

For four tables the winner was a shape the application cannot write to:

- **`areas`** — won with `parent_id`; every read and write in the Areas page uses
  `parent_area_id`. The page returned 500 on load and could not create an area.
- **`devices`** — won without `transfer_mode`, `timezone`,
  `is_registration_device`, `is_attendance_device`, `connection_interval`,
  `device_direction` or `enable_access_control`, all seven of which Add Device
  and Edit Device write. No reader could be added or edited. `device_direction`
  is also read once per record while pushing attendance to ERPNext, inside a
  per-record `catch`, so every checkin counted as failed and nothing arrived.
- **`attendance_logs`** — won with `punch_type`/`verify_type` and a three-column
  unique key, against ingest code that writes `punch_state`/`verification_mode`
  and targets `ON CONFLICT (employee_code, punch_time)`. Fixed in `ensureSchema`
  before this consolidation.
- **`attendance_daily_summary`** — won with `overtime_minutes`; the engine writes
  `ot_minutes`. Also fixed in `ensureSchema` first.

The live definition of every table is now `database/000_schema.sql`, and
`server/tests/schema_shape.test.js` fails the build if a table is ever defined in
two files at the top level again, or if a statement the application issues stops
resolving against a freshly built database.
