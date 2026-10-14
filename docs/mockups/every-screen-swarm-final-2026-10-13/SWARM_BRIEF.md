# VSA Every Screen swarm: brief for every agent

Read this whole file first. Then read `docs/vsa-design-plan-2026-10-13.md` (decisions, fix list, the ten grafts) and `docs/every-screen-inventory-2026-10-13.md` (what changes on each board). All paths are under `/tmp/claude-0/c/es_work/`.

## What we're doing

VSA (Virtual Stevedore Assistant) is a phone-first iOS app for one stevedoring supervisor, Colby, who runs ro-ro auto discharge at Colonels Island, Brunswick GA: outdoors, in direct sun, sometimes gloved, one-handed. **VSA Every Screen** is his chosen design: 46 board mockups covering every app screen (sections 1–9). The board files here are copies of it. We are finishing that design so Claude Code can rebuild the app from it. You change copies only; Claude (the lead) publishes later, after Colby approves.

**The goal: from tracker to assistant.** A tracker records what it's told and answers when asked. An assistant **speaks first**, at the right moment. The test for every screen: *after the user gives it something, does it give back more than it took?* Principles: give back more than you take; speak first at the right moment; ask only about what is in doubt; silence means all is well (warnings rare enough to be believed); hold the list of what's left; know the norms without being told; make the complex simple (three things that matter now, not twenty); never trade accuracy for comfort (facts, calculations and forecasts stay labeled). Two standards in order: **dependable** (right number or "unknown", never loses input, same place same tap, works one-handed in sun, never interrupts a count), then **a step ahead** (the answer to the question of the moment is already on screen).

## Colby's decisions (do not reopen)

