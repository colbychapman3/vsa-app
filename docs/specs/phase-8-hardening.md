# Spec: Phase 8, Harden the shell around the core

Status: **APPROVED by Colby 2026-10-05** with the recommended default for every open question. 8a, 8b, 8f and most of 8c are built (see "Built" at the end). Source: ChatGPT's "Final Repository Review" and ChatLLM's "Final Review Conclusion" (both 2026-10-05), checked against `main` @ `d403e78`. Anything marked *verified* was run or read in the repo on 2026-10-05.

## Objective
Keep the engine and the append-only ledger exactly as they are. Make a bad release harder to ship, make the architecture rules fail a test when broken, keep saves fast on long vessels, and make a lost phone cost less. Success:
- CI fails on a broken engine/AI/storage boundary, a push-entitlement regression, a missing native module, or quadratic replay.
- `project()` output is byte-identical before and after the speed fix.
- The app offers a one-tap copy of the vessel log at every break/shift-end report, completion report and archive.

## Basis (verified)
- 381/381 tests pass; `tsc --noEmit` is clean.
- `src/engine/` has zero non-relative imports. Only `src/app/ai.ts` loads `@react-native-ai/apple` (by `require` and `typeof import`, so a guard must search for the package name, not only `import` lines). Only `src/storage/db.ts` and `tests/nodeDb.ts` touch `expo-sqlite`. The only `store.append` callers are `App.tsx:161` and `App.tsx:275`.
- Replay is quadratic. `historyOf()` rebuilds an id map per call (called at `src/engine/index.ts:142, 290, 316, 344, 447`); `appendEvent()` runs 2-3 linear `find()`s and copies the events array and `supersededBy` map per event; `store.append()` re-projects the whole log inside an exclusive transaction. Desktop Node, notes-heavy log with edits: 300 events 13 ms, 1,000 events 83 ms, 3,000 events 1,098 ms for `project()`. Property reads per event during `replay()`: 495, 773, 2,199, 6,407 at 100/300/1,000/3,000 events (linear code would stay flat). Not measured on an iPhone.
- The fix branch ChatLLM describes (`local/replay-prototype`) is **not in this repo**; only `main` exists.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `typecheck`, `test`. `npm run check:ios` takes 20 s on Linux and produces a Hermes bundle; it does **not** compile Swift, so it would not have caught build #7 (that was a gitignored Swift file, now guarded by `tests/native.test.ts`).
- `expo prebuild --platform ios --no-install` runs on Linux. Its `VSA.entitlements` came out an empty `<dict/>` (no `aps-environment`), so `plugins/withoutPush.js` loads and works under `"type": "module"`; builds #3-#8 also succeeded. `expo-modules-autolinking resolve --platform apple` lists the `VsaText` pod on Linux.
- The UI already shows "N entries not backed up" (Snapshot, `App.tsx:308`) and "Last exported" (`Plan.tsx:179-181`). `exportLog` carries a SHA-256 over operation id, test flag, baseline and events plus `event_count`; `importLog` re-runs the engine.
- Recovery tests already exist: crash partway through an append, transaction rollback, rejected batch writes nothing, re-delivery stores once, newer-schema database refused, stepwise migration, backup round trip per scenario, bad JSON / checksum / event-count / different-history imports.
- `tests/rules.test.ts` exempted 2 of 23 rules as `deferred` to Phase 3 and Phase 5/6, both long done.
- 266 source lines are over 150 characters.
- `typescript-eslint` 8.71 supports TypeScript `>=4.8.4 <6.1.0`; the repo has `~6.0.3`.

## Checkpoint 8a: Release checks and guardrail tests (no UI, no build)
1. **Guardrail tests**, one `tests/architecture.test.ts` written like `rules.test.ts` and `native.test.ts` (source scan, named rules):
   - `ENGINE-BOUNDARY`: files under `src/engine/` import only relative engine files (strict today).
   - `AI-BOUNDARY`: the string `@react-native-ai` appears in `src/` only in `ai.ts`.
   - `AI-WRITE-BOUNDARY`: `ai.ts`, `assistant.ts` and `engine/proposal.ts` have no runtime import from `src/storage/` (type-only allowed) and no `.append(`.
   - `STORAGE-BOUNDARY`: `INSERT INTO events` appears only in `store.ts`; `.append(` on a store appears only in `App.tsx` and `src/storage/`.
   - `DOMAIN-BOUNDARY` (screens do no protocol math): scan first. If violations exist today, list them as an allowlist that may only shrink; if the rule can't be stated mechanically, leave it out.
