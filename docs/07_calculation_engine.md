# Calculation engine and metric contract
All counts are integer units; durations are hours or explicitly labeled minutes. Never mix autos with H&H/static or discharge with load-back. Every result retains operation ID, scope, inputs, source/event IDs, checkpoint, formula and provenance. Missing inputs yield unknown, not zero. A calculation using a forecast input remains a forecast. Retain full precision internally; display counts as integers, rates/percentages to one decimal, time estimates to sensible minutes.

## Inventory and reconciliation
Let S = current authoritative starting autos, V = confirmed vessel progress, F = field-counted autos, L = authoritative load quantity, A = confirmed loaded.

- Vessel remaining = S - V. Negative result is an exception; never clamp it silently.
- Field-ledger balance = S - F. This is NOT physical vessel remaining.
- Load-back remaining = L - A, separately by port/code and deck when allocations are established.
- Percent vessel complete = 100 V / S, for S > 0. For S = 0, report no cargo in scope; percentage is not applicable, not 100% by division.
- Signed reconciliation variance = V - F at the same checkpoint/scope. If positive, accounting in transit = variance; if zero, counts match; if negative, flag field exceeds vessel progress, with in-transit quantity unknown. Do not invent a cause.
- At a stop/completion, positive variance still needs confirmation/investigation; equal totals do not prove every destination/deck allocation matches. Match subtotals too.
- Authoritative direct remaining R can derive V = S - R if scope and S are established. Preserve that derivation and do not also add the same production as a second event.

## Hourly counts, H.A. and productive time
For cumulative checkpoints, interval units = C_end - C_start; for an interval report, use reported units directly. A decreasing cumulative count triggers a correction query unless an explicit correction explains it. Do not sum overlapping intervals or mix cumulative checkpoints with increments.

Nominal interval rate = units / interval hours. A 30-minute interval of 120 units is 240/hour, not 120/hour. Protocol-compatible H.A. = sum of field units / sum of covered active nominal reporting hours. Exclude full known breaks; never count missing periods as zero. Show the coverage and denominator. A short pre-break reporting hour can remain one nominal reporting hour; its productive-time rate is separate.

Productive hours = verified productive minutes / 60. Merge overlapping stop intervals before subtracting them from the relevant window; do not double-count a cutoff already included in a stoppage. Productive rate = matched-window units / productive hours. Do not automatically derive actual productive minutes from a planned cutoff or a reference safety meeting. If production continued through a supposed stop, flag the conflict. Field arrivals may lag vessel movement: do not attribute a field-window productive rate to the vessel's precise work window without matched evidence.

Driver-hours = sum over segments(driver count x productive hours in that segment). Vehicles/driver/hour = matched units / driver-hours. For a full nominal hour with constant gang this reduces to units / drivers; label that nominal basis. Missing drivers, zero driver-hours, or nonpositive durations make the rate unavailable. Never average differing gang sizes without time weighting.

Example: 240 cars over an hour with 40 drivers for 30 minutes and 60 for 30 minutes gives 50 driver-hours and 4.8 cars/driver/hour.

## Short hours and cutoffs
Clear-by = scheduled break start minus confirmed destination cutoff. Noon Northside -> 11:45, Southside -> 11:30. Standard 11:00-12:00 and 17:00-18:00 can be short hours. If 120 units are confirmed produced during 11:00-11:30 with no other stop, productive rate is 240/hour while the 11:00-12:00 bucket count is 120. Neither justifies calling the crew inefficient. A cutoff is a planning constraint; verify actual productive minutes for measured efficiency.

## Forecasting and required rate
Choose a comparable recent rate with an explicit workstream, ledger basis and window. If only field rates exist, flag field lag as a limitation when estimating vessel completion. Do not invent multipliers for destinations, decks or drivers. Record assumptions for any scenario model.

Active hours needed = remaining / selected positive rate. To obtain clock ETA, consume productive time across future working windows, skipping confirmed breaks/cutoffs/stoppages. Do not use a rate already diluted by those same stops and then subtract the stops again. Unknown future schedule -> conditional ETA or unavailable.

Required rate = remaining / available positive productive hours before target. If no productive time remains and cargo remains, target is infeasible on those assumptions. Zero remaining means no further production required; it does not establish an actual completion time. Do not backdate a completion to the forecast.

Example: at 11:00, 360 autos remain, rate 240/active hour, Southside cutoff 11:30, break 12:00-13:00, no work 11:30-13:00. Produce 120 before cutoff and 240 after restart: estimated finish 14:00. A 14:00 target has 1.5 active hours, requiring 240/hour.

Preserve each forecast's issued time, predicted scope/time, selected rate, data window and assumptions. Signed ETA error in minutes = actual completion time - predicted completion time (positive = later than forecast). Absolute error = abs(signed error). Compare the same completion milestone only. Never replace a historical forecast with the latest forecast when scoring accuracy.

## Distance and clearance arithmetic
Planning travel minutes = distance_miles / assumed_mph x 60 for a positive assumed speed. At 2.6 miles and 15 mph, this is 10.4 minutes, labeled estimated travel excluding stops. It is not the 22-minute MBZ reference time and not a measured cycle. Feet-to-mile conversion is feet/5280 if explicitly requested; do not overwrite published rounded miles.

Height arithmetic, once the correct applicable SOP requirement is sourced: available clearance = minimum verified route/deck clear height - actual cargo height; margin = available clearance - required clearance. Missing any required evidence -> not verified. Negative margin -> incompatible. Nonnegative margin verifies only the inspected height constraint; it is not certification of all loading requirements. For the supplied 2024 SOP passenger-car scope, page 28 specifies 8 cm at deck heights <=220 cm and 10 cm above 220 cm. Verify applicability before use; this is not an H&H rule. A route segment can introduce separate constraints.

## Corrections and integrity
Replace a superseded interval value in the active projection; do not append it as extra production. A correction from 250 to 275 changes cumulative field count by +25. Recompute remaining labels, H.A., normalized rate, percent where affected, reconciliation and current forecast. Keep the former event immutable. A new correction can reopen a previously reconciled ledger.
