# Spec: H/H timeline (Phase 7g)

Status: **APPROVED and built 2026-10-05** (Colby's answers applied below). Built as: `src/engine/hh.ts` (passes, status, analysis), the `hh_phase` status change in `project()`, `hhMarkerEvents` / `editHhMarkerEvents` / `removeHhMarkerEvents` in `entries.ts`, the H/H mode on the Log sheet, the Plan card, hour tags, the report's H/H section after protocol 9.3's fifteen, and an Ask answer. Colby asked on 2026-10-05: the start and end of H/H will play a part in the analysis of the car discharge. When H/H completes, some drivers often switch to the car gang (the driver count and its reason are already in the app), and once the large units are gone, cars are no longer waiting on them, so pace and H.A. should theoretically rise. Decided with him the same day: log **both start and complete**, and allow **multiple passes** (H/H can pause and restart).

## Objective
Record when H/H starts and completes so the hourly record and the completion report can show how the car discharge looked while H/H was active and after it cleared. H/H stays awareness only: another stevedore counts it, the app shows its numbers read-only and never adds them to auto counts (CLAUDE.md, Ledgers). Success: on a vessel with H/H, two taps log a pass; the hourly log and Plan show it; the report compares the car hours with H/H active against the car hours after it cleared, with denominators, as an observation and never a cause.

## Rule (proposed)
- **Two markers, one pass each:** "H/H started" and "H/H complete". A pass is one start and its complete. Passes can repeat (start, complete, start, complete ...).
- **Times:** the exact time when Colby gives it; otherwise a clearly labeled processing time (the Data-honesty rule). A marker can be back-timed within the day.
- **Never automatic, with one stated exception (Colby, 2026-10-05):** nothing marks H/H complete by itself, not a count, not a timer (the same rule as ETA). It is Colby's tap. If a pass is still open when the shift ends and no closing time was entered, the analysis treats it as ending with the shift, and says so ("ended with the shift, no closing time entered"). The marker itself stays open; Colby can still back-time a real closing time, which then replaces the shift end.
- **Order is checked:** a complete needs an open start before it; a start needs the previous pass closed; times increase; a complete can't be before its start. A refusal says exactly what is wrong and what to do ("H/H is already started since 08:10. Mark it complete first, or correct that start.").
- **Corrections** supersede the old time and keep history, with a reason, like every other entry.
- **Counts:** H/H counts stay where they are (the H/H ledger, read-only). Markers carry no counts and never touch an auto ledger.
- **Driver changes:** when a pass completes, Setup of the next hour offers "Drivers changed?" using the **existing** hour driver count and the existing reason list for driver changes. Nothing is assumed: no change is logged unless Colby enters one. The hour's own driver count already wins over the day's, so earlier hours keep their rate.

## Analysis (observation, never cause)
- **H/H active hour:** the hour lies wholly inside a pass. **H/H clear hour:** wholly outside every pass and after a pass ended. **Transition hour:** an hour that holds a pass start or end, counted in neither group and listed. Hours before the first start are listed and not compared.
- For each group: autos counted, counted hours (H.A. denominator), productive hours (Pace denominator), H.A., Pace, and the average driver count. Driver rate (vehicles per driver per hour) is shown beside them, so a change in drivers is visible next to a change in pace.
- **Every hour counts** (Colby, 2026-10-05): there is no minimum number of hours. A group with one hour is shown, with its denominator, so thin data is visible and never hidden. A group with no hours shows "none yet" and no comparison.
- Wording follows the protocol's analytics rule: "H.A. was 118 while H/H was active (4 h) and 142 after it cleared (3 h); 12 more drivers were on cars after 13:20. Consistent with, not proof of, H/H clearing; possible contributors also include the drivers." Never "because".
- Pace uses productive minutes, so the 07:00 safety meeting and short pre-break hours are already handled.

## Screens (layout only, per vsa-field-ui)
- **Log sheet:** the two 56 pt buttons, **Start H/H** and **H/H complete**, each asking for the time with the existing time picker (default: now, labeled). The sheet swaps its content, never opens a second modal.
- **Plan:** an H/H card showing the state only, read-only (Not started / Active since 08:10 / Complete 13:20 / Active again since 15:00 / Ended with the shift) and the H/H counts.
- **Hourly log:** an hour that holds a marker shows a small tag ("H/H started 08:10", "H/H complete 13:20").
- **Completion report:** an H/H timeline line per pass and the before/after block above, in the analysis section.
- **Ask:** "when did H/H finish?" answers from the markers; unknown stays unknown.
- No alarms, no new modal (one `Sheet` at a time).

## Data (event ledger, per the vsa-event-ledger skill)
- One status-change event type for the marker, shaped like the existing `shift` status change (started / completed, with a time), on the H/H workstream. Exact fields follow `docs/06` at build time.
- Old logs have no markers and replay unchanged; the new rule is enforced in `src/app/entries.ts`, and `src/engine` only accepts well-formed markers, so a stored log always replays.
- Backup export and import carry the markers like any other event.

## Open questions (recommended default first)
None open. Decided by Colby on 2026-10-05: the buttons live on the Log sheet; every hour counts; an unclosed pass ends with the shift.

## Tests (written first)
- Start, complete, start, complete: states and times; order and overlap refusals with their exact messages; a complete with no open start; a start while one is open.
- Correction of a time supersedes and keeps history; a log with no markers replays unchanged (Glovis Condor 101 and screens 01-03 unmoved).
- Analysis: groups, denominators, driver averages, transition hours listed, a one-hour group shown (no minimum), "none yet" for an empty group, and wording that never says "because".
- A pass open at shift end is treated as ending with the shift and labeled so; a later back-timed complete replaces that end; the shift end not yet logged leaves the pass active.
- A real-paperwork check on the Pontus Highway day once Colby has logged markers on the phone (CLAUDE.md rule 6).

## Boundaries
- Never: add H/H to auto counts or compare auto counts with a total that includes it, mark a pass complete automatically, change a recorded time, or state a cause.
