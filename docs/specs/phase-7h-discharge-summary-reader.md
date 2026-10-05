# Spec: Discharge summary reader for the Load list (Phase 7h)

Status: **DRAFT**, waiting on approval. Colby's answer to C3 on 2026-10-05 ("I approve and agree with recommendations"): yes, spec it after the labor order reader.

## Objective
Colby photographs the vessel's **Discharge Summary** (one table: booking, party, commodity, weight, CBM, load quantity, VIN, special code) and the Load list step in Setup fills the brand totals and the H/H total from it, instead of typing them. Free, offline, no AI. Success: on the Hector Highway 10A summary (fixture `5-discharge-summary-table.json`, `6-discharge-summary-totals.json`), the brand totals are proposed, each tagged "From discharge summary: check", and the game plan comparison (match, or the exact difference) works as it does for typed numbers.

## Rule (proposed)
- **Rows** are read with the existing layout code (`src/app/layout.ts`): one row per booking, cells by column position, so a wrapped party name never splits a row.
- **Brand totals** = the load quantity summed per brand. The brand comes from the commodity or party cell (MERCEDES-BENZ, BMW, MASERATI, LAND ROVER, ...); a row that names no known brand is listed as "not placed" and never added to a brand.
- **Autos vs H/H:** rows whose commodity is a unit that is not an auto (excavators, buses, trucks, chassis, special code SPV or a weight over the auto limit) go to the H/H total, never to an auto brand. Anything unsure is "not placed" and shown, never guessed.
- **VINs and booking numbers** are read only to count rows and are never stored or displayed.
- **Checks, shown and never fixed:** the page's own total row (when present) equals the sum of the rows; the sums equal the game plan's brand line. A difference shows the exact figures.
- Load list quantity beats the game plan unless Colby overrides; the discrepancy stays visible (CLAUDE.md, Ledgers).

## Open questions (recommended default first)
1. **Where does the rule for "not an auto" come from?** Default: Colby confirms the special-code and commodity words once on this fixture; anything else is "not placed".
2. **Two pages (rows continue onto a second photo):** default: one photo per read, sums add across reads, shown as a list Colby can remove.

## Tests (written first)
- The real fixtures: rows counted, per-brand sums, H/H sum, "not placed" list, no VIN or booking in any output.
- Damaged copies: a quantity dropped (the page total check fails and says by how much), a row with no brand (not placed), a page that is not a discharge summary (refused with the reason).
- A mismatch against the game plan brand line shows the exact difference and does not block Save without Colby's override (existing rule).

## Boundaries
- Never: add H/H to an auto brand, store a VIN or booking number, fill a number the page does not state, or change a figure to make a check pass.