2. **CI**: add `npm run check:ios` to the existing job, and a second `release` job running `npm run verify:release` (`scripts/verify-release.mjs`): prebuild into a temp directory, assert no `aps-environment` in the entitlements and that the camera and photo usage strings are present; assert autolinking lists `VsaText`; run `node scripts/build-knowledge.mjs` and `node scripts/export-map.mjs` then `git diff --exit-code` on the generated files (both are plain Node; confirm they are deterministic first). It does not compile Swift: the "`VsaText` in the EAS build log" step stays in every phone check.
3. **ESLint only** (flat config, `typescript-eslint` pinned to a TypeScript-compatible range): `no-floating-promises`, `no-misused-promises`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` (warn), unused variables, `no-restricted-imports` for `src/engine`. `npm run lint` in CI. First run: triage, fix real findings, never mass-disable. No Prettier (see Boundaries).
4. **Rules**: replace the two stale `deferred` entries in `tests/rules.test.ts` with real tests (travel times: `tests/assistant.test.ts:107` already pins it; document text is evidence: point at the proposal/prompt-injection tests or add one). Add a stable id to each rule entry.
5. **Docs**: add a short "Architecture guardrails" section to `CLAUDE.md` (id, one line, enforcing test). Not a new `docs/ARCHITECTURE.md`: CLAUDE.md says never copy rules elsewhere.

Gate: `npm test`, `typecheck`, `lint`, `check:ios`, `verify:release` green on a clean checkout; each guardrail test shown failing on a deliberate violation before it is committed.

## Checkpoint 8b: Linear replay (engine only, no UI, no build)
1. **Equivalence first**: before changing code, add `tests/replayEquivalence.test.ts` holding canonical-JSON hashes of `project()` from current `main` for every scenario in `tests/scenarios.ts`, the kit 1,969 log, the Glovis TEST demo, a synthetic 400-event mixed log at every 7th prefix, and the duplicate, overlap and correction-rejection paths. Green on current code and committed before the change.
2. **Fix** (`src/engine/events.ts` only): `replay()` keeps internal indexes (by event id, by idempotency key, `supersededBy`, interval events bucketed by metric and scope) and extends the log it owns; `appendEvent()` keeps its public, immutable signature. `historyOf()` caches its id map per events array (`WeakMap`), filled only for a finished log. No snapshots; `store.append()` still re-projects the whole log.
3. **Scaling guard, no clock**: wrap events in a property-read counter (prototype: `scratchpad/bench.ts` approach) and assert reads(4N) ÷ reads(N) is at most 6 for both `replay()` and `project()` on a mixed log (linear = 4, quadratic = 16).
4. `scripts/bench-replay.mjs` prints timings at 100/300/1,000/3,000 events. Not run in CI.
5. Optional, ships with the next build: Settings › About shows "Opened N entries in X ms" for the open vessel, so real iPhone numbers come from the TestFlight build.

Gate: equivalence hashes unchanged, guard test fails on the old code and passes on the new, 381+ tests green, speed-up of at least 10x at 3,000 events on desktop.

## Checkpoint 8c: Save-a-copy prompts (small UI; ships in the 7e/step 6 build)
1. When `unsaved > 0`, after the break/shift-end report, after the completion report, and when archiving a vessel, offer "Save a copy of this vessel log now?" that runs the existing `exportVessel` (share sheet). Dismiss changes nothing and marks nothing backed up (today's rule). Never blocks, never a second modal on top of another (vsa-field-ui).
2. Snapshot note includes the time of the last copy when entries are unsaved.
3. Test: a stored row with unparseable JSON next to a valid vessel. The valid vessel opens, the damaged one is flagged with a plain message, nothing is deleted. Check current behavior first; fix only if startup breaks.
4. **Spike, no shipped code**: can the app write an automatic copy off the app sandbox without a server or recurring cost? Candidates: an iCloud Drive folder through the `expo-file-system` directory picker (confirm the API and that access persists across launches); an iCloud entitlement (native work, a build, an Apple capability). Report findings and cost; build nothing until Colby decides.
5. Ask Colby to check iOS Settings › iCloud › Backup on the phone. If device backup is on, say so in the About-backups note, worded as "may also", never as a guarantee.

Gate: tests, then one phone check inside the 7e build.

## Checkpoint 8d: Make the app shell testable (after 7e, with 7d)
1. Move `save()`, `exportVessel` and `openVessel` orchestration out of `App.tsx` into `src/app/session.ts` (plain TS; store, db and clock passed in). Node tests: double-tap guard, vessel switched while saving, rejected batch leaves state unchanged, dismissed share not marked backed up, TEST/LIVE never cross.
2. Extract `useBackup`, `useAppearance`, `useReminders` only when a feature (7e, 7d) needs to touch that state. No provider tree now. Revisit if `App.tsx` passes about 500 lines or a feature needs a third level of prop passing.
3. Do not split `project()`.

## Checkpoint 8e: Explainable numbers (this is 7d step 2; do it first inside 7d)
1. Engine type `Derived { value, kind: 'calculated' | 'forecast', inputs, formula, excluded, assumptions }` for remaining, in transit, H.A., Pace, ETA, gap, clear-by. Recorded values stay plain.
2. Event ids only where one event is the source (a correction, a clerk count). No id lists on aggregates.
3. Tests as in ROADMAP 7d step 2 (recomputing from the trace reproduces the value) plus: ETA is always `forecast`.
4. Order inside 7d: brief, then traces, then what-ifs and the question router.

## Checkpoint 8f: Reference-data drift tests (any time)
1. Read the formats of `docs/14_Operating_Protocol_v1.1_TEXT.md`, `docs/knowledge-src/`, and `src/app/map/data.ts` first.
2. Tests assert that Appendix D distances and the Southside list in each of those equal `src/engine/terminal.ts`. The PDF can't be parsed in a test; a mismatch against the text copy means a human checks the PDF (the PDF wins).
3. `terminal.ts` stays the single code source. A machine-readable `rules.json` that generates docs is deferred until a second drift incident.

## Boundaries (rejected on purpose)
- No engine rewrite, no mutable-state CRUD, no snapshot or cache layer, no cloud sync.
- No Prettier: it would rewrite most of the code and its history and fights "match the surrounding code".
- No hash chain: the export checksum, `event_count` and import-time engine check already catch cut-off and edited files, and a chain would change event identity and need a stored-data migration.
- No multiple local backup generations: copies inside the app's own storage go with the app or the phone.
- No provider/controller tree for `App.tsx` ahead of need.
- No fixed wall-clock thresholds in CI.

## Open questions (recommended default first)
1. **Approve Phase 8 as written?** (the once-per-phase gate)
2. **CI release job**: about 3 minutes per run on GitHub-hosted Linux; default yes, if it fits the repo's free Actions minutes.
3. **Patch**: if Colby still has `0001-engine-index-replay-lookups-so-project-is-linear-in-.patch` from the ChatLLM chat, attach it and I review and apply it behind the equivalence tests; default: I re-implement from the description.
4. **Off-device automatic copy**: spiked; **decided 2026-10-05: not now** (Colby agreed with the recommendation). In the ROADMAP backlog.
5. **Where the guardrail rules live**: a CLAUDE.md section (default) or a new `docs/ARCHITECTURE.md` with CLAUDE.md pointing to it.

## Order
8a and 8b first (no build, no phone, can run while build #8 is phone-checked). 8c rides the 7e + step 6 build so no extra EAS build is used. 8d after 7e. 8e is the first half of 7d. 8f whenever.

## Built (2026-10-05)
**8b done.** `tests/replayEquivalence.test.ts` (77 hashes taken from the original replay, committed first), then the linear replay in `src/engine/events.ts` (+62/−16): every hash unchanged. `tests/replayScaling.test.ts` failed on the old code (13.3x and 13.6x the reads for 4x the events) and passes now. `project()` at 3,000 events went from 1,098 ms to 15 ms on desktop; at 10,000 events it takes 58 ms (`npm run bench:replay`). Not yet measured on an iPhone (the optional About line rides the 7e build). ChatLLM's patch was not available, so this is a fresh implementation checked against the original behavior.

**8a done** except where noted:
- `tests/architecture.test.ts`: ENGINE-, AI-, AI-WRITE-, STORAGE- and DOMAIN-BOUNDARY, each with made-up violations it must catch. DOMAIN-BOUNDARY's allowlist was derived from today's screens and may only shrink.
- `scripts/verify-native.mjs` (`npm run verify:native`) and `verify:release`. Proven to fail when the push plugin is removed (the `aps-environment` entitlement appears), when the Swift source is missing, and when a generated file is stale. Writing it hit the same trap as the build #7 `.gitignore` bug (its first copy filter dropped `modules/vsa-text/ios`), so it now excludes only root-level folders.
- CI: `lint` and `check:ios` added to the existing job; new `native` job runs `verify:native` (about 25 s locally).
- ESLint 10 with `typescript-eslint` and `react-hooks`, correctness rules only. First run found 13 problems, all fixed. One was a real bug: `File.copy()` returns a promise in this Expo SDK and `keepPhoto()` ignored it, so a failed photo copy would have gone unnoticed and the event would point at a file that was never saved. `keepPhoto` now awaits it. **This path needs a phone check in the next build** (take a photo from Log › Photo and confirm it saves and shows; a photo that can't be copied should now say so and save nothing).
- `tests/rules.test.ts`: the two stale deferrals now have real tests (a new test that instruction-shaped text cannot become an action or add a number), the `deferred` escape hatch is removed, and every rule has an id.
- CLAUDE.md has the "Architecture guardrails" section and the new commands. `tests/kit.test.ts` still lists kit B12 and B23 as deferred to old phases; left as is, they are now covered by the rules above.

Not started: 8c, 8d, 8e, 8f.

**8f done** (`tests/terminalDrift.test.ts`): the protocol text copy and the knowledge copy (Appendix C sides and cutoffs, Appendix D miles), and the protocol's Southside prose list, are compared with `terminal.ts`; each was tampered with to prove its test fails. All currently agree except one **known gap, reported to Colby, not fixed**: the Southside list in `docs/knowledge-src/02-Stevedoring-Operations-Reference.md` names four lots (Zone 1, MBZ, Zone T, Zone V) and omits Zone X, Zone B, Site 5, Site 6 and Gate 2, which Appendix C makes Southside (30 min, not 15). That file feeds the in-app search. **Resolved 2026-10-05:** Colby confirmed Appendix C's nine Southside lots are right; the reference was corrected, the knowledge index regenerated, and the test now requires an exact match. Colby still mirrors the corrected line into the Project's copy.

**8c built, except the spike's decision and one wording line:**
- Damaged rows: a stored row with unreadable JSON made `store.load` throw, which would have broken the vessel list (`listRows`). `load` and `append` now return a plain refusal ("could not be read ... Nothing was changed or deleted"); the damaged vessel is flagged in the list, nothing is removed, the valid vessel next to it works (`tests/store.test.ts`).
- Save-a-copy prompts: after the break/shift-end and completion reports, a notice with a one-tap "Save a copy" button when entries are not in a saved copy; when archiving a vessel, an alert offering the same; the Snapshot note now says how old the last copy is and has a "Save a copy now" button. TEST vessels are never nagged. Dismiss skips; a cancelled share sheet marks nothing backed up (unchanged). Wording and the when-to-offer rule are pure functions with a test (`offerCopy`, `unsavedNote` in `view.ts`). **Phone-check in the 7e build:** a break report, the completion report and an archive each offer a copy; the button opens the share sheet; large text sizes.
- Not done: the line about iCloud device backup in the About-backups note, until Colby has checked iOS Settings › iCloud › Backup on the phone (it would be worded "may also", not a guarantee).

**Spike: an automatic copy off the phone (findings, nothing built).**
- `Directory.pickDirectoryAsync()` (a Files folder picker, installed `expo-file-system`) grants access only for the running session: it calls `startAccessingSecurityScopedResource` and stores no bookmark, and nothing in the library saves one. So the app could write into an iCloud Drive folder only after Colby re-picks the folder at every app launch.
- A persistent automatic copy needs native code: a small Swift module that saves a security-scoped bookmark for the chosen folder (or uses an iCloud container, which also needs the iCloud capability and a new provisioning profile). Either is a new native module plus a store build (EAS quota), with a real risk of the same kind as build #7.
- The SQLite file sits in the app's Documents area, which iOS normally includes in an iCloud or computer backup if the owner has that on. I did not find anything in `expo-sqlite` that excludes it, but I have not verified this on a phone.
- Recommendation: do not build the native module now. The checkpoint prompts plus Colby's own iCloud Backup cover the common losses (phone lost, reset, app deleted) with no new native code. Revisit if a vessel is ever lost.

Not started: 8d (after 7e), 8e (first half of 7d).
