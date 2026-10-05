# VSA App Roadmap

Each phase ends with a working, tested result and Colby's approval before the next starts.
Keep **Now** current; add a row to the timeline when a phase or build changes. Build numbers are App Store Connect build numbers (EAS `autoIncrement`), as shown in TestFlight.

## Now (2026-10-05)
- **Do not phone-check build #7** (EAS `dd5051bd`, 2026-10-05). It was built without the text reader: `.gitignore` hid `modules/vsa-text/ios/`, and its build log has no `VsaText`. Fixed in PR #1.
- **Build #8** (EAS `0a53a6a0`, from `b484819`, 2026-10-05): text reader and Zone 7-9 distance correction. Its build log has `VsaText` (#7 had none); submitted to TestFlight.
- **Next:** phone-check #8: 7b (this game plan, VIN scan, van sheet, notes) and 7c (Night, large text, a TEST vessel).
- **Waiting on Colby:** approve the 07:00 safety meeting spec (`docs/specs/phase-7-safety-meeting.md`, draft).
- **Phase 8 hardening approved 2026-10-05** (`docs/specs/phase-8-hardening.md`): 8a (guardrail tests, CI native job, ESLint), 8b (linear replay), 8f (terminal drift tests) and 8c (save-a-copy prompts, damaged-row handling) are built and tested; 8d and 8e (= 7d step 2) come after 7e. **Phone-check in the next build:** Log › Photo save (a photo-copy bug was fixed) and the save-a-copy prompts after a break report, the completion report and an archive.
- **Waiting on Colby:** mirror the corrected Southside line (nine lots) from `docs/knowledge-src/02-Stevedoring-Operations-Reference.md` into the Project's copy. iCloud Backup is on (confirmed 2026-10-05). Automatic off-phone backup: decided not now (Colby, 2026-10-05); see Backlog.
- **After that:** keep import photos (7b step 6) and the safety meeting rule in one build, then 7d Smarter Ask.

## Timeline
| Phase | Spec approved | Built | Phone-checked | Build |
|---|---|---|---|---|
| 0 Setup, 1 Rules engine | 09-25 | 09-25 | (no UI) | none |
| 2 Offline storage | 09-25 | 09-26 | 09-26 (Expo Go) | none |
| 3 Screens | 09-26 | 09-26 | with 4 | none |
| 4 Real device build | (no spec) | 09-28 | 09-29 | EAS dev build |
| 5 New-vessel setup, reports | 09-29 | 09-29 | 09-30 | EAS dev build |
| 6a Map, notes, search; 6b evidence | 09-30 | 09-30 | 09-30 | EAS dev build |
| 6c On-device AI, VIN scan | 10-01 | 10-01 | 10-01 | EAS dev build |
| 6d Ask; van list, polish | 10-01 | 10-01 | 10-01 | EAS `6f1bde1a` |
| 7a TestFlight | 10-01 | 10-02 | live on TestFlight | #3, #4 |
| 7c Sidebar, Settings, Night | 10-03 | 10-03 | pending | #5 |
| 7b Game plan reader | 10-04 | 10-04 | pending | #7 (no reader), #8 |
| Zone 7-9 distance correction | 10-05 (Colby) | 10-05 | with #8 | #8 |
| 7e 07:00 safety meeting | draft | | | |
| 7d Smarter Ask | 10-03 (plan) | | | |
| 8 Hardening (8a, 8b) | 10-05 | 10-05 | with next build | none |

## Phase 7: TestFlight, paperwork import, sidebar, smarter Ask
**7a TestFlight: live.** Store builds ship headless: `eas build --platform ios --profile production --non-interactive`, then `eas submit --platform ios --profile production --latest --non-interactive`. Phone checks happen on the TestFlight build; nothing in this phase needs the dev client. Each checkpoint is one store build, and EAS counts builds against the paid plan's monthly quota.

Specs: `phase-6e-game-plan-reader.md` (7b, approved 2026-10-04; replaces `superseded/phase-7-game-plan-import.md`), `phase-7-sidebar.md` (7c), `phase-7-safety-meeting.md` (7e, draft). 7d has no spec file; its plan is below. Example paperwork: `docs/reference/game-plan-example-hector-highway-10a/`.

**Checkpoint 1: 7b Game plan reader: built** (spec `phase-6e-game-plan-reader.md`; plan approved 2026-10-03, spec 2026-10-04). Steps 1-5 done 2026-10-04: word-position fixtures and row rebuilding (`src/app/layout.ts`), deck-level brand split (`Deck.cargo`), cover-page reader (`src/app/gamePlan.ts`), Setup step 0 / Load list / H&H ledger (old 6c import removed), `modules/vsa-text` replacing `expo-text-extractor`. 378 tests; 5 review rounds, all required findings fixed; loop stopped by Colby to ship.
- Step 6, keep import photos (Settings switch and storage): not built yet; next build after #8. The photo permission text in `app.json` ("The photos are not stored") must change with it.
- Step 7, gate: tests, typecheck, check:ios, TestFlight build, `VsaText` in the build log, phone check (this game plan, VIN scan, van sheet, notes).

**Checkpoint 2: 7c Sidebar, Settings, Night: built** (spec `phase-7-sidebar.md`): menu button and sidebar, Settings sheet (Appearance Light/Night/Auto, archived vessels, Back up vessels with select, Plan reminders, AI status, About), startup recovery. In build #5; phone check pending.

