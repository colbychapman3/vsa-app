> **Key:** Design X = VSA Every Screen. Design Y = group C (VSA Explore). The judges did not know which was which.
> **Correction (Claude, after the review):** the report says X's night renders were identical to its day renders. That was a rendering error on my side, not a flaw in X; X's night look renders correctly now. The judges' night contrast figures came from X's color values, and I re-checked them: the night FORECAST chip (white on amber, 2.15:1) and the purple Pace (2.89:1) do fail.

# Supervisor report: is each screen right?

Judge: Supervisor. Read-only review of `r/` renders (all 35 opened) and `src/X|Y/*.dc.html`.
Scale: 1 = broken, 3 = usable with clear faults, 5 = right.

## Summary scores

Key: R = rule compliance, S = sun readability, C = clarity in 3 s, G = glove use, K = consistency.

| Screen | X R | X S | X C | X G | X K | **X** | Y R | Y S | Y C | Y G | Y K | **Y** | Winner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 Snapshot, calm | 3 | 4 | 4 | 2 | 4 | 17 | 3 | 2 | 4 | 4 | 3 | 16 | **X** (narrow) |
| 1.2 Snapshot, due | 1 | 4 | 2 | 2 | 2 | 11 | 3 | 2 | 4 | 5 | 3 | 17 | **Y** (clear) |
| 1.3 Decks | 3 | 4 | 4 | 3 | 3 | 17 | 3 | 2 | 4 | 4 | 3 | 16 | **X** (narrow) |
| 1.4 Hourly, list | 2 | 4 | 3 | 2 | 3 | 14 | 4 | 2 | 4 | 4 | 4 | 18 | **Y** |
| 1.5 Hourly, graph | 3 | 4 | 4 | 3 | 3 | 17 | 4 | 2 | 4 | 4 | 4 | 18 | **Y** (narrow) |
| 1.6 Plan, top | 4 | 4 | 4 | 4 | 3 | 19 | 4 | 2 | 4 | 5 | 4 | 19 | **Y** (narrow) |
| 1.7 Plan, lower | 4 | 4 | 4 | 4 | 4 | 20 | 4 | 2 | 4 | 5 | 4 | 19 | **tie** |
| **Total** | 20 | 28 | 25 | 20 | 22 | **115** | 25 | 14 | 28 | 31 | 25 | **123** | **Y, medium-low confidence** |

The designs are close. Y's screens follow the rules more often, keep their numbers consistent, and are built for gloves. X is the only design you can read in the sun today, and it has the stronger low-deck warning. Y's lead depends completely on a light day variant that does not exist yet.

---

## Method notes (read before the scores)

- **The X night renders are byte-identical to the X day renders** (md5 matches for all 7 pairs). The night mode was never rendered, so I judged X Night only from its CSS tokens (`.vsa.night`). Nobody has looked at it.
- **Contrast.** I wrote a WCAG 2.x helper (`relative luminance`, `(L1+.05)/(L2+.05)`). For the sun I used the brief's stand-in: both colors washed 45% toward white (`c + .45·(255−c)`). Under that wash, even pure black on white only reaches 4.74:1, so read the sun numbers relative to each other. They are not absolute pass/fail.
- **Y glass.** Y's `.gc` cards are translucent white (8–17%) over a blurred gradient. I did not trust a theoretical estimate, so I **sampled the rendered pixels** behind the cards. The lightest card backdrop is `rgb(46,76,124)` (1.7 "Open items", 1.1 top-right glow), the darkest is `rgb(15,33,68)` (1.1 ship card), and the nav bar is `rgb(6,19,43)`. In the sun renders the same spots read `rgb(140,156,182)` and `rgb(123,132,152)`. A pure-token worst case (full glow plus 17% white, `rgb(90,126,185)`) gives much lower ratios: labels 2.74:1, white numbers 4.10:1. Because of that, **Y's contrast depends on the wallpaper. It is not fixed by the design.**
- **Tap sizes** come from the source CSS. Where the source gives no height, I estimated padding + line-height and checked the render: X's Ask button measures about 37 px tall in `X_1.1_day.png`.

