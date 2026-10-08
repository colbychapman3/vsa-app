# Spec: Vessel complete (Phase 7k)

Status: **APPROVED 2026-10-08 (all defaults) and built.** Built as `status_change` with metric `vessel_complete` (value completed or reopened, plus `blockers`), not a new event type. Reopen is a button with a reason; a clean mark whose remaining later leaves 0 shows "review" on Snapshot until reopened (no automatic reopen event). Not built: the Complete chip in the vessel list.

## Objective
When vessel remaining reaches exactly 0, the app asks "Is the vessel complete? Yes / No". Yes finalizes the reports, unless something still open would stop a close-out. A manual "Mark vessel complete" is always available and works even with open issues. Nothing is ever marked complete without Colby's tap (CLAUDE.md: forecasts and completion are never automatic).

## Proposed defaults (change any)
1. **Prompt:** appears once when remaining hits 0, as a sheet with Yes / No. No = dismissed; it asks again only if remaining leaves 0 and returns to 0. The Snapshot hero keeps a "Mark vessel complete" button while the vessel is not marked.
2. **Blockers that stop a normal Yes** (each named in plain words, each with a Go to fix link): field and ship don't match (overall or by brand); an open issue; a deck with no count; a note section Colby chose to require is not used (none required).
3. **Manual override:** "Mark complete anyway" beside the blockers, and always in the menu. It asks for a reason (quick picks plus Other) and records the open blockers in the event, so the report says "Completed with N open items: …". Never silent.
4. **Data:** one new event `vessel.completed` (payload: time, reason if overridden, blockers list); `vessel.reopened` (reason) to undo, since the log never erases. Projection: `s.completed = {time, override, blockers} | null`. Old logs replay unchanged; replay hashes must not move.
5. **After Yes:** Snapshot shows a green VESSEL COMPLETE banner with the time; reports print COMPLETE (or "COMPLETE, closed with open items" for an override) instead of INTERIM; the vessel list shows a Complete chip. Counting is not locked: a new count or correction stays possible and, if it moves remaining off 0, the banner turns to "Reopened" and the next 0 asks again. Archive stays separate and manual.
6. **Report rule today:** COMPLETE currently means remaining = 0. New rule: COMPLETE means Colby marked it. Remaining = 0 without the mark prints "INTERIM: ready to close, not confirmed".

## Tests (first)
- Prompt due only at exactly 0 and not marked; not due when remaining unknown.
- Blockers listed correctly for each cause; normal Yes refused with them; override accepted with reason, refused without.
- Mark, reopen, mark again; replay equivalence unchanged on old logs; report header per state.
- TEST vessels behave the same and show the TEST chip.

## Boundaries
- Never: auto-mark, hide open items when overriding, delete events, or lock the record.
