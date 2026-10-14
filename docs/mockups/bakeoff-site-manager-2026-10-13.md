> **Key:** Design X = VSA Every Screen. Design Y = group C (VSA Explore). The judges did not know which was which.
> **Correction (Claude, after the review):** the report says X's night renders were identical to its day renders. That was a rendering error on my side, not a flaw in X; X's night look renders correctly now. The judges' night contrast figures came from X's color values, and I re-checked them: the night FORECAST chip (white on amber, 2.15:1) and the purple Pace (2.89:1) do fail.

I couldn't write `/tmp/claude-0/c/bake/report_site_manager.md`: the file write was refused because subagents must return reports as text. The full report follows the summary below; please save it to that path if you need the file.

## Summary (~250 words)

**Recommendation:** build from Design X and graft in Y's assistant behaviors. **Confidence:** medium-high. It is high on X as the base, but on assistant behavior alone the two are close: Y scores 24, X scores 23.

**Three biggest reasons:**
1. **Buildability.** X's CSS tokens match `src/app/palette.ts` value for value (Light, Night, and an Extra-visible mode like `sunLight`). Its hull, segment controls, List/Graph and Not useful? already exist in the app, so the cost is small and fits one phase and one EAS build. Y needs `expo-blur` and `expo-linear-gradient` (neither installed, both native), a new visual system across about 28 screen files (only 7 are designed), and has no tokens. Its translucent glass also breaks the solid-color contrast tests in `tests/theme.test.ts`.
2. **Field fit.** The main use is daytime in direct sun. X follows CLAUDE.md's light hi-vis day theme plus Night. Y is dark and translucent only, and its day look doesn't exist yet.
3. **Y's real advantage is behavior, not skin**, and those behaviors transfer cheaply to X.

**Top ideas to graft from Y:**
1. A Now card with its own peach **Log 14–15** button, carrying X's step-ahead content ("DK4 won't clear by the 17:30 stop").
2. An (i) on each number that explains how it was worked out, using the existing `traces()`.
3. A "Needs a look" list at the bottom of the Snapshot.
4. OFFICIAL field and FORECAST finish tiles side by side; H.A. with its denominator beside Pace.
5. Plain-language hourly notes.
6. Resolved ✓ / Reopen on discrepancies.

**Fixes X needs before handoff:** its Pace shows 171, but its own rows give 176. DK4 is "Not started" yet 25 cars are gone. X's night renders are identical to its day renders, so its Night look was never actually rendered.

**Decisions for Colby:**
1. Keep the light day theme plus Night: yes.
2. Peach main action: yes, with a navy edge on light backgrounds.
3. Keep the full Snapshot when something is due, rather than X's stripped-down view: yes.
4. One phase, one store build: yes.

---

# Site manager report: Design X vs Design Y

## Recommendation

**Build from Design X, and graft in Y's assistant behaviors.** Confidence: **medium-high**. It is high on X as the base. It is medium on the overall verdict, because on assistant behavior alone the two are close (Y is slightly ahead).

The case for Y is how it behaves, not how it looks. Its Now card has a button. It explains its own numbers. It keeps a "Needs a look" list, and a resolved item can be reopened. It writes in plain words. None of these needs glass or a dark theme, and each one transfers cheaply to X. The case against Y as the base is the job site: it is dark only, while the main use is in direct sun. It has no tokens or day theme. It needs two new native libraries and a new visual system across about 28 screen files, and only 7 of those screens are designed.

| | Design X | Design Y | Winner |
|---|---|---|---|
| Assistant score (7 screens, sum of 1–5) | 23 | 24 | Y, narrowly (close) |
| Snapshot "Now" moment | Better content: break margin, "DK4 won't clear by the 17:30 stop" | Better shape: a card with its own **Log 14–15** button; the screen doesn't reshape | Y on shape, X on content. Combine them. |
| Buildability in the real app | 5. Tokens match `src/app/palette.ts` value for value | 2. New visual system, `expo-blur` and `expo-linear-gradient`, contrast tests break | **X** |
| Field fit (day sun first, night second) | 4. Light day theme plus Night plus an Extra-visible mode | 2. Dark and translucent only; the day look doesn't exist | **X** |
| Handoff readiness | 4. Token sheet, Night and Extra-visible modes, tap-target overlay | 2. Hard-coded hex, no tokens, no day, two different headers | **X** |
| Numbers agree with each other | 3. Pace 171 contradicts its own rows (176); DK4 contradiction | 4. Every sum checks; one graph mislabel | Y |

Per-screen winners, from the assistant angle: 1.1 X · 1.2 Y · 1.3 X (narrow) · 1.4 Y · 1.5 tie · 1.6 Y · 1.7 tie.