### Contrast table (key pairs)

**X, day (light theme)**

| Pair | Size | Day | Sun sim |
|---|---|---|---|
| Main numbers `#0E1A2B` / card `#FFF` | 96 px | 17.5 | 3.94 (large: pass) |
| Field 981 `#0E1A2B` / `#F4F6F8` | 48 px | 16.1 | 3.77 (large: pass) |
| Labels `--muted #3A4B60` / card | 13–17 px | 8.9 | **2.78** |
| "OFFICIAL RECORD" `#3A4B60` / `#F4F6F8` | 13 px 800 | 8.2 | **2.66** |
| FORECAST chip `#FFF` / `#B45309` | 13–15 px 700 | 5.0 | **2.29** |
| LIVE chip `#FFF` / `#15803D` | 13 px | 5.0 | **2.27** |
| Tab labels `#C9D6EA` / `#14243B` | 13 px | 10.6 | **2.95** |
| Low-deck banner `#7F1D1D` / `#FEE2E2` | 15/13 px | 8.2 | **2.83** |
| Unconfirmed chip `#7C2D12` / `#FFF4EB` | 13 px | 8.7 | **2.85** |
| H.A. `#1D4ED8` / card | 40 px | 6.7 | **2.61** |
| Pace `#7C3AED` / card | 40 px | 5.7 | **2.47** |
| Hull "✓ clear" `#A9BAD1` / `#14243B` | 13 px | 7.9 | **2.55** |
| Deck fill `#3D7BFF` vs track `#24375A` (non-text) | bar | 3.1 | **1.57** |

X also has an "extra visible" token set (`.xv`: ink `#000`, muted `#1F2B38`, 15 px labels, 2 px borders). In the sun sim that gives 4.74 for numbers and 3.48 for labels, the best sun figures in either design. No render shows it.

**X, Night tokens (7:1 aim; not rendered)**

| Pair | Ratio |
|---|---|
| Ink `#E8EEF5` / card `#13202F` | 14.1 ✓ |
| Muted `#B5C4D8` / card | 9.3 ✓ |
| Tabs `#B5C4D8` / `#060D17` | 11.0 ✓ |
| Low deck `#FFB4B4` / `#3A1515` | 9.6 ✓ |
| **FORECAST chip `#FFF` / night `--orange #F59E0B`** | **2.15 ✗ (fails AA as well as 7:1)** |
| **Pace `#7C3AED` (hard-coded) / night card** | **2.89 ✗** |
| LIVE `#FFF` / `#15803D` (not themed) | 5.0 (below 7:1) |

**Y (dark only), measured against rendered backdrops: lightest card / darkest card | sun sim**

| Pair | Size | Night | Sun sim |
|---|---|---|---|
| White numbers / deck counts | 46–80 px | 8.6 / 15.9 | **2.78** / 3.75 |
| Labels `#C9D4E6` | 14–17 px | 5.75 / 10.6 | **2.24 / 3.02** |
| Field 981 `#FFF` / `#000` tile | 52 px | 21.0 | 4.74 (best in Y) |
| OFFICIAL chip `#000` / `#FFF` | 13 px 800 | 21.0 | 4.74 |
| FORECAST chip `#FFF` / `#5856D6` | 13 px 800 | 5.65 | **2.36** |
| Finish `#C9C8FF` | 52 px | 5.40 / 9.98 | **2.18** |
| "Before the 17:30 stop" `#7FE0A0` | 15 px 700 | 5.36 | **2.14** |
| H.A. `#9CC2FF` | 46 px | 4.74 | **2.02** |
| Low deck `#FFC9C4` | 16 px 700 | 5.90 | **2.26** |
| Height not confirmed `#FFE3A8` | 16 px 700 | 6.88 | **2.47** |
| Short hour `#FFC98A` | 16 px 700 | 5.72 | **2.22** |
| LIVE `#05230F` / `#34C759` | 12 px 800 | 7.54 | **2.45** |
| Tab labels `#C9D4E6` / nav | 13 px | 12.4 | 3.33 |
| Peach button `#3A2410` / `#FFD6A5` | 18 px 800 | 10.7 | 2.95 |