**7e 07:00 safety meeting** (Colby, 2026-10-05: make it a rule). Spec first (`phase-7-safety-meeting.md`, draft with open questions); after approval it ships with step 6 in one build, and the same rule goes into the Project Instructions.

**Checkpoint 3: 7d Smarter Ask** (pure TS in the existing engine and view layers; no library, no cost; AI off still works). The brief (stage 1) needs nothing from 7b/7c and can move first if Colby wants it sooner; it adds the H&H list once 7b lands.
1. Full vessel brief `src/app/brief.ts` replaces the six-fact list in `handoffPrompt`: every deck, hourly log, breaks, ship vs field by brand, labor, notes, discrepancies, H&H awareness; formulas and denominators beside each number; tags carried; no VINs, ids or photos; vessel name only if asked. Test: brief totals equal the screens' totals on every scenario.
2. "Why" traces for remaining, in transit, H.A., Pace, ETA, gap, clear-by (inputs, formula, exclusions), shown by extending the existing "About this" taps and included in the brief. No new button. Test: recomputing from the trace reproduces the value.
3. What-if calculators `src/app/whatif.ts`: drivers change, stop time, break shift, "can deck X clear by the break", "finish time at pace P". Labeled FORECAST with assumptions listed; impossible inputs rejected with the exact reason.
4. Wider question router in `assistant.ts`: what-if intents with times, numbers, decks and brands pulled out by rules first (the on-device model may only help route, output validated); anything unmatched says what is missing and prepares the full brief for the user's AI app. Test set: the QUICK questions plus about 40 hand-written ones (no Ask history is stored, so none to mine; Colby can add real ones); measure "answered correctly or declined" with zero invented values.
5. Watch rules added to the existing `alerts()` (feeds Plan alerts and reminders): pace below the rate needed to make a break, a growing gap, deck fit warning. No new file, no new screen, no alarms.
6. Gate as in Checkpoint 1, step 7, then Phase 7 is done.

**Phase 7 done when:** the example game plan loads with 1,578 autos by deck/brand/yard and H&H shown separately; any vessel opens or starts from the menu on every tab; Night readable at 7:1; Ask answers what-ifs from the engine and hands anything else to Colby's AI app with a complete brief.

## Done (details in git history and `docs/specs/`)
- **0 Setup:** Expo (TypeScript) project, private GitHub repo, kit files in `docs/`, app spec (`app-spec.md`).
- **1 Rules engine:** plain TS; tests from kit file 11, the 1,969 replay and Glovis Condor 101; matches the VSA Live tracker.
- **2 Offline storage:** `expo-sqlite`, append-only event log, corrections with history, state rebuilt from events.
- **3 Screens:** Snapshot, Decks, Hourly, Plan, Log sheet, from the VSA Live tracker.
- **4 Real device build:** EAS build on Colby's iPhone. Field-feedback fixes from the 2026-09-27 airplane-mode test (last letter wrapping, drivers set once per day, break log edit/add/remove). The large-text-size check is part of every phone check.
- **5 New-vessel setup:** Setup (manual or baseline paste), vessel list/switch/archive, vessel log export/import, break/shift-end and completion PDF reports (`phase-5-new-vessel.md`).
- **6 Assistant, map, photo evidence** (`phase-6-capability-map.md`; every module works with AI off; AI only proposes, Colby confirms, the engine does the math):
  - **6a:** Map, Plan Notes, offline knowledge search from the Brain.
  - **6b:** Photo evidence from Log (damage, poor stowage, accident, pre-stow) and its conditional reports.
  - **6c:** On-device AI runtime, VIN camera scan, photo-prefilled notes. Its photo-prefilled setup was removed in 7b (spec in `docs/specs/superseded/`).
  - **6d:** Floating Ask button, three confirmed actions, 25-minute Plan reminders, Ask my AI (question plus the whole document pack to the user's own AI app by share sheet; no API, no cost).
  - Also approved 2026-10-01: van list in Plan, Snapshot/Hourly/Plan wording changes, polish pass.

## Backlog (not scheduled; each needs its own spec and approval)
- **Public App Store release:** privacy policy URL (the app sends nothing off the phone unless Colby taps Ask my AI), screenshots, age rating, review notes. Never submitted without Colby's explicit go.
- **Per-hatch quantities** from stow-plan callouts like `112MB,28BMW` (needs position-aware text reading and flat full-page photos).
- **Sync / sharing when online:** the original Phase 5 item was never built; vessel log export and import are the substitute today. Web view-only output for supervisors sits with it.
- **Automatic off-phone backup:** deferred by Colby 2026-10-05. Today: save-a-copy prompts at reports and archive, plus iCloud Backup on the phone. Building it needs a small Swift module that keeps a security-scoped bookmark to a Files/iCloud Drive folder (the installed folder picker only grants access for one app session; findings in `docs/specs/phase-8-hardening.md`) and a store build. Reopen if a vessel record is ever lost.
- **Answer checker:** paste an AI reply back and flag numbers that are not in the facts. Deferred until the brief proves useful (an AI's own sums would cause false flags).
- **Keep screen on, haptic tick on save:** each needs a new library.
- **Cloud AI reasoning:** needs a server and recurring cost. Colby declined paid online reasoning on 2026-10-01; reopen only if he asks.