## 1. Assistant score

Each screen was tested against Colby's philosophy:
- Does it speak first?
- Does it give back more than it takes?
- Does it hold the list of what's left?
- Does it ask only about doubt?
- Does it stay quiet when all is well?
- Does it make the complex simple?

| Screen | X | Y | Winner | Why |
|---|---|---|---|---|
| 1.1 Snapshot, calm | **4** | 3 | X | **X**'s hero answers four of the five questions people ask Colby on one card: how many are left (337), when we finish (16:08 FORECAST), whether we make the break ("82 min before break"), and whether the counts square ("Field is 34 under ship progress"). The field count sits in its own boxed **OFFICIAL RECORD** row. Weaknesses: H.A. stands alone with no denominator and no Pace, and the brand list adds length.<br>**Y** puts the OFFICIAL field tile and the FORECAST tile side by side, and that reads very well. H.A. shows its denominator ("981 ÷ 6 counted hours"), Pace sits next to it, and the (i) on Vessel remaining expands to "Starting 1,352 − confirmed deck progress 1,160 = 192. Field count is not part of this sum." But Y never shows ship progress or the gap on the Snapshot, so "do the counts square?" and the required "Field is N under ship progress" line are missing. The 86% ring repeats a number already given. "Before the 17:30 stop" is more precise than X's "before break", but it gives no margin. |
| 1.2 Snapshot, something due | 3 | **4** | Y | **Y**'s Now card ("The 14–15 count is due · Log it while it is fresh") holds the **Log 14–15** action itself. This is the best single assistant element in either design: the right hour, one tap, nothing to look for. The rest of the Snapshot stays where it was (same place, same tap). "Needs a look" at the bottom keeps the list (the count mismatch, then "DK4 not started: 55 autos, low deck").<br>**X** has the more step-ahead sentence: "DK4 won't clear by the 17:30 stop at this pace". It also has "Not useful?", which feeds the no loop. But the Now bar itself can't be tapped. Three attention items are stacked in three styles: an orange strip, a navy bar, and a peach warning. The peach warning reuses the action color. And when something is due, the Snapshot drops the OFFICIAL field count, the ship and H.A. That is a layout change at the exact moment he needs the habit. |
| 1.3 Decks | **4** | 3 | X (narrow) | **X** keeps the list. "2 deck heights unconfirmed → Confirm on Plan" routes the doubt to where it gets fixed. The low-deck banner shows how many autos are still aboard, and each row carries hatch chips, the photo count and "Cleared: 11:42".<br>**Y** is plainer and very legible ("65 left of 433" set big), and its height notes are consistent (DK9 and DK7 both "Height not confirmed"). But hatches show only on the selected deck, and nothing routes him to confirm.<br>X has two inconsistencies to fix: DK4 is "Not started" yet shows 30 of 55 left, and "2 deck heights unconfirmed" flags only DK9 on screen. |
| 1.4 Hourly, list | 3 | **4** | Y | **Y** turns the needed rate into a large number ("you need **28** cars per hour · 192 left, 7.0 working hours") and adds an OFFICIAL field tile. Its row notes are written the way Colby would say them: "+27 from the short hour before", "H/H started 09:20 (awareness only)", "Corrected: was 190, now 199. Original kept."<br>**X**'s "Today" strip (logged, short hour, break, due-now outline) is the best hold-the-list element on this tab. But X's Pace of **171** contradicts its own rows: 981 ÷ 335 productive min gives 176, which is the figure Y shows. X's "+27 (+21.8%)" also compares against a short hour with no caveat.<br>Both designs show a needed rate (28 or 49/hr) six times below the current pace. That is noise, not an answer. |
| 1.5 Hourly, graph | 3 | 3 | Tie | **Y** has a three-column brand table (Field / Cleared / In transit), a plain definition of in transit, and a tap-a-point readout. However, its graph is titled "Cars counted each hour" while it plots pace (07 shows 180, but 150 were counted). That is the kind of number that costs trust.<br>**X** has the more honest title ("Hourly pace") and the know-the-norms line "at break: must match". Its brand rows are less scannable. |
| 1.6 Plan, top | 3 | **4** | Y | The content is identical. **Y** gives Save the one soft-peach full-width slot. "Last cars" recomputes when the side changes (22:30 / 22:45). "Two days" says "Day 2 start: not set yet. The forecast rolls into Day 2." Confirm becomes "Confirmed ✓".<br>**X** is static, and its Save is only outlined. |
| 1.7 Plan, lower | 3 | 3 | Tie | The content is identical, and both show "Not backed up · 44 entries" with a peach Export. **Y**'s Mark resolved → "Resolved ✓ The log keeps it. Reopen" is worth taking. Neither design moves this admin screen toward an assistant. |