Verdict on contrast: at night, Y passes AA everywhere on its rendered backdrops, but colored text on the lighter cards (Finish, H.A., the warnings) sits at 4.7–6.9, under the 7:1 Night aim. In the sun sim Y's ordinary text falls to about 2.0–3.0. X keeps its main numbers above 3:1 (large) and its body text near 2.6–2.9. **Neither design's small text survives the sun sim. X degrades much less, and X is the only one with a light hi-vis day theme, which CLAUDE.md requires today.**

---

## Screen by screen

### 1.1 Snapshot, calm

**X**: R 3 · S 4 · C 4 · G 2 · K 4
- Done well: big 337 with "of 1,352 autos · 75%"; FORECAST chip on Finish 16:08; boxed "Field count / OFFICIAL RECORD 981"; "Ship progress 1,015"; **"Field is 34 under ship progress"**, the only place in either design that states the side and the gap in words. Hull deck map reads H4→H3→H2→H1. Brand remaining adds up (210+112+15 = 337; 820+480+52 = 1,352).
- Violations:
  - **H.A. card shows "164 /hr" with no denominator, and Pace is missing from the Snapshot.** That breaks "H.A. with denominator, Pace, show both".
  - **"82 min before break"** under 16:08. 16:08 + 82 min = 17:30, which is the Southside clear-by stop, not the 18:00 break. The label is wrong.
  - "OFFICIAL RECORD" is 13 px muted grey (2.66:1 in sun). The word that matters most has the weakest type on the card.
- Glove: Ask/Map are `padding: 9px 14px` at 15 px, about 37–40 px tall (under 44). Tab items are about 38 px (18 px glyph + 13 px label). The hull card is one tap target with 24 px rows.
- Sun (`X_1.1_sun.png`): the white card stays crisp. The navy hull and header wash to slate, so the 13 px deck labels get weak (2.55).

**Y**: R 3 · S 2 · C 4 · G 4 · K 3
- Done well: black-and-white **OFFICIAL Field count 981** tile next to a **FORECAST Finish 16:17 "Before the 17:30 stop"** tile. You can't mistake which is the record and which is the forecast. H.A. tile reads "**981 ÷ 6 counted hours**", with **Pace 176 "per productive hour"** beside it. The ⓘ button (44×44) opens "Starting 1,352 − confirmed deck progress 1,160 = 192. Field count is not part of this sum." That is a derivation that explains itself (Phase 7d target). Deck rows add up (65+47+25+55 = 192).
- Violations:
  - **Ship progress and the side-and-gap sentence are missing from the Snapshot.** Ship 1,160 appears only inside the ⓘ, so a supervisor can't see "field 179 under ship" at a glance.
  - DK4's name is tinted pink (`#FFC9C4`) with no words. It is a low-deck warning nobody can read.
  - The H.A. sparkline has an unexplained yellow bar.
- Glove: every control is 44 to 52 px. The "+ Log" is translucent glass (`rgba(255,255,255,.24)`), not peach, so the screen has no visible main action.
- Sun (`Y_1.1_sun.png`): it turns into grey-on-grey. Only the black OFFICIAL tile holds up.

**Winner: X (narrow).** It states ship vs field, and it can be read in the sun. Y is better on OFFICIAL, H.A./Pace and tap size.

### 1.2 Snapshot, something due

**X**: R 1 · S 4 · C 2 · G 2 · K 2
- Violations:
  - **The Field count (OFFICIAL), ship progress, the ship-vs-field sentence, H.A. and Pace have all disappeared** from this state. Only the 337 card is left.
  - **"DK4 won't clear by the 17:30 stop at this pace" contradicts the FORECAST finish of 16:08 on the same screen.** The whole vessel finishes at 16:08, yet a deck with 30 left (1.1) misses 17:30. The alert is also a forecast with no FORECAST label.
  - The warning uses `--action` peach `#FFD6A5`, the same color as the main action. Peach then means both "press me" and "danger".
