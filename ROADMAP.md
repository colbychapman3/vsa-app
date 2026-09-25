# VSA App Roadmap

Each phase ends with a working, tested result and Colby's approval before the next starts.
Update the status line when a phase changes.

**Current status:** Phase 1 complete (approved 2026-09-25). Phase 2 in spec. Phase 0 leftovers: the Expo app is created in Phase 2 (needed for expo-sqlite); the whole-app spec is still deferred.

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
- Snapshot, Decks, Hourly (list + graph), Plan & routes, Log sheet, matching the tracker and the design canvas.
**Done when:** a full demo shift can be logged on the phone with no signal.

## Phase 4: Real device build
- Apple Developer account active; EAS development build installed on the iPhone.
**Done when:** the app runs from its own icon, outside Expo Go.

## Phase 5: New-vessel setup and sync
- Load a new vessel's baseline (entered or imported). Optional sync/sharing when online.
**Done when:** a second vessel can be started without developer help.

## Phase 6: On-device AI (optional)
- Apple on-device model interprets typed or spoken entries into structured events; rules engine does all math; confirmation before saving.
**Done when:** entries work by voice/text offline, and the app still works fully with AI off.

## Phase 7: TestFlight / App Store
- TestFlight for Colby and coworkers; App Store later if desired.
