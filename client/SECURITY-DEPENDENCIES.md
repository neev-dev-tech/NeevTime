# Client dependency advisories

`npm audit` reports three high-severity advisories that are deliberately not
fixed. Each was checked against how the code actually uses the library rather
than taken at face value, because the remedy in every case is a major-version
migration and none of the three is reachable here.

Reassessed 2026-08-04. Re-check when the usage below changes — the reasoning,
not the advisory, is what makes these safe to leave.

## xlsx (SheetJS) 0.18.5 — prototype pollution, ReDoS

**Not reachable: the library is only ever used to write.**

Every call site uses `XLSX.utils.book_new`, `XLSX.utils.json_to_sheet`,
`XLSX.utils.book_append_sheet` and `XLSX.writeFile`. There is no `XLSX.read` or
`XLSX.readFile` anywhere in `src/`. Both advisories require *parsing* a hostile
spreadsheet.

The one place the app ingests a user file is the Import wizard, and it accepts
`.csv` only (`accept=".csv"`), parsed with `FileReader` — xlsx never sees it.

There is also no fix to apply: `npm audit` reports `fixAvailable: false`, because
SheetJS no longer publishes to the npm registry. Upgrading means repointing the
dependency at `cdn.sheetjs.com`, which is worth doing the day anything here
starts reading spreadsheets, and is otherwise churn.

**This becomes urgent if** the import path ever accepts `.xlsx`, or any feature
starts parsing uploaded workbooks.

## react-router / react-router-dom 7.18.2 — RSC mode CSRF bypass

**Not reachable: the advisory applies to React Server Components mode.**

This client is a plain single-page app. It uses `BrowserRouter` with `<Routes>`
in `src/App.jsx`; there is no `createBrowserRouter`, no `RouterProvider`, no
`@react-router/server`, and no RSC anywhere. The vulnerable code path is not
compiled in.

The fix is react-router 8, a major migration across every route in the app, for
an advisory that cannot fire. Not a good trade today.

**This becomes urgent if** the app adopts RSC or data-router mode.

## What was fixed

Everything else, on 2026-08-04:

- **jspdf 2.5.2 → 4.2.1** (critical) and **jspdf-autotable 3.8.4 → 5.0.8**,
  which also cleared the transitive **dompurify** advisories. Verified beyond a
  clean build: `default === autoTable` still holds in v5, so the existing
  `{ default: autoTable }` import survives; all twelve `jsPDF` methods the export
  code calls exist in v4; and a real PDF was generated and checked for a `%PDF-`
  header. Both libraries remain dynamically imported, so the login page does not
  pay for them.
- **axios, form-data, socket.io-parser, ws, engine.io-client, follow-redirects,
  yaml** — transitive, fixed by `npm audit fix` with no manifest change.

Server-side is at zero: 12 transitive advisories fixed the same way, and
**nodemailer 7 → 9.0.3**. None of nodemailer's advisories were reachable either
— they need `envelope`, a transport `name`, `list` headers, `raw`, `jsonTransport`
or OAuth2, and `services/email.js` uses none of them — but that one had a clean
upgrade path, so there was no reason to carry it.
