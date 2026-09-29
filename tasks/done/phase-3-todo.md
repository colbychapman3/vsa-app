# Phase 3 tasks — screens

Commands: `npm test`, `npm run typecheck`, `npm run check:ios`. Every task ends with them passing and a commit. Screen tasks also get a quick look on the phone in Expo Go.

- [x] **T1: App shell** (M)
  - Acceptance: dependencies installed with `npx expo install` (`react-native-svg`, `expo-font`, `@expo-google-fonts/barlow-condensed`, `@expo-google-fonts/ibm-plex-sans`, `react-native-safe-area-context`); `theme.ts` with the tracker's colors, fonts and sizes; header (TEST chip, port/berth, vessel, subtitle); bottom tab bar with badges; floating **Log** button; `App.tsx` opens the store, creates or loads the TEST Glovis vessel, and holds state. The check screen is removed.
  - Verify: `npm run check:ios`; on the phone the four tabs switch and the header matches screen 02.
  - Files: `App.tsx`, `src/app/theme.ts`, `src/app/screens/Chrome.tsx`, `package.json`
  - Depends on: none

- [x] **T2: View model** (M)
  - Acceptance: `view.ts` derives, from `project()` state plus the current time, everything the tracker computes while drawing: hero (vessel remaining or field balance), banners, break strip and clear-by per side, "forecast passed", tiles, brands remaining/finished, side split, tab badges, deck sort and insights, hourly rows (change labels, per-driver rate), graph points and scale, field vs cleared table, Plan sections.
  - Verify: `tests/view.test.ts` reproduces screen 01 (512, 74.0%, 1,457 / 1,419 / gap 38 of 70, ETA 17:06 at 245/hr over the last 2 hours, H.A. 237 = 1,419 ÷ 6, pace 247 over 5.75 h, Kia 30 / Hyundai 482, Northside 100.0%, badges Decks 1 · Plan 1), screen 02 (no counts: 1,969, "Needs production data", Plan 5), and screen 03 (1,039, 47.2%, match at 930, "Matches clerk", ETA 17:24, H.A. 233, pace 248).
  - Files: `src/app/view.ts`, `tests/view.test.ts`
  - Depends on: T1

- [x] **T3: Entries** (M)
  - Acceptance: `entries.ts` turns each form into events: hourly count (total, brand split, drivers, stop time), correction on re-entry with a required reason, deck update (status, skipped, hatch or deck remaining, time), height confirmation, break start/end, end of shift, next-day start, shift settings, clerk count, discrepancy open/resolve. Empty time → `occurred_at: null`; the tapped **Now** fills the phone's time.
  - Verify: `tests/entries.test.ts`: every form saved through `store.append` on node:sqlite, then `project()` shows it; re-entering an hour supersedes only the changed values and keeps history; corrections without a reason are refused.
  - Files: `src/app/entries.ts`, `tests/entries.test.ts`
  - Depends on: T1

### Checkpoint A
- [x] `npm test`, `npm run typecheck`, `npm run check:ios` pass; screen 01–03 numbers reproduced
- [x] Independent review (agent-skills:code-reviewer) of T1–T3: no math outside engine/view, unknown never shown as 0, tests really prove the screen numbers; findings fixed or reported to Colby (6 review rounds 2026-09-26: 7, 2, 1, 3, 1 required → all fixed; round 6 clean)

- [x] **T4: Snapshot** (M)
  - Acceptance: matches screens 01–03: banners, track-as-discrepancy, break strip, open discrepancies strip, hero with clerk check, FORECAST and CALCULATED tiles, remaining by brand, side split.
  - Verify: `npm run check:ios`; on the phone, compare with screen 02 (no counts).
  - Files: `src/app/screens/Snapshot.tsx`
  - Depends on: T2

- [x] **T5: Log sheet** (M)
  - Acceptance: matches screen 09. Modes: Hourly count (hour picker with "(correct)", brand split, pre-break stop buttons with side default, correction reason picker), Break / shift (start, end, end of shift, next day), Clerk count, Discrepancy; the Deck mode lists decks (opening the deck sheet from T6). Time fields empty with a **Now** button. Engine rejections are shown in red and nothing is saved.
  - Verify: on the phone, log hours including the 11:00 short hour, a correction, a break with a clerk count; the Snapshot updates.
  - Files: `src/app/screens/LogSheet.tsx`
  - Depends on: T3, T4

- [x] **T6: Decks and deck sheet** (M)
  - Acceptance: matches screens 04–05: deck insights (low decks, unconfirmed count), deck list with pills, heights, hatch chips, cleared line and red low-deck rows; the deck sheet with status, skipped, hatch or deck remaining, time with Now, save, last three changes.
  - Verify: on the phone, mark decks Active/Complete, enter hatch counts, try an over-quantity hatch (refused).
  - Files: `src/app/screens/Decks.tsx`, `src/app/screens/DeckSheet.tsx`
  - Depends on: T2, T3

- [x] **T7: Hourly** (M)
  - Acceptance: matches screens 06–07: stats, pace formula, field vs cleared by brand, list (short hour, corrected, change vs prior, brands, drivers) and graph (pace line, counts, average dashed, orange short hours, Day 2 labels).
  - Verify: on the phone, compare with screens 06–07 after logging hours.
  - Files: `src/app/screens/Hourly.tsx`
  - Depends on: T2

- [x] **T8: Plan and shift settings** (M)
  - Acceptance: matches screen 08: confirm deck heights (Set at … buttons, confirmed chips with change), open discrepancies with Mark resolved and recently resolved, baseline and data status, labor, forecast settings with **Change shift settings** sheet, side split, destinations with the reference-time note, break log.
  - Verify: on the phone, confirm heights (the Decks badge updates), resolve a discrepancy, set a Day 1 shift end (ETA moves to Day 2).
  - Files: `src/app/screens/Plan.tsx`, `src/app/screens/ShiftSheet.tsx`
  - Depends on: T2, T3

### Checkpoint B — Phase 3 done (Colby's iPhone, airplane mode)
- [x] Independent review (agent-skills:code-reviewer) of T4–T8 before the phone check; findings fixed or reported to Colby (5 rounds 2026-09-26: 5, 1, 1, 1 required → all fixed; round 5 clean)
- [ ] A full TEST shift: hours with the short pre-break hour, deck updates, lunch with a clerk count and reconciliation, a corrected hour, a discrepancy tracked and resolved, heights confirmed, end of shift
- [ ] Each tab matches its reference screen in layout and numbers
- [ ] Readable in sun with gloves (Colby's judgment)
- [ ] Colby approves; ROADMAP updated
