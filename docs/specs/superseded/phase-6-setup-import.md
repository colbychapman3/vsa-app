> **Superseded 2026-10-04** by `../phase-6e-game-plan-reader.md`. The 6c photo import was removed in Phase 7b (commit 2df3eba). Kept for history only.

# Spec: setup-import (Phase 6c)

## Objective
New vessel from paperwork photos: the existing 5-step Setup is prefilled, Colby checks every step with Next, and the last step sends important notes into Plan Notes. Success: a vessel set up from photos saves only after every step was shown, and every prefilled value is visibly marked until confirmed.

## Flow
1. Setup step 0 offers **Manual**, **Upload photos**, or the existing **Paste baseline**.
2. Upload photos: pick from Photos or take pictures (load list, game plan, stow plan pages) → scan (document) → recognized text.
3. If AI is `ready`: `propose('setup', text)` fills the SetupForm. If not: the text is shown beside each step so values can be copied; nothing is prefilled.
4. Steps 1–5 as today. Prefilled fields carry a "from photo: check" tag that clears when Colby edits or confirms the step. Next is required on every step; Review cannot be reached by skipping.
5. Review uses `buildBaseline` unchanged: refusals and discrepancies (load list vs game plan) behave exactly as with typed input. Load list quantity wins; the discrepancy stays visible.
6. **Notes step** (after Review, before Save): lines from the text that are not baseline values are listed; Colby ticks the ones to keep, edits, and they save as `plan-note` events with the vessel.

## Rules
- Nothing invented: a value not found in the text stays empty, not zero. Unknown stays unknown.
- Source is recorded: the vessel's sources list gets "Photo import (n pages)".
- Photos are discarded after save unless Colby keeps them (decision 2).

## Structure
`Setup.tsx` (new entry + tags + notes step), `src/app/setup.ts` (merge a validated proposal into a SetupForm, pure), proposal schema in `src/engine/proposal.ts`.

## Testing
Merge: proposal fills only empty fields it has evidence for; tags set; a proposal deck with qty above the hatch total is refused by `buildBaseline` with the exact overage; AI off → empty form + text. Glovis Condor 101 fixture: a hand-written proposal round-trips to the same totals as the verified baseline. Notes step: ticked lines become plan-note events; unticked are dropped.

## Boundaries
- Never: save without every step shown; prefill a field silently; let a proposal bypass `buildBaseline`.

## Success criteria (6c, all three specs)
1. VIN scan works in sun with gloves; typing still works.
2. A vessel set up from photos matches the paperwork after checking, and AI off still allows the full manual path.
3. All tests pass; one new dev build; phone check passes.
