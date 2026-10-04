# Spec: game plan reader (Phase 6e, replaces the 6c setup photo import)

Status: **APPROVED** by Colby 2026-10-04. Built as Phase 7 checkpoint 1 (replaces `phase-7-game-plan-import.md`). Shipped as a TestFlight store build, like checkpoint 2, instead of a dev build.

## Why
The 6c photo import did not reach its goal. Apple's text reader gave flat lines with no positions, so table rows could not be rebuilt. The on-device model could not read a table from that text, and the proposal check then dropped most of what it did read. The deck/hatch grid, which is the real work, was still typed by hand. None of it was ever tested on a real photo. It is removed, not repaired.

## Objective
Colby photographs the **APS "Working Plan / Game Plan" cover page** and Setup comes up filled: vessel, date, every deck with its brand split and hatch list, destinations, the H/H count and the page's notes. Every value is checked step by step before saving. It is free, works in airplane mode and uses no AI.
**Success:** Colby's real Hector Highway 10A photo fills Setup with exactly the values below, and a bad or partial photo stops with a plain message instead of guessing.

## The source (from Colby's photos, 2026-10-04)
- **Cover page:** the same APS form every vessel. Header: VESSEL, DATE, HEADER, DRIVERS, LASHER, VANS, CLERKS, SPOTTER/DRIVER, PORT ROTATION. Two tables, **DISCHARGE AUTO'S** and **DISCHARGE H/H**, each with the columns AMOUNT · PORT · DISC · CARGO DESCRIPTION · DECK · HATCH · YARD and a TOTAL line. Notes are in red below the tables.
- **Schematic:** the layout changes by shipping line. It is the only place deck heights appear. **Not read in 6e**: heights are typed.
- **Discharge summary (load list):** its layout may change by line. **Not read in 6e**: Colby types the brand totals.

