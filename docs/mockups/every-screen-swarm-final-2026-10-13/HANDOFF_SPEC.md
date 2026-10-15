# VSA Every Screen: handoff spec for Claude Code (one phase, no store build)

> **Status 2026-10-14:** what is built and what is not is in `docs/specs/phase-a-trust-2026-10-14.md` (gap table). Since this spec: the Ship done ring was replaced by a big percent over a bar; the clerk's text reader (board 2.3) was deleted; the Snapshot holds only the numbers and the ship (Now card, Needs a look and the needed rate moved to Decks, Plan and Hourly); What if has no typed Pace.

Written by the Site Manager, 2026-10-13; updated 2026-10-13 (late) for Colby's final design changes (section 9). If section 9 and an earlier section disagree, section 9 wins. Read-only review of the boards in `/tmp/claude-0/c/es_work/` and of `/home/claude/vsa-app` (CLAUDE.md, `src/app/screens/`, `view.ts`, `answer.ts`, `brief.ts`, `now.ts`, `engine/eta.ts`). Nothing in the repo was changed.

Boards win on layout and wording, the repo wins on rules. Where a board contradicts the engine, the engine rule stands and the board is wrong (section 0 lists the known ones).

## 0. Fix these in the boards (or build to the engine, not the board)

1. **2.1b forecast.** The board shows FORECAST 16:23, "15 min later". The engine rule gives **16:09, 1 min later**, which is also what the sample story says. Check: after the 14-15 save, rate = average of the last two hours with a known pace = (151 + 158) / 2 = 154.5/hr. Decks were saved 13:58 and the anchor is 15:00, so `carriedRemaining` removes 154.5 x 62 / 60 = 160 cars from 337, leaving 177. 177 / 154.5 = 68.7 min after 15:00 = 16:09. 16:23 comes from the field balance (213), the wrong ledger when decks exist. Build to the engine (`state.steady`) and expect 16:09 in the test. The "why it moved" line should read: "Pace 155/hr, was 158/hr. About 160 cars carried from the deck count of 13:58 (estimate)."
2. **Hourly notes (G5) are misleading.** 1.4 says "+27 from the short hour before" on 13-14 (151 vs 124), and "+32 from the safety-meeting hour" on 08-09. Raw counts across a short hour are not comparable. The paces are 165 then 151 (down 14/hr) and 180 then 182. Use `hourlyView` `deltaPaced` ("pace 151/hr, 14 below the 11-12 hour"), never a raw count difference across a short or safety-meeting hour. Plain wording is still the goal. The graph (1.5) already shows 151 as the lowest point, so the list must not say "+27".
3. **Stale decks look like a mismatch.** 2.1b says "Field is 124 over ship progress". The decks are 62 working minutes old. Say so ("Decks last saved 13:58; about 160 cars cleared since, estimate") and keep the plain gap sentence second. This is wording, not a new rule.
4. **Hero number age.** 1.1/1.2 show 337 at 15:04 with no age. The app already has `hero.estimate` ("About N left now (est.)") and the steady carry. Show "Decks as of 13:58" under Ship progress, and the estimate line when `nowEstimate` returns a number.

## 1. Board to file map (50 boards, including 2.1b, 1.2b, 1.4b, 1.4c and 3.1b; 4.4 Map was deleted)

Board names are the file stems. `Main.dc.html` is 1.1.