- Clarity: three stacked banners (orange "1 open discrepancy", navy "The 14-15 count is due", peach warning) and a floating "Not useful?" link. The count is due, but there is **no button to log it**. "Not useful?" doesn't say what it refers to.
- Glove: "Not useful?" is a bare 15 px text link, about 19 px tall. The count-due banner has no `tap` class.

**Y**: R 3 · S 2 · C 4 · G 5 · K 3
- Done well: the due card sits at the top, "The 14–15 count is due", with a full-width **peach "Log 14–15"** button, 56 px. This is the "speaks first, gives back" pattern done right. The rest of the Snapshot stays in place (OFFICIAL, FORECAST, H.A. ÷ 6, Pace). "Needs a look" lists the count mismatch (expands to "14:52 · Clerk shows 4 more MBZ than my count for 13–14") and "DK4 not started: 55 autos, low deck".
- Violations:
  - Same ship-vs-field gap as 1.1.
  - **Low deck (a hard warning) uses the same amber diamond as a count mismatch.** The design doesn't separate hard from soft.
  - "Log it while it is fresh." is filler.

**Winner: Y (clear).** It has one obvious action and keeps the official number on screen. X drops required facts and contradicts itself.

### 1.3 Decks

**X**: R 3 · S 4 · C 4 · G 3 · K 3
- Done well: **the warning levels are right.**
  - Hard: a red banner "DK4 · 1.80 m · low deck / Shuttle vans need 1.85 m or more · 30 autos remaining", plus a red row and a "Low deck · below 1.85 m" chip.
  - Soft: an orange outlined "Height not confirmed" chip and "2.00 m?".
  - A "2 deck heights unconfirmed → Confirm on Plan" shortcut, hatch chips in H4→H1 order, "Cleared: 11:42", and the footer "Red rows are low decks".
- Violations / inconsistencies:
  - **DK4 says "Not started" but shows "30 of 55"**, which means 25 cleared, and the hull draws H3 55% full.
  - **"2 deck heights unconfirmed", but only DK9 is flagged.** DK7 (which 1.6 says "can be lowered") has no flag.
  - **The "All decks (7)" segment is selected but lists 5 decks.** DK2 and DK1 are missing.
  - "2.00 m?" wraps as "2.00 / m?" in the 56 px name column.
- Glove: deck rows are about 60–80 px ✓ and the segments are 44 ✓. The hull "tap a deck" rows are 24 px.

**Y**: R 3 · S 2 · C 4 · G 4 · K 3
- Done well: big cards ("65 left of 433", "Active"). Tapping one shows its hatches "H4 26 · H3 20 · H2 12 · H1 7" (adds up). DK9 and DK7 both carry "Height not confirmed", which matches "2 to confirm" on 1.6. In "All decks", DK2 and DK1 read "**Cleared time not provided**", which is honest about unknowns. DK4 "55 left of 55, Not started" is consistent.
- Violations:
  - **The low deck is just a pink line, "Low deck: vans need 1.85 m", in the same type and weight as the yellow soft warning.** There is no banner and no colored card, so a hard warning looks like a soft one.
  - The header switches to a glass pill with menu, chat-bubble and pin icons, unlike 1.1–1.2.
- Sun (`Y_1.3_sun.png`): the pink and yellow warning lines nearly vanish (2.26 and 2.47).

**Winner: X (narrow).** The hard/soft warning levels are a safety rule, and X gets them right and keeps them readable in the sun. Its count and status contradictions must still be fixed.

### 1.4 Hourly, list

**X**: R 2 · S 4 · C 3 · G 2 · K 3
- Violations:
  - **The field total is labeled "Total", not OFFICIAL.**
  - H.A. 164 has no denominator.
  - **Pace 171 doesn't match X's own hours.** It shows 6 hours with 07–08 at 50 min and 11–12 at 45 min, so productive time is 335 min, and 981 ÷ 5.583 h = **175.7**.
  - The deltas "+27 (+21.8%)" in green and "−7 (−3.8%)" in red put a value judgment on a full hour against a short hour ("a short hour is not worse"). They read like an alarm.
  - "H/H start 09:20" is link-blue with no "awareness only".
