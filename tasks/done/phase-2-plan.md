# Implementation Plan: Phase 2 — Offline storage

Spec: `docs/specs/phase-2-offline-storage.md` (approved 2026-09-25). Tasks: `tasks/done/phase-2-todo.md`.
Phase 1 plan: `tasks/done/`.

## Overview

Create the Expo app shell, then a storage layer that saves each vessel's baseline and append-only event log in SQLite, validating every append with the Phase 1 engine. A temporary check screen proves it on Colby's iPhone.

## Dependency graph

```
Expo app shell + engine bundles in Metro (T1)
        │
   db adapter + schema + triggers (T2)
        │
   store: create / list / load / append (T3)
        │
   check screen on the iPhone (T4)
```

## Architecture decisions

- **One adapter, two drivers.** `src/storage/db.ts` exposes `exec`, `run`, `all` and `transaction`. `expo-sqlite` backs it on the phone and `node:sqlite` in tests. The store code and SQL are shared, so tests exercise the real schema.
- **Validate, then write.** `append()` runs `project(baseline, stored + new)`. Only on success does it insert the new events, in one exclusive transaction.
- **Database enforces append-only.** Triggers reject `UPDATE`/`DELETE` on `events` and changes to a vessel's TEST/LIVE mark or baseline, so no future code can edit history by accident.
- **No stored projections.** State is rebuilt from the log on load. At a few hundred events per vessel this is instant; caching can come later if it's ever slow.

## Task list

- T1 Expo app shell · T2 schema and adapter · T3 store API
- Checkpoint A (all tests on this PC)
- T4 check screen
- Checkpoint B (Colby's iPhone check, Phase 2 approval)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Metro or Expo's TypeScript config rejects the engine's `.ts` import paths | High: engine unusable in the app | T1 checks this first with `npx expo export --platform ios`. Fallback: set `allowImportingTsExtensions` in the Expo tsconfig, or drop the extensions (Node's strip-types then needs `--experimental-default-type`). Stop and report if neither works. |
| Expo template overwrites project files (`package.json`, `tsconfig.json`, `.gitignore`) | Medium | Scaffold in a temp folder, then merge by hand; diff before committing. |
| `node:sqlite` and `expo-sqlite` differ (transactions, types) | Medium | Keep the adapter tiny; storage tests cover transactions and rollback. The iPhone check exercises the expo side. |
| Expo Go on the phone doesn't match SDK 57 | Low | Install the current Expo Go from the App Store; `npx expo start` reports a mismatch. |

## Open questions

None. Spec defaults stand (Expo Go, same Wi-Fi or `--tunnel`).