| Board | Screen file(s) in `src/app/screens/` | Notes |
|---|---|---|
| 1.1 Main (Snapshot, calm) | `Snapshot.tsx`, `SnapshotBoxes.tsx`, `ui.tsx` (Hero/Tile), `Chrome.tsx` (header, tab bar) | Tile grid is now: OFFICIAL Field count (with field meter), FORECAST Finish, "Ship done" ring tile, Pace (with sparkline and the H.A. line). See section 9. (i) on Vessel remaining, gap, Finish, Pace/H.A. |
| 1.2 Snapshot, something due | `Snapshot.tsx` (Now card), `SnapshotBoxes.tsx`, new `NeedsLook.tsx` | Same layout as 1.1 with the Now card on top and Needs a look at the bottom. Retire the strip/banner stack for working phase. |
| 1.3 Decks | `Decks.tsx`, `view.ts decksView` | DK4 status Paused, DK7 flagged, all 7 decks listed. |
| 1.4 Hourly list | `Hourly.tsx`, `view.ts hourlyView` | Same header strip as 1.5 (H.A., Pace, OFFICIAL). The Today card now ends with the Needed rate gauge (section 9.4). |
| 1.5 Hourly graph | `Hourly.tsx` (SvgPoint, brand table), `view.ts graph`, `brandTableOf` | Tappable points, readout card, Field / Cleared / In transit table. |
| 1.6 Plan top | `Plan.tsx` (Baseline, Shift, Confirm heights) | Peach Save shift, live Last cars. |
| 1.7 Plan lower | `Plan.tsx` (Open discrepancies, Backup, Break log, notes, H/H, Reports) | Resolve / Resolved / Reopen; Export full width. |
| 2.1 Log hourly | `LogSheet.tsx` | Peach Save hourly count. |
| 2.1b After Save | `AnswerCard.tsx` (becomes the sheet content), `answer.ts`, `LogSheet.tsx` | Replaces the dropped-in banner card with this view inside the Log sheet. |
| 2.2 typing | `LogSheet.tsx`, `FieldBox.tsx` | Tokens only. |
| 2.3 All hours / clerk's text | `LogSheet.tsx`, `clerkText.ts` | Tokens only. |
| 2.4 Break or end of shift | `LogSheet.tsx` | Peach main action only on the one primary of the section. |
| 2.5 Log deck | `LogSheet.tsx`, `DeckSheet.tsx` | DK4 status chip. |
| 2.6 H/H | `LogSheet.tsx` | 44 pt "Remove this marker". |
| 2.7 Issue | `LogSheet.tsx`, `Plan.tsx` | Saved issue appears in Needs a look and Plan. |
| 2.8 Photo | `LogSheet.tsx`, `EvidenceForm.tsx` | VIN never auto-corrected; unchanged. |
| 3.1 Deck sheet | `DeckSheet.tsx` | Peach Save deck update; add the answer (section 4.2). |
| 3.2 Deck photos | `DeckPhotoTypes.tsx` | 44 pt Select / Cancel selecting. |
| 3.3 Photo record / VIN scan | `EvidenceForm.tsx` | Tokens only. |
| 4.1 Ask | `Ask.tsx`, `AnswerCard.tsx`, `NotUseful.tsx` | 44 pt Not useful?. |
| 4.2 Ask my AI | `Ask.tsx`, `aiFiles.ts` | OFFICIAL on the field line, pace per engine. |
| 4.3 Search | `Search.tsx` | Tokens only. |
| 4.4 Map | `MapScreen.tsx` | No board. The sketch Map screen was deleted (Colby, 2026-10-13); the app's existing satellite map screen stays exactly as it is. |
| 5.1 Menu | `Sidebar.tsx` | Tokens only. |
| 5.2 Send update | `update.ts` + the Send-update sheet in `Snapshot`/`Chrome` | OFFICIAL wording and pace 176 come from the same view. |
| 5.3 Settings | `Settings.tsx` | Tokens only. |
| 5.4 Customize Snapshot | `CustomizeSnapshot.tsx`, `snapshotLayout.ts` | New BoxIds, see 3.5. |
| 5.5 Lessons & Insights | `Lessons.tsx` | Tokens only. Renamed from "Lessons from past ships" (menu row and sheet title). |
| 6.1 Finish history | `EtaHistory.tsx`, `etaHistory.ts` | Tappable points. |
| 6.2 Closeout | `CloseoutSheet.tsx`, `closeout.ts` (scorecard) | "Finished 4 min after the forecast", from `forecastError` signed minutes. |
| 6.3 Vessel complete | `CompleteSheet.tsx`, `complete.ts` | "Go fix it" opens the issue with Resolve. |
| 7.1 New vessel | `Vessels.tsx` (entry), `Setup.tsx` | Photo first; draft resume. |
| 7.2 Game plan read, 7.3 Paste text | `Setup.tsx`, `gamePlan.ts`, `ImportPhotos.tsx` | Tokens only. |
| 7.4 to 7.8 Steps 1, 3, 4, 5, 6 | `Setup.tsx` (`Nav` = Next / Save vessel) | One peach Next per step. |
| 7.9 Close this setup | `Setup.tsx` | Tokens only. |
| 8.1 Vans, 8.2 Van row, 8.3 Read the van sheet | `Vans.tsx` (`CreateSheet`, `EditSheet`, `MarkSheet`) | Peach main action each. |
| 8.4 Paperwork photos | `Vans.tsx` `PhotoSheet`, `ImportPhotos.tsx` | Tokens only. |
| 9.1 Break / end of shift | `ui.tsx` `BannerView`, `Snapshot.tsx`, `view.ts snapshot().banners` | Brand table at break reuses `brandTableOf`. |
| 9.2 First launch | `App.tsx` | Tokens only. |
| 9.3 Night | `palette.ts` `night`, same screens as 1.1 (with the ring, meter and sparkline) | The Night check. |

