# Phase 2 tasks — offline storage

Commands: `npm test`, `npm run typecheck`, `npx expo export --platform ios`. Every task ends with them passing and a commit.

- [ ] **T1: Expo app shell** (M)
  - Acceptance: Expo SDK 57 blank TypeScript app in the project root (`App.tsx`, `app.json` named "VSA", `index.ts`); existing scripts, tests, `.gitignore` entries and docs kept; `App.tsx` imports the engine and shows the Glovis TEST start total (1,969) to prove the engine bundles.
  - Verify: `npm test` (82 still pass), `npm run typecheck`, `npx expo export --platform ios` succeeds.
  - Files: `package.json`, `app.json`, `App.tsx`, `index.ts`, `tsconfig.json`, `.gitignore`
  - Depends on: none

- [ ] **T2: Schema and driver adapter** (S)
  - Acceptance: `db.ts` adapter (expo-sqlite and node:sqlite); schema v1 per spec with WAL, `user_version`, append-only triggers, TEST/LIVE lock.
  - Verify: storage test 4 (UPDATE/DELETE on events fails; `is_test` and `baseline_json` can't change); migration runs once on a new file and is a no-op on reopen.
  - Files: `src/storage/db.ts`, `src/storage/schema.ts`, `tests/store.test.ts`
  - Depends on: T1

- [ ] **T3: Store API** (M)
  - Acceptance: `createVessel` (Glovis only as TEST; baseline validated), `listVessels`, `load` (baseline + events + `project()` state), `append` (validate with engine, one transaction, re-delivery skipped, other-operation events refused).
  - Verify: storage tests 1, 2, 3, 5, 6, 7 on a real file, closed and reopened. Includes the kit 1,969 replay and the Phase 1 parity shifts from storage.
  - Files: `src/storage/store.ts`, `tests/store.test.ts`
  - Depends on: T2

### Checkpoint A
- [ ] `npm test`, `npm run typecheck`, `npx expo export --platform ios` pass

- [ ] **T4: Check screen** (S)
  - Acceptance: `App.tsx` opens the store on the phone. Buttons: create TEST Glovis vessel; log the next test hour (fixed TEST counts); show field, vessel remaining, event count, last error; **Replay check** reloads the stored log, compares with the in-memory state and shows PASS/FAIL. Large tap targets; labeled TEST.
  - Verify: `npx expo export --platform ios`; then Colby's iPhone check below.
  - Files: `App.tsx`
  - Depends on: T3

### Checkpoint B — Phase 2 done (on Colby's iPhone, Expo Go)
- [ ] Create TEST vessel, log hours, force-quit, reopen → counts still there
- [ ] Airplane mode on with the app open → new entries save and show
- [ ] Replay check shows PASS
- [ ] Colby approves; ROADMAP updated
