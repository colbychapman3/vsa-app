# VSA App Roadmap

Each phase ends with a working, tested result and Colby's approval before the next starts.
Update the status line when a phase changes.

**Current status (2026-10-04):** Phases 0-6 done and phone-checked. TestFlight live; build 5 (checkpoint 2: sidebar, Settings, Night) submitted 2026-10-03. Checkpoint 1, the game plan reader (spec phase-6e), is built (378 tests; 5 review rounds, 16 required findings fixed; round 5 still had 2, both fixed; loop stopped by Colby to ship). The EAS Free plan ran out of iOS builds on 2026-10-04; Colby upgraded to a paid EAS plan 2026-10-05; build 6 started then. Keep import photos moved to next. Checkpoint 3 (smarter Ask) after.

## Done (details in git history and `docs/specs/`)
- **0 Setup:** Expo (TypeScript) project, private GitHub repo, kit files in `docs/`, app spec (`app-spec.md`).
- **1 Rules engine:** plain TS; tests from kit file 11, the 1,969 replay and Glovis Condor 101; matches the VSA Live tracker.
- **2 Offline storage:** `expo-sqlite`, append-only event log, corrections with history, state rebuilt from events.
- **3 Screens:** Snapshot, Decks, Hourly, Plan, Log sheet, from the VSA Live tracker.
- **4 Real device build:** EAS build on Colby's iPhone. Field-feedback fixes from the 2026-09-27 airplane-mode test were built 2026-09-28 (last letter wrapping, drivers set once per day, break log edit/add/remove). The large-text-size check is part of every phone check below.
- **5 New-vessel setup:** Setup (manual or baseline paste), vessel list/switch/archive, break/shift-end and completion PDF reports (`phase-5-new-vessel.md`).
- **6 Assistant, map, photo evidence** (`phase-6-capability-map.md`; every module works with AI off; AI only proposes, Colby confirms, the engine does the math):
  - **6a:** Map, Plan Notes, offline knowledge search from the Brain.
  - **6b:** Photo evidence from Log (damage, poor stowage, accident, pre-stow) and its three conditional reports.
  - **6c:** On-device AI runtime, VIN camera scan, photo-prefilled new vessel and notes.
  - **6d:** Floating Ask button, three confirmed actions, 25-minute Plan reminders, Ask my AI (question plus the whole document pack to the user's own AI app by share sheet; no API, no cost).
  - Also approved 2026-10-01: van list in Plan, Snapshot/Hourly/Plan wording changes, polish pass.

## Phase 7: TestFlight, paperwork import, sidebar, smarter Ask
**7a TestFlight: live.** Store builds ship headless: `eas build --platform ios --profile production --non-interactive`, then `eas submit --platform ios --profile production --latest --non-interactive`. Colby's phone check happens on the TestFlight build, so there is no separate dev build for this phase (nothing here needs the dev client). Each checkpoint below is one store build; EAS counts builds against the plan's monthly quota.

Specs: `phase-6e-game-plan-reader.md` (7b, approved 2026-10-04; replaces `phase-7-game-plan-import.md`), `phase-7-sidebar.md` (7c, built). 7d has no spec file; its plan is below. Example paperwork: `docs/reference/game-plan-example-hector-highway-10a/`.

**Phase 7 plan (approved 2026-10-03; checkpoint 1 replaced by the 6e spec, approved 2026-10-04):**

**Checkpoint 1: 7b Game plan reader** (spec `phase-6e-game-plan-reader.md`; Colby's top priority). Step 0 is done: Colby's photos and "Show paperwork text" screenshots (2026-10-03) showed the old reader loses table rows.
1. Fixtures: photos and word-position fixtures (done 2026-10-04); row rebuilding `src/app/layout.ts` with tests (done).
2. Engine: deck-level brand split `Deck.cargo` (hatch counts may be unknown), tests first.
3. `src/app/gamePlan.ts`: the cover-page reader with every check in the spec.
4. Setup: Read the game plan as step 0, Load list step, tags, notes area, H/H ledger; old 6c import removed.
5. `modules/vsa-text`: Vision reader with positions; `readPhotos` switched over; `expo-text-extractor` removed.
6. Keep import photos (Settings switch and storage), if it fits; otherwise next.
7. Gate: tests, typecheck, check:ios, review loop to zero required, TestFlight build, phone check (this game plan, VIN scan, van sheet, notes).

**Checkpoint 2: 7c Sidebar, Settings, Night**
5. First, a short spike: do the tab and map SVG icons accept dynamic colors? If not, a small `useColors()` hook for SVG components only.
6. Sidebar (menu button, New vessel, vessel list), `sidebarVessels` in `view.ts` (with tests), Settings sheet (Appearance Light/Night/Auto, archived vessels, Back up vessels with select, Plan reminders, AI status, About).
7. Startup recovery: a vessel that cannot open no longer blocks the app (test).
8. Keep import photos moves to Checkpoint 1, step 3b: it shares the import flow and its storage (see the sidebar spec), so it is built where the photos are read.
9. Gate as in step 4, plus phone check in Night, at large text size, with a TEST vessel.

**Checkpoint 3: 7d Smarter Ask** (pure TS in the existing engine and view layers; no library, no cost; AI off still works). The brief (stage 1) needs nothing from 7b/7c and can move first if Colby wants it sooner; it adds the H&H list once 7b lands.
10. Full vessel brief `src/app/brief.ts` replaces the six-fact list in `handoffPrompt`: every deck, hourly log, breaks, ship vs field by brand, labor, notes, discrepancies, H&H awareness; formulas and denominators beside each number; tags carried; no VINs, ids or photos; vessel name only if asked. Test: brief totals equal the screens' totals on every scenario.
11. "Why" traces for remaining, in transit, H.A., Pace, ETA, gap, clear-by (inputs, formula, exclusions), shown by extending the existing "About this" taps and included in the brief. No new button. Test: recomputing from the trace reproduces the value.
12. What-if calculators `src/app/whatif.ts`: drivers change, stop time, break shift, "can deck X clear by the break", "finish time at pace P". Labeled FORECAST with assumptions listed; impossible inputs rejected with the exact reason.
13. Wider question router in `assistant.ts`: what-if intents with times, numbers, decks and brands pulled out by rules first (the on-device model may only help route, output validated); anything unmatched says what is missing and prepares the full brief for the user's AI app. Test set: the QUICK questions plus about 40 hand-written ones (no Ask history is stored, so none to mine; Colby can add real ones); measure "answered correctly or declined" with zero invented values.
14. Watch rules added to the existing `alerts()` (feeds Plan alerts and reminders): pace below the rate needed to make a break, a growing gap, deck fit warning. No new file, no new screen, no alarms.
15. Gate as in step 4, then Phase 7 is done.
**Phase 7 done when:** the example game plan loads with 1,578 autos by deck/brand/yard and H&H shown separately; any vessel opens or starts from the menu on every tab; Night readable at 7:1; Ask answers what-ifs from the engine and hands anything else to Colby's AI app with a complete brief.

## Backlog (not scheduled; each needs its own spec and approval)
- **Public App Store release:** privacy policy URL (the app sends nothing off the phone unless Colby taps Ask my AI), screenshots, age rating, review notes. Never submitted without Colby's explicit go.
- **Per-hatch quantities** from stow-plan callouts like `112MB,28BMW` (needs position-aware text reading and flat full-page photos).
- **Sync / sharing when online:** the original Phase 5 item was never built; export and import by text are the substitute today. Web view-only output for supervisors sits with it.
- **Answer checker:** paste an AI reply back and flag numbers that are not in the facts. Deferred until the brief proves useful (an AI's own sums would cause false flags).
- **Keep screen on, haptic tick on save:** each needs a new library.
- **Cloud AI reasoning:** needs a server and recurring cost. Colby declined paid online reasoning on 2026-10-01; reopen only if he asks.