## 2. Tokens

Current `palette.ts`: `action` and `accent` are `#FF8A3D`, `onAction` navy. Changes:

| Token | Light | Night | Notes |
|---|---|---|---|
| `action` | `#FFD6A5` (peach) | `#FFD6A5` | The one main action per screen. Never a warning. `onAction` stays navy `#0E1A2B` (Night `#0A121D`); contrast about 12:1. |
| `actionEdge` (new) | `#14243B` navy, 1.5 to 2 pt border | none needed, or the same peach edge at Night's `line` | Day only: `.vsa:not(.night) .btn`. Peach on `#EEF1F4` is about 1.3:1 alone, so the edge carries the button in sun. |
| `accent` | Keep `#FF8A3D` only if still used as a non-action (hull `deckWarn`, `accent` on `head` pair); otherwise alias to `action`. | | `TEXT_PAIRS` has `['accent','head']`. |
| `onOrange` | `#FFFFFF` on `orange #B45309` (unchanged) | `#1C1100` on `#F5A524` | Night FORECAST chip text uses `onOrange` (8.6:1 per the lead). Confirm the chip fill is the Night `orange`. |
| `pace` (new) | board value (7.1:1 on card day) | board value (8.9:1 night) | Replaces `PACE_COLOR = color.oInk` in `theme.ts`. Add `['pace','card']` to `TEXT_PAIRS`. |
| `red` Night | needs a value | the boards use a lighter red for text on the Night card; today's `night.red #FF8585` already exists | The brief says "`--red` needs a Night value": the board's Night CSS defines one; copy it. Add `['red','card']` is already a pair, so the test covers it at 4.5:1; Night aims at 7:1. |
| `official` (new, optional) | black box `#0B1220`-style, white chip | outlined box | Field count tile. Prefer reusing `head`/`headInk` rather than a new token. |

**`tests/theme.test.ts` must change** (line 40 asserts `light.action === '#FF8A3D'`, and the test title says "hi-vis orange action"). Colby approved this on 2026-10-13. Replace with `#FFD6A5` and keep the 7:1 assertion on `onAction` / `action`. Also add: Night text pairs >= 7:1 for FORECAST chip (`onOrange` on `orange`) and Pace (`pace` on `card`); the `actionEdge` is present in Light. `sunLight` spreads `...light`, so it picks up peach: check its TEXT_PAIRS at 7:1 still pass (`onAction` on `action`).

Other global changes (every screen): radius 12 px `var(--r-m)` cards; the ship (hull) card corners are 10 / 10 / 12 / 24 px (top-left, top-right, bottom-right, bottom-left), no longer the 70 px bow curve; 44 pt tap minimum (`TAP` in `theme.ts`, header buttons, tab items, text links, hull rows 44); one header; sentence-case labels; peach button full width, 52 to 56 high.

## 3. Data each new element needs

Everything is a view-model output first; screens only lay it out (DOMAIN-BOUNDARY).

