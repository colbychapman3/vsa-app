# Spec: Phase 1 — Rules engine (no UI)

Status: **APPROVED by Colby 2026-09-25** (as written, including open-question defaults and the `typescript`/`@types/node` dev dependencies). Plan: `tasks/plan.md`.

## Objective

A plain TypeScript rules engine that does all VSA math and validation for **auto discharge**, with no UI, storage, or AI dependencies. Later phases (SQLite storage, screens, on-device AI) call it; nothing else in the app does protocol math.

User: Colby, supervising ro-ro auto discharge at Colonels Island. Success: for the same inputs, the engine gives the same numbers as the VSA Live tracker, passes every applicable kit test, and never invents, clamps, or hides a value.

**In scope (decided 2026-09-25):** everything the VSA Live tracker calculates, plus the load-list vs game-plan check and the SOP p.28 passenger-car clearance check.
**Out of scope:** H&H, load-back, and lashing ledgers (later phase); storage (Phase 2); screens (Phase 3); paperwork extraction and new-vessel setup (Phase 5); AI (Phase 6).

Phase 0 leftovers (Expo app, whole-app spec) are deferred until Phase 3. The engine does not need Expo.

## Sources and authority

Controlling order: Colby's correction > `docs/VSA_Project_Instructions_v2.1.md` > protocol v1.1 > kit files `05`/`06`/`07`/`15` > tracker (`docs/reference/vsa-live.html`) > inference.
The tracker is the reference behavior wherever the docs are silent. Where they disagree, the docs win and the difference is listed in this spec (see Open Questions).

## Modules

One folder, one file per concern. Arrows point one way.

| Module | Responsibility | Depends on |
|---|---|---|
| `time` | Operation clock: `{day, "HH:MM"}` ↔ absolute minutes; ISO-with-offset → operation time; clear-by per side/break | — |
| `baseline` | Validate a vessel baseline (the Glovis JSON shape): hatch/deck/brand totals, duplicate ids, load list vs game plan discrepancy | — |
| `decks` | Deck status, hatch/deck/brand remaining (tracker `deckCalc`), deck heights and the 1.85 m van rule (tracker `heightInfo`) | baseline |
| `fit` | SOP p.28 passenger-car clearance (8 cm ≤ 220 cm, 10 cm > 220 cm); missing Stow H/deck height/citation → not verified | — |
| `events` | Event envelope (kit file 06 shape), validation and rejection messages, replay: idempotency, conflicting duplicates, cross-operation rejection, corrections that supersede with history, overlapping intervals | time, baseline |
| `production` | Hourly periods: short pre-break hour, productive minutes, pace, H.A., driver-hours (time-weighted), stoppage hours, cumulative → interval | time |
| `ledger` | Vessel remaining, field balance, in transit, percent, brand ledgers, clerk remaining, reconciliation status at breaks/shift end | decks, production |
| `eta` | Break-aware FORECAST ETA across days (tracker `etaCalc`), required rate, forecast error | time, production |
| `index` | `project(baseline, events) → state`: the one call later phases use | all |

Build order: `time`, `baseline`, `fit` → `decks`, `production` → `events` → `ledger` → `eta` → `index`.

## Behavior (the rules the tests pin down)

**Unknown is `null`, never 0.** Every derived value is `number | null`; when an input is missing the output is `null` with a reason string.

