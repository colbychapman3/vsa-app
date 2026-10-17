# Design questions from the UI conformance trial (2026-10-17)

Boards checked: 103 Decks, 201 Log › Hourly, 903 Night (`tools/render`, Hera Highway 13A fixture). Each question is where the board and the app differ because of a later decision or a rule. **Decided by Colby, 2026-10-17: every recommended answer** (the last column). Done in the app: #4 (Deck heights heading dropped), #12 (sheet grabber, TEST/LIVE chip beside close, divider), #8 (fixture: DK4 has its 2 photos). Everything else keeps the app as it is.

**Board updates owed to the VSA Every Screen artifact** (the boards are frozen here; update the artifact, then refresh the copy): #1 ship card (2026-10-16), #2 What if on Decks, #3 tab bar, #5 Finish 16:02, #6 no Now card / traces in Ask / bar not ring, #7 "About N left now (est.)", #9 "Can be lowered" on every unconfirmed deck, #10 "✓ Complete", #11 20 px margins, #13 no clerk's text link, #14 the app's type sizes.

| # | Board · element | Board shows | App does (why) | Decision needed (recommended) |
|---|---|---|---|---|
| 1 | 1.3 Decks, 9.3 Night · ship card | "Ship progress 1,015 of 1,352 · tap a deck", bars per hatch | Hull holds the decks, hatch tabs, all-clear collapses (Colby, 2026-10-16) | Keep the app; update the board to the 2026-10-16 ship card |
| 2 | 1.3 Decks · What if | Not on Decks | What if widget between ship card and heights (2026-10-14) | Keep the app; add What if to the board |
| 3 | All · tab bar | Plain tabs | Peach selected tab, centered Log, "14–15 due" pill, badges on Decks/Plan (2026-10-14..16) | Keep the app; update the board |
| 4 | 1.3 Decks · "Deck heights" heading | No heading | Section heading with (i) above the low-deck card | Drop the heading (match the board) |
| 5 | 1.1 / 9.3 Snapshot · Finish | 16:08, 82 min before the 17:30 stop | 16:02, 88 min before (the brand-mix forecast rule, 2026-10-14, came after the boards) | Keep the app's number; update the board. The loop never changes forecast math to match a picture |
| 6 | 1.1 / 9.3 Snapshot · Now card, (i) traces, ring | "14–15 count is due" card on top, open "How this is worked out" boxes, a ring | Now card moved out, traces in Ask, percent with bar instead of ring (2026-10-14) | Keep the app; update the board |
| 7 | 1.1 / 9.3 Snapshot · Vessel remaining | Number and Ship progress row only | Adds "About 160 left now (est.)" FORECAST line | Keep (labeled FORECAST); add to the board |
| 8 | 1.3 Decks · DK4 photo badge | Camera badge "2" on DK4 | No badge (the fixture has no photos yet) | Harness: add 2 photos to the fixture; no app change |
| 9 | 1.3 Decks · "Can be lowered" line | Only on DK7 | On every unconfirmed deck (DK9 and DK7): the engine's "unconfirmed" already means "can be lowered below 1.85 m" | Keep the app, or name the rule that separates DK7 from DK9 |
| 10 | 1.3 Decks · Complete pill | "Complete" | "✓ Complete" (the check is a shape cue for sun and color blindness) | Keep the ✓ |
| 11 | All screens · side margins | About 12 px | 20 px on every tab (so DK12's four hatch chips wrap to two lines) | Keep 20 px, or move every screen to the board's margin in one change |
| 12 | 2.1 Log · sheet header | Grabber, LIVE chip, divider | None (the shared sheet frame, used by every sheet) | Add all three to the shared frame (recommended), or leave |
| 13 | 2.1 Log · "Paste clerk's text" link | Shown | Left out: the clerk's text paste was removed in build #31 | Keep it out; drop it from the board |
| 14 | 2.1 Log · type sizes | Labels and notes about 12–14 px, input 46 px, brand rows 55 px apart | 14–17 px, 44 px inputs (shared form style), rows 69 px apart | Keep the app's larger type (sun first) |

## Fixed on 2026-10-17 ("fix two")

- **1.3 Decks:** compact grey hatch chips (cars left only), status pill in one column beside the deck name, "2.00 m?" in orange with a "Height not confirmed" chip on its own line, the "Can be lowered…" line, the low-deck row (red height, "Low deck · below 1.85 m"), complete decks (green 0, "Cleared 11:42", no hatch list), the unconfirmed card ("DK9 · DK7" and "Confirm on Plan ›"), the low-deck card copy, "All decks (7) / Decks remaining (4)", a visible footnote, and a black-outline Paused pill everywhere.
- **2.1 Log › Hourly:** the four hour chips fit one row (two logged with ✓, the due hour, the next), the "All hours" link (opens the full hour list), "158 of 158 ✓", the count note, and › on "Break or end of shift".