### 3.1 Now card (G1)
Today `nowLine()` returns `{tone, text, advice}` and `Snapshot.tsx` draws a strip. Add `action?: { label: string; kind: 'log-hour' | 'open-deck' | 'open-plan'; target: string }` to `NowLine` in `now.ts`.
- `due`: `{ label: 'Log 14-15', kind: 'log-hour', target: '14:00' }`. `LogSheet` already takes an hour; add an `initialHour` prop. Peach button.
- `warn` (paceWatch): the action is a navigation ("See DK4"), **not peach** (ghost/outline). Peach is never a warning.
- Calm stays null (silence). Keep `notUseful` ("Not useful?" at 44 pt).
- Remove the separate `v.banners` strips and the `openIssues` strip from the working phase; they move to Needs a look (3.3). Keep the break and shift-ended banners and the reconciliation banners (section 9.1).

### 3.2 Answer after Save (2.1b)
`answerAfterSave(before, after, b, nowMin, head)` already exists and is pinned by `answer.test.ts`. The board adds:
- **OFFICIAL field box**: `after.field` and "through 14-15" (last logged hour label from `periods.at(-1)`).
- **What changed rows** with denominators: H.A. `{value, was}` and the line "1,139 ÷ 7 counted hours" (`production.countedHours`); Pace and "1,139 ÷ 395 productive min" (`production.prodMin`); FORECAST finish with `d` ("1 min later") and `why`. Extend `Fig` with `{ sub: string; was: string | null }`, and keep `tag`.
- **Gap card**: field vs ship progress and when decks were saved ("Decks saved 13:58"). Needs `latestDeckSave: string | null` from `state.steady`/deck events (`deckSaves` is already computed for `steadyFinish`); expose its max as `s.deckAsOf` (time label) from the engine. If `s.steady.carry` is set, show the carry sentence (3.4) instead of a bare "field is N over".
- **Action**: peach "Update decks" only when `deckAsOf` is older than the last logged hour; otherwise no action and the quiet line ("Nothing needs your attention right now.").
- A short-hour save adds one line: "Short hour: 124 in 45 min is pace 165/hr, not a slow hour" (from `Period.pace`).

### 3.3 Needs a look (G3)
New `needsLook(s, b): { id; tone: 'red'|'orange'; title; sub; action: {label; go} }[]`, in `view.ts` (or a new `src/app/look.ts`), built from data that already exists:
- open discrepancies (`s.issues` status open, sorted by `openedAt`);
- hard low decks (`heightChip(d).tone === 'red'` and not complete): "DK4 · 1.80 m · low deck. Vans need 1.85 m." action "See DK4";
- unconfirmed heights (`heightChip` orange): grouped "2 deck heights unconfirmed", action "Confirm on Plan".
Order: red before orange, then oldest first. Empty list renders nothing (no header). It is not an alarm list: no counts of days, no animations.

### 3.4 (i) "How this is worked out" (G2)
`traces(s, b)` in `brief.ts` already has keys `remaining`, `gap`, `ha`, `pace`, `eta`, `transit`, `clearby`. Add a small `InfoTap` component (44 pt hit area, 20 px glyph) that opens one sheet showing `Trace.title` and `lines`. Map: Vessel remaining -> `remaining`; the "Field is N under ship progress" sentence -> `gap`; Pace tile (i), which now also carries H.A. -> `ha`; FORECAST finish -> `eta` (its second line already explains the carry). Only one modal at a time (vsa-field-ui). ROADMAP lists "About this taps" as "Not built": this closes it.

### 3.5 Resolved / Reopen (G6)
Today `resolveDiscrepancyEvents` writes `discrepancy_resolved`, and `engine/index.ts` has no reopen. Boards: "Resolved ✓ The log keeps it. Reopen". Needs a new event rule: reopening appends a `discrepancy_opened` (or a `discrepancy_reopened` event type) for the same issue id with a reason, never edits the old event (EVENTS-ARE-TRUTH). This touches `engine/events.ts` (`EventType` and the `EVENT_TYPES` list), `engine/index.ts` projection, `entries.ts`, and likely `replayEquivalence` hashes. **Decided (section 8): reuse `discrepancy_opened`** with the same id, `inputs: [issueId]` and a `reopened` flag, history preserved.

