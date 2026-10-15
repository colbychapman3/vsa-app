# Phase A: Trust (approved by Colby 2026-10-14: "go A + updates, drop Pace")

Goal: the next store build matches the Every Screen boards, so a phone check tests the design and not missing pieces. JS only, plus the
over-the-air update library (expo-updates), so this is the last store build needed for JS-only fixes.
Source: `docs/mockups/every-screen-swarm-final-2026-10-13/HANDOFF_SPEC.md` (boards win on layout and wording, the engine wins on rules).

## Done already (2026-10-14)
- Typed Pace control removed from What if (`80dd15b`): every What-if control is backed by the log.
- Over-the-air updates: `expo-updates`, fingerprint runtime, `production` channel; `verify:native` checks them (`ca1267b`).

## Gap table (handoff spec section and board â†’ status in code, `main` at `ca1267b`)

| Item | Board | Status | What is missing |
|---|---|---|---|
| Now card with one action (G1) | 1.2 | Built | `now.ts` `NowLine.action`; Log opens on the due hour (`LogSheet` default hour) |
| Needs a look (G3) | 1.2 | Built | `view.ts needsLook` |
| (i) "How this is worked out" (G2) | 1.1 | Built | `InfoNote` per box |
| Field meter line | 1.1 | Built | "Field Â· In transit Â· Ship left" line (`view.ts`) |
| Ship done ring | 1.1 | Replaced | Big percent over a bar (cloud session, 2026-10-14); banner on HANDOFF_SPEC |
| Pace sparkline + H.A. line | 1.1 | Built | `paceSeries` |
| Answer after Save, hourly (2.1b) | 2.1b | Partial | Card exists (`answer.ts`, `AnswerCard`). Missing: OFFICIAL field "through HHâ€“HH", H.A. / Pace denominators with "was", decks-saved time and carry sentence, peach "Update decks" when decks are older than the last hour, short-hour line |
| Answer after a deck save (3.1b) | 3.1b | Partial | Same component; missing "N cleared since" and "DKx still as of HH:MM" |
| Pre-break nudge (1.2b) | 1.2b | Missing | "Break in N min. Stop at HH:MM." Now card, ghost action to the deck that needs it |
| Needed rate (G9) | 1.4, 1.4b, 1.4c | Partial | Hourly shows a text card **wrongly tagged FORECAST**. Missing: CALCULATED tag, gauge (pace bar + needed tick, shared scale), warn at needed â‰¥ 0.9 Ã— pace, "short / close" lines |
| Brand table in transit (G8) | 1.5, 9.1 | Partial | Diff column only. Missing: Field / Cleared / In transit columns, "All" total row, one-line definition |
| Graph point readouts (G10) | 1.5, 6.1 | Missing | Tappable points (44 pt), readout card, y = labeled value (F9) |
| Plan live Last cars (G7) | 1.6 | Partial | Shown only after save; must follow the side control while editing |
| Reopen a resolved issue (G6) | 1.7 | Missing | Resolved issues list + Reopen with a reason; `discrepancy_opened` with the same id and `reopened` flag (decided 2026-10-13); history kept |
| Closeout signed wording | 6.2 | Built | `closeout.ts` `signedMin` |
| Night contrast pairs | 9.3 | Built | `theme.test.ts` checks every TEXT_PAIR at 7:1 |
| Largest text size | all | Built | `a9e2704` (cap at 1.6Ã—, `textScale.test.ts`) |

## Build order (each step: tests first or with the code; `npm run verify:release` before commit)
1. **Needed rate**: view value `neededRate()` (CALCULATED, never FORECAST); Hourly gauge. Constant `NEEDED_WARN = 0.9`. Not on the Snapshot: since `e092b5a` (2026-10-14) the Snapshot holds only the numbers and the ship; warnings sit at the top of Decks.
2. **Brand table**: `inTransit` per brand (never negative; field-ahead shows "Field over by N", red only at a break or shift end), "All" row, definition line. "â‰¥" kept for inexact field.
3. **Answer after Save**: extend `Answer` with `official`, denominators, `decksAsOf`, `carry`, `action: 'update-decks' | null`, short-hour line; deck save variant. Shown in the Log sheet after Save (one modal at a time).
4. **Pre-break nudge**: `now.ts breakNudge`, a warn line in the 30 min before the first stop of a scheduled break (each side its own clear-by), at the top of Decks with a ghost "See DKx".
5. **Graph readouts**: points carry `{label, pace, count, minutes, short}`; y uses the same value as the label; tap selects, default latest.
6. **Plan live Last cars**: pure `lastCars(shiftEnd, side)`; Plan updates as the side changes.
7. **Reopen**: entry builder + projection (same id, `reopened`), Plan "Resolved âœ“ The log keeps it. Reopen". Replay hashes refreshed only if the output changes, with the reason in the commit.
8. **Cleanup**: delete `FillNumber`; un-export single-file constants; `unknown` + narrowing for `any` in `setup.ts` and `backup.ts`; delete shared export / Print files after the share sheet closes and sweep stale ones at launch.
9. **Docs**: banner on HANDOFF_SPEC (ring replaced; 2.3 clerk text deleted); ROADMAP Now.

Deferred to its own step after this list (the cloud plan's items 2 and 5): the render harness in `tools/render/` and the `src/app/native/` move.
Both are structure, not trust in the numbers, and each touches many files; they come after the features so the features ship first.

## Rules that hold
H&H never enters a brand table, the OFFICIAL total or the needed rate. Peach is never a warning. Needed is CALCULATED, finish is FORECAST.
No screen does protocol math (DOMAIN-BOUNDARY). Reopen appends; nothing is rewritten (EVENTS-ARE-TRUTH).

## Done when
Every row above is Built or Replaced; `verify:release` green; one store build carries it with expo-updates; Colby phone-checks at the
largest text size and in sun. After that build, JS fixes ship with `eas update --channel production` instead of a store build.
