# Phase A: Trust (approved by Colby 2026-10-14: "go A + updates, drop Pace")

Goal: the next store build matches the Every Screen boards, so a phone check tests the design and not missing pieces. JS only, plus the
over-the-air update library (expo-updates), so this is the last store build needed for JS-only fixes.
Source: `docs/mockups/every-screen-swarm-final-2026-10-13/HANDOFF_SPEC.md` (boards win on layout and wording, the engine wins on rules).

## Done first (2026-10-14)
- Typed Pace control removed from What if (`80dd15b`): every What-if control is backed by the log.
- Over-the-air updates: `expo-updates`, fingerprint runtime, `production` channel; `verify:native` checks them (`ca1267b`).

## Gap table (handoff spec item and board → status in code)

| Item | Board | Status | Notes |
|---|---|---|---|
| Now card with one action (G1) | 1.2 | Moved | `now.ts` `NowLine.action`; since `e092b5a` the due hour is a chip on Log and warnings sit at the top of Decks |
| Needs a look (G3) | 1.2 | Built | `view.ts needsLook` |
| (i) "How this is worked out" (G2) | 1.1 | Built | `InfoNote` per box |
| Field meter line | 1.1 | Built | "Field · In transit · Ship left" line (`view.ts`) |
| Ship done ring | 1.1 | Replaced | Big percent over a bar (2026-10-14); banner on HANDOFF_SPEC |
| Pace sparkline + H.A. line | 1.1 | Built | `paceSeries` |
| Answer after Save, hourly (2.1b) | 2.1b | Built (`dfd3bae`) | OFFICIAL field "through HH–HH", H.A. and Pace with denominators and "was", decks saved time and carry, short-hour line, peach Update decks. Shown under the header after the sheet closes, not inside the Log sheet |
| Answer after a deck save (3.1b) | 3.1b | Built (`dfd3bae`) | Remaining "N fewer", decks saved time, "DKx still as of HH:MM" |
| Pre-break nudge (1.2b) | 1.2b | Built (`ee65b96`) | At the top of Decks, ghost "See DKx" |
| Needed rate (G9) | 1.4, 1.4b, 1.4c | Built (`a3cd7aa`) | CALCULATED gauge on Hourly (was tagged FORECAST); warn at needed ≥ 0.9 × pace; not on the Snapshot (numbers only) |
| Brand table in transit (G8) | 1.5, 9.1 | Built (`3b06890`) | Field / Cleared / In transit, All row, definition; Hourly graph and the Snapshot at breaks |
| Graph point readouts (G10) | 1.5 | Built (`dd3bb23`) | Tap a point (44 pt) for its hour. F9 (label a short hour by its pace) waits on Colby: it moves a screen-number test |
| Finish history point readouts | 6.1 | Not done | Next after the phone check |
| Plan live Last cars (G7) | 1.6 | Built (`7e76f47`) | |
| Reopen a resolved issue (G6) | 1.7 | Built (`9e29551`) | `discrepancy_opened` on the same id with a reason; replay hashes unchanged |
| Closeout signed wording | 6.2 | Built | `closeout.ts` `signedMin` |
| Night contrast pairs | 9.3 | Built | `theme.test.ts` checks every TEXT_PAIR at 7:1 |
| Largest text size | all | Built | `a9e2704` (cap at 1.6×, `textScale.test.ts`) |

## Build order (each step: tests first or with the code; checks green before commit)
1. Needed rate: `neededRate()` (CALCULATED, never FORECAST); Hourly gauge; `NEEDED_WARN = 0.9`. Not on the Snapshot: since `e092b5a` the Snapshot holds only the numbers and the ship.
2. Brand table: `inTransit` per brand (never negative; field-ahead shows "field over", red only at a break or shift end), All row, definition. "≥" kept for an inexact field.
3. Answer after Save: `official`, denominators, `decks`, `stale`, `short`, `action: 'update-decks' | null`. The projection gains `deckSaves`; replay hashes refreshed for that field only.
4. Pre-break nudge: `now.ts breakNudge`, in the 30 min before the first stop of a scheduled break (each side its own clear-by).
5. Graph readouts: each point carries its hour, pace and minutes worked; tap selects, default latest.
6. Plan live Last cars: pure `lastCars(end, side, nextStart)`.
7. Reopen: entry builder + projection; Plan lists resolved issues with Reopen.
8. Cleanup (`5a56c45`): `FillNumber` deleted; eight single-file constants un-exported. Not done: `any` → `unknown` in the two importers (local to a fully tested JSON check; the rewrite buys little), and the cache sweep (moved to Phase B, privacy).
9. Docs: banner on HANDOFF_SPEC; ROADMAP Now.

Deferred (the cloud plan's items 2 and 5): the render harness in `tools/render/` and the `src/app/native/` move. Both are structure, not
trust in the numbers, and each touches many files.

## Rules that hold
H&H never enters a brand table, the OFFICIAL total or the needed rate. Peach is never a warning. Needed is CALCULATED, finish is FORECAST.
No screen does protocol math (DOMAIN-BOUNDARY). Reopen appends; nothing is rewritten (EVENTS-ARE-TRUTH).

## Done when
`verify:release` green; one store build carries this with expo-updates; Colby phone-checks at the largest text size and in sun. After that
build, JS fixes ship with `eas update --channel production` instead of a store build.
