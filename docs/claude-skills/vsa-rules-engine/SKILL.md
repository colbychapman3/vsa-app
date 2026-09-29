---
name: vsa-rules-engine
description: Rules for the pure VSA rules engine in src/engine and the view model in src/app/view.ts — protocol math (vessel remaining, field balance, H.A., pace, ETA, clear-by, deck heights), validation messages, and the node:test discipline. Use when changing any calculation, validation, or projection.
---

# VSA rules engine

All protocol math and validation live in `src/engine/` (plain TypeScript). `src/app/view.ts` holds display-only derivations. Both are covered by tests in `tests/`. CLAUDE.md's "Non-negotiable domain rules" are the spec; this skill is how to keep them true in code.

## Purity
- No imports from React, React Native, expo-*, or storage in `src/engine/` or `src/app/view.ts`.
- Data in, data out. Pass the current time in (`nowMin`); never read the clock inside the engine.
- Same inputs, same outputs.

## Unknown is not zero
- A missing input gives `null` plus a reason, never 0. Example: vessel remaining is `null` when any active deck has no count; the screen then shows field balance, labeled as such.
- Driver rate is unavailable (with a reason) when drivers or productive minutes are unknown.

## The metrics (don't invent others)
- **Vessel remaining** = starting − confirmed deck progress. **Field balance** = starting − field. Never mix them.
- **In transit** = ship progress − field; never negative.
- **H.A.** = field ÷ counted hours (show the denominator). **Pace** = field ÷ productive hours (pre-break hours count only minutes worked). Show both.
- **Per-driver rate** = units ÷ driver-hours (`driverRate`), a secondary figure. Drivers come from the workday setting (e.g. Day 1 = 70, Day 2 = 50) unless an hour has its own count.
- **ETA** is labeled FORECAST, break-aware, can roll into Day 2, and is never marked complete by itself.

## Breaks and clear-by
- Breaks 12:00 and 18:00, one hour each.
- Clear-by is a fixed offset before the break: Northside 15 min, Southside 30 min (`CLEAR_BY_MIN`). Southside = Zone 1, MBZ, Zone T, Zone V (and the other Appendix C Southside names in `time.ts`). "MB Field" alone = MBZ. Apply once; when Colby gives a stop time, use it and don't subtract again.
- Don't compute clear-by from travel times: reference times don't say one-way or round trip.

## Validation
- Impossible values are refused with the exact overage (e.g. "exceeds starting cargo (1,969) by 12"). Never clamp.
- Messages name the thing and say what to do, in plain words. Screens show them as-is.
- Decks: shuttle vans need ≥ 1.85 m. Fit checks need Stow H, deck height and a cited SOP rule, or there is no approval.

## Tests (node:test, not Jest)
- `npm test` runs `node --test --experimental-strip-types "tests/**/*.test.ts"`. Tests live in `tests/<module>.test.ts`; fixtures in `tests/fixtures/` and `tests/scenarios.ts`.
- Every rule change gets a test first (or with it), including the refusal message.
- The screen-number tests in `tests/view.test.ts` (screens 01–03) and the Glovis Condor 101 replay must keep passing; if a change moves one of those numbers, stop and ask Colby.
- Before committing: `npm test`, `npm run typecheck`, `npm run check:ios`.