- Done well: corrections ("Corrected · Was 190 → 199 · original kept"), short hour ("Stopped 11:45 · 45 min worked · pace 165/hr"), safety meeting ("50 min worked · pace 180/hr"), and a FORECAST required rate (49/hr = 337 ÷ 7.0 ✓).
- Clarity: the "Today" strip needs a four-part color legend ("Blue logged · orange short hour · striped break · outlined: due now") to read. It is cryptic at a glance.
- Glove: "Details ▾" is a 15 px text link, about 19 px tall.

**Y**: R 4 · S 2 · C 4 · G 4 · K 4
- Done well: **H.A. 164 · Pace 176 · OFFICIAL Field count 981** in the header (Pace is right). The required rate is labeled FORECAST (28 = 192 ÷ 7.0 ✓). The rows say what they mean: "+27 from the short hour before", "Corrected: was 190, now 199. Original kept.", "H/H started 09:20 (awareness only)", "Safety meeting: 50 min worked, pace 180 per hour".
- Violations: **the H.A. tile here says "per hour" with no denominator** (only the Snapshot shows ÷ 6). The FORECAST chip sits on a required rate, which is a calculation (X does the same).

**Winner: Y.** It shows OFFICIAL, its Pace is right, and its deltas are neutral and labeled.

### 1.5 Hourly, graph

**X**: R 3 · S 4 · C 4 · G 3 · K 3
- Done well: a **"Ship vs field · at break: must match"** card (1,015 / 981 / in transit 34). It is the only screen in either design that states the break rule. Brand field and cleared figures agree with 1.1 (598+352+31 = 981; 610+368+37 = 1,015).
- Violations:
  - The field count here isn't marked OFFICIAL.
  - **The graph plots 151 at y = 78. On its own scale (200 → 30, 150 → 90) that is about 160, so the drop looks smaller than it was.**
  - The H.A./Pace/Total header from 1.4 is gone, so the Hourly tab changes shape between List and Graph.

**Y**: R 4 · S 2 · C 4 · G 4 · K 4
- Done well: the same header as 1.4. The graph is plotted correctly, with 46 px tappable points and a readout ("10:00–11:00: 199 per productive hour"). "Ship and field" shows 1,160 / 981 with an **OFFICIAL** chip and in transit 179, plus "In transit: cleared from the ship, not in the field count yet." The brand table has an in-transit column (135+34+10 = 179 ✓).
- Violations: it doesn't state the side and gap in a sentence, and it doesn't say "must match at break". The y-axis starts at 150, which stretches the dip.

**Winner: Y (narrow).** It is more accurate and more consistent. X's break-rule label is worth taking.

### 1.6 Plan, top

**X**: R 4 · S 4 · C 4 · G 4 · K 3. Clean rows: H&H "38 awareness only", "Actual start 07:10 safety meeting", One/Two days, a side picker "Southside (−30)", "Last cars 22:30.", Confirm DK9 (98 remaining, matches 1.1) and DK7 ("can be lowered"). **There is no peach main action. "Save changes" is a ghost button the same weight as "Change start time".** "Last cars 22:30." is small 13 px muted text, though it is the answer to the moment's question.

**Y**: R 4 · S 2 · C 4 · G 5 · K 4. Same content. "**Last cars 22:30.**" is bold at about 20 px. Save is a full-width 56 px peach button. DK9 "47 autos remaining" matches 1.3. Flaw: in the script, `go: () => setState({[flag]: !s[flag]})`, so **a second tap on "Confirmed" quietly un-confirms a deck height** with no reason and no history.

**Winner: Y (narrow).** It has the main action and the answer stands out. X reads better in the sun.

### 1.7 Plan, lower

