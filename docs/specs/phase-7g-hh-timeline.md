# Spec: H/H timeline (Phase 7g)

Status: **DRAFT**, waiting on Colby's approval. Colby asked on 2026-10-05: the start and end of H/H will play a part in the analysis of the car discharge. When H/H completes, some drivers often switch to the car gang (the driver count and its reason are already in the app), and once the large units are gone, cars are no longer waiting on them, so pace and H.A. should theoretically rise. Decided with him the same day: log **both start and complete**, and allow **multiple passes** (H/H can pause and restart).

## Objective
Record when H/H starts and completes so the hourly record and the completion report can show how the car discharge looked while H/H was active and after it cleared. H/H stays awareness only: another stevedore counts it, the app shows its numbers read-only and never adds them to auto counts (CLAUDE.md, Ledgers). Success: on a vessel with H/H, two taps log a pass; the hourly log and Plan show it; the report compares the car hours with H/H active against the car hours after it cleared, with denominators, as an observation and never a cause.

## Rule (proposed)
- **Two markers, one pass each:** "H/H started" and "H/H complete". A pass is one start and its complete. Passes can repeat (start, complete, start, complete ...).
- **Times:** the exact time when Colby gives it; otherwise a clearly labeled processing time (the Data-honesty rule). A marker can be back-timed within the day.
- **Never automatic:** nothing marks H/H complete by itself, not a count, not a timer (the same rule as ETA). It is Colby's tap.
- **Order is checked:** a complete needs an open start before it; a start needs the previous pass closed; times increase; a complete can't be before its start. A refusal says exactly what is wrong and what to do ("H/H is already started since 08:10. Mark it complete first, or correct that start.").
- **Corrections** supersede the old time and keep history, with a reason, like every other entry.
- **Counts:** H/H counts stay where they are (the H/H ledger, read-only). Markers carry no counts and never touch an auto ledger.
- **Driver changes:** when a pass completes, Setup of the next hour offers "Drivers changed?" using the **existing** hour driver count and the existing reason list for driver changes. Nothing is assumed: no change is logged unless Colby enters one. The hour's own driver count already wins over the day's, so earlier hours keep their rate.

## Analysis (observation, never cause)
- **H/H active hour:** any part of the hour overlaps an H/H pass. **H/H clear hour:** no overlap and at least one pass has completed earlier. **Transition hour:** an hour that starts or ends inside a pass boundary, counted in neither group and listed.
- For each group: autos counted, counted hours (H.A. denominator), productive hours (Pace denominator), H.A., Pace, and the average driver count. Driver rate (vehicles per driver per hour) is shown beside them, so a change in drivers is visible next to a change in pace.
- Fewer than 2 hours in either group: "Not enough hours yet" and no comparison.
- Wording follows the protocol's analytics rule: "H.A. was 118 while H/H was active (4 h) and 142 after it cleared (3 h); 12 more drivers were on cars after 13:20. Consistent with, not proof of, H/H clearing; possible contributors also include the drivers." Never "because".
- Pace uses productive minutes, so the 07:00 safety meeting and short pre-break hours are already handled.

## Screens (layout only, per vsa-field-ui)
- **Plan:** an H/H card: state (Not started / Active since 08:10 / Complete 13:20 / Active again since 15:00), the H/H counts read-only, and two 56 pt buttons, **Start H/H** and **H/H complete**, each asking for the time with the existing time picker (default: now, labeled).
- **Hourly log:** an hour that holds a marker shows a small tag ("H/H started 08:10", "H/H complete 13:20").
- **Completion report:** an H/H timeline line per pass and the before/after block above, in the analysis section.
- **Ask:** "when did H/H finish?" answers from the markers; unknown stays unknown.
- No alarms, no new modal (one `Sheet` at a time).

## Data (event ledger, per the vsa-event-ledger skill)
- One status-change event type for the marker, shaped like the existing `shift` status change (started / completed, with a time), on the H/H workstream. Exact fields follow `docs/06` at build time.
- Old logs have no markers and replay unchanged; the new rule is enforced in `src/app/entries.ts`, and `src/engine` only accepts well-formed markers, so a stored log always replays.
- Backup export and import carry the markers like any other event.

## Open questions (recommended default first)
1. **Where do the buttons live?** Default: the Plan H/H card. Alternative: also on the Log sheet.
2. **Is a pass needed to be closed at shift end?** Default: no. A pass left open at the end of the day is shown as "H/H still active at shift end" in the report, and Day 2 can complete it.

## Tests (written first)
- Start, complete, start, complete: states and times; order and overlap refusals with their exact messages; a complete with no open start; a start while one is open.
- Correction of a time supersedes and keeps history; a log with no markers replays unchanged (Glovis Condor 101 and screens 01-03 unmoved).
- Analysis: groups, denominators, driver averages, transition hours listed, "Not enough hours yet", and wording that never says "because".
- A real-paperwork check on the Pontus Highway day once Colby has logged markers on the phone (CLAUDE.md rule 6).

## Boundaries
- Never: add H/H to auto counts or compare auto counts with a total that includes it, mark a pass complete automatically, change a recorded time, or state a cause.