**The Snapshot "Now" moment.** Y has the better container: a card that speaks, acts and collapses, on top of a layout that never moves. X has the better words: a break margin while calm, and "DK4 won't clear by the 17:30 stop at this pace" when it matters. Neither designs the calm Now state ("Nothing needs your attention", or ahead/behind mid-morning), nor finish today vs Day 2. The app's `src/app/now.ts` already produces warn, due and calm. Y's card with an action, filled with X's content, is the right Now card.

## 2. Buildability in the real app

What exists today (read only; nothing changed):
- `src/app/palette.ts` (Light, Night and `sunLight` Extra visible, with a WCAG contrast test in `tests/theme.test.ts`)
- `SnapshotBoxes.tsx`: the hero, the ship hull with H4→H1 hatch bands, and half-width boxes (the `half` prop)
- `now.ts`: the Now line with warn, due and calm, plus driver advice
- `NotUseful.tsx`, the `Seg` controls, Hourly's List/Graph, and Decks' "All decks / Decks remaining"
- `brief.ts` `traces()`: the why trace for remaining, transit, H.A., pace, gap, clear-by and ETA
- `whatif.ts` (`canClear`, `paceWatch`)
- the engine's `requiredRate()` in `src/engine/eta.ts`

**Design X maps almost one to one.** Its CSS tokens are the app's palette values: bg `#EEF1F4`, ink `#0E1A2B`, the Night set, and an `xv` mode that matches `sunLight`. The hull's corner radii (10/10/70/18) and the segment labels are the same as the app's. Cost: **small**. It is mostly view-model string fixes and layout edits. The only token change is the action color, from hi-vis orange `#FF8A3D` to peach `#FFD6A5`; `tests/theme.test.ts` pins the orange, so Colby has to approve the change.

X still needs a little new data:
- the "Today" strip (data is in `hourOptions()` plus breaks and short hours; small)
- the needed-rate line: `requiredRate()` exists in the engine but is not wired into any screen yet (small to medium, with a test)
- "82 min before break": already `snapshot().strip.finish` ("N min to spare (est.)")

**Design Y needs a new visual system.**
- Backdrop blur on every card and the floating tab bar, plus a gradient wallpaper. Neither `expo-blur` nor `expo-linear-gradient` is installed. Both are native, so they mean a `verify:native` change and a store build. Many blurred cards in a scrolling list is also the costliest thing to render on iOS.
- The contrast test assumes solid `#RRGGBB` token pairs. Translucent `rgba` glass makes contrast depend on whatever is behind the card, so the 4.5:1 and 7:1 tests can no longer prove sun readability.
- The ring and the animated bars are easy (`react-native-svg` is already installed).
- It switches fonts to SF Pro, and uses 24–28 pt card corners. Colby asked for corners "not too rounded"; X uses 12.
- It has no tokens at all (hard-coded hex inline in every file).
- Its header differs between 1.1/1.2 ("‹ Vessels", big title) and 1.3–1.7 (hamburger plus pill).
- The 7 designed screens cover a fraction of the app's 28 screen files. Setup, Log, the deck sheet, Closeout, Settings, Vans, Map, Ask, Lessons and every banner and reconciliation state would have to be invented to match.

Cost: **large**. It is a re-skin of the whole app plus a day theme that doesn't exist yet. Both designs show values the view model already has, so the data cost is about the same. The difference is almost entirely visual-system cost.

**Phase and quota discipline.** X plus the grafts fits in one phase, one spec and one EAS build. Y as the base is at least two phases (a dark re-skin, then a day variant) and at least two store builds, with native dependencies to check in each Xcode log.

## 3. Field fit as a product

The main use is daytime in direct sun. CLAUDE.md's rule is a light hi-vis daytime theme plus a Night mode at 7:1.
- **X follows that rule** and adds an Extra-visible mode. In the washed "sun" renders, X's dark-on-light type keeps its shape. What fades is light text: the green "82 min before break", the peach tab label, and the peach Export on a white card. The peach main action on a light background needs a 1.5–2 pt navy edge to hold up in glare.
- **Y is dark only, with translucent cards.** On a real phone in sun, screen reflections lift a dark background toward grey. That is exactly the failure the washed renders show: Y's light-blue numbers, the pink "DK4" and the green "Before the 17:30 stop" lose contrast. Glass makes it worse.
- **Y's day variant is the biggest unknown.** It would be a third design that no one has judged in sun. "Light glass" over a gradient (the `.glassL` class already in Y's CSS) is a weak fit for a terminal at noon.
- Y would also require changing a written CLAUDE.md rule, which is Colby's call.

