# Spec: Tracker to Assistant, Phases 0 to 5

Status: **APPROVED by Colby 2026-10-11/12 and built 2026-10-12** (main, through the commit that adds this file). Source plan: the Claude Docs artifact "Tracker to Assistant: Game Plan"; philosophy: "VSA Philosophy: Is It an Assistant?". Gate rule changed by Colby 2026-10-12: a phase passes once everything in it is built and merged; "is it an assistant?" is still asked on every ship.

## Objective
Turn the tracker into an assistant: the app speaks first at the right moment, gives back more than it takes, and is dependable first. Three acts: I Prep, II Input loop, III Closeout. No operating rule changed in any phase.

## Phase 0: Dependable first
- **Setup draft** (`src/app/setupDraft.ts`): closing New vessel with typed work asks Keep working / Save draft and close / Discard. One draft, text only, TEST/LIVE flag kept. Autosaves 1 s after the last change and when the app leaves the foreground; never saves an untouched form.
- **Save in reach** (`KeyboardSave` in `ui.tsx`): Save rides above the keyboard on hourly count, deck, break/shift and discrepancy forms. Decks list Active, Paused, Not started/Unknown, Complete last (`orderForList` in `view.ts`, display only).
- **Export file**: `<vessel id>-<YYYY-MM-DD>.vsalog.json` through the share sheet; marked exported only if the sheet reports it was used. **Import from a file** (`expo-document-picker`, `src/app/importFile.ts`), same checks as paste; also for baseline import. 20 MB limit (`importLimit.ts`).
- **Mark complete near the end** (`showMarkComplete`): shows when known remaining ≤ ceil(5% of starting autos), at least 1, or every deck is complete, or the vessel is already marked. The menu entry is hidden once a vessel is marked.

## Phase 1: An answer after every entry
After each hourly count or deck save: remaining, the H.A. change, how far the ETA moved, and only what needs action now (the white answer card with "Why it moved", Design B). Built and merged Oct 11 (builds #23 to #26).

## Phase 2: A step ahead
- **Now line** above the remaining number (Oct 11).
- **Reminders** (`reminderPlan` in `assistant.ts`, `reminders.ts`): count due at HH:05 once per missed working hour (the 11-12 count pings at 12:05; break hours never ping); deck won't make the cutoff, sent at the break minus 75 min only when the pace watch warns, labeled FORECAST; break ending, 5 min before a 1-hour break ends. Settings › Notifications has a switch each. Quiet hours removed (Colby, Oct 12).

## Phase 3: The coach at closeout (`src/app/closeout.ts`, `CloseoutSheet.tsx`)
- One screen from the menu ("Closeout…") and the Snapshot: open items first, in the order that would hurt most if forgotten. Worked out: field matches the decks (every deck counted, ship = field overall and by brand) and discrepancies closed. Ticked by Colby: load-back closed, lashing closed, vans gassed, damage photos logged, H&H kept separate. "You're clear" when all are closed.
- **Ticks are log entries**: `status_change`, metric `closeout_check`, value `checked`/`unchecked`, payload `check` ∈ `CLOSEOUT_CHECKS` (engine). The state carries `closeoutChecks` only when any exists, so old logs replay byte-identical.
- **Scorecard**: the first and the last forecast before the finish, each against the actual finish (`forecastError`, cars only). Actual finish = the deck save that took the ship to 0 when it falls inside the last counted hour (typed time, else save time), otherwise the end of the last counted hour. Unknown until remaining is 0.
- **What slowed you down today?** kept as a Plan note with that title (in the log and the export); a new answer supersedes, an empty one removes it with a reason.
- **Answer sheet** text through the share sheet (superintendent and/or operations manager, picked at send time): status, field count of starting, remaining, finish (actual or FORECAST), H.A. and pace, damage records, open items, the slowed-down line; H&H not included.
- Mark the vessel complete is the last button, swapped into the same sheet (one modal).

## Phase 4: Prep that asks only about doubt (`src/app/prep.ts`)
- After a game plan photo: one card with total autos, decks, destinations with side and count, Southside share by autos (unknown if any destination has no count), H&H printed total apart.
- Doubts only: berth (blocks), build errors (block), game plan total vs decks (exact difference, does not block), read problems, missing deck heights (optional; blank keeps fit checks off). Planned start is one field. "Looks right: load list" skips the step screens; "Check every field one by one" keeps them.
- Review on every path (photo, typed, imported) shows the ship summary and "What the app will watch today": clear-by per side, low/unknown heights, the count reminder, planned start and clock hours, H&H awareness, setup discrepancies.
- Tested on the real Hector Highway 10A cover page (rule 6) and the Glovis Condor 101 baseline (TEST fixture).

## Phase 5: The no loop, built in (`src/app/history.ts`, `Lessons.tsx`)
- A ship teaches only once Colby has marked it complete and the mark holds.
- "Lessons from past ships" (menu): pooled pace and H.A. (all autos over all hours), mean forecast error of the last forecast, slowdown themes by fixed keywords (most common = the next fix), every answer, ship by ship.
- Beside the forecast, never changing it: Finish history and Closeout show the past forecast bias; Setup's watch list shows how long these autos would take at past pace, labeled history.
- Isolation: TEST teaches only TEST, LIVE only LIVE; no other ship's cargo, counts or times enter a record.

## Other decisions recorded 2026-10-12
- Vessel delete is a permanent feature (stays after go-live); a LIVE vessel still needs a current saved copy.
- Option 5 (counts that arrive on their own): no parking scans, the clerk records on paper, vans not GPS-tracked, scans exist at Gate 2, APS approves access. Next: ask APS whether Gate 2 scans can give an hourly count without VINs. Nothing built.

## Tests
`tests/setupDraft`, `deckListOrder`, `importFile`, `vesselComplete`, `reminders`, `closeout`, `prep`, `history` (plus the existing suites). Replay hashes unchanged.

## Boundaries
- Never: auto-complete a vessel, promote a forecast to an actual, add H&H to autos, mix TEST and LIVE history, or let history change a forecast.