**Inventory**
- Vessel remaining = starting − confirmed deck progress. If any deck has status Unknown, or is Active/Paused with no count, vessel remaining is `null` and the engine lists which decks are missing.
- Field balance = starting − field. Always labeled field balance, never vessel remaining.
- In transit = progress − field when progress ≥ field. Field above progress → mismatch flagged; in transit `null` (never negative).
- Percent = progress ÷ starting × 100; starting 0 → not applicable, not 100%.
- Brand ledgers per tracker `deckCalc` rules (a mixed hatch that's partly done makes those brands `null`).
- The chief clerk's remaining count is a cross-check at breaks ("matches clerk" / "off by N"), as in the tracker. Vessel remaining always comes from deck progress (`CLAUDE.md`). *(Corrected during T7: this spec first said the clerk count sets progress, from an optional line in doc 07.)*

**Reconciliation**
- During work: report the gap, and note it if field runs ahead or the gap exceeds the driver count. No alarm.
- At a break or shift end: overall and by brand, match → `match` (green), ship ahead → `warning`, field ahead → `alarm` (red). Zero overall variance doesn't clear a brand mismatch. By brand this follows `CLAUDE.md`; the tracker shows every brand mismatch red.
- Counts only "match" when overall and every brand match. Hours logged without a brand split leave the brand check unknown, so they can't confirm a match.

**Production**
- An hour is short if a break starts at its end. It needs a stop time (:30 or :45 for Southside/Northside); until set, pace for that hour is `null` and the engine says so.
- H.A. = field ÷ counted hours (each logged hour, short or not, counts as 1; denominator returned). Pace = field ÷ productive hours. Both returned.
- Driver rate uses time-weighted driver-hours (240 cars, 40 drivers × 30 min + 60 × 30 → 4.8/driver/hour).
- Cumulative checkpoints produce intervals by difference; a decreasing cumulative is rejected unless a correction explains it.

**Time**
- Breaks 12:00 and 18:00, 1 hour, from the baseline. Clear-by: Northside 15 min, Southside 30 min before any scheduled break, applied once; a user-given stop time is never cut again.
- Two-day ships: Day 1 shift end + next-day start; ETA rolls into Day 2.
- An event with no time is stored as "time not provided". The engine never fills in the clock time as the event time.

**ETA** — Always labeled FORECAST. Rate = average pace of the last two hours with a known pace (tracker). It skips breaks and clear-by windows, rolls past shift end, and uses the field balance (labeled) when vessel remaining is unknown. Zero remaining → no further production needed, **not** a completion time. A forecast is never marked complete. Required rate = remaining ÷ productive hours left before a target (none left → infeasible). Forecast error = actual − predicted, in minutes, for the same milestone only.

**Decks and fit**
- Status: Not started, Active, Paused, Complete, Unknown, plus a Skipped flag on Not started. Complete → 0 remaining.
- Heights: below 1.85 m → hard warning; at or above 1.85 m but can be lowered below it and not confirmed → soft warning; confirmed → ok.
- Fit check needs Stow H, deck height, and the SOP p.28 rule. Missing any → `not_verified` with the missing field named. Width is never used for height. Passenger cars only.

**Validation (reject, never clamp)**
Messages reuse the tracker's wording, with the exact overage:
- Hatch remaining above its quantity: "H3 exceeds its 106 autos by 4. Check the count."
- Deck total above deck start; hatch sum ≠ deck total.
- Field total above starting cargo: "This makes the field total 1,975, which exceeds starting cargo (1,969) by 6. Check the count."
- Brand split doesn't add to the hour total; partial brand split.
- Non-integer or negative counts/drivers.
- Replay: event for another operation, reused key with different content, unknown correction target, overlapping field interval, double supersession.

**Corrections** supersede the active value, keep the old event and full history, and report the net change (250 → 275 = +25). They never add on top.

## Tech Stack

- TypeScript 5.x, strict mode. Engine code: no runtime dependencies.
- Tests: Node's built-in test runner (`node:test` + `node:assert`) on Node 22, running `.ts` directly with `--experimental-strip-types`. No test framework to install.
- New dev dependencies (need approval): `typescript` and `@types/node`, for type checking only.

## Commands

```
npm test            # node --test --experimental-strip-types "tests/**/*.test.ts"
npm run typecheck   # tsc --noEmit
```

## Project Structure

```
src/engine/        → engine modules above (time.ts, baseline.ts, decks.ts, fit.ts,
                     events.ts, production.ts, ledger.ts, eta.ts, index.ts)
tests/             → one *.test.ts per module + kit.test.ts + tracker-parity.test.ts
tests/fixtures/    → events.jsonl (kit examples), scenario files for parity tests
docs/reference/    → glovis-condor-101-baseline.json (fixture, read in place)
```

## Code Style

Pure functions, plain data in and out, no classes, no mutation of inputs. `null` = unknown. Names follow the domain (`vesselRemaining`, `fieldBalance`, `inTransit`).

```ts
export type Reject = { ok: false; error: string };

export function checkHatchRemaining(hatch: string, qty: number, remaining: number): Reject | null {
  if (!Number.isInteger(remaining) || remaining < 0) return { ok: false, error: `${hatch} must be a whole number.` };
  if (remaining > qty) return { ok: false, error: `${hatch} exceeds its ${qty} autos by ${remaining - qty}. Check the count.` };
  return null;
}
```

## Testing Strategy

Three layers, all in `npm test`:

1. **Kit tests (`docs/11_validation_tests.json`)**: each case that applies to an auto-only engine becomes an automated test with the kit's numbers:
   - Engine: T3, T4, T5, T6, T2 (fit), B08, B09, B10, B13, B14, B15, B16, B17, B18, B19, B20, B21, B22, B24, B28.
   - Partial: T7 (the engine rejects cross-operation events; the rest is setup behavior).
   - Not the engine's job, deferred with reason recorded in the test file: T1 and B27 (new-vessel setup, Phase 5); B11 and B12 (route/distance lookup, Phase 3 plan screen); B23, B25, B26 (AI/text behavior, Phase 6).
2. **Replay (kit `examples/events.jsonl`)**: three events → 1,969 field units with the 275 correction active and 250 kept in history. Re-delivery is a no-op; cross-operation, conflicting duplicate, unknown target, and overlapping interval are each rejected. Replaying twice gives identical state.
3. **Tracker parity (Glovis Condor 101 baseline)**: the parity test loads the tracker's own `deckCalc`, `etaCalc`, and `compute` from `vsa-live.html` (it exposes them as `window.__VSA_TEST__`) in a Node sandbox. It runs scripted shifts through both the tracker and the engine and asserts identical numbers. Scenarios: start of shift, mixed-deck progress, an Active deck with no count, a short hour with and without a stop time, a lunch break, end of shift with ship = field, ship ahead, field ahead, and a Day 2 ETA.

Every rule in `CLAUDE.md`'s domain section maps to at least one test, and the test file names the rule.

## Boundaries

- **Always:** run `npm test` and `npm run typecheck` before each commit; reject impossible values with the exact overage; keep correction history; keep fixtures TEST-only.
- **Ask first:** any new dependency beyond `typescript`/`@types/node`; changing a rule where the docs and tracker disagree; changing the event envelope shape (Phase 2 stores it).
- **Never:** clamp or zero an unknown; add AI, UI, or storage code to the engine; edit `docs/` sources to make a test pass; delete or skip a failing test without approval; put Glovis data into anything but tests.

## Success Criteria

- [x] `npm test` passes: all engine kit tests, the replay test, and all tracker parity scenarios. (82 tests, 2026-09-25)
- [x] `npm run typecheck` passes with `strict: true`.
- [x] Each domain rule in `CLAUDE.md` has a named test (`tests/rules.test.ts` enforces it).
- [x] Deferred kit tests are listed in the test file with the phase that owns them (`tests/kit.test.ts`).
- [x] Engine files import nothing outside `src/engine/` and Node built-ins are used only in tests.
- [ ] Colby reviews the parity results and approves Phase 1 complete; ROADMAP.md is updated.

## Open Questions

These have defaults. I'll build with the default unless Colby says otherwise.

1. **Clear-by with mixed destinations.** The tracker applies the largest clear-by of any destination (30 min if any Southside destination) to the whole-vessel ETA. The docs define clear-by per destination but don't say how to combine them for one vessel ETA. *Default: keep the tracker's behavior (the more cautious one).*
2. **ETA rate.** The tracker averages the pace of the last two hours with a known pace. The docs only say "comparable recent rate". *Default: keep the tracker's rule and return the hours it used.*
3. **Parity harness risk.** *(Resolved: the tracker runs in a Node sandbox; no fallback needed.)* If `vsa-live.html` can't run in a Node sandbox without a browser, the fallback is expected numbers captured once from the tracker in a browser and saved as fixtures.
