# Spec: 07:00 safety meeting (Phase 7e)

Status: **DRAFT**, waiting on Colby's approval. Colby asked for this rule on 2026-10-05. The glossary records it ("07:00 start: includes a 10-minute safety meeting", Confirmed); Protocol v1.1 and the app do not have it yet.

## Objective
A workday that starts at 07:00 begins with a 10-minute safety meeting, so production can't start before 07:10. Pace and the ETA forecast should count that hour as 50 productive minutes, not 60, so the first hour doesn't read as a false production drop and the forecast doesn't assume 10 minutes of work that can't happen. Success: on a 07:00 day the first hour's Pace uses 50 minutes and says why; H.A. is unchanged; nothing else moves.

## Rule (proposed)
- Applies to any workday whose start time is 07:00: Day 1 (`baseline.start`) and a next-day start (`plan.nextStart`).
- The meeting runs 07:00-07:10. Productive minutes in the 07:00 hour = 50 when production runs to 08:00.
- **H.A. is unchanged**: field count ÷ counted nominal hours, as the Project Instructions define it. Only Pace and the ETA use productive minutes.
- **Never subtract twice.** If Colby records a later actual start (the existing `day_start` entry, e.g. 07:20), the productive start is the later of 07:10 and that time, so a 07:20 start gives 40 minutes, not 30. The same applies if the 07:00 hour is also cut short by a break.
- The ETA forecast for a day that starts at 07:00 (including the Day 2 roll-over) begins at 07:10.
- Screens: the 07:00 hour shows "50 min (safety meeting 07:00-07:10)" wherever a short hour shows its minutes; the About this text for Pace names the rule. No new screen, no alert.

## Open questions (recommended default first)
1. **Starts other than 07:00** (for example 08:00): no meeting deduction (default; the glossary names 07:00 only), or the meeting applies to every day's start?
2. **Meeting length**: fixed 10 minutes (default), or editable per day for a day when it ran long or was skipped (stored as a correction with history, like `day_start`)?
3. **Driver rate** (vehicles per driver per hour): also uses 50 minutes for that hour (default, same as Pace), or stays nominal like H.A.?
4. **Project Instructions**: add the same rule to the ANALYTICS section so vessel chats apply it too (default: yes, as revision 4 once this spec is approved).

## Engine changes (after approval)
- `src/engine/production.ts` `buildPeriods`: the 07:00 hour's productive minutes start at the later of 07:10 and the recorded actual start; `Period` gets a reason field for the screens.
- `src/engine/eta.ts`: a day starting at 07:00 starts producing at 07:10.
- No new event type: the rule is derived from the start times already stored. Defaults to question 2 decide whether a correction event is needed.

## Tests (written first)
- 07:00 day, 120 autos in the 07:00 hour: Pace = 144/h (120 ÷ 50 min), H.A. unchanged; reason text present.
- 08:00 day: no deduction (per question 1's default).
- Recorded actual start 07:20 on a 07:00 day: 40 productive minutes, not 30.
- Day 2 with `nextStart` 07:00: the ETA forecast resumes at 07:10.
- The screen-number tests (screens 01-03) and the Glovis Condor 101 replay still pass unchanged (their Day 1 starts at 08:00). If either moves, stop and ask Colby.
- Expected to change, on purpose: the Day 2 scenarios that start at 07:00 (`tests/scenarios.ts` "Day 2 production", the Day 2 cases in `tests/eta.test.ts`). Each updated number gets a comment naming this rule.

## Boundaries
- Never: change a field count, H.A.'s denominator, or a recorded time; treat the meeting as a break (no clear-by applies to it).