### 3.6 Brand table: Field / Cleared / In transit (G8)
`brandTableOf(s)` returns `{name, field, cleared, diff}`. Add `inTransit: string | null` (cleared - field when >= 0, else null and a separate `fieldOver` shown only as the gap) and keep the totals row "All". Rule: in transit = ship progress - field per brand and overall, never negative (a negative is the "field ahead" case: show "Field over by N", red only at a break or end of shift, which `brandTableOf` already does via `reconciling`). Add a one-line definition constant: "In transit: cleared from the ship, not in the field count yet." Brand `field` with `fieldExact === false` keeps the "≥" prefix (data honesty).

### 3.7 Needed-rate card (G9)
`requiredRate(remaining, from, target, schedule)` exists and is unused. Add to the snapshot view: `needed: { rate: number; vsPace: number; target: string } | null`.
- Inputs: remaining = `s.steady.remaining ?? s.vesselRemaining`; from = the forecast anchor (`s.eta.fromAbs`); target = Day 1 last-cars time (`SHIFT_END_STOP_MIN` applied to the planned shift end, i.e. 22:30) or the stop before the next break if the user set a target; schedule from `scheduleOf(b, s.plan, actual)`.
- Snapshot: show only when `needed.rate >= 0.9 x current pace` (named constant, to be approved) or the target is set; otherwise hidden (silence). Hourly (1.4): the Today card always shows it as a quiet gauge (section 9.4). Today 337 needs about 57/hr against pace 176.
- Label "Needed" (a calculation), big number "/hr", one line "to finish by 22:30"; never FORECAST. If `requiredRate` returns `rate: null`, show the reason ("No productive time left before the target").

### 3.8 Graph point readout (G10; 1.5, 6.1)
`graph(s)` points need the underlying hour: add to each point `{ label: '13:00-14:00', pace: number | null, count: string, minutes: number | null, short: boolean, note: string | null }` (`Period` has `start`, `min`, `pace`, `count`, `reason`). `SvgPoint` becomes a Pressable with a 44 pt hit circle; selected index in `Hourly.tsx` state; default selected = latest point. Readout text: "Pace 151/hr. 151 counted in 60 min worked." Short hours: "124 counted in 45 min worked." Fix F9 (the 151 point plotted at about 160): `y()` must use the same value as the label (`pace` when known).

### 3.9 2.1b forecast (rule)
No new engine rule. After save, `state.steady` is the displayed finish. Test with the Hera story (section 5). Do not recompute in the screen.

### 3.10 Other
- **OFFICIAL tile**: `s.field` and last logged hour label; same component on Snapshot, Hourly, 2.1b, 6.2, 9.1.
- **H.A. denominator**: `"${field} ÷ ${countedHours} counted hours"` (exists as `ha.notes[0]`); Pace: `"${prodCount} ÷ ${prodMin} productive min"`. `hourlyView.stats.paceNote` today reads "per productive hr": change to the division so Hourly agrees with Snapshot.
- **Plan top (G7)**: Last cars recomputed live when the side segmented control changes: pure function `lastCars(shiftEnd, side)` using `SHIFT_END_STOP_MIN`. Two days: "The forecast rolls into Day 2" from `plan.nextStart`. Save is peach, full width.
- **5.4 Customize Snapshot**: `BOXES` in `snapshotLayout.ts` has `hero, ship, field, eta, ha, brands, side, vessel`. New tiles do not need new ids: `field` becomes the OFFICIAL tile, `eta` the FORECAST tile, `ha` hosts Pace and H.A. together (the Pace tile with its H.A. line). Add `progress` (the "Ship done" ring tile; default on, sits beside `ha`), `needed` and `look` ids (default hidden/auto). `parseLayout` must accept old saved layouts (tests in `layout.test.ts`, `snapshotCustom.test.ts`). `PINNED` stays `['hero']`.
- **Closeout (6.2)**: "Finished 4 min after the forecast" from `forecastError({predicted, actual}).signedMin`: negative = early, positive = after. Say which way, never just "early". The forecast scored is the one made at 14:00 for the cars milestone.

