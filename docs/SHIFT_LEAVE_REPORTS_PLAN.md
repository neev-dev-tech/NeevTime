# Shift, Leave & Reports — the plan to industry standard

18 August 2026 · the next build phase, ordered by what is broken before what is missing

## The finding that reorders everything

Both modules were surveyed against the code before writing this, and the
headline is not a missing feature. It is that the two modules' cores are
**stored but never used**:

- **The attendance engine never reads `employee_shifts`.** Shifts, rosters,
  night flags and per-shift grace all exist as tables and screens — and
  `calculateDayStats` scores every employee against the single global
  `shift_start` in Settings. Assign somebody the 14:00 shift and they are
  marked five hours late every day. The entire shift module is decorative.
- **Nothing ever writes `leave_balances.accrued`.** Types carry
  `annual_quota`, `carry_forward`, `max_carry_forward`, `encashable` — and no
  job accrues, no year-end processes carry-forward, `encashable` does nothing.
  Balances only move when an admin types an opening balance or an approval
  deducts. The policy fields are decorative.

Competitors do not win here because they have more screens. They win because
their equivalents of these two engines run.

## Build order

### 1. Shift-aware scoring — the engine honours the assignment *(first: payroll correctness)*

`processDateRange` loads each employee's effective shift (latest
`employee_shifts.effective_date <= date`, falling back to the global rules) and
scores lateness, half-day and OT against that shift's own start, grace and
thresholds. The shift columns already exist: `start_time`, `grace_in_minutes`,
`late_threshold_minutes`, `is_night_shift`, `break_duration_minutes`.

**Night shifts are the hard part and the reason to do this carefully.** A
22:00–06:00 shift's punches land on two calendar dates; today's grouping by
punch date would split one worked night into two broken days. Day attribution
must follow the shift window, not midnight. This changes payroll numbers, so it
ships the way the timezone fix did: computed against production data read-only,
compared with stored summaries, and only then recomputed.

### 2. Leave accrual engine *(second: makes existing policy fields real)*

A monthly job — same pattern as the recompute scheduler, applied by a person the
first time — that accrues `annual_quota / 12` per active employee per type,
prorated from joining date. A year-end process that computes carry-forward
within `max_carry_forward`, writes next year's opening balances, and records
what lapsed. Sandwich rule (weekend/holiday between two leave days counts) as a
per-type flag, applied at application time so the employee sees the true cost
before submitting. Half-day already works; encashment becomes a tracked balance
movement rather than a dead flag.

### 3. Reports to what payroll actually consumes *(third: the daily-use surface)*

What exists is a reasonable list (daily, monthly, late/early, absent, OT,
payroll CSV, scheduled email delivery). The gaps that lose deals:

- **One-click monthly muster** — the register exists; the one-click month view
  with P/A/L/H/W marks per employee per day, exportable, is the sheet every HR
  person actually opens.
- **Cross-tabs** — hours and OT by department × month and contractor × month
  (the contractor half already exists; generalise it).
- **Trends** — late arrivals and OT as lines over months, on the dashboard,
  from `attendance_daily_summary` which already holds everything needed.
- **Excel (.xlsx) exports** — payroll teams import Excel, not CSV, and the
  distinction matters to them; one shared exporter, every report gains it.

### 4. Rotation & swaps *(last: genuinely new, sell-driven)*

Week A/B rotation patterns generating `employee_shifts` rows in advance; shift
swap requests through the same approval chain as leave. Real features, but
nobody is mis-paid by their absence — they wait until 1–3 are true.

## What is deliberately not here

Biometric-verified leave, geofenced shift check-in variations, AI scheduling —
none of it changes a buying decision at this product's price point, and all of
it sits on top of engines that must exist first.

## Sequencing

| Step | Size | Risk | Blocks |
|---|---|---|---|
| Shift-aware scoring | M | changes payroll numbers — ships behind verification | everything shift-related |
| Leave accrual + year-end | M | low — additive job | leave being trustworthy |
| Reports upgrades | S each | none | daily HR use |
| Rotation & swaps | M | low | nothing — last |
