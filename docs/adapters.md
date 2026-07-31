# Device adapters

NeevTime ingests punches from three kinds of source. All of them end up in the
same place — `server/services/punch_ingest.js` — so deduplication, timezone
handling, summary recomputation, the live feed and the HRMS push behave the same
no matter which brand of reader produced the punch.

| Source | Status | Where |
|---|---|---|
| ZKTeco / eSSL (ADMS/iclock push) | **Live in production** | `server/services/adms.js` |
| Anything that can POST JSON | **Live in production** | `server/routes/vendor_ingest.js` |
| Hikvision (ISAPI) | **Written, not enabled, not tested on hardware** | `server/services/adapters/hikvision.js` |
| Suprema (BioStar 2) | **Written, not enabled, not tested on hardware** | `server/services/adapters/suprema.js` |

The Hikvision and Suprema adapters are deliberately **not mounted or started**.
Nothing in `server.js` references them, so deploying this code changes nothing
about how the running system behaves.

## What is proven and what is not

The parsing half of each adapter is pure and covered by tests:

```bash
node --test server/tests/adapters.test.js
```

13 tests cover XML, JSON and multipart Hikvision events, both Suprema response
shapes, and — most importantly — that access-denied and unrecognised events are
**not** turned into attendance.

The network half is not proven. Nobody has pointed a real device at this code.
Specifically unverified:

**Hikvision**
- The `subEventType` numbers your firmware emits on a successful punch. The
  defaults (`1` card, `38` fingerprint, `75` face, `76`, `77`) come from the
  ISAPI documentation and vary by model and firmware.
- Whether your model sends `attendanceStatus` at all. Many send the literal
  string `"undefined"`, in which case in/out is inferred from punch order as it
  already is for eSSL.
- Whether it posts XML, JSON or multipart, and whether it can reach the listener.

**Suprema**
- The event type codes your BioStar version uses for a successful verification.
  These differ between 2.7, 2.8 and 2.9. The defaults are the common
  verify/identify successes.
- Whether `user_id` carries your employee code or an internal id that needs
  mapping.
- Whether the install presents a self-signed certificate.

Both adapters **ignore anything they do not recognise and log what they saw**,
rather than guessing. That is the important safety property: a punch invented
from a rejected badge is worse than a missing one, because nobody goes looking
for it. The log line tells you exactly which code to add.

## Enabling Hikvision when a device is available

1. Register the device and issue it a token:

   ```bash
   curl -X POST https://<server>/api/devices/external \
     -H "Authorization: Bearer <admin-jwt>" -H 'Content-Type: application/json' \
     -d '{"serial_number":"HIK-1","vendor":"hikvision","device_model":"DS-K1T341"}'

   curl -X POST https://<server>/api/devices/HIK-1/ingest-token \
     -H "Authorization: Bearer <admin-jwt>"
   ```

2. Mount the listener in `server.js`, next to the other route mounts and **above**
   the `authenticateToken` routers:

   ```js
   app.use('/api/adapters/hikvision', require('./routes/adapter_hikvision'));
   ```

3. On the device: Network → Advanced Settings → HTTP Listening. Set the URL to
   `http://<server>:3001/api/adapters/hikvision/event?token=<ingest_token>`.

   The token is in the query string because most Hikvision firmware cannot send
   a custom header. Keep the listener on the LAN, or put TLS in front of it.

4. Badge once and watch the log. You will see either `punch stored for …` or
   `event ignored from …: sub-event NN is not a recognised successful
   identification`. If it is the latter and the badge was accepted by the door,
   add `NN` to `SUCCESS_SUB_EVENTS` in `hikvision.js`.

The listener always answers `200 OK`, even on failure. A Hikvision controller
that receives an error retries the same event forever, which turns a small
parsing problem into a flood.

## Enabling Suprema when a server is available

1. Register a device row for it and note the serial you use.
2. Start the poller in `server.js` after the other schedulers:

   ```js
   require('./services/adapters/suprema_poller').startSupremaPoller({
     baseUrl: 'https://biostar.local',
     username: 'admin',
     password: process.env.BIOSTAR_PASSWORD,
     deviceSerial: 'BIOSTAR-1',
     allowSelfSigned: true,
     intervalMs: 60000
   }, io);
   ```

   Put the password in the environment, not in the file.

3. Watch the log for `[Suprema] N events, M stored — ignored: …`. The ignored
   reasons name the event codes to add to `SUCCESS_EVENT_CODES`, or pass
   `successEventCodes` in the config to avoid editing code.

The poller starts from the moment it is enabled rather than replaying history.
Pass `since` to backfill. Re-reading a window is safe — punches upsert on
`(employee_code, punch_time)`.

## Adding another vendor

Write a module that turns the vendor's payload into this shape and hand it to
`recordPunch`. Do not write to `attendance_logs` directly.

```js
{
  employeeCode: 'INT029',
  timestamp: '2026-07-31 13:11:52',  // or ISO with an offset
  deviceSerial: 'SERIAL',
  state: 'in',        // 'in' | 'out' | numeric ZK code | null to infer
  verifyMode: 'face', // or 1 finger, 2 face, 3 card, 4 password
  raw: '…'            // original payload, for troubleshooting
}
```

If the vendor has middleware or a cloud that can send an HTTP request, prefer
`POST /api/ingest/punch` — it already accepts this shape and needs no new code.
