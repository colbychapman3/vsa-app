# Every Screen inventory: what changes on each board (Step 1, 2026-10-13)

Source: VSA Every Screen artifact, version 1791918979-0e0e (46 boards, 9 sections). Plan: `vsa-design-plan-2026-10-13.md`. Nothing here has been changed yet; this is the work list the swarm will follow once Colby approves it.

## Key

**Fixes (F)**
- F1 Pace 171 → 176 (981 ÷ 335 productive min).
- F2 DK4 shows "Not started" with 30 of 55 left. Change its status to Paused (keeps every total).
- F3 Unconfirmed heights: 1.3 says 2 but flags only DK9; flag DK7 too (1.6 lists both).
- F4 "All decks (7)" lists 5: show all 7.
- F5 "82 min before break" → "82 min before the 17:30 stop".
- F6 1.2 says "DK4 won't clear by the 17:30 stop" while the whole ship finishes 16:08. Remove the claim; peach is never used for a warning.
- F7 OFFICIAL on every field count (black box style), never "Total" or unlabeled.
- F8 H.A. always shows its denominator ("981 ÷ 6 counted hours").
- F9 1.5 graph: the 151 point is drawn at about 160.
- F10 Tap targets 44 pt minimum: header Ask/Map (~40), tab items (~38), text links ("Not useful?", "Details ▾", "Select", "Cancel selecting", "Remove this marker" and similar, ~19), hull rows (24).
- F11 Night contrast: FORECAST chip (white on amber, 2.15:1) and purple Pace (2.89:1) fail; aim 7:1.
- F12 One full-width soft-peach main action per screen, with a navy edge on light backgrounds; peach replaces hi-vis orange everywhere it marks the main action.
- F13 Label a required rate "Needed", never FORECAST (it is a calculation).
- F14 Forecast-vs-actual wording says which way it missed ("16 min after the forecast"), never just "early".
- F15 One ship story across all 46 boards (see the note at the end).

**Grafts from group C (G)**
- G1 Now card that acts (its own peach button: "Log 14–15", "See DK4").
- G2 (i) "How this is worked out" on a number, using the app's traces.
- G3 "Needs a look" list at the bottom of the Snapshot.
- G4 OFFICIAL field tile beside FORECAST finish tile; H.A. (with denominator) beside Pace.
- G5 Plain-language hourly notes.
- G6 Resolved ✓ / Reopen on discrepancies.
- G7 Plan top: peach Save, "Last cars" recomputed live, Two days → "The forecast rolls into Day 2".
- G8 Brand table: Field / Cleared / In transit + a one-line definition of in transit.
- G9 Needed rate as a big number, only when it matters.
- G10 Tap a graph point for its readout.

**Applies to every board:** F10, F11 (Night), F12, the token sheet (Light / Night / Extra visible), one header, 12 px radius. Boards marked "global only" get nothing beyond these.

## 1 · Main tabs (7 boards: the heaviest changes)