## 4. Assistant moments (boards now exist for the first two)

1. **Pre-break nudge (warn Now card): board 1.2b `102b-Snapshot-break-coming`.** "Break in 30 min. Stop at 11:45." plus a ghost "See DK12" button (not peach: nothing to log). Sample numbers at 11:15: field 706 through 10-11, ship progress 760, in transit 54, remaining 592, ring 56%, H.A. 177 (706 / 4), pace 184 (706 / 230 productive min), FORECAST finish 15:25 (avg of last two known paces 175 and 199 = 187/hr; skips the 11:45 stop and the 12:00 break). These are sample numbers, not the Main story; the 12:00 break check later reconciles ship = field.
2. **Answer after a deck save: board 3.1b `301b-Deck-After-Save`.** DK12 160 -> 148 at 15:02 ("12 cleared since"); ship progress 1,027 (was 1,015), remaining 325, 76%; field 981 OFFICIAL, gap 46 shown as in transit; "DK9, DK7 and DK4 are still as of 13:58"; quiet line "Nothing needs your attention right now." A peach "Update decks" button only when decks are older than the last logged hour. Run `answerAfterSave`; reuse the 2.1b component.
3. **Needed-rate warn state: board 1.4b `104b-Needed-rate-short`.** Example numbers: needed 182 vs pace 151; 2 px orange outline, orange number and tick, line "Pace is 31/hr short of what the ship needs." Never peach, never FORECAST. The "Close:" state (needed < pace but >= 0.9 x pace) is board 1.4c `104c-Needed-rate-close`: needed 165 vs pace 176, same orange warning, line "Close: pace is only 11/hr above what the ship needs."
4. **End-of-shift reconciliation** reuses 9.1 with the Southside stop at 22:30; no new board.

## 5. Build order (one phase; `npm run verify:release` after each numbered step)

