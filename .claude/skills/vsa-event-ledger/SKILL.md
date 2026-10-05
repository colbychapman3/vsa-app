---
name: vsa-event-ledger
description: Rules for the VSA append-only event log and on-phone storage (src/storage, src/engine/events.ts, src/app/entries.ts) — how entries become events, how corrections supersede with history, time fields, and what the database refuses. Use when adding an entry type, a correction, a metric, or touching storage or migrations.
---

# VSA event ledger and storage

The record is an append-only log of kit-06 events (`docs/06_event_log_schema.json`) per vessel. State is never stored: `project(baseline, events)` in `src/engine/index.ts` rebuilds it every time.

## Flow of a save
1. A form in `src/app/screens` calls `App.save(build)`.
2. `build` is a function in `src/app/entries.ts` that turns the form into one or more events (`builder(ctx)`). No math there.
3. `store.append` (`src/storage/store.ts`) runs `project()` over stored + new events inside one exclusive transaction and inserts the new events only if the engine accepts all of them. Otherwise nothing is written and the engine's exact message is shown in red.

## Append-only
- The `events` table has triggers that abort any `UPDATE` or `DELETE` (`src/storage/schema.ts`). Don't remove them, don't work around them.
- **Prototype-phase exception (Colby, 2026-10-05):** while the app is in prototype and every vessel is TEST, Settings can delete a vessel (swipe left, tap the trash). It goes only through `store.deleteVessel` (schema V4: the delete triggers let a delete through only inside the transaction that wrote that vessel's `deleting:` marker), is refused for the open vessel, and a LIVE vessel needs a current saved copy. `VESSEL_DELETE_ALLOWED` in `store.ts` switches it off: **set it to false before go-live.** Nothing else may delete events or vessels.
- A vessel's TEST/LIVE mark and baseline can't change. TEST ids start with `TEST-`; a TEST event can never land in a LIVE vessel.

## Corrections supersede; they never add
- A correction is a new event with `event_type: 'correction'`, `supersedes_event_id` = the **current head** of the chain, and a non-empty `payload.reason`. The engine refuses a correction without a reason, one that targets an already-replaced event, or one that changes scope, metric, count kind or period.
- The corrected value **replaces** the old one; history is kept in the chain (`historyOf`). Never model a correction as a +/- offset that gets summed.
- To take something back (a duplicate break, say), supersede it with a correction whose value is the removal marker the engine understands for that metric (breaks: `'void'`), with a reason. It stays in the log, shown as removed.
- Correction reasons are quick picks in the UI (`REASONS`, `BREAK_REASONS` in `entries.ts`) plus "Other…".

## Time fields
- `occurred_at` is only a time Colby typed or confirmed with **Now**. Empty = `null` = "time not provided". Never fill it from the phone clock silently.
- `recorded_at` is the phone clock at save, labeled as processing time wherever it's shown.
- Times are ISO with the operation's fixed UTC offset (`ctx.offset`, Day 1 at noon) so the same hour re-entered later matches.

## Ids and order
- `event_id` = idempotency key = `<operationId>-<sequence>`, sequence strictly increasing per vessel. Re-delivering an identical event is a no-op; same key with different content is refused.

## Queries and migrations (`expo-sqlite` via `src/storage/db.ts`)
- Always bind parameters (`?`); never build SQL from input strings.
- Multi-row writes go in `db.transaction`.
- Schema changes bump `SCHEMA_VERSION` and add a migration step; never rewrite V1. The app refuses a database newer than itself.
- Tests run the same store on `node:sqlite` (`tests/nodeDb.ts`). Every new entry type gets a test that saves through `store.append` and reads back through `project()`.

## Backup (built in Phase 5)
One vessel's log exports and imports as a checksummed JSON file (`src/storage/backup.ts`). Import only ever appends; it never overwrites or deletes.