| Board | Changes |
|---|---|
| 1.1 Snapshot, calm | F5, F7, F8. G4 (OFFICIAL + FORECAST tiles; H.A. ÷ 6 hours beside Pace). G2 on Vessel remaining, gap, H.A., finish. Keep: hull map with H4–H1, "Field is 34 under ship progress", remaining by brand. Hull rows to 44 pt (F10). No Now card when calm (silence means all is well). |
| 1.2 Snapshot, something due | Rebuilt as the full Snapshot (decision 3): same layout as 1.1 with G1 on top ("The 14–15 count is due" + peach Log 14–15; "Not useful?" as a 44 pt control) and G3 at the bottom (count mismatch, DK4 low deck). F6, F7. Removes the orange strip / navy bar / peach warning stack. |
| 1.3 Decks | F2, F3, F4. Keep: red hard low-deck banner, orange "Height not confirmed", "2 deck heights unconfirmed → Confirm on Plan". "2.00 m?" must not wrap. |
| 1.4 Hourly, list | F1, F7 ("Total" → OFFICIAL Field count), F8, F13. G5 (plain notes: "+27 from the short hour before", "Corrected: was 190, now 199. Original kept.", "H/H started 09:20 (awareness only)"). G9 (needed rate shown only when it matters; today it doesn't, so the card is quiet). Today strip kept. |
| 1.5 Hourly, graph | F7, F9. G8 (brand table), G10. Keep "Ship vs field · at break: must match". Same H.A./Pace/OFFICIAL header as 1.4 so the tab doesn't change shape. |
| 1.6 Plan, top | G7. F12 (Save becomes the peach main action; "Last cars 22:30" bold). |
| 1.7 Plan, lower | G6 on "Mark resolved". F12 (Export full width, "Not backed up" framed and prominent). |

## 2 · Log (8 boards)

| Board | Changes |
|---|---|
| 2.1 Log › Hourly | F12 (Save hourly count = peach). Show the H/H and drivers fields as they are. **Gap:** no board shows the answer after Save (see question 1). |
| 2.2 Log › typing | Global only. |
| 2.3 Log › All hours + clerk's text | Global only ("✓ already has a count: picking it corrects it" already keeps history). |
| 2.4 Log › Break or end of shift | F12. Time moves with F15. |
| 2.5 Log › Deck | F2 (DK4 status chips), F12. |
| 2.6 Log › H/H | F10 ("Remove this marker"). |
| 2.7 Log › Issue | F12. Link to G3/G6: a saved issue appears in "Needs a look" and on Plan with Resolve. |
| 2.8 Log › Photo | Global only (VIN never auto-corrected; keep). |

## 3 · Deck sheet and photos (3 boards)

| Board | Changes |
|---|---|
| 3.1 Deck sheet | F12 (Save deck update = peach). |
| 3.2 Deck photos | F10 ("Select", "Cancel selecting"). |
| 3.3 Photo record / VIN scan | Global only. |

## 4 · Ask, Search, Map (4 boards)

| Board | Changes |
|---|---|
| 4.1 Ask | F10 ("Not useful?"). The answer card is already the G2 pattern; keep it as the model for the (i) traces. |
| 4.2 Ask my AI | F7 (field line says OFFICIAL), F1 if pace appears. |
| 4.3 Search | Global only. |
| 4.4 Map | Map stays as is (Colby); only the picker and cards take the tokens. |

## 5 · Menu, Settings, Send update (5 boards)

| Board | Changes |
|---|---|
| 5.1 Menu | Global only. |
| 5.2 Send update | F1 (pace 171 → 176), F7 (field OFFICIAL in the text). |
| 5.3 Settings | Global only (Light / Night / Auto / Extra visible already here). |
| 5.4 Customize Snapshot | Add the new tiles from G4 (OFFICIAL field, Pace) to the list; "Field / cleared by brand" follows G8. |
| 5.5 Lessons from past ships | Global only. |

## 6 · Finish history, Closeout, Vessel complete (3 boards)

| Board | Changes |
|---|---|
| 6.1 Finish history | G10 (tap a point). |
| 6.2 Closeout | F14 ("22:20 · 16 min early" → "finished 16 min after the forecast"), F1 check, F15 times. |
| 6.3 Vessel complete | G6 link (Go fix it → Resolve). F15 times. |

## 7 · New vessel setup (9 boards)

| Board | Changes |
|---|---|
| 7.1–7.9 | Global only, plus F12 on each step's Next / Save vessel. The setup flow already asks only about doubt (7.2, 7.3, 7.7 show the exact difference and keep both numbers). |

## 8 · Vans and paperwork (4 boards)

| Board | Changes |
|---|---|
| 8.1–8.4 | Global only, plus F12 on the main action ("Mark Back vans gassed", "Save", "Add 2 vans"). |

## 9 · States (3 boards)

| Board | Changes |
|---|---|
| 9.1 Break / end of shift | F7, F15 times. Keep match green / ship ahead orange / field ahead red. |
| 9.2 First launch | Global only. |
| 9.3 Night | F11 (this board is the Night check), G1 + G4 to match 1.2. F15. |

## The sample story (F15)

The main tabs say: 15:04, 337 left, FORECAST finish 16:08. The app's forecast counts from the end of the last logged hour (14:00): 337 ÷ 158/hr = 2 h 8 min → 16:08, so that number is right by the app's own rule. But later boards tell a different ship: 9.3 Night has 96 left at 21:05, 6.2 Closeout finishes at 22:36, 9.1 Break has 172 left at 18:02. A ship with 337 left at 15:04 finishing at 16:08 can't still be working at 21:05.

Default fix: keep the main tabs as the reference and retime the later boards to the same ship: Closeout and Vessel complete around 16:15–16:20 (with "finished N min after the forecast"), 9.1 at the 12:00 break (ship = field, 830; 522 left), and 9.3 Night as the same 15:04 Snapshot in the Night palette.

## Questions for Colby before the swarm runs

1. **Answer after Save.** The app's most important assistant moment (the answer card after every Save) has no board. Add one board, "2.1b After Save", showing it? *Recommended: yes, it is the first thing the philosophy asks for.*
2. **One ship story (F15).** Retime the late-day boards as above? *Recommended: yes.*
