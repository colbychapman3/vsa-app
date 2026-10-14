> **Partly superseded 2026-10-13** by `../mockups/every-screen-swarm-final-2026-10-13/HANDOFF_SPEC.md` (VSA Every Screen design). Replaced: the Now card and the answer-after-save UI (boards 1.2, 1.2b, 2.1b, 3.1b). Where the two disagree, the handoff spec and its boards win; the rest of this spec still stands.

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

## Assistant steps 1 to 4 (Colby, 2026-10-12, after the "is it an assistant?" review)
Approved as "do all these". No server, no cost, no rule change. Colby's frame: first prove the tracker is easy and accurate on two parallel live ships; these four are the first moves toward an assistant inside today's limits.
1. **Send update** (`src/app/update.ts`, Snapshot button): the superintendent's message (field count of starting, remaining or unknown with the field balance, FORECAST finish, next break with each side's stop time, the pace-watch outlook, H&H left out), handed to Messages through the share sheet.
2. **The clerk's text** (`src/app/clerkText.ts`, Log › hourly count): paste or dictate ("10-11 245", "245 for 9 to 10", "8 to 9 212, 9 to 10 230"). Fixed rules only. "1-2" or "8-9" resolve to a working hour already started, preferring the one not logged; otherwise "not read" with the reason. Each hour only fills the form; Save stays Colby's.
3. **Advice** (`paceAdvice` in `whatif.ts`, under the Now line): when the pace watch fires, the drivers the last per-driver rate says would clear the deck by the cutoff, labeled FORECAST with its math and assumption; nothing without a driver rate.
4. **"Not useful?"** (`NotUseful.tsx`, `src/app/feedback.ts`, `src/storage/feedback.ts`): one tap on the answer card, the Now line, or a reminder's "Not useful" button; optional reason. Kept on the phone (settings table), not in any vessel's log; counted in Lessons, LIVE and TEST apart.
Tests: `tests/assistSteps.test.ts`.

## Other decisions recorded 2026-10-12
- Vessel delete is a permanent feature (stays after go-live); a LIVE vessel still needs a current saved copy.
- Option 5 (counts that arrive on their own) is closed: no parking scans; the clerk records on paper; vans are not GPS-tracked; Gate 2 does not scan cars (IAP checks TWIC badges only, nothing reported); counts arrive by radio, calls and texts.

## Tests
`tests/setupDraft`, `deckListOrder`, `importFile`, `vesselComplete`, `reminders`, `closeout`, `prep`, `history` (plus the existing suites). Replay hashes unchanged.

## Boundaries
- Never: auto-complete a vessel, promote a forecast to an actual, add H&H to autos, mix TEST and LIVE history, or let history change a forecast.
