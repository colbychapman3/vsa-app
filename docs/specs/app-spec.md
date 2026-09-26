# Spec: VSA app (whole app)

Status: **APPROVED by Colby 2026-09-26** with the open-question defaults (Now button for times, quick-pick correction reasons, TEST vessel only until Phase 5) and the listed dependencies. Phase 3 plan: `tasks/plan.md`. Later phases get their own specs.

## Objective

A phone app that replaces chat-based tracking of ro-ro auto discharge at Colonels Island. One supervisor (Colby) logs what happens on the terminal: hourly field counts, deck progress, breaks, clerk counts, discrepancies. The app shows the live picture: what's left aboard, pace, forecast, reconciliation. All math comes from tested code, never guesses.

- **User:** Colby on an iPhone 16 Pro, outdoors, in direct sun, often with gloves, often with no signal.
- **Success:** a full shift is run from the app instead of chat. Every number matches the VSA Live tracker for the same inputs, nothing is lost, and nothing unknown is shown as a number.

## Reference and authority

- **Behavior:** the VSA Live tracker source, `docs/reference/vsa-live.html` (live copy: claude.ai artifact 95qzykPseLLPyHjBEmmCHC).
- **Layout:** `docs/reference/screens/` (9 captures at iPhone width; read the README there). There is no separate design.
- **Rules:** `CLAUDE.md` > `docs/VSA_Project_Instructions_v2.1.md` > protocol v1.1 > kit files. Where the tracker differs from these rules, the rules win and the difference is listed (see "Differences from the tracker").
- **Not copied:** the tracker's demo mode, its "Live/Connecting" cloud status, and its view-only mode. The app is single-user and on the phone.

## Architecture

```
Screens (Phase 3)  →  view model (pure, tested)  →  engine project()  (Phase 1, pure, tested)
      │ entries                                           ↑ rebuilt from
      └──→ store.append (Phase 2) ──→ SQLite on phone ────┘ the event log
```

- **Engine** (`src/engine/`, done): all protocol math and validation.
- **Store** (`src/storage/`, done): baseline + append-only event log per vessel; every append is validated by the engine first.
- **View model** (`src/app/view.ts`, Phase 3): the display-only derivations the tracker does while drawing screens: next break and clear-by strip, side split, brands remaining, tab badges, "forecast passed", deck sort order, hourly change labels. Plain TypeScript with no React, unit-tested. **No protocol math in screen code.**
- **Entries** (`src/app/entries.ts`, Phase 3): turns each Log sheet form into kit-06 events (one form can be several events), including corrections. Unit-tested.
- **Screens** (`src/app/screens/`, Phase 3): React Native. Layout only.

## Phases (from ROADMAP)

| Phase | What | Status |
|---|---|---|
| 1 | Rules engine | Done |
| 2 | Offline storage | Done |
| **3** | **Screens: Snapshot, Decks, Hourly, Plan, Log sheet** | **This spec** |
| 4 | Development build on the iPhone (own icon, no PC) | Needs Apple Developer account |
| 5 | New-vessel setup (entered or imported) and optional sync/sharing | Later spec |
| 6 | Apple on-device model for typed/spoken entries (optional) | Later spec |
| 7 | TestFlight / App Store | Later |

Until Phase 5, the app runs one vessel: the **TEST Glovis Condor 101** baseline, clearly marked TEST. A LIVE vessel can't be started until Phase 5 gives a way to enter a real baseline.

## Phase 3 — screens

Four tabs in a fixed bottom bar (Snapshot, Decks, Hourly, Plan) plus a floating blue **Log** button on every tab that opens the Log sheet. Header on every tab: TEST/LIVE chip, "SSI discharge · Berth 2", vessel name, and a subtitle.

### Snapshot (screens 01–03)

