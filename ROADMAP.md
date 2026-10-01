# VSA App Roadmap

Each phase ends with a working, tested result and Colby's approval before the next starts.
Update the status line when a phase changes.

**Current status:** Phase 6a, 6b and 6c approved (6c phone-checked 2026-10-01, build 83cc0968). 6d (assistant) next, spec first.

## Phase 0: Setup
- Create the Expo project (TypeScript) in this folder; initialize git; push to a private GitHub repo.
- Copy Migration Kit files into `docs/`, tracker source into `docs/reference/`.
- Run `/spec` for the whole app → `docs/specs/app-spec.md`. Colby approves.
**Done when:** the blank app runs on Colby's iPhone in Expo Go.

## Phase 1: Rules engine (no UI)
- Plain TypeScript: vessel remaining, field balance, in transit, H.A., pace, stoppage hours, ETA across breaks and two days, reconciliation, brand ledgers, deck heights (1.85 m rule), validation and rejection messages.
- Automated tests from kit file 11, the 1,969 replay, and the Glovis Condor 101 baseline.
**Done when:** all tests pass and match the VSA Live tracker's results.

## Phase 2: Offline storage
- `expo-sqlite`: vessel baseline, append-only event log (entries, corrections with history), derived state rebuilt from events.
**Done when:** data survives app restarts and airplane mode, and the replay test passes from the stored log.

## Phase 3: Screens
- Snapshot, Decks, Hourly (list + graph), Plan & routes, Log sheet, matching the VSA Live tracker: behavior from `docs/reference/vsa-live.html`, layout from `docs/reference/screens/`.
**Done when:** a full demo shift can be logged on the phone with no signal.

## Phase 4: Real device build
- Apple Developer account active; EAS development build installed on the iPhone.
- Field feedback from Colby's airplane-mode test (2026-09-27), fix and verify on the dev build:
  - Some text wraps its last letter onto the next line. Fixed 2026-09-28 (Plan "Brea/ks"; Snapshot tile labels and FORECAST/CALCULATED tags now stay on one line and shrink). Verify on the dev build at large text size.
  - Drivers are set once per workday (Day 1 = 70, Day 2 = 50), not asked every hour. Built 2026-09-28: Plan › Labor › Set the day's drivers; an hour's own count still overrides. Verify on the phone.
  - Break log: edit start/end times, add a missed break, remove a wrong/duplicate one (corrections keep history). Built 2026-09-28: Plan › Break log (tap a break, or Add a missed break). Verify on the phone.
**Done when:** the app runs from its own icon, outside Expo Go.

## Phase 5: New-vessel setup and sync
- Load a new vessel's baseline (entered or imported). Optional sync/sharing when online.
  - Setup screen asks the VSA's startup questions (protocol §11.1); later, fill it from a photo of the labor order / game plan, read on-device, every value confirmed before saving.
  - Downloadable PDF report (via the share sheet) at any time: break/shift-end (protocol §11.2) and vessel completion (§9.3). Interim reports are time-stamped and labeled; unknowns stay unknown.
**Phase 5 plan (approved 2026-09-29):**
1. Setup + import core (pure TS, tests): `src/app/setup.ts`.
2. Vessel list, switching, archive, last-opened (`src/storage/vessels.ts`, settings table; no schema change).
3. Report content (pure TS, tests): `src/app/report.ts`, break/shift-end + completion, notes for analysis sections.
4. Screens: Vessels sheet, 5-step Setup, import, report buttons; `App.tsx` no longer hard-codes the vessel.
5. Add `expo-print` + `expo-sharing`; new EAS dev build; phone check.
**Done when:** a second vessel can be started without developer help.

## Phase 6: Assistant, map and photo evidence
Capability map and decisions: `docs/specs/phase-6-capability-map.md` (approved 2026-09-30). Every module works with AI off; AI only proposes, Colby confirms, the engine does the math.
- **6a:** Map screen (`phase-6-terminal-map.md`), Plan Notes (`phase-6-plan-notes.md`), offline knowledge search from the Brain (`phase-6-knowledge.md`). Built and approved 2026-09-30.
- **6b:** Photo evidence from Log (damage, poor stowage, accident, pre-stow; VIN required only for accidents) and its three conditional reports. Built and approved 2026-09-30.
- **6c:** On-device AI runtime, VIN camera scan, photo-prefilled new vessel and notes (`phase-6-ai-runtime.md`, `phase-6-scan.md`, `phase-6-setup-import.md`). Built and approved 2026-10-01.
- **6d:** Floating assistant head: questions answered from the engine and the knowledge pack, then confirmed actions and 25-minute Plan reminders.
**Done when:** each stage passes its phone check; the app still works fully with AI off.

## Phase 7: TestFlight / App Store
- TestFlight for Colby and coworkers; App Store later if desired.