Choosing Y means betting the main use case on a look that doesn't exist yet.

Note: X's `_night` renders are byte-identical to its `_day` renders (same checksum), so X's Night look was not actually rendered for this bake-off. Its Night tokens exist in the source and mirror the app's Night palette, which Colby phone-checked in build #26, so the risk is low but not zero.

## 4. Handoff readiness

**X is closer to a system Claude Code can rebuild from.**
- What X has:
  - a token sheet (color, type scale, radii, border widths)
  - Night and Extra-visible variants, plus a tap-target overlay
  - one consistent header and tab bar across all 7 screens
- What X is missing:
  - interactive states (no scripts: Details ▾, pressed, expanded, resolved)
  - unknown, break-reconciliation, Day 2 and first-car states (the app's view model already has these banners, so they carry over)
  - an actual Night render
- What X must fix:
  - Pace 171 → 176
  - the DK4 "Not started" contradiction and the unconfirmed-heights count
  - "before break" → "before the 17:30 stop"
  - the 1.2 Snapshot reshaping when something is due

**Y has better-specified behavior but no system.**
- What Y has:
  - toggles and states in its scripts: the (i) trace, the expanding Now card and discrepancy, the tap-to-select deck, the graph point readout, Two days, confirm, resolve/reopen
  - `aria` labels and a reduced-motion rule
- What Y is missing:
  - tokens
  - a day theme
  - one header
  - the "Field is N under ship progress" line
  - the other ~21 screens
- What Y would remove: about 18 keyframe animations ship in every file, including falling confetti and a sailing ship.

## Ideas from Y worth adopting (ranked)

1. **A Now card that acts.** "The 14–15 count is due" holds a full-width peach **Log 14–15** that opens the Log on that hour. For a warning, use "DK4 won't clear by the 17:30 stop → See DK4". The rest of the Snapshot never reshapes. *Where:* `Snapshot.tsx`, plus an `action` field on `NowLine` in `now.ts`. **Small.**
2. **(i) "How this is worked out"** on Vessel remaining, the gap, H.A. and the ETA, inline on the screen, using the existing `traces()`. ROADMAP lists "About this taps on screens for the why traces" as not built, so this ticks the Phase 7d target. *Where:* hero and tiles (the `InfoNote` component exists). **Small.**
3. **"Needs a look" list** at the bottom of the Snapshot. It replaces the stacked strips: open discrepancies, low decks and unconfirmed heights in one quiet list, each opening where it gets fixed. **Small to medium.**
4. **OFFICIAL field tile beside the FORECAST finish tile**, with "through 13–14" so he can see how fresh the count is. Also H.A. with its denominator beside Pace as two half tiles. *Where:* `SnapshotBoxes.tsx` (the `half` prop exists). **Small.**
5. **Plain-language hourly notes**: "+27 from the short hour before", "Corrected: was 190, now 199. Original kept.", "H/H started 09:20 (awareness only)". *Where:* `hourlyView()` strings, with tests. **Small.**
6. **Resolve → "Resolved ✓ The log keeps it. Reopen"** on Plan discrepancies. **Small.**
7. **Plan, top:** a peach Save as the one main action, "Last cars" recomputed live when the side changes, and the Two-days line "The forecast rolls into Day 2". **Small.**
8. **Brand table** with Field / Cleared / In transit columns, plus a one-line definition of in transit. **Small.**
9. **Needed rate as a big number**, but only when it is at or above the current pace, or a target time has been set. Otherwise stay quiet. *Where:* wire the engine's `requiredRate()` into the view. **Small to medium.**
10. **Tap a graph point for its readout.** **Medium.**

**Do not adopt:** glass or blur, the gradient wallpaper, 24–28 pt corners, the progress ring (it repeats the %), grow-in animations, the SF Pro font switch, or Y's two different headers.

## Decisions only Colby can make

1. **The day look.** Keep CLAUDE.md's rule (light hi-vis by day plus Night) and build from X, or change the rule and wait for a day version of Y that doesn't exist yet. *Recommended default:* keep the rule and build from X.
2. **The main-action color.** Soft peach `#FFD6A5` (his stated preference) replaces hi-vis orange `#FF8A3D`, which the theme test pins as the Design B pick. *Recommended default:* peach, with a 1.5–2 pt navy edge whenever it sits on a light background, so it holds up in sun.
3. **The Snapshot when something is due.** Keep the full Snapshot with the Now card on top (Y), or switch to X's reduced focus view. *Recommended default:* keep the full Snapshot. Same place, same tap; the field count never disappears.
4. **The build plan.** Run this as one phase with one spec, one approval and one EAS store build after `verify:release`. *Recommended default:* yes. Grafts 1–8 go in that build; 9–10 can wait.