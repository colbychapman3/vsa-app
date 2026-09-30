# Spec: plan-notes (Phase 6a)

## Objective
A Notes section on the Plan tab for ship-specific information that has no standard field. Typed now; filled from a photo later (setup-import, 6c). Success: add, edit and remove a note; history kept; notes appear in the vessel reports.

## Scope
- In: note = free text, optional title, created time (exact when given, else labeled processing time), optional photo file (kept only if Colby keeps it), source label (typed / photo-read). Edit = correction that supersedes and keeps history; delete = removal entry, never a hard delete.
- Out: AI reading (6c). Notes never change any count, ledger or ETA.
- Notes from a photo: the extracted text is the record; the image is optional and can be discarded. Extracted text is always shown for confirmation before saving; unclear parts stay visibly unknown, never guessed.

## Tech stack / structure
- New event types in `src/engine/events.ts`: `note.added`, `note.corrected`, `note.removed`, following the `vsa-event-ledger` skill (append-only, supersede with history; schema migration only if needed).
- Projection in `src/app/view.ts`; UI in `src/app/screens/Plan.tsx` (a Notes card) plus an add/edit sheet (one modal at a time); included in `src/app/report.ts` break and completion reports.

## Commands
- Test: `node --test --experimental-strip-types --no-warnings=ExperimentalWarning tests/notes.test.ts tests/events.test.ts tests/report.test.ts`
- Typecheck: `npx tsc --noEmit`

## Code style
Same as `src/engine/events.ts`: small pure functions returning events, exact rejection messages, no clamping.

## Testing
Add/correct/remove round-trips through replay; a correction keeps the old text in history; a removed note leaves a history row; empty text is refused with a message; vessel isolation (a note never appears on another vessel); backup export/import carries notes; reports list current notes only, edited ones marked.

## Boundaries
- Always: keep history; label times; vessel-scoped.
- Ask first: any storage schema change.
- Never: let a note alter counts; overwrite an old value in place.

## Success criteria
1. Add, edit, remove a note on the phone offline; it survives a restart.
2. History shows every version.
3. Reports list notes.
4. All tests pass, existing ones still green.

## Open questions
None. (Reminders apply to Plan alerts in the assistant, every 25 min, stage 6d.)
