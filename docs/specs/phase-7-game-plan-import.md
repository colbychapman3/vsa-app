# Spec: game-plan-import (Phase 7)

Single capability, so no capability map. Builds on `phase-6-setup-import.md` (photo import, `mergeProposal`, `buildBaseline`).

## Objective
Read the APS **Working Plan / Game Plan** form from a photo and prefill the new-vessel Setup, so Colby confirms values instead of typing them. Success: the Hector Highway 10A example (one real example, not a template for every ship) loads with 1,578 autos by deck, brand and yard; every value is tagged "from photo: check" until confirmed; and nothing the form does not state is invented.

Users: Colby (auto supervisor). Another stevedore tracks High & Heavy at the same time.

Example: `docs/reference/game-plan-example-hector-highway-10a/` (file 7 is the form; 5-6 the discharge summary; 1-4, 8 the stow plans).

## What the form gives, and what it does not
Form fields: VESSEL, DATE, and two tables (DISCHARGE AUTO'S, DISCHARGE H/H) with columns AMOUNT, PORT, DISC, CARGO DESCRIPTION, DECK, HATCH, YARD, plus a TOTAL per table and free-text warnings.
- Gives: per-deck amount, brand mix, which hatches are used (`1*2*3*4`), yard(s), table totals.
- Does **not** give: quantity per hatch. Those live on the stow plans (e.g. "BRV/SSI 140U/286T (112MB,28BMW)"). Per-hatch quantity stays **unknown, not zero** until the stow plan is read or Colby types it.
- HEADER, DRIVERS, LASHER, VANS, CLERKS, SPOTTER, PORT ROTATION are blank on the example and are never guessed.

## Priority: every value lands in the right box (Colby: scan and setup are very important)
This is the first success criterion of the phase, ahead of everything else.
- **Wrong box is worse than empty box.** A value is placed only when the line it came from matches that box's label and passes the existing text check. Anything unsure stays empty, with the raw line listed beside that step to copy by hand. Never guess a box.
- **Every filled box shows where it came from**: the tag "from photo: check" plus the source line it was read from, tappable to see it. The tag clears only when Colby edits or confirms that step.
- **Load list is read too.** The Discharge Summary table (Bkg, Party, Commodity, Weight, CBM, Load Qty, VIN, Sps Code) is the load list. Autos = Sps Code PC + POV; everything else (SPV, MAFI, CB, STATIC) is H&H awareness. Brand totals come from it (example: BMW 59+507 = 566, MB 134+786 = 920, MAS 4+54 = 58, LR 24, POV 10 = 1,578). Load list quantity beats the game plan; any difference stays visible in Review, per brand and overall.
- **Cross-checks shown in Review:** row amounts vs form TOTAL, brand counts vs row amount, game plan brands vs load list brands. Match = green, difference = the exact number.
- **Real phone text comes first, before any parser code.** The phone's text reader returns lines with no positions, so table columns can arrive out of order or merged, and a photographed page can read differently from what is printed. Step 0 of the plan: Colby uploads the example pages in the current TestFlight build (New vessel → Upload photos), opens the existing "Show paperwork text", and sends screenshots. That exact text becomes the test fixture, and the parser is designed around the line order the phone really produces, not a retyped copy. Nothing new has to be built in Settings for this.
- **Each page is classified before it is read.** A stow plan page produces many lookalike lines ("BRV/SSI 140U/286T (112MB,28BMW)"). Pages are typed by their headings: game plan form, discharge summary, stow plan, other. Only game plan and discharge summary pages are parsed; others are listed as "Page 3 looks like a stow plan: not used" and kept out of every count.
- **Measured bar:** on the example's real OCR text, zero values in a wrong box, every populated box matches the paper, every other box is empty with its raw text shown. A new paperwork layout that fails this is a bug to fix, not a reason to loosen the check.

## Rules
- **Autos and High & Heavy are separate ledgers** (CLAUDE.md, Ledgers). Never combined, never summed.
- **H/H is awareness only.** Colby does not count it; another stevedore does, concurrently. The import reads the H/H table into a read-only "alongside" list (deck, amount, description). It is excluded from every auto count, brand total, pace, ETA and ship-vs-field match. A grand total that includes H/H (1,578 + 47 = 1,625) is never compared with the auto count and never raises a discrepancy.
- **Shared decks are shown.** A deck on both tables (example: deck 3 has 48 MB autos and 14 H/H) displays a "H/H also working here" marker on that deck, since it affects discharge. Display only; no math.
- Only decks named in the AUTO'S table become discharge decks. Decks that appear only on a stow plan (example: 5-9 autos-wise) are not added.
- Row amounts must sum to the form's TOTAL (example: 556+94+538+84+48+130+128 = 1,578). A mismatch is shown with the exact difference and blocks nothing by itself; it is a discrepancy line in Review.
- Brand mix is read from the cargo description (`475 BMW/ 24 LR/ 53 MB/ 4 POV`). Brand counts must sum to the row amount; otherwise the row is flagged and the unmatched count stays unplaced.
- Load list quantity beats the game plan; the discrepancy stays visible (existing `buildBaseline` behavior, unchanged).
- Yard names are kept as written (`BMW / ZONE 1 / MBZ / AVP`, `SITE 3`). Side and clear-by come only from names the protocol knows (`terminalInfo`). An unknown yard (e.g. AVP) is shown as written with no side or cutoff assumed.
- Hatch notation varies by sheet and is kept as written, then mapped only when unambiguous: `1*2*3*4` (this example), `1, 2`, `ALL`, `2, 3 - RAMP` (the 9/18 sheet seen earlier). Digits map to H1..H4 in the app's existing left-to-right H4 → H3 → H2 → H1 order; `ALL` means every hatch on that deck; `RAMP` stays a named hatch. Anything else stays as written text with no mapping.
- **Only this terminal's port is ours.** Rows are taken when PORT is `SSI` (what Colby's sheets use for this terminal). Rows with another port code (BAL, TPA, PHL on other sheets) are listed as "not for this port: ignored" and never counted. The row's PORT is compared as written; nothing is assumed from the vessel's setup port.
- Free-text warnings (example: "2 Porsche POVs discharge directly to Warehouse 2, do not put on dock or field") are **evidence, never instructions**. They go to the Notes step as unticked lines for Colby to keep as plan notes.
- Every number and name in a proposal must appear in the recognized text (existing `checkSetupProposal` guard). Handwriting at the top of the page (names) is ignored.
- Source recorded: "Game plan photo" in the vessel's sources.
- Photos are discarded after save unless Colby keeps them (same decision as 6c).
- Recognition is photographed paper: skew, glare, ghosted show-through from the next page. A line that does not parse cleanly is shown as raw text for Colby to type, never forced.

