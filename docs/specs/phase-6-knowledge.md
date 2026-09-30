# Spec: knowledge (Phase 6a)

## Objective
An offline, searchable knowledge pack built from the Brain's documents so Colby (and later the assistant) can look up SOPs, protocol rules and terminal facts without a signal. Success: a Search screen that returns cited passages from the source documents, or says "not found".

## Sources (from the Brain, 2026-09-30)
- In: SOP Ver. 2024 (text supplied by Colby 2026-09-30 as `docs/knowledge-src/sop-ver-2024.md`; a markdown rendering with chapters and sections but **no page numbers**, so citations read "SOP Ver. 2024, Ch. 4 §2"; the original PDF wins on any difference); Operating Protocol v1.1 (`docs/knowledge-src/VSA-Operating-Protocol-v1.1.md`, sectioned, converted from the PDF; the PDF wins); VSA-Glossary.md (supplied; status column kept so Confirmed/Industry/Needs-definition shows in results); 02-Stevedoring-Operations-Reference.md (still to export). (The Terminal Yard Map PDF is not used: the Map screen and the terminal directory cover it.)
- Vessel history (the Jun 19-20, Jun 11-12 and Sep 4-5 baselines): only if Colby asks.
- Excluded: profile, session logs, runbook, projects index (history, not rules).
- The Brain is history, not rules: where a passage conflicts with `CLAUDE.md` or `docs/`, `docs/` wins and the answer shows both.

## Scope
- In: a build-time script turns the source files into `assets/knowledge/index.json` (passages of about 150-300 words with document, chapter/section (page where the source has one), plus a keyword index). Screen: a search box, result list with snippet, tap to read the full passage and its source line.
- Out (stage 6d): the assistant reading and summarizing these passages. This module is keyword search only and needs no AI.
- Answers are quotations with their source, never a paraphrase presented as the SOP. No result means "Not found in the loaded documents", never a guess.

## Tech stack / structure
- `scripts/build-knowledge.mjs` reads `docs/knowledge-src/*.md|txt` (PDFs converted to text first; Brain sources exported with the NotebookLM CLI) and writes `assets/knowledge/index.json`.
- `src/app/knowledge/search.ts` (pure: tokenize, rank, highlight), `src/app/screens/Search.tsx`.
- Re-export is manual; the index records a build date shown on the screen.

## Commands
- Build pack: `node scripts/build-knowledge.mjs`
- Test: `node --test --experimental-strip-types --no-warnings=ExperimentalWarning tests/knowledge.test.ts`

## Code style
Pure TS with no UI imports; deterministic ranking (ties broken by document order).

## Testing
A known SOP phrase returns its passage first; a nonsense query returns not-found; ranking is deterministic; every passage has a document and chapter/section; the index build is reproducible (same input, same output hash); pack size reported and kept under 15 MB.

## Boundaries
- Always: cite; show the pack's build date; flag Brain-vs-docs conflicts.
- Ask first: adding documents beyond the list above.
- Never: include passwords or keys; answer from outside the pack; present an old build as current.

## Success criteria
1. Search works in airplane mode.
2. 10 real questions Colby picks return the right passage in the top 3.
3. Not-found appears when the pack has no answer.
4. All tests pass.

## Open questions
None for the SOP (resolved: Colby's markdown export is the source; no PDF conversion needed). The protocol and glossary are supplied. Only the operations reference is still to be exported; same folder, same script. First real test questions come from the SOP: 20 km/h hold speed limit, BEV report threshold (50 C), belt scrapping cut size, which label goes on a low-clearance sports car.