Expected result for the cover page photo `docs/reference/game-plan-example-hector-highway-10a/7-working-plan-game-plan-form.jpg` (its word-position fixture: `tests/fixtures/gameplan/7-working-plan-game-plan-form.json`, read by the Windows text reader; the phone's own Vision output is added after the phone check):

| Deck | Amount | Split | Hatches | Yards (paired by order) |
|---|---|---|---|---|
| 10 | 556 | 475 BMW, 24 LR, 53 MB, 4 POV | H1–H4 | BMW Field, Zone 1, MBZ, AVP Yard |
| 11 | 94 | 35 BMW, 58 MAS, 1 POV | H1, H2 | BMW Field, Site 3, AVP Yard |
| 12 | 538 | 56 BMW, 482 MB | H1–H4 | BMW Field, MBZ |
| 4 | 84 | 84 MB | H2, H3 | MBZ |
| 3 | 48 | 48 MB | H2, H3 | MBZ |
| 2 | 130 | 130 MB | H1, H2, H3 | MBZ |
| 1 | 128 | 123 MB, 5 POV | H1, H2, H3 | MBZ, AVP Yard |
| Autos total | 1,578 (matches the printed TOTAL) | | | |
| H/H | 33 (deck 5) + 14 (deck 3) = 47 (matches) | | | AVP Yard |

Brand totals: MB 920, BMW 566, MAS 58, LR 24, POV 10. Note: "2 Porsche POVs discharge directly to Warehouse 2. Do not put on dock or field."

## Decisions (Colby, 2026-10-04: defaults)
1. **Hatch counts can be unknown.** The game plan gives a deck's total by brand and which hatches hold cargo, not a count per hatch. A deck can now carry its brand split at deck level, with hatch counts unknown (not 0). Hatch counts can still be typed in Setup when known (for example from a stow plan), as today.
2. **Yards pair with brands by order** on each row (475 BMW → BMW, 24 LR → Zone 1, …), marked "from game plan: check" until the Destinations step is confirmed. If a row has a different number of brands than yards, nothing is paired for that row and it says so.
3. **H/H goes to its own ledger** (`baseline.hh`), never added to autos.
4. **The load list is typed** (brand totals and the H/H total) in a new Load list step. It is optional; if skipped, Review says "Load list not checked".
5. **Photo fixtures: allowed** (Colby, 2026-10-04: the repo is private). The Hector Highway 10A photos are in `docs/reference/game-plan-example-hector-highway-10a/`; word-position fixtures read from them are in `tests/fixtures/gameplan/`.

## Flow
1. Setup step 0: **Read the game plan** with two buttons, take a picture or choose a photo. Below them: **Type it in** (the manual path, unchanged) and **Import a baseline** (unchanged). One page per read. The cover page is one page.
2. Reading shows "Reading the game plan…". The result comes back as one of these:
   - **Read:** Setup is filled, and a summary card lists what was filled and every problem.
   - **Not a game plan / unreadable:** "This doesn't look like the APS game plan cover page (no AMOUNT / DECK / HATCH header found). Retake it flat and in focus, or type it in." Nothing is filled.
3. Steps as today (Vessel, Start, Destinations, Decks), plus **Load list** before Review, plus the existing Notes step. Each filled field carries **From game plan: check** until its step is confirmed with Next. Review cannot be reached by skipping.
4. **Load list step:** a box for each brand found (MB, BMW, …) plus "H/H total", each blank = not entered. Each row shows the game plan figure next to it: match ✓, or the exact difference.
5. **Review:** runs `buildBaseline` as today. If the typed load list differs from the decks, **Save is blocked** with two ways forward: fix the deck numbers until they match, or **Game plan controls (override)**, which is recorded. Either way both numbers and the difference are stored in `baseline.verification` and stay visible on Plan.
6. **Notes step:** red/other lines below the last TOTAL are offered as Plan Notes (ticked by default only for lines in the notes area; Colby can untick or edit). Counts are never changed by a note.
7. Saving records the source: "Game plan photo (APS cover page)".
8. On the summary card, **Share what was read** sends the reader's raw output (text and positions, no photo) through the share sheet, so a failed read can be turned into a test case.

## Reading rules (pure TypeScript, `src/app/gamePlan.ts`)
Input: the recognized lines with their positions (normalized page coordinates, top-left origin). Output: a filled Setup draft, tags, and a list of problems. No AI, and no network.
- **Find the tables** from their header words (AMOUNT, CARGO D…, DECK, HATCH, YARD; misspellings like "DISCIPTION" are accepted) and the section titles (DISCHARGE AUTO'S, DISCHARGE H/H). The page tilt is measured from the header line and corrected before rows are built. Column edges sit halfway between header words.
- **Rows** are built from the AMOUNT cells. Each cell joins the row it lines up with after the tilt correction. A cell that lines up with no row is reported, not dropped silently.
- **Cargo description:** `475 BMW/ 24 LR/ 53 MB/ 4 POV` means a split. A bare brand (`MB`) means the whole amount is that brand, because the paperwork says so; this is not a guess. Anything else (for example "24 BUSES/ 5 STATIC/ CB" in H/H) is kept as written text.
- **Checks, never fixes:**
  - Split ≠ amount: "Deck 10: the split adds to 546 but AMOUNT says 556 (difference 10). Type the split." The deck is added with its amount and hatches, and the split is left empty for Colby.
  - Rows ≠ printed TOTAL: "Game plan TOTAL says 1,578; the rows add to 1,568 (difference 10)." Shown on the summary and on Review.
  - An unreadable number or a missing deck: the row is listed with what was read, and nothing is filled for it.
  - Hatch text `1*2*3*4` becomes H1–H4. The `*` may come back as x, ×, ·, a space or a comma. Only digits 1–4, each once; anything else is reported.
  - The same deck appearing twice in autos is reported, and both rows are kept for Colby to merge.
- **Yard names** map to terminal names: BMW → BMW Field, ZONE 1 → Zone 1, MBZ → MBZ, AVP → AVP Yard, SITE n → Site n. "MB Field" still means MBZ. An unknown name is kept as written, and its side must be chosen (existing rule).
- **Header:** VESSEL and DATE are read from the text right of their labels on the same line. DRIVERS fills Day 1 drivers only if it is a number. HEADER, LASHER, VANS, CLERKS and SPOTTER, when filled, go to the Notes step. Handwriting outside the form is ignored.
- **Deck order** is kept as printed (10, 11, 12, 4, 3, 2, 1), which is the discharge order. Hatches read H4 → H1 on screen as today.

## Engine change (deck-level split)
- `Deck` gains an optional `cargo: Item[]`, the deck's brand split. When `cargo` is present, its hatches list only names (`items: []`), and a hatch's starting count is **unknown**.
- `validateBaseline`: starting cargo and brand totals come from `cargo` for those decks. A deck can't have both `cargo` and hatch items.
- `deckCalc`: deck start and brand start come from `cargo`. A hatch with an unknown start shows "count not on paperwork". For a deck that is Not started, remaining = start.
- `deckUpdate`: a hatch remaining count is checked against the deck's start, since there is no hatch maximum. When every hatch has a count, their sum must not exceed the deck start, and an overage is refused with the exact number. The deck total check is unchanged.
- **Brand remaining** on a multi-brand deck with no hatch counts is unknown until the deck is complete, never split by guess. A single-brand deck works as today.
- Glovis Condor 101 (hatch-level counts) is unchanged: same replay, same screen numbers.

## Reader on the phone
- A small local Expo module (`modules/vsa-text`, Swift, Apple Vision `VNRecognizeTextRequest`, accurate level) returns each line's text, its position and Vision's confidence. Language correction is off for the game plan, so numbers and codes are not "corrected".
- It replaces `expo-text-extractor`. `readPhotos` keeps its current output (text per page), so the VIN scan, van sheet and Plan Notes photos work as before; they get a phone check.
- Needs one new EAS development build.

## Removed
- `proposeSetup`, `SETUP_SCHEMA`, `checkSetupProposal`, `mergeProposal`, `labeledHeader`, `fieldFromLine`, the tap-a-line list and the copy-text card, with their tests. `noteLines` is replaced by the notes-area rule above.
- On-device AI stays for note tidy and Ask. It is no longer used in Setup.

## Testing (node:test)
- **Real photo fixtures:** a recognized-lines fixture for the Hector Highway cover page, made by running OCR on the real photo, gives exactly the table above, with the checks passing. After the phone check, the phone's own Vision output (via Share what was read) is added as a second fixture.
- **Damaged copies of that fixture:** one split number changed (refused with the exact difference, split left empty), the TOTAL changed, a row missing, a tilted page (rotated coordinates), `1x2x3x4` / `1 2 3` hatch text, yards ≠ brands (left unpaired), the header words missing (not a game plan, nothing filled).
- **Engine:** deck-level split totals and brand starts. Hatch remaining above the deck start is refused with the exact overage. Hatch sum above the deck start is refused. Multi-brand brand remaining is unknown mid-deck. Glovis Condor 101 replay and screens 01–03 are unchanged.
- **Load list:** a match passes. A mismatch blocks Save. The override is recorded with both numbers, and the discrepancy stays visible.
- `npm test`, `npm run typecheck`, `npm run check:ios` pass.

## Boundaries
- **Never:** fill a value the page doesn't state, fix a number to make a total balance, combine H/H with autos, save without every step shown, or send a photo anywhere.
- **Out of scope (later):** reading the schematic (heights, hatch counts) and the discharge summary; adding hatch counts after the vessel is saved (re-create and archive, as in Phase 5).

## Done when
1. The Hector Highway photo taken on the phone fills Setup exactly as above, and it saves after the step-by-step check.
2. A blurred or wrong page stops with the message, and nothing is filled.
3. VIN scan, van sheet and Plan Notes photo reading still work. All tests pass. Phone check on the new dev build.

## Plan (one approval)
1. Fixtures: photos in `docs/reference/game-plan-example-hector-highway-10a/`, word-position fixtures in `tests/fixtures/gameplan/` (done 2026-10-04).
2. Engine: deck-level `cargo`, with tests first (rules-engine skill).
3. `src/app/gamePlan.ts`: the reader with all tests above.
4. Setup: the new step 0, the Load list step, tags and the notes area. Remove the old import (field-UI skill).
5. `modules/vsa-text` native reader; switch `readPhotos` over; remove `expo-text-extractor`.
6. Review loop until zero required findings, then a TestFlight store build, then Colby's phone check: this game plan, VIN, van sheet, notes.