- Every Screen is the base. Group C's ten ideas (G1–G10 in the inventory) are grafted in. Its glass look is NOT: no blur, no gradient wallpaper, no 24–28 px corners, no progress ring, no grow-in animation, no font switch.
- Soft peach `var(--action)` (#FFD6A5) is the one main action per screen, full width, with a navy edge by day (already added globally: `.vsa:not(.night) .btn`). Peach is never used for a warning.
- When something is due, the full Snapshot stays; the due card sits on top.
- Every Screen's own Night mode stays (no glass).
- One new board: `201b-Log-After-Save.dc.html` (2.1b · Log › After Save). No other new boards.

## Design tastes (Colby)

Plain and quick to understand; less wording, only important info; corners not too rounded (cards 12 px `var(--r-m)`); the field count stands out as OFFICIAL (black box with white OFFICIAL chip by day, matching style at night); one soft peach full-width main action; numbers that sit side by side share a baseline.

## Domain rules (from the project's CLAUDE.md; a board that breaks one fails)

- Hourly field counts are the **official record**; label the field count OFFICIAL everywhere it appears. Deck/ship progress is the working tool.
- Any finish/ETA is labeled **FORECAST**. A required rate is labeled **Needed** (it's a calculation, not a forecast).
- Vessel remaining = starting − confirmed deck progress. In transit = ship progress − field (never negative). Unknown shows as unknown, never 0.
- Autos, High & Heavy, load-back and lashing are separate ledgers. **H&H is awareness only**, never added to or compared with autos.
- During work: say which side is ahead and by how much ("Field is 34 under ship progress"), no alarms. At breaks and end of shift ship must equal field (match green, ship ahead orange, field ahead red).
- H.A. = field ÷ counted hours, denominator shown. Pace = field ÷ productive hours. Show both.
- Clear-by before breaks: Northside 15 min, Southside 30 min. Breaks 12:00 and 18:00, one hour.
- Decks read H4 → H3 → H2 → H1. Below 1.85 m = hard low-deck warning (red); a height not confirmed = soft warning (orange).
- Corrections supersede and keep history. Fit checks need Stow H, deck height and a cited SOP rule.
- Field UI: 44 pt minimum tap targets (main actions 52–56), WCAG AA by day (4.5:1 body, 3:1 large), Night aims at 7:1, no text breaking mid-word, one modal at a time.

## The sample story (F15): every number on every board must agree with this

Vessel **Hera Highway 13A**, LIVE, Berth 2, Day 1 = 10/12/2026. Start 07:00 (safety meeting, actual start 07:10). Breaks 12:00 and 18:00. Day 1 shift end 23:00 Southside → last cars 22:30. Labor: 70 van drivers, heavy gang 12. Starting autos **1,352**: BMW 820, MBZ 480, POV 52. H&H 38 (awareness only; H/H start 09:20).

Hourly field counts (OFFICIAL):
| Hour | Count | Note |
|---|---|---|
| 07–08 | 150 | safety meeting, 50 min worked, pace 180/hr |
| 08–09 | 182 | |
| 09–10 | 175 | H/H started 09:20 (awareness only) |
| 10–11 | 199 | corrected: was 190, now 199, original kept |
| 11–12 | 124 | short hour: stopped 11:45 (Northside clear-by, 15 min), 45 min worked, pace 165/hr |
| 12–13 | break | |
| 13–14 | 151 | BMW 98 · MBZ 48 · POV 5 |
| 14–15 | 158 | BMW 100 · MBZ 52 · POV 6 (due at 15:04; saved 15:05 on 2.1b) |
| 15–16 | 178 | (closeout only) |
| 16–17 | 35 | (closeout only) 16:00–16:12, last cars |

**At 15:04 (main tabs, Ask, Send update, Menu, Night):** field **981** through 13–14 (BMW 598, MBZ 352, POV 31). Ship progress **1,015** (decks last saved 13:58): cleared BMW 610, MBZ 368, POV 37. In transit 34 (12 / 16 / 6). **Vessel remaining 337** (75% done): BMW 210, MBZ 112, POV 15. **H.A. 164** = 981 ÷ 6 counted hours. **Pace 176** = 981 ÷ 335 productive min. **FORECAST finish 16:08** (from 14:00, average pace of the last two hours with a known pace: 151 and 165 → 158/hr), **82 min before the 17:30 stop**. Needed rate to finish by 22:30 is far below current pace, so the needed-rate card stays quiet (G9). Field is 34 under ship progress.

Decks (discharge order, total 1,352):
| Deck | Total | Left at 15:04 | Hatches left (H4/H3/H2/H1) | Status | Height |
|---|---|---|---|---|---|
| DK12 | 433 (120/120/120/73) | 160 | 61/46/30/23 | Active | 2.10 m, confirmed 07:40 |
| DK9 | 260 (90/90/80/–) | 98 | 55/36/7/– | Active | 2.00 m, not confirmed (soft) |
| DK7 | 140 | 49 | 49 in H4 | Paused | 2.20 m, not confirmed, can be lowered (soft) |
| DK4 | 55 | 30 | 30 in H3 | **Paused** | 1.80 m, low deck (hard); 2 photos |
| DK3 | 210 | 0 | – | Complete, cleared 11:42 | 2.40 m |
| DK2 | 150 | 0 | – | Complete, cleared 09:55 | 2.40 m |
| DK1 | 104 | 0 | – | Complete, cleared 08:40 | 2.40 m |

Deck update in progress at 15:02 (2.5, 3.1): DK12 hatches 55/40/30/23 = 148 (previous 160 at 13:58).
Open discrepancy: count mismatch, noticed 14:52, "Clerk shows 4 more MBZ than my count for 13–14."
Ship note: "Gate 2 closed 09:00–09:40, cars staged at MBZ." (09:42, from the game plan.)

**2.1b After Save (15:05, the 14–15 count of 158 just saved):** field 1,139 through 14–15; H.A. 163 = 1,139 ÷ 7; pace 173 = 1,139 ÷ 395 min; FORECAST finish 16:09 (1 min later; the engine carries the 13:58 deck count forward at 154.5/hr, about 160 cars, so about 177 left). decks last saved 13:58, so field is 124 over ship progress (1,139 vs 1,015): say so plainly and offer "Update decks" (field ahead is a mismatch to check, not an alarm mid-shift). The answer gives back more than the 158 he typed; it never just echoes it.

**At the 12:00 break (9.1, 2.4):** production stopped 11:45. Field 830 through 11–12 (BMW 500, MBZ 304, POV 26). Ship = field overall, 830 = 830 (match). Brand banners for reference: BMW field 500 vs cleared 503 (field short by 3), MBZ field 304 vs cleared 301 (field over by 3), POV 26 = 26. Vessel remaining 522 (61% done).

**Closeout (6.1–6.3):** vessel remaining reached 0 at 16:12. Field 1,352 (after 15–16: 178 and 16–17: 35). H.A. 150 = 1,352 ÷ 9 counted hours; pace 174 = 1,352 ÷ 467 productive min. Forecast at 14:00 was 16:08: finished **4 min after the forecast**. End of shift logged 16:15. Closeout screen 16:20; marked complete 16:22. The count mismatch from 14:52 is the one open item (resolved or "complete anyway" per the board's own story).

**9.3 Night:** the 1.2 Snapshot (15:04, count due) in the Night palette.

Setup (section 7) and Vans (8) keep their own internal sample (they happen before the ship); make them agree with the totals above where they show them (1,352; DK12 433; brands 820/480/52; H&H 38).

## Board file format (do not break)

- Each `.dc.html` is self-contained: `<helmet>` holds the CSS tokens (`.vsa` light, `.vsa.night`, `.vsa.xv` extra visible), the markup sits inside `<x-dc>`, and a `<script type="text/x-dc" data-dc-script data-props=...>` holds `class Component extends DCLogic { renderVals() {...} }`. Keep `class="vsa {{mode}}"` and the `night` / `extraVisible` / `showTapTargets` props working.
- Templating: `{{ name }}` (dotted lookups only), `<sc-if value="{{ x }}" hint-placeholder-val="{{ true }}">`, `<sc-for list="{{ xs }}" as="x" hint-placeholder-count="3">`, `onClick="{{ fn }}"`. Every hole must exist in `renderVals()`. For interactivity (G1 expand, G2 (i), G10 point readout) add `constructor(props){ super(props); this.state={...}; }` and return handlers that call `this.setState`, and keep returning `mode`.
- Inline styles use the tokens (`var(--ink)`, `var(--card)`, `var(--action)`, `var(--r-m)`…). Don't hard-code hex in new markup; if you need a new color, tell the lead.
- The board height is the `height:` in the `.vsa` div's inline style. If content grows or shrinks, change it to fit with no dead space at the bottom, and report the new height.
- No emoji in new text (existing glyphs may stay). Sentence-case labels.

## Tools

- Render: `python3 /tmp/claude-0/c/es_work/tools/render.py <file> day,night,sun` → PNGs in `/tmp/claude-0/c/es_work/renders/` (`--all` renders every board). Look at your renders with the Read tool: never judge a board you haven't looked at.
- Check holes: `node /tmp/claude-0/c/es_work/tools/check.js <file>` (prints `ok`, or `MISSING x`; lines saying `MISSING true, false` are only hint placeholders and harmless; it can crash on boards whose handlers need a browser event, which is also harmless).
- Edit with the Read + Edit tools (Read a file before editing it) or a short Python script.
- Original, untouched copies are in `/tmp/claude-0/c/es_orig/` for comparison.

## Rules for every agent

- Only edit the files your role names. Never edit `canvas.json`, `SWARM_BRIEF.md` or `docs/`.
- Never publish, commit, push, or touch `/home/claude/vsa-app`.
- Return a report as your final message (see your role's prompt for its shape). Be specific: board, element, what changed, why.
