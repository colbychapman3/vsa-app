---
name: ui-conformance
description: Loop that makes each VSA app screen match its VSA Every Screen board (render, pixel-diff, review, fix, re-check) until every board passes or becomes a design question. Expensive (many subagents). Use only when Colby asks for "ui conformance", "match the boards", or "make the screens match the mockups".
disable-model-invocation: true
---

# UI ↔ board conformance loop

Goal: every board is `pass` or `design-q`. This skill applies CLAUDE.md and `vsa-field-ui`; it never overrides them.

**Start here.** The harness is `tools/render/` (render.mjs, states.mjs, hera.ts; built 2026-10-17, trial on 103, 201, 903). If `tools/render/manifest.json` is missing, read `setup.md` in this folder and do it first (phase gate, harness, pilot). If the manifest exists, resume from it: never start over.

## What wins

- Boards: `docs/mockups/every-screen-swarm-final-2026-10-13/boards/*.dc.html`, ids = file stems, meaning in `HANDOFF_SPEC.md` beside them. They're a frozen copy of the live "VSA Every Screen" artifact. Never edit a board.
- **Later Colby decisions beat the boards.** Before treating a difference as a bug, check `git log --since=2026-10-13 -- src/app` and `ROADMAP.md` (for example: the ship card redesign `docs/mockups/ship-card-2026-10-16.html`, and the selected tab in Log peach, both 2026-10-16). Each such case is a design question ("board X, decided Y on date: update the board?"), never a revert.
- **Domain rules beat pixels.** Never fake a number, hide "unknown", drop a FORECAST/CALCULATED label, go below 44 pt, or allow mid-word wrapping to match a board.
- Ambiguous or conflicting boards: record a DESIGN QUESTION, don't guess, and carry on.

## Units of work

Reviewers work **per board**; fixers work **per screen** (every board of one screen file, such as 102 + 102b, or 104 + 104b + 104c), so two fixers never edit the same file and one state's fix can't break another unseen. Fixers on screens with shared files run one at a time.

## Each round

1. `node tools/render/render.mjs export`, then `capture`, then `diff` (all boards in `tools/render/states.mjs`). Read only the JSON lines. Not built yet: `hash` and `manifest.json` (add them before the first full round).
2. Skip a board when its status is pass, its hash hasn't changed, and its mismatch is at most its baseline + 1 (+ its noise floor). Queue everything else.
3. Reviewers, 3 in parallel. Give them paths and the board's earlier open issues, never contents or images.
4. Pass: `status=pass`, `passBaselinePct=mismatchPct`. Fail: group the findings by screen and run that screen's fixer.
5. After the fixers: `npm run typecheck`, `npm run lint`, `npm test`. On red, fix it or revert that fixer's change before going on.
6. Fresh reviewers check every fix next round. A fixer never grades its own work.
7. Track issues by their `key`. Still open after 2 rounds → fix it yourself with full context. Add every designQ to `manifest.designQ`, deduplicated by board and element.
8. Write the manifest after every step. Commit once per round (the boards that passed and the screens changed, in the message). Push only if Colby asked.

Stop when every board is pass or design-q and a final full capture and diff shows none above baseline + 1, or after 3 rounds (the default; Colby can raise it).

## Token rules

The orchestrator reads the manifest and the JSON lines only; it opens images or source only to escalate. Subagents get paths. Every return is JSON. Trim all command output.

## Final report (plain text for Colby)

- One table: board | status | rounds | mismatch first → last.
- DESIGN QUESTIONS, also written to `docs/mockups/design-questions-<date>.md`: board id and element, what the board shows, what the app or a later decision does, and the decision needed (with a recommended answer), so the artifact gets updated first.
- What still needs the phone (fonts, safe area, sun), and whether the changes ship with `eas update` (JS only) or need a store build.
