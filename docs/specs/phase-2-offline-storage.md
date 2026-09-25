# Spec: Phase 2 — Offline storage

Status: **DRAFT — awaiting Colby's approval.** No code until approved.

## Objective

Store each vessel on the phone so nothing is lost: the baseline, and an append-only log of every entry (counts, deck updates, breaks, corrections). The screen state is always rebuilt from that log by the Phase 1 engine (`project()`). The phone is the source of truth and needs no signal.

Success: data survives app restarts and airplane mode, an entry is saved completely or not at all, and replaying the stored log gives exactly the same state as before it was saved.

**In scope:** the Expo app shell (the Phase 0 leftover, needed because `expo-sqlite` runs only inside an Expo app); the storage layer; a bare **check screen** for proving storage on the iPhone (thrown away in Phase 3).
**Out of scope:** real screens (Phase 3), sync or sharing between phones (Phase 5), new-vessel setup from paperwork (Phase 5).

## How it works

```
entry (Phase 3 screen) → store.append(vessel, events)
                            │  project(baseline, stored + new)   ← Phase 1 engine
                            │    rejected? → nothing written, error shown
                            └─ ok → insert all new events in one transaction
open app → store.load(vessel) → project(baseline, stored events) → state
```

- **Validate before write.** Every append runs the engine on the stored log plus the new events. If the engine rejects anything (overage, overlap, wrong operation, bad correction), nothing is written and the exact message comes back.
- **All or nothing.** One entry can be several events (a count plus its brand split and drivers). They're written in one exclusive transaction.
- **Append-only, enforced by the database.** SQLite triggers block every `UPDATE` and `DELETE` on the events table. Corrections are new events (Phase 1 rules), so history is never lost.
- **Re-delivery is a no-op.** Events already stored with identical content are skipped; a reused id with different content is rejected (engine rule).
- **One vessel = one record.** Each vessel has its own operation id; the store refuses events for another vessel. Vessels are marked **TEST** or **LIVE** when created, and that mark can't change. The Glovis baseline and demo data can only be loaded as TEST.

## Data model

```sql
CREATE TABLE vessels (
  operation_id  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  is_test       INTEGER NOT NULL CHECK (is_test IN (0, 1)),
  baseline_json TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE events (
  operation_id    TEXT NOT NULL REFERENCES vessels(operation_id),
  sequence        INTEGER NOT NULL,
  event_id        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_json      TEXT NOT NULL,       -- the full kit-06 event
  PRIMARY KEY (operation_id, sequence),
  UNIQUE (operation_id, event_id),
  UNIQUE (operation_id, idempotency_key)
);
-- triggers: RAISE(ABORT) on UPDATE or DELETE of events; on UPDATE of vessels.is_test / baseline_json
```

Schema version is tracked with `PRAGMA user_version` so later phases can migrate without losing data. WAL mode on.

Baseline changes (a load-list amendment) are out of scope here. They'll be events in Phase 5, not edits to `baseline_json`.

## Tech stack

- Expo SDK 57 (current), TypeScript, blank template. No navigation library until Phase 3.
- `expo-sqlite` (included in Expo Go, so no custom build needed yet).
- Tests run on this PC with Node's built-in `node:sqlite`: same SQL, same store code. A small adapter hides the two drivers (`expo-sqlite` on the phone, `node:sqlite` in tests); it's the only place they differ.
- New dependencies (need approval): `expo`, `expo-sqlite`, `react`, `react-native`, and what the Expo template brings (`expo-status-bar`, `@types/react`).

## Commands

```
npm test              # engine + storage tests (Node, no phone needed)
npm run typecheck     # engine, storage and app
npx expo start        # dev server; scan the QR code with the iPhone camera → opens in Expo Go
npx expo start --tunnel   # if the phone and PC aren't on the same Wi-Fi
npx expo export --platform ios   # bundle check on Windows (proves the app compiles)
```

## Project structure

```
App.tsx               → check screen (temporary)
app.json              → Expo config (name "VSA", slug "vsa-app", iOS first)
src/engine/           → Phase 1, unchanged
src/storage/store.ts  → openStore, createVessel, listVessels, load, append
src/storage/db.ts     → driver adapter: expo-sqlite and node:sqlite
tests/store.test.ts   → storage tests on node:sqlite (file on disk, reopened)
```

## Code style

Same as Phase 1: plain functions, `null` = unknown, rejections return `{ ok: false, error }` with the exact reason. Storage never changes a value; it stores what the engine accepted.

```ts
const r = await store.append('GLOVIS-TEST', events);
if (!r.ok) showError(r.error); // e.g. "H3 exceeds its 106 autos by 4. Check the count." Nothing was saved.
```

## Testing strategy

Storage tests (Node, real SQLite file on disk):
1. **Restart:** create a vessel, append, close the database, reopen the file, load → identical state.
2. **Replay from the stored log:** store the Phase 1 parity shifts and the kit correction events; reload; state equals `project()` on the original events. The kit's 1,969 replay passes from storage.
3. **All or nothing:** a batch whose last event is rejected writes nothing; the log is unchanged.
4. **Append-only:** direct `UPDATE`/`DELETE` on events fails at the database level.
5. **Re-delivery:** appending the same events twice stores them once.
6. **Isolation:** events for another operation are refused; a vessel's TEST/LIVE mark can't be changed; Glovis loads only as TEST.
7. **Crash in the middle:** a failure inside the transaction leaves the log as it was.

On the iPhone (Expo Go, check screen): see Success Criteria.

## Boundaries

- **Always:** validate with the engine before writing; write in one transaction; keep the engine free of storage code.
- **Ask first:** any dependency beyond the list above; any schema change after this phase ships (it needs a migration).
- **Never:** update or delete a stored event; store TEST data in a LIVE vessel; write a derived number (remaining, ETA) as if it were a fact; make the app depend on a network connection.

## Success criteria

- [ ] `npm test` passes (Phase 1 tests plus storage tests 1–7).
- [ ] `npm run typecheck` passes; `npx expo export --platform ios` builds.
- [ ] On Colby's iPhone in Expo Go: create the TEST Glovis vessel, log a few hours from the check screen, force-quit the app, reopen → counts are still there.
- [ ] With the app open, turn on airplane mode, log more entries → they save and show. (In Expo Go a force-quit needs the PC to reload the app, so the restart test is done with signal. Restart with no signal at all is Phase 4.)
- [ ] Check screen "Replay check" button shows PASS (stored log replays to the same state).
- [ ] Colby approves; ROADMAP updated.

## Open questions

These have defaults. I'll build with the default unless Colby says otherwise.

1. **Expo Go on the iPhone.** Default: Colby installs Expo Go from the App Store (free) before the phone check. The PC and phone should be on the same Wi-Fi; if not, we use `--tunnel`.
2. **Airplane-mode test.** Expo Go loads the app from the PC. Default: open the app with signal, then turn on airplane mode and log entries. The app itself makes no network calls. Reopening with no signal and no PC needs the app installed from its own icon, which is Phase 4 (development build).
