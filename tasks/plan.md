# Implementation Plan: Phase 3 — Screens

Spec: `docs/specs/app-spec.md` (approved 2026-09-26). Plan approved by Colby 2026-09-26, with an independent reviewer agent at Checkpoints A and B. Tasks: `tasks/todo.md`. Earlier plans: `tasks/done/`.

## Overview

Build the four tabs and the Log sheet to match the VSA Live tracker (behavior: `docs/reference/vsa-live.html`; layout: `docs/reference/screens/`). The two tested pure layers go first: the view model (display derivations) and entries (forms → events). Screens only lay them out.

## Dependency graph

```
T1 shell (deps, theme, fonts, tabs, header, Log button, TEST vessel loads)
 ├── T2 view model (view.ts) ─────────────┐
 └── T3 entries (entries.ts) ─────────────┤
                                           ├── T4 Snapshot
                                           ├── T5 Log sheet (hour, break/shift, clerk, discrepancy)
                                           ├── T6 Decks + deck sheet
                                           ├── T7 Hourly (list + graph)
                                           └── T8 Plan + shift settings sheet
```

The Log sheet (T5) comes right after Snapshot so every later screen can be checked on the phone with real entries.

## Architecture decisions

- **Three layers, one direction:** screens → `view.ts` / `entries.ts` → engine + store. Screens import no engine math.
- **One vessel in memory:** `App.tsx` loads the TEST Glovis vessel (creating it as TEST on first run) and keeps the latest `project()` state. Every save goes through `store.append`, which returns the new state, or a rejection that the open sheet shows in red.
- **No navigation library:** tab state in `App.tsx`, sheets as React Native `Modal`s.
- **Event ids:** device-generated, unique per vessel (`<vessel>-<sequence>`); `recorded_at` is the phone's clock (processing time); `occurred_at` is only what Colby entered or confirmed with **Now**.
- **Corrections:** re-entering an hour supersedes each changed event for that hour (total, each brand, drivers, stop time) with the chosen reason. Unchanged values aren't touched. A value added for the first time is a new observation.

## Task list

- T1 shell · T2 view model · T3 entries
- Checkpoint A (Node tests; screen 01–03 numbers)
- T4 Snapshot · T5 Log sheet · T6 Decks · T7 Hourly · T8 Plan
- Checkpoint B (full TEST shift on Colby's iPhone with no signal; Phase 3 approval)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Screen 03's exact inputs aren't recorded | Low | Rebuild them from the Phase 1 lunch scenario (Kia 351 / Hyundai 579 cleared, 930 field), which gives the screen's numbers: 1,039, 47.2%, H.A. 233, pace 248. |
| Fonts fail to load offline | Medium | Bundle via `@expo-google-fonts` (files ship in the app). Fall back to system fonts rather than block the app. |
| Large iOS text sizes break layouts | Medium | Numbers never wrap (a single line that shrinks to fit); labels wrap; check at the largest standard size on the phone. |
| Correction logic across several events per hour | Medium | T3 tests every case (changed total only, brand split added, drivers changed, stop time changed) against the real store. |
| Tracker behavior not visible in the screenshots (history, empty states) | Low | Read the tracker's code for each screen before building it. |

## Open questions

None. Spec defaults stand.
