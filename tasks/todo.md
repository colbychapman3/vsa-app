# Phase 1 tasks — rules engine

Commands: `npm test`, `npm run typecheck`. Every task ends with both passing and a commit.

## Foundation

- [x] **T1: Project setup and tracker harness** (S)
  - Acceptance: `package.json` (scripts, dev deps `typescript`, `@types/node`), strict `tsconfig.json`; `tests/tracker.ts` loads the tracker's `deckCalc`/`etaCalc`/`compute` from `vsa-live.html` in a `vm` sandbox; kit `examples/events.jsonl` copied to `tests/fixtures/`.
  - Verify: a smoke test runs tracker `deckCalc` on the Glovis D12 deck and gets start = 457. If the sandbox can't load the script, stop and report before T2 (fallback per spec).
  - Files: `package.json`, `tsconfig.json`, `tests/tracker.ts`, `tests/tracker.test.ts`, `tests/fixtures/events.jsonl`
  - Depends on: none

- [x] **T2: `time`** (S)
  - Acceptance: HH:MM ↔ minutes, `{day, hm}` ↔ absolute minutes, ISO-with-offset → operation time; clear-by for any break time by side (Northside 15, Southside 30; Southside = Zone 1, MBZ, Zone T, Zone V); a user-given stop time is not cut again; missing time → "time not provided".
  - Verify: tests for B18, B22 (break 15:20, Gate 1/Gate 2), noon cutoffs 11:45/11:30.
  - Files: `src/engine/time.ts`, `tests/time.test.ts`
  - Depends on: T1

- [ ] **T3: `baseline` and `decks`** (M)
  - Acceptance: baseline validation (hatch/deck/brand totals, duplicate ids, load list vs game plan kept as a discrepancy, load list controls); deck status rules including Skipped; hatch/deck/brand remaining; unknown when Active/Paused with no count; rejections for hatch above quantity, deck total above start, hatch sum ≠ deck total; heights: hard below 1.85 m, soft when lowerable and unconfirmed.
  - Verify: T3 kit test; Glovis baseline totals 1,969 (829 Kia, 1,140 Hyundai); parity with tracker `deckCalc`/`heightInfo` on every Glovis deck across all statuses.
  - Files: `src/engine/baseline.ts`, `src/engine/decks.ts`, `tests/baseline.test.ts`, `tests/decks.test.ts`
  - Depends on: T1

- [ ] **T4: `fit`** (S)
  - Acceptance: SOP p.28 passenger-car clearance with citation in the result; missing Stow H, deck height or rule → `not_verified` naming the missing field; never uses width; partial manifest verifies inspected units only; not applicable to H&H.
  - Verify: T2, B16 (220/212, 221/212, 210/203), B17 (415 of 535 inspected).
  - Files: `src/engine/fit.ts`, `tests/fit.test.ts`
  - Depends on: T1

### Checkpoint A
- [ ] `npm test` and `npm run typecheck` pass
- [ ] Tracker harness works (or fallback fixtures agreed with Colby)

## Core

- [ ] **T5: `events` and replay** (M)
  - Acceptance: event envelope typed after kit file 06; replay applies in sequence order; exact re-delivery is a no-op; reused key with different content, other operation, unknown correction target, double supersession, and overlapping active field interval are each rejected with a message; correction supersedes, keeps history, reports net change.
  - Verify: kit replay → 1,969 with 275 active and 250 in history; replay twice → identical state; T5 (net +25); B19; T7 (cross-operation rejected).
  - Files: `src/engine/events.ts`, `tests/events.test.ts`
  - Depends on: T2, T3

- [ ] **T6: `production`** (M)
  - Acceptance: short pre-break hour needs a stop time (pace `null` with reason until set); pace by productive minutes; H.A. = field ÷ counted hours with the denominator; time-weighted driver rate; stoppage hours with merged overlaps; cumulative → interval, decreasing cumulative rejected; zero or unknown denominators → unavailable with reason.
  - Verify: T6 (120 in 11:00–11:30 → 240/active hour, 6/driver), B14 (4.8), B20 (300 → 540 = 240), B21; parity with tracker period pace/delta/H.A.
  - Files: `src/engine/production.ts`, `tests/production.test.ts`
  - Depends on: T2

### Checkpoint B
- [ ] `npm test` and `npm run typecheck` pass
- [ ] Replay test green

## Ledger and forecast

- [ ] **T7: `ledger` and reconciliation** (M)
  - Acceptance: vessel remaining (`null` + missing decks list when unknown); field balance labeled; in transit never negative; percent (starting 0 → not applicable); brand ledgers; clerk remaining sets progress once; field total above starting rejected with overage; during work: gap noted, no alarm; at break or shift end: match/warning/alarm overall and per brand; completion is autos-scoped only.
  - Verify: T4 (640/610 → 360 remaining, 30 in transit, flagged at lunch), B08, B09, B13, B24 (1,005 of 1,000 → over by 5); parity with tracker `compute` fields.
  - Files: `src/engine/ledger.ts`, `tests/ledger.test.ts`
  - Depends on: T3, T5, T6

- [ ] **T8: `eta`** (M)
  - Acceptance: FORECAST label; rate = average of last two known paces (hours used returned); skips breaks and clear-by; rolls past shift end into Day 2; field-balance basis labeled when vessel remaining unknown; zero remaining → no completion time; required rate and infeasible target; forecast error per milestone.
  - Verify: B10, B15 (finish 14:00, 240/hour required), B28 (+12 min, cars only); parity with tracker `etaCalc` on Day 1 and Day 2 cases.
  - Files: `src/engine/eta.ts`, `tests/eta.test.ts`
  - Depends on: T6, T7

- [ ] **T9: `project()` and full parity** (M)
  - Acceptance: `project(baseline, events)` returns the full state or the first rejection; kit test file covers every engine case and lists deferred ones with owning phase; each `CLAUDE.md` domain rule has a named test.
  - Verify: all spec parity scenarios on Glovis (start, mixed progress, Active deck no count, short hour ±stop time, lunch, ship = field, ship ahead, field ahead, Day 2 ETA) match the tracker.
  - Files: `src/engine/index.ts`, `tests/kit.test.ts`, `tests/parity.test.ts`, `tests/rules.test.ts`
  - Depends on: T7, T8

### Checkpoint C — Phase 1 done
- [ ] All spec success criteria checked
- [ ] Colby reviews parity results and approves
- [ ] ROADMAP.md status updated
