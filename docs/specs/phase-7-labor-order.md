# Spec: Labor order reader (Phase 7f)

Status: **DRAFT**, waiting on Colby's answers to the open questions. Colby asked on 2026-10-05 after phone-checking build #8: "The labor order shows the number of auto drivers, but it even gives a full description of the labor. That is useful to creating a new vessel."

## Objective
Colby photographs the APS **Labor Order** page and Setup fills what it states: the start time, the drivers, and the labor description, each checked against the cover page. Free, offline, no AI. Success: on the Pontus Highway V.15 labor order, Day 1 drivers and the start time are filled and the labor lines are kept as a Plan note, with every number tagged "From labor order: check".

## What the page holds (Pontus Highway V.15, 2026-10-05; photo in the 2026-10-05 session, saved as a fixture only with the phone's own read)
- Header: VESSEL (printed "Pontus Highway V.15"; the cover page prints "V.13" and the discharge summary "V.15A": show all three, never pick one), DATE, START TIME 07:00.
- Three gangs (AUTO GANG 1, AUTO GANG 2, HH/AUTO GANG 3), each with role rows: Header, HH Driver/Auto Drivers, Truck/Auto Driver, Lift Driver/Auto Driver, Auto Driver, Van Drivers, Flagmen, Spotter/Driver, Lashers, and a printed gang total (56, 48, 23).
- Support (Ship Foreman, Field Foreman, Gear Person, Water Person = 5), Clerks (Chief, Time Keeper, Plan, BMW Scan 6 with a "06:30 START" note, Field = 17), TOTAL LONGSHOREMAN 149.
- Discharge quantities (MB 96, BMW 1041, RR 13, MASE 4, POV 13, H/H 25, Units 1,192, Moves 1,311) and Load quantities (MB 1,214, POV 2, Heavy 19 = 1,235).
- Dispatch contact lines: never read or stored.

## Rule (proposed)
- **Start time** fills Setup's planned start. A different "06:30 START" for one crew is a note, not the start.
- **Drivers** fills only the number Colby says counts (open question 1); the gang rows go to the Plan note.
- **Labor note:** one Plan note listing each gang's roles and counts as printed, unticked by default.
- **Checks, shown and never fixed:** discharge brand counts equal the cover page's brand line (here they do: 1041 / 13 / 4 / 96 / 13); H/H and Units are compared with the cover page and the difference is shown (here: H/H 25 vs 24, Units 1,192 vs 1,191); a gang whose role rows do not add to its printed total says so.
- H/H stays awareness only and is never added to auto counts.

## The reading problem (found on the phone, 2026-10-05)
Apple's reader returned the labor order's labels but **none of the gang-column numbers** (42, 35, 6, 5, 56, 48, 23 ...) and dropped other isolated numbers in table cells (deck digits 8, 1 and 3 and the H/H amounts on the cover page). Reading these needs a second recognition pass over the number columns at higher zoom, in `modules/vsa-text` (Swift), which means a store build. Until a real phone read returns the numbers, nothing here can be pass/fail tested (CLAUDE.md rule 6). First task: add the second pass, take one phone read of this labor order, make it the fixture.

## Open questions (recommended default first)
1. **Which number is "Drivers, Day 1"?** The page has gang totals 56 / 48 / 23, Auto Driver rows 42 / 35, and Van Drivers 6 / 5 / 1. Default: Colby tells us once; recommended is the Auto Driver rows added across the two auto gangs (42 + 35 = 77) because that is who drives the autos, but this is Colby's to define.
2. **Should gang or role counts live anywhere besides a note?** Default: no, a note only.
3. **Day 2 drivers:** a second labor order for Day 2 sets Day 2 drivers the same way (default: yes, one page per read).

## Tests (written first, after the real phone read exists)
- The real phone read of this page: start time, gang rows, totals and the three checks.
- Damaged copies: a gang total changed (the mismatch is shown), a discharge count changed (the difference is shown), the START TIME missing (nothing is filled), a page that is not a labor order (refused with the reason).

## Boundaries
- Never: fill a number the page does not state, add H/H to autos, read or store the dispatch phone numbers or email, or pick between V.13, V.15 and V.15A.