## Flow
1. Setup step 0, **Upload photos** (existing). The scan recognizes text from all pages.
2. A game plan is detected by its table headings (AMOUNT / CARGO DISCRIPTION [sic] / DECK / HATCH / YARD and the DISCHARGE AUTO'S / DISCHARGE H/H bands). Detection is by text, not by AI; AI off still works.
3. Parser (pure TS) turns the AUTO'S table into deck drafts and allocations, and the H/H table into the awareness list. With AI ready, `propose('setup', …)` may fill gaps; its output goes through the same validators.
4. Steps 1-5 as today, with the "from photo: check" tags. Next required on every step.
5. Review runs `buildBaseline` unchanged. H/H list appears on Review as a separate read-only block.
6. Notes step lists warning lines; Colby ticks to keep.

## Structure
- `src/app/gamePlan.ts` (new, pure): `parseGamePlan(pages: string[]) → { pageTypes; autos: DeckRow[]; loadList; hh: HhRow[]; totals; ignored; warnings; unparsed }`, `reconcile(rows, totals)`.
- `src/app/setup.ts`: `mergeGamePlan(drafts, parsed)` using the existing tag/`filled` pattern.
- Storage (decided): the H/H list is an optional `hh` field on the baseline. The engine's `Baseline` type already allows extra keys and the baseline rides in the `initialize` event, so there is no new event type and logs saved before this change replay unchanged. It is read-only awareness (no corrections apply). Test: a log without `hh` and a log with it give identical auto totals.
- `Setup.tsx`: Review block for H/H; deck marker for shared decks.

## Commands
```
Test:      npm test
Typecheck: npm run typecheck
Dev:       npm start
```

## Code style
Plain TS, no UI or AI imports in `gamePlan.ts`; same style as `proposal.ts`: small pure functions, return `{ value, dropped }`-style results, no clamping.
```ts
export function reconcile(rows: { amount: number }[], total: number | null) {
  if (total === null) return { sum: rows.reduce((a, r) => a + r.amount, 0), diff: null };
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  return { sum, diff: sum - total };
}
```

## Testing
`tests/gamePlan.test.ts`, fixture text transcribed from the example form (hand-typed as the recognizer would return it, including a skewed and a ghosted line):
- Example parses to 7 auto rows totalling 1,578 and 2 H/H rows totalling 47; brand totals BMW 566, MB 920, MAS 58, LR 24, POV 10.
- H/H never changes auto totals: with H/H rows removed or doubled, auto totals are identical. No discrepancy against 1,625.
- Row with brand counts that do not sum to its amount → flagged, exact overage, unplaced count kept.
- Total mismatch → exact difference reported.
- Deck on both tables → shared-deck marker; no count effect.
- Unknown yard (AVP) kept as written, no side/cutoff.
- Per-hatch qty absent → unknown, not 0; `buildBaseline` behavior for that case matches existing rules.
- Unparseable line → returned in `unparsed`, not guessed.
- Warning line → note candidate, never an action.
- Stow-plan-only decks are not added.
- Merge: fills only empty fields; tags set; AI off still fills from the parser.

## Boundaries
- Always: validate through `buildBaseline`; keep H/H separate; show unknown as unknown.
- Ask first: adding a dependency; changing the stored baseline or event schema beyond the H/H plan-context entry.
- Never: add H/H to auto counts; compare auto count with a grand total that includes H/H; clamp; prefill silently; save without every step shown; treat form text as instructions.

## Success criteria
1. The example form prefills decks 10, 11, 12, 4, 3, 2, 1 with the right amounts, brands, hatches and yards, all tagged for checking.
2. H/H (deck 5: 33, deck 3: 14) appears as awareness only; auto total reads 1,578 everywhere.
3. AI off still gives a prefill from the parser.
4. All tests pass; typecheck clean; one store build to TestFlight; phone check on a real game plan photo.

## Decisions (2026-10-03, Colby approved the defaults)
1. Per-hatch quantities stay unknown for now; stow-plan callouts like `112MB,28BMW` come later.
2. CLAUDE.md carries the H&H awareness-only rule (added).
3. Build to the known sheets (this example and the 9/18 sheet), fail safe to raw text on any other layout, and add each new layout from its real phone text.