**X**: R 4 · S 4 · C 4 · G 4 · K 4. Open discrepancy with "Mark resolved", break log, ship notes, "H/H timeline · Awareness only", reports with "Unknowns print as unknown… INTERIM until the vessel is marked complete", backup. The Export button is peach but **half-width** next to Import. "Not backed up · 44 entries" is a 13 px brown line with a tiny dot, which is easy to miss.

**Y**: R 4 · S 2 · C 4 · G 5 · K 4. The same content, plus "High & Heavy (awareness only)" in the section title. The backup card has an amber frame, "◆ Not backed up · 44 entries" at 18 px, and a full-width peach Export. "Mark resolved" has a "Reopen" path.

**Winner: tie.** Y's structure is better (backup prominence, full-width Export). X is the one you can read in the sun.

---

## Consistency across the 7 screens

- **X as a system:** strong. It uses the same header, tab bar, 12 px card radius and tokenized colors (`--r-m`, `--t-*`) everywhere, with the peach Log always in the same place ("same place, same tap"). **Its numbers don't hold together:** the DK4 status and alert, "2 unconfirmed" against 1 flagged, 7 decks against 5 listed, Pace 171 against 176, and the graph point. The hull card has a 70 px bottom-left corner that clashes with the 12 px system.
- **Y as a system:** **every number agrees across all 7 screens** (192, 1,160, 981, 179, 164 ÷ 6, 176, deck and brand sums). But there are **two header designs**: 1.1–1.2 use "‹ Vessels" with a 34 px title and sparkle/map icons, while 1.3–1.7 use a glass pill with menu and chat/pin icons. The date reads "Mon 15:04" in one and "10/12/2026" in the other, and the home indicator appears on 1.3–1.7 only. Card radii of 22–28 px go against Colby's "corners not too rounded".

---

## Overall supervisor verdict

**Design Y, medium-low confidence.**

Why Y:
1. **It shows the official record and the rates correctly.** The OFFICIAL Field count is a black tile on 4 screens (X labels it on 1 screen, calls it "Total" on 1.4, and drops it on 1.2). H.A. shows its denominator (÷ 6 counted hours) and Pace is beside it (X never shows the denominator, and its 1.4 Pace is wrong for its own hours).
2. **It is dependable.** Every number agrees across all 7 screens, and the ⓘ shows how the remaining figure is worked out. X's screens contradict each other in 5 places, and 1.2 contradicts itself.
3. **It matches field use and Colby's preferences better:** 48–56 px targets throughout, one full-width peach action where a screen has one (Log 14–15, Save, Export), and plain row wording.

Why only medium-low:
- **Y is not usable in the sun as it stands.** It is dark-only, with glass whose contrast depends on the wallpaper. In the sun sim, labels drop to 2.2–3.0:1 and even the main numbers to 2.8:1. CLAUDE.md currently requires a light hi-vis day theme, and X is the only design that has one (plus an extra-visible mode). If the light variant of Y can't be delivered with opaque surfaces and AA contrast, **X wins** after its blocking fixes.
- X does several safety-critical things better: the hard-vs-soft deck warnings, the ship-vs-field sentence, and "must match at break".

---

## What the loser (X) does better: Y should take these