1. **Tokens and chrome.** `palette.ts` (peach, `actionEdge`, `pace`, Night values), `theme.ts` (`PACE_COLOR`), `tests/theme.test.ts` change, `ui.tsx` button (navy edge by day), `Chrome.tsx` (44 pt header buttons and tab items). Visual diff on every screen is limited to color and tap size.
2. **Engine and view data, tests first.** `deckAsOf`; `needsLook`; `needed`; brand `inTransit`; graph point readout fields; short-hour note rule; `NowLine.action`; reopen event rule (after Colby's choice). Pure files only.
3. **Shared components.** OFFICIAL tile, FORECAST tile, `InfoTap` + trace sheet, Needs a look, Needed card, `ReadoutCard`.
4. **Snapshot** (1.1, 1.2, 9.1, 9.3): Now card, tiles, Needs a look, remove strips.
5. **Log and After Save** (2.1, 2.1b, 2.4, 3.1): `LogSheet.initialHour`, answer view inside the sheet, deck answer.
6. **Hourly** (1.4, 1.5), **Decks** (1.3), **Plan** (1.6, 1.7).
7. **Closeout, Complete, finish history** (6.x), then **tokens-only boards** (sections 4, 5, 7, 8, 9.2).
8. `npm run verify:release`; update ROADMAP **Now** and the timeline in the same commit; move replaced specs to `docs/specs/superseded/`. No `eas build`.

## 6. Risks

- **theme.test and `sunLight`.** Changing `action` ripples to every pair test and `sunLight` (spreads `light`). Do step 1 alone and run tests before anything else.
- **Peach on light, in sun.** The navy edge carries it; on `sunLight` use a black 2 pt edge. Do not assume a phone check passes: the 45 percent glare render in `renders/*_sun.png` is the check.
- **Replay and replay hashes.** A reopen event changes the event vocabulary. `replayEquivalence` pins output byte-for-byte (refresh only with `UPDATE_REPLAY_HASHES=1` and a stated reason); `architecture.test.ts` guards storage and engine boundaries.
- **DOMAIN-BOUNDARY.** Screens may not do protocol math. Needed rate, in transit per brand, last cars, short-hour paces: all in `view.ts`/engine.
- **Two ledgers on one screen.** Field vs ship per brand and H&H "awareness only" must stay visibly separate; H&H never enters a brand table or the OFFICIAL total.
- **Dense Snapshot.** The due card plus tiles plus hull plus brands plus Needs a look is 1,992 px on the board. Verify scroll and tab-bar overlap on iPhone 16 Pro and with Larger Text (no mid-word wraps).
- **Sample data in the app.** The Hera numbers are mock data; do not copy them into the app. Tests build them from `tests/scenarios.ts`/`synthLog.ts`, never from real VIN or booking numbers.
- **Native.** No new native modules in this phase (verify `verify:native` stays green).

## 7. Tests to add (domain rules as tests)

New files or additions, `node:test`:
1. `answer.test.ts`: Hera story at 15:05 after saving 158: field 1,139, H.A. 163, Pace 173, FORECAST 16:09 and "1 min later" (not 16:23); `why` mentions the carry; `watch` empty; action "Update decks" present because decks are older than the last hour.
2. `needsLook.test.ts`: red before orange; closed issues excluded; empty returns `[]` (no header); a low deck and unconfirmed heights never use the same tone; Paused DK4 at 1.80 m is hard red.
3. `view.test.ts`: brand `inTransit` never negative; "≥" when `fieldExact` false; totals row equals overall in transit; at a break a field-ahead brand is red, ship-ahead orange, match green.
4. `needed.test.ts`: hidden when needed < 0.9 x pace (the 337-left sample); shown with label Needed when above; `rate: null` shows a reason; never labeled FORECAST; uses the schedule (breaks, clear-by, shift-end stop).
5. `hourly.test.ts`: a pre-break short hour is never described as "down" because its count is lower; the delta after a short or safety-meeting hour is by pace; "Corrected: was 190, now 199. Original kept." from `x.was`.
6. `now.test.ts`: due card action targets the latest unlogged ended hour; warn card action is not the primary (peach) kind; calm returns null.
7. `graph.test.ts`: every point's y matches its labeled value (F9); each point exposes a readout; short hours labeled with minutes worked.
8. `theme.test.ts`: peach `#FFD6A5` with `onAction` >= 7:1; Night FORECAST chip and Pace >= 7:1; `sunLight` text pairs still >= 7:1.
9. `closeout.test.ts`: forecast-vs-actual wording states the direction ("N min after the forecast") for signed minutes both ways.
10. `events`/`store.test.ts`: reopen appends and never rewrites the resolved event; history lists both.
11. `plan.test.ts`: Last cars follows the side (Northside 15, Southside 30), applied once; two-day mode states the forecast rolls into Day 2.
12. `tapTargets` check (source scan, like `native.test.ts`): header buttons, tab items and text-link components use `TAP` (44).

## 9. Final design changes (Colby, 2026-10-13 late; these override earlier sections)

Source of truth is the live VSA Every Screen artifact (version 22 or later). Boards are in `docs/mockups/every-screen-swarm-final-2026-10-13/boards.tgz`.

### 9.1 Snapshot tile grid (1.1, 1.2, 9.3)
Row 1: OFFICIAL Field count, FORECAST Finish. Row 2: "Ship done" ring tile, Pace tile. The Vessel remaining card is just the number and "autos left of 1,352" (no progress bar, no percent: the ring carries it).
- **Ring tile ("Ship done")**: ring filled to `percentComplete` (confirmed vessel progress / starting autos, shown rounded, "75%" centered), caption "1,015 of 1,352". Arc color `blue`, track `soft`, round cap, starts at 12 o'clock. It replaces the old H.A. tile position. Pure view value: `percentComplete` and `progressLabel` from `view.ts`; the ring component only draws. `aria-label` = "75% done, 1,015 of 1,352".
- **Field meter (inside the OFFICIAL tile)**: one bar scaled to starting autos, segments: field (solid `fill`), in transit (hatched), the rest empty (`track`). Caption "Field 981 · In transit 34 · Ship 337" ("Ship" = vessel remaining). The three values must add up to starting autos (1,352); test it. If field is greater than ship progress (the mismatch case) there is no in transit segment: show the field segment and the mismatch line instead, never a negative.
- **Pace tile**: Pace number, then a sparkline of pace per counted hour (every hour that has a known pace, oldest to newest, up to the last 6; short and safety-meeting hours use their productive-minute pace), a dashed reference line at the current pace value, a dot on the latest hour, then "per productive hour", then the H.A. line: "H.A. 164 /hr" and "981 ÷ 6 counted hours" under it (denominator always shown). The (i) button sits on this tile and opens the `ha` trace (covers both H.A. and Pace).
- All sparkline values come from `hourlyView` periods (`Period.pace`). The screen draws them; no pace math in the component. Add `paceSeries: { label; pace }[]` to the snapshot view.

### 9.2 H.A. moved
H.A. is no longer its own tile on Snapshot. It stays its own tile on Hourly 1.4 and 1.5 (unchanged). Customize Snapshot (5.4): `ha` = Pace tile with the H.A. line, `progress` = the ring tile.

### 9.3 Removed and renamed
- 4.4 Map: the sketch Map screen is deleted. Keep the app's existing satellite map screen exactly as is; the header Map button opens it. Do not restyle it.
- "Lessons from past ships" is now "Lessons & Insights" (menu row, sheet title, board title).

### 9.4 Needed rate gauge (Hourly 1.4)
In the Today card, below the day strip: "Needed rate" title with a CALCULATED tag, big number "57" with "/hr to make last cars 22:30", then a bar: purple bar = current pace, a black tick = needed rate, labels "Needed 57" (above the tick) and "Pace 176" (below the bar end). Scale 0 to max(pace, needed) rounded up to the next 20 (the board uses 200 for 176 and 57); one scale for both marks. A line under it, e.g. "Comfortable: pace is about 3x what the ship needs." (the 1.5x cutoff for this wording is a suggestion, not decided).
- **Warn state** (needed >= 0.9 x pace): the card gets a 2 px `orange` outline and the number turns `orange`; the tick turns `orange`; line: "Pace is N/hr short of what the ship needs." (needed - pace, only when positive; if needed < pace but >= 0.9 x pace, "Close: pace is only N/hr above what the ship needs."). No peach (peach is never a warning). Never labeled FORECAST.
- Needed = remaining / active hours to the target (breaks and clear-by out), from `requiredRate`; `rate: null` shows the reason instead of a number.

### 9.5 New tests for section 9
1. Meter: field + inTransit + remaining equals starting autos; no negative segment; mismatch case drops the in transit segment.
2. Ring: percent equals confirmed progress / starting, rounded once; arc length matches.
3. `paceSeries`: values match `hourlyView` periods (same numbers as the graph); short hours use productive-minute pace.
4. Gauge: shared scale for pace and needed; warn state at >= 0.9 x pace; no FORECAST label.

## 8. Decisions (Colby, 2026-10-13 23:40: "use your recommendation" on all four)

1. **Reopen a resolved discrepancy: DECIDED.** Reuse `discrepancy_opened` for the same issue id, with `inputs: [issueId]` and a `reopened` flag. No new event type. History is preserved; the resolved event is never rewritten.
2. **Needed-rate gauge: DECIDED.** Always shown as a quiet gauge on Hourly 1.4. On Snapshot it shows only when needed >= 0.9 x current pace (named constant) or a target is set. Never peach, never FORECAST.
3. **Lessons & Insights sample: DECIDED.** Board now shows "1 finished ship": H.A. 172/hr with "1,511 ÷ 8.8 counted hours", Pace 178/hr, and the note that TEST ships are not counted. Sample numbers only; the app computes them from real finished ships.
4. **Sample story: DECIDED.** Keep as is: the 11:45 stop is Northside (15 min) and Day 1 ends Southside (30 min). The story mixes sides on purpose.
5. The `theme.test.ts` change to peach is approved (2026-10-13).

No open questions remain in this spec.