1. **Status banners, only when triggered:** SHIFT ENDED; ON BREAK; field above starting cargo (red); reconciliation at a break or shift end (green match / orange ship ahead / red field ahead, overall and per brand; or "waiting on deck counts"); "Forecast passed · completion not reported".
2. **Red banners** get a **Track as open discrepancy** button (it becomes "On the open discrepancy list" once tracked).
3. **Break strip:** next scheduled break and clear-by per side ("Break 12:00 · Clear-by North 11:45"), or "No more scheduled breaks today". Hidden during reconciliation.
4. **Open discrepancies strip** → Plan tab.
5. **Hero card:** VESSEL REMAINING (or FIELD BALANCE when a deck count is missing, with "needs a remaining count on D9"), "of N autos · x% complete/field-counted", progress bar, ship progress, field record, gap (in transit) with driver count. During work, a note if field is ahead of the ship or the gap is more than the drivers. At a break: clerk comparison ("Matches clerk" green / "Off by N" red) or "Chief clerk count not logged for this break".
6. **Two tiles:** EST. COMPLETION tagged **FORECAST** (dashed outline when there's no ETA; shows the reason, e.g. "Needs production data"; "Day 2" above the time when it rolls over; "Based on field balance" when vessel remaining is unknown) and AVG HOURLY (H.A.) tagged **CALCULATED** with its denominator and pace, which opens the Hourly tab.
7. **Remaining by brand:** banner "N brands remaining of M · K finished", one row per brand with remaining of start and a bar.
8. **Side split:** Northside/Southside percent of starting autos, and autos left per side (unknown if a brand goes to both sides or its remaining is unknown).

### Decks (screens 04–05)

1. **Deck insights:** a red card per low deck with cargo left ("D7 is a low deck: 1.70 m · shuttle vans can't drive on"), and "N deck heights unconfirmed → Confirm on Plan".
2. **Deck list** in baseline order (H4 → H1 hatch chips): label, status pill (Active, Paused, Not started, Skipped, Complete, Unknown), remaining of start, height chip (red = low deck, orange = unconfirmed), hatch chips with brands. Complete decks show "Cleared 199 Kia · at 13:40" or "time not provided". Low decks have a red row.
3. **Deck sheet** (tap a deck): status buttons, the Skipped checkbox (Not started only), remaining per hatch (blank = unknown) or a deck total, the time of this update, and **Save deck update**. Shows the last three changes from history.

### Hourly (screens 06–07)

1. **Stats:** H.A. (with "÷ N hr"), Pace (per productive hr), Total field count, and the pace formula line.
2. **"Stoppage time not set"** warning for short hours without a stop time. The engine refuses to save such an hour, so this shouldn't occur. Kept for safety.
3. **Field vs cleared by brand** table (≥ when some hours have no brand split; difference as "field over" red or "in transit").
4. **List / Graph** toggle.
   - **List:** each hour with count and bar, a SHORT HOUR tag with stop time and pace, and a CORRECTED tag ("Was 235 · original kept"). Also the change vs the prior hour (pace-based when a short hour is involved), brand chips, and drivers with per-driver per productive hour.
   - **Graph:** a pace line per hour with counts labeled, a dashed average-pace line, and orange dots for short hours. Day 2 hours are prefixed.

### Plan (screen 08)

1. **Confirm deck heights:** for each unconfirmed deck with cargo left, buttons "Set at 2.00 m" / "Set at 1.70 m" (tallest first). Confirmed decks show a chip "D7 1.70 m ✓ · change".
2. **Open discrepancies** with **Mark resolved**, plus the last five resolved.
3. **Baseline & data status:** starting autos by brand; H&H as a separate ledger; verification chips and checks; sources.
4. **Labor:** start, auto drivers ordered and gangs, van drivers, heavy gang, and the note "ordered, not a confirmed shape-up".
5. **Forecast settings:** breaks, Day 1 shift end ("Works until finished" or a time), next-day start, and **Change shift settings**.
6. **Side split** from destinations.
7. **Destinations from Berth N:** name, side, brands, measured miles, reference time, and clear-by. Note: "Reference times: cycle scope (one-way vs round trip) unspecified."
8. **Break log.**

### Log sheet (screen 09)

Five modes: **Hourly count · Deck · Break / shift** (becomes "End break" or "Next day") **· Clerk count · Discrepancy**.

- **Hourly count:** hour picker (defaults to the next hour after the last one logged, skipping a break; a logged hour is marked "(correct)"). Fields: autos counted, drivers (optional), split by brand (optional; all brands or none). For a pre-break hour: "When did production stop?" with :30 and :45 buttons, defaulting by side as the tracker does. Note: "Enter the count for that hour only, not the running total."
- **Deck:** the deck list; tapping a deck opens the deck sheet.
- **Break / shift:** break start time; or break end time; **Log end of shift** (starts end-of-shift reconciliation); after a shift end, **Start Day 2** with its start time.
- **Clerk count:** clerk's vessel remaining and the time.
- **Discrepancy:** "What doesn't match" (up to 200 characters) → the open list.
- **Shift settings sheet** (from Plan): "Finish today" / "Carries to Day 2", Day 1 shift end, next-day start.

**Every save goes through `store.append`.** On rejection, the sheet stays open and shows the engine's exact message in red. Nothing is saved.

### Look and feel (from the tracker)

- **Colors:** light "hi-vis" theme with the tracker's colors: warm off-white background `#F4F1EA`, near-black ink and header `#15171A`, blue for actions `#1D4ED8`, orange for forecast and warnings `#B45309`, red for alarms `#B91C1C`, green for match `#15803D`, orange-peach accent `#FDBA74`. Tag colors: FORECAST orange, CALCULATED grey.
- **Fonts:** Barlow Condensed (bold) for big numbers and headings; IBM Plex Sans for text; tabular (same-width) digits.
- **Field use:** tap targets at least 56 pt (Log button, tabs, save buttons, height buttons). Numbers never break mid-digit. Layout works at large iOS text sizes. Nothing depends on color alone: every status also has a word.

### Differences from the tracker (rules win)

These follow the Phase 1 rulings, which the tracker has since mostly adopted:

1. **Brand reconciliation:** ship ahead is orange (warning) and field ahead is red. The tracker now does the same.
2. **Per-driver rate** is per productive hour. The tracker now does the same.
3. **Clerk count** is a cross-check only (same as the tracker).
4. **Southside** uses the full Appendix C list.
5. **No demo mode, no cloud status, no view-only mode** (see "Not copied" above).
6. **Times are never auto-filled as event times. Needs Colby's OK (open question 1).** The tracker pre-fills the deck-update, break and clerk time fields with the phone's clock. The app leaves those fields empty with a one-tap **Now** button, so a time is only recorded when Colby enters or confirms it. An empty time is saved as "time not provided".
7. **Corrections need a reason. Needs Colby's OK (open question 2).** Re-entering an hour creates a correction; the engine requires a reason. The sheet shows quick reasons (Recount · Typo · Checker update · Other…) and saves nothing until one is picked.
8. **Deck sheet is a full snapshot; an unchanged re-save records nothing.** Decided by Colby 2026-09-26. The sheet opens with the current counts, and clearing a box saves that hatch as unknown (same as the tracker). Saving the same values again, only to confirm them at a new time, records nothing and says "Nothing to save" (the tracker would write it and update the deck time).
9. **Hours follow the day's start time; an hour may not run through a break.** Decided by Colby 2026-09-26 (option A). A 07:30 start gives 07:30–08:30 hours, like the tracker. Unlike the tracker, an hour such as 11:30–12:30 that runs through the 12:00 break is refused, because it would count break time as productive. **Known gap, for Phase 5:** with a half-hour start, the half hour right before a break has no hour of its own yet. Colby's shifts normally start on the hour.

## Tech

- **Base:** Expo SDK 57, React Native, TypeScript (done). State-based tabs and React Native `Modal` sheets; no navigation library.
- **New dependencies (need approval), all included in Expo Go:**
  - `react-native-svg`: hourly graph and the tracker's icons
  - `expo-font` with `@expo-google-fonts/barlow-condensed` and `@expo-google-fonts/ibm-plex-sans`: the tracker's fonts, bundled so they work offline
  - `react-native-safe-area-context`: keeps the header and tab bar clear of the notch and home bar
- **Commands:** `npm test`, `npm run typecheck`, `npm run check:ios`, `npx expo start`.
- **Structure:**
  ```
  App.tsx                   → loads the store and the TEST vessel, holds tab state
  src/app/view.ts           → view model (pure, tested)
  src/app/entries.ts        → Log forms → events (pure, tested)
  src/app/theme.ts          → colors, fonts, sizes
  src/app/screens/*.tsx     → Snapshot, Decks, Hourly, Plan, LogSheet, DeckSheet, ShiftSheet
  tests/view.test.ts, tests/entries.test.ts
  ```
  The Phase 2 check screen is removed.

## Testing strategy

1. **View-model tests (Node):** the tracker's demo shift must produce exactly the numbers in screen 01: 512 remaining of 1,969; 74.0%; ship 1,457; field 1,419; gap 38 of 70; ETA FORECAST 17:06 at 245/hr over the last 2 hours; H.A. 237 (1,419 ÷ 6); pace 247 over 5.75 productive hours; Kia 30 of 829; Hyundai 482 of 1,140; Northside 100.0%; tab badges Decks 1, Plan 1. Screen 03's lunch numbers (1,039, 47.2%, match at 930, ETA 17:24, H.A. 233) and screen 02's no-counts state are tested the same way.
2. **Entry tests (Node):** each Log form becomes the right events. Re-entering an hour makes corrections that supersede the old values with the reason, and history is kept. An empty time field becomes `occurred_at: null`. Deck, break, shift, clerk and discrepancy forms all round-trip through `store.append` on node:sqlite.
3. **Build check:** `npm run check:ios` on this PC.
4. **On the iPhone (Phase 3 done-when):** in airplane mode, log a full TEST shift: hours with a short pre-break hour, deck updates, lunch break with a clerk count and reconciliation, a corrected hour, a discrepancy tracked and resolved, deck heights confirmed, end of shift. Then compare each tab against the screens folder.

## Boundaries

- **Always:** keep protocol math in the engine and display derivations in `view.ts`, both tested; show the engine's exact rejection; label forecasts FORECAST; show unknown as unknown ("—" plus the reason), never 0.
- **Ask first:** any dependency beyond the list above; any screen or behavior the tracker doesn't have; any change to the rules above.
- **Never:** do math in screen code; auto-fill an event time; store TEST data in a LIVE vessel; make the app need a network connection.

## Success criteria (Phase 3)

- [ ] `npm test` passes, including view-model tests with screens 01–03 numbers and entry tests.
- [ ] `npm run typecheck` and `npm run check:ios` pass.
- [ ] On Colby's iPhone, a full TEST shift is logged with no signal, and each tab matches its reference screen in layout and numbers.
- [ ] Readable in sun with gloves, per Colby's judgment on the terminal.
- [ ] Colby approves; ROADMAP updated.

## Open questions

These have defaults. I'll plan with the default unless Colby says otherwise.

1. **Event times:** empty field plus a **Now** button instead of the tracker's pre-filled clock time (difference 6). *Default: yes.* It's one extra tap, but a time is never recorded unless Colby confirms it.
2. **Correction reasons:** quick-pick reasons when re-entering an hour (difference 7). *Default: yes.* The engine requires a reason, so the alternative is an automatic reason like "Re-entered on Log sheet".
3. **Vessel switching** (more than one vessel on the phone) waits for Phase 5. *Default: yes; Phase 3 runs only the TEST Glovis vessel.*
