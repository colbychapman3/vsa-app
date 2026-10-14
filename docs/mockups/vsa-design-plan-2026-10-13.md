# VSA design: where we stopped and what's next (2026-10-13)

> **Copies on Colby's PC (for Claude Code sessions without Project access):** this plan is at `docs\mockups\vsa-design-plan-2026-10-13.md`, the two bake-off reports sit beside it, and the full Every Screen artifact (canvas.json + 46 boards, version 1791918979-0e0e) is in `docs\mockups\every-screen-2026-10-13\` with a README explaining the board format. Not committed. If the artifact has changed since, the artifact wins.

Read this first when picking the design work back up. It is written for a fresh Claude session with no memory of the chat.

> **How to find and start this plan.** This doc lives in the claude.ai Project "Virtual Stevedore Assistant" (path `claude/vsa-design-plan-2026-10-13.md`), not in the repo. It is design work on the **VSA Every Screen artifact** (https://claude.ai/artifact/CrFC2N7Sd8oh44jkznHuQD), done with the Artifact tool. It is **not** the older "Design step 1 / Design step 2" code commits (1378510, 69ee3b1, 2026-10-12, already on main: type scale 13/15/17/22/28, three radii, two-row header, Log in the tab bar, Log sections). Those are app code already done; the rebuild in Step 3 starts from current main and keeps them.

## State in one paragraph

Colby is finalizing the VSA app's design before handing it to Claude Code to rebuild the app. **VSA Every Screen** is the winning design (about 50 screens, light hi-vis + Night). **VSA Explore** (group C, dark Liquid Glass) was a challenger that had to beat it. We ran a blind bake-off on the 7 main-tab screens: group C's *behavior* won narrowly, but Every Screen won as the *base* (day theme, buildability, tokens that match the app's code). **Colby confirmed on 2026-10-13: Every Screen is the base and group C's assistant behaviors get grafted into it.** Next: the screen inventory, then the agent swarm on Every Screen, then the handoff to Claude Code. All four decisions are answered (below).

## Artifacts (all private to Colby)

| What | Link | Version at stop |
|---|---|---|
| VSA Every Screen (the winner; Design canvas) | https://claude.ai/artifact/CrFC2N7Sd8oh44jkznHuQD | 1791918979-0e0e |
| VSA Explore / group C (challenger; Design canvas, title shows "VSA") | https://claude.ai/artifact/76vsjQtyyHVMt6FzFjnT7g | v44, 1791912521-67fe |
| Older single-page "VSA Every Screen" (not the canvas; ignore) | https://claude.ai/artifact/Ki926venWueZ1L84SDsLuL | — |
| VSA Philosophy: Is It an Assistant? (doc) | https://claude.ai/artifact/TM9Y3Gskf9YmKyJYYK6Hp8 | — |
| Tracker to Assistant: Game Plan (doc) | https://claude.ai/artifact/NmMZVnbTtJuHewUJ6fzCDq | — |
| Tracker to Assistant: Round 2 (doc) | https://claude.ai/artifact/ApingaV2BN7QEMZY3kbfWF | — |

The three docs are Claude Docs: read them with the Claude Docs connector (read the project, then the tab's node), not the Artifact tool.

Full bake-off reports are in this Project: `claude/bakeoff-supervisor-2026-10-13.md` and `claude/bakeoff-site-manager-2026-10-13.md`.

## What Colby decided this session

- Every Screen is the incumbent winner; group C had to impress enough to take #1.
- Bake-off before any big swarm run: done.
- If C had won: C as the night look plus a light C for day. Moot unless he picks C.
- Lock screen / Live Activity, Apple Watch, Siri and StandBy: keep in the design but mark "later" (native extensions, a separate build). Siri "Log a count" already exists in the app.
- His design tastes from this round: he liked C7 (the plain Snapshot) and the A1 Snapshot layout most; dislikes cryptic screens, wordiness and very rounded corners; the field count must stand out as OFFICIAL; one soft peach, full-width main action per screen.

## Bake-off result (blind: X = Every Screen, Y = group C)

| | Every Screen (X) | Group C (Y) |
|---|---|---|
| Supervisor total (is each screen right?) | 115 | **123** (low-medium confidence) |
| Site manager assistant score | 23 | **24** |
| Site manager recommendation | **Base** (medium-high) | Graft its behaviors |
| Sun test (45% glare wash) | Holds better; light text fades | Most text 2–3:1; glass contrast depends on wallpaper |
| Buildability | Tokens match `src/app/palette.ts`; one phase, one EAS build | Needs expo-blur + expo-linear-gradient (native), a new visual system over ~28 screen files, no tokens, no day look |

Per screen (supervisor): 1.1 X · 1.2 Y (clear) · 1.3 X · 1.4 Y · 1.5 Y · 1.6 Y · 1.7 tie.

## Decisions Colby made (2026-10-13, after the bake-off)

1. **Every Screen is the base**, with group C's behaviors grafted in.
2. **Peach `#FFD6A5` replaces hi-vis orange `#FF8A3D`** as the main action color. Use a 1.5–2 pt navy edge when it sits on a light background so it holds up in sun. The app's `tests/theme.test.ts` pins the orange, so the rebuild changes that test (Colby approved the change).
3. **The full Snapshot stays when a count is due**: the due card goes on top (C's way); field count, ship progress, H.A. and the ship never disappear. Every Screen's stripped-down 1.2 is retired.
4. **One phase, no store build.** The design work, the handoff spec and the code rebuild are one phase. No EAS store build is part of it; a TestFlight build happens only when Colby asks for one later.
5. **Night look: Every Screen's own Night mode**, no glass. Fix its two contrast failures (FORECAST chip, purple Pace) so Night meets the 7:1 aim.
6. **All ten group C grafts** are in scope, including the needed-rate number and tap-a-graph-point.
7. **VSA Explore stays** as an idea board with a "replaced by Every Screen" banner after the handoff. Do not delete it.

No open questions remain for this plan. Next session: start Step 1 (inventory) directly.

## The plan

### Step 1: Inventory (no agents)
List every Every Screen board (sections 1–9, ~50 screens). For each: which fixes and grafts apply. Send Colby the list before any agent runs.

### Step 2: Swarm on Every Screen (roles Colby asked for)
Brief every agent with CLAUDE.md's domain rules; the philosophy (speak first, give back more than it takes, ask only about doubt, silence means all is well, hold the list, make the complex simple, never trade accuracy for comfort; dependable first, then a step ahead; the Now card; the answer after Save); his tastes above; and the fix and graft lists below.

1. **Design enhancers (2 in parallel: sections 1–4 and 5–9).** Apply fixes and grafts; make each screen act like an assistant. No new screens, no invented data, no publishing.
2. **Polisher (1).** Whole-set consistency: one header, one type scale, 12 px radius, tokens for Light / Night / Extra-visible, numbers on shared baselines, one peach action per screen, no dead space, fewer words, every state. Adds no features.
3. **Supervisor (1).** Pass/fail per screen on rules, contrast (AA by day, 7:1 Night aim), 44 pt targets, consistency. Sends fails back (max 2 loops). Does not fix.
4. **Site manager (1).** Different goal: does the whole set move VSA from tracker to assistant, and can Claude Code build it? Reads the real app read-only. Writes the handoff spec: screen map (design screen → `src/app/screens` file), data each screen needs from `view.ts` / the engine, build order, decisions for Colby.

Colby reviews; publish a new Every Screen version only after his OK.

### Step 3: Handoff to Claude Code
Spec goes in `docs/specs/` per CLAUDE.md (old specs move to `docs/specs/superseded/`). Put a "replaced by Every Screen" banner on VSA Explore. Same phase; Claude Code rebuilds with tests green (`npm run verify:release`), but **no EAS store build** unless Colby asks.

## Fix list for Every Screen (checked against the renders)

- 1.4: Pace shows 171; its own hours give 176 (981 ÷ 335 productive minutes).
- 1.3: DK4 says "Not started" but 30 of 55 are left; "2 deck heights unconfirmed" flags only DK9; "All decks (7)" lists 5.
- 1.1: "82 min before break" is 16:08 + 82 = 17:30, the clear-by stop, not the break. Say "before the 17:30 stop".
- 1.2: "DK4 won't clear by the 17:30 stop" sits beside a 16:08 finish (contradiction); the due bar has no action; field count, ship progress and H.A. disappear when something is due; peach is used for a warning.
- OFFICIAL missing on 1.2, "Total" on 1.4, unlabeled on 1.5. H.A. never shows its denominator; Pace is missing from the Snapshot.
- 1.5: the 151 point is drawn at about 160.
- Tap targets under 44 pt: Ask/Map (~40), tab items (~38), "Not useful?" and "Details ▾" (~19), hull rows (24).
- Night: FORECAST chip white on `#F59E0B` = 2.15:1; purple Pace `#7C3AED` on the night card = 2.89:1. Both fail.
- 1.6 Save is a ghost button (no main action); 1.7 Export is half-width.
- Label the required rate "Needed", not FORECAST (it's a calculation); keep FORECAST for the ETA. Show it only when it matters (at or above current pace, or a target is set).

## Grafts from group C (ranked; site manager's map to the code)

1. **Now card that acts:** "The 14–15 count is due" with a full-width peach **Log 14–15** that opens the Log on that hour; warnings get their own action ("See DK4"). `Snapshot.tsx` + an `action` field on `NowLine` in `now.ts`. Small.
2. **(i) "How this is worked out"** on Vessel remaining, gap, H.A. and ETA, using the existing `traces()` in `brief.ts` (meets ROADMAP's Phase 7d target). Small.
3. **"Needs a look" list** at the bottom of the Snapshot (open discrepancies, low decks, unconfirmed heights), replacing stacked strips. Small–medium.
4. **OFFICIAL field tile beside the FORECAST finish tile** ("through 13–14"); H.A. with "981 ÷ 6 counted hours" beside Pace. `SnapshotBoxes.tsx` `half` prop. Small.
5. **Plain-language hourly notes:** "+27 from the short hour before", "Corrected: was 190, now 199. Original kept.", "H/H started 09:20 (awareness only)". `hourlyView()` strings + tests. Small.
6. **Resolve → "Resolved ✓ The log keeps it. Reopen".** Small.
7. **Plan top:** peach Save; "Last cars" recomputed live when the side changes; Two days → "The forecast rolls into Day 2". Small.
8. **Brand table:** Field / Cleared / In transit + a one-line definition of in transit. Small.
9. **Needed rate as a big number,** only when it matters; wire the engine's `requiredRate()` (exists, unused). Small–medium.
10. **Tap a graph point for its readout.** Medium.

Keep from Every Screen (the judges said C lacked these): the "Field is N under ship progress" sentence; "at break: must match"; hard low-deck red banner vs soft orange "Height not confirmed"; "2 deck heights unconfirmed → Confirm on Plan"; the hull map with H4–H1 headers; remaining by brand; one header; peach Log in the same tab-bar spot; "Not useful?" (made 44 pt).

Do **not** take from C: glass/blur, gradient wallpaper, 24–28 pt corners, the progress ring (repeats the %), grow-in animations, the SF Pro font switch, two header styles, a deck-height Confirm that a second tap silently undoes.

## Practical notes for the next session

- The cloud workspace is wiped between sessions; files under `/tmp` or the scratchpad are gone. Re-download artifact files with the Artifact tool (`read` with `paths` and `out_dir`).
- Design artifacts: `project/canvas.json` plus one `project/<name>.dc.html` per board. Publish with `file_path` = absolute path to canvas.json, `root` = the folder above `project/`, and a `files` map of changed boards only (never include canvas.json; `null` deletes a board). A publish is refused if the live version changed since you last read it: read or list files first, then merge.
- Every Screen boards take props `night`, `extraVisible`, `showTapTargets` (in `data-props`). When rendering locally, use a fresh browser page per render, or night renders come out identical to day (this bug hit the bake-off; fixed).
- Subagents can't write files here; they return reports as text. Save them yourself.
- `dist/` is read-blocked for Claude in this repo; `web-build/` (gitignored) works for scratch files that need uploading.
- Store builds run on Colby's PC through the linked computer (CLAUDE.md Gotchas), never from the cloud.

## Other open threads (outside this plan)

- An unblurred VIN in `docs/mockups/all-screens-2026-10-12.html` on his PC (offered to blur; not done).
- App track (ROADMAP / Round 2): phone check of build #28, and two live ships with VSA Live kept in parallel as the fallback record (the "prove the tracker" gate).