1. **A light hi-vis day theme with fixed, opaque surfaces.** Y's day variant should copy X's token approach: `--bg #EEF1F4`, white cards, ink `#0E1A2B`, muted `#3A4B60`, plus a `night` and an **`xv` extra-visible** token set (`#000` ink, 15 px labels, 2 px borders). No glass or blur behind numbers in daytime.
2. **The hard low-deck warning:** a red banner ("DK4 · 1.80 m · low deck / Shuttle vans need 1.85 m or more · N autos remaining"), plus a red-tinted deck row and a red-outlined chip. Keep the orange outlined "Height not confirmed" chip visibly lower in weight. Y's pink text line isn't enough.
3. **"Field is 34 under ship progress"** as a plain sentence on the Snapshot, with Ship progress shown beside the OFFICIAL field count rather than hidden in the ⓘ.
4. **"Ship vs field · at break: must match"** as the header of Y's "Ship and field" card.
5. **"2 deck heights unconfirmed → Confirm on Plan"** as a one-tap shortcut row on Decks.
6. **The hull deck map with H4 H3 H2 H1 column headers** (Y's ship rows have no hatch labels, so the reading order isn't shown).
7. **"Remaining by brand"** on the Snapshot.
8. **One header on every screen** and a 12 px card radius (Colby: "corners not too rounded").
9. **A step-ahead deck alert** ("DK4 won't clear by the 17:30 stop"). Keep the idea, but only when the forecast supports it, labeled FORECAST, and not in peach.
10. **A peach Log in the same tab-bar spot on every screen.** Y's glass "+ Log" reads as a regular tab.
11. **"Not useful?" feedback on the Now card,** so the app learns which prompts help. Make it a 44 px control with clear wording.

(If X is chosen instead, X must take from Y: the OFFICIAL black tile everywhere, "981 ÷ 6 counted hours" + Pace, the ⓘ derivation, "Before the 17:30 stop", a full-width peach "Log 14–15" in the due card, "+27 from the short hour before" and "(awareness only)" wording, "Cleared time not provided", the in-transit definition line, the brand table with an in-transit column, tappable graph points, 48–56 px targets, bold "Last cars 22:30.", and the framed backup warning.)

---

## Blocking issues (fix before handing to developers, whoever wins)

**Design X**
1. **OFFICIAL is missing or mislabeled.** 1.2 has no field count at all, 1.4 calls it "Total", and 1.5 has it unlabeled.
2. **H.A. has no denominator anywhere, and Pace is missing from the Snapshot.**
3. **Numbers contradict each other.**
   - 1.2: "DK4 won't clear by 17:30" against Finish 16:08.
   - 1.3: DK4 "Not started" with 30 of 55; "2 unconfirmed" with 1 flagged (DK7 needs the chip); "All decks (7)" lists 5.
   - 1.4: Pace 171 should be about 176.
   - 1.5: the 151 point is drawn at about 160.
4. **"82 min before break" is wrong.** It means before the 17:30 stop.
5. **Tap targets under 44 pt:** Ask/Map (about 38 px), tab items (about 38 px), "Not useful?" and "Details ▾" (about 19 px text links), and the hull deck rows (24 px).
6. **Night mode has never been rendered** (the night PNGs equal the day PNGs). Night FORECAST chip `#FFF`/`#F59E0B` = **2.15:1** and hard-coded Pace `#7C3AED` = **2.89:1** fail AA.
7. **Peach is used for a warning (1.2).** 1.6 has no main action, and 1.7 Export is half-width.
8. **The due count on 1.2 has no action button.**

**Design Y**
1. **There is no light/day theme**, and glass contrast depends on the wallpaper. The sun sim gives 2.0–3.0:1 for most text, against the CLAUDE.md light hi-vis rule. The day variant must exist, with opaque surfaces, before handoff.
2. **Ship progress and the side-and-gap statement are missing from the Snapshot**, and the break rule (must match) is never stated.
3. **The low deck (hard) looks the same as a soft warning or a discrepancy:** pink text on 1.3, an amber diamond on 1.2, an unexplained pink "DK4" on 1.1.
4. **There are two header systems and two date formats** (1.1–1.2 against 1.3–1.7), and the Ask/Map icons differ between them.
5. **A deck-height Confirm can be undone silently** by tapping again (1.6 script). An undo needs a reason and must keep history.
6. **Card radius is 22–28 px**, and Log isn't peach, so 1.1, 1.3, 1.4 and 1.5 show no main action.
7. **H.A. tiles on 1.4/1.5 drop the denominator.** The yellow bar in the 1.1/1.2 sparkline is unexplained.

**Both:** a FORECAST chip sits on the required rate ("To finish by 22:30 you need 28/hr"). That is a calculation built on a planned stop, so label it "Needed" or "Calculated" and keep FORECAST for the ETA.
