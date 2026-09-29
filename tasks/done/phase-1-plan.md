# Implementation Plan: Phase 1 — Rules engine

Spec: `docs/specs/phase-1-rules-engine.md` (approved 2026-09-25). Tasks: `tasks/done/phase-1-todo.md`.

## Overview

Build the auto-discharge rules engine as plain TypeScript in `src/engine/`, one module at a time, each with its tests. The riskiest piece goes first: running the tracker's own code inside the tests, so every later task can check its numbers against the tracker.

## Dependency graph

```
setup + tracker harness (T1)
   │
   ├── time (T2) ─────────────┬──────────────┐
   ├── baseline + decks (T3)  │              │
   └── fit (T4)               │              │
            │           events (T5)   production (T6)
            │                 │              │
            └──────── ledger (T7) ───────────┘
                              │
                          eta (T8)
                              │
                 project() + full parity (T9)
```

## Architecture decisions

- **Validation lives with the rule it protects.** `decks` rejects a hatch count above its quantity; `ledger` rejects a field total above starting cargo; `events` only checks log integrity (operation, duplicates, correction targets, overlaps). `project()` runs them in order and stops at the first rejection, so an event is either applied whole or not at all.
- **Operation time is `{ day, "HH:MM" }`**, matching the tracker. ISO timestamps from kit-06 events are converted once in `time`. The engine never reads the device clock.
- **Tracker parity runs the tracker's own code.** `tests/tracker.ts` loads the `<script>` from `docs/reference/vsa-live.html` into a Node `vm` sandbox with a stub `document`/`window`, and reads `window.__VSA_TEST__`. Nothing is copied from the tracker into the engine by hand.
- **`null` means unknown everywhere.** Results that can be unknown carry a `reason`.

## Task list

See `tasks/done/phase-1-todo.md` for acceptance criteria and verification per task.

- Foundation: T1 setup and tracker harness · T2 time · T3 baseline and decks · T4 fit
- Checkpoint A
- Core: T5 events and replay · T6 production
- Checkpoint B
- Ledger and forecast: T7 ledger and reconciliation · T8 ETA · T9 `project()` and full parity
- Checkpoint C (Colby approves Phase 1)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tracker script won't run in a Node sandbox (DOM calls at load) | High: no automatic parity | T1 tests this first. Fallback (approved in spec): capture expected numbers from the tracker in a browser once and save them as fixtures. |
| Node 22 `--experimental-strip-types` limits (no enums, `.ts` import extensions) | Low | Use plain types and unions only; imports use `.ts` extensions with `allowImportingTsExtensions`. |
| Tracker and docs disagree on a rule not yet found | Medium | Stop and ask Colby. Don't pick one silently (spec boundary). |
| Glovis data leaking outside tests | Medium | Fixture is read only from `tests/`; engine never imports `docs/`. |

## Open questions

None. Spec defaults stand: tracker's clear-by and ETA-rate rules.
