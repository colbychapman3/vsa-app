# Spec: knowledge (Phase 6a)

## Objective
An offline, searchable knowledge pack built from the Brain's documents so Colby (and later the assistant) can look up SOPs, protocol rules and terminal facts without a signal. Success: a Search screen that returns cited passages from the source documents, or says "not found".

## Sources (from the Brain, 2026-09-30)
- In: SOP Ver. 2024.pdf; Virtual Stevedore Assistant Operating Protocol v1.1 (text already in `docs/14_Operating_Protocol_v1.1_TEXT.md`); 02-Stevedoring-Operations-Reference.md; VSA-Glossary.md; Terminal_Yard_Map_Brunswick.pdf.
- Vessel history (the Jun 19-20, Jun 11-12 and Sep 4-5 baselines): only if Colby asks.
- Excluded: profile, session logs, runbook, projects index (history, not rules).
- The Brain is history, not rules: where a passage conflicts with `CLAUDE.md` or `docs/`, `docs/` wins and the answer shows both.

## Scope
- In: a build-time script turns the source files into `assets/knowledge/index.json` (passages of about 150-300 words with document, section, page, plus a keyword index). Screen: a search box, result list with snippet, tap to read the full passage and its source line.
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
A known SOP phrase returns its passage first; a nonsense query returns not-found; ranking is deterministic; every passage has a source and page; the index build is reproducible (same input, same output hash); pack size reported and kept under 15 MB.

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
- Can the SOP PDF be exported as text from the Brain (CLI `source` commands), or should I convert the PDF in `docs/`? Default: try the CLI, fall back to PDF text extraction, and report which was used.
