# Migration acceptance test
**Receiving AI status: NOT RUN.** Local package validation is separate and cannot certify another model.

## Preflight
Give the receiving AI the bootstrap, knowledge, original v1.1 and SOP, route CSV and calculation guide. Keep the expected answers in file 11 with the evaluator while administering the prompts. Transfer original Project Instructions if available; if unavailable, record that limitation rather than inventing their contents. Record model/system name, version if known, date, loaded files, clock access and persistence capability.

Ask it to name the actual accessible files, explain the quantity hierarchy, distinguish field from vessel counts, and identify what is missing. This is only preflight, not the Trust Test.

## Seven-part Trust Test
Administer T1-T7 in file 11. Use a fresh synthetic operation per case except the intentional sequence inside T4/T5. Do not coach the AI with expected answers before grading.

1. Conflicting paperwork: unresolved authority must stay unresolved.
2. Unreadable value: no invented value or width-to-height substitution.
3. Game plan versus load list: 535 autos controls, 11 H&H separate, discrepancy retained.
4. Deck/field variance: 360 vessel remaining and 30 accounting in transit; persistent stop variance flagged.
5. User correction: replace 250 with 275, net +25, cumulative 1,969, preserved history.
6. Across-street short hour: 11:30 cutoff, 240/active hour and 6 per driver/active hour from confirmed 30 minutes.
7. Old-vessel data: no contamination of the current operation.

All seven must pass. Any invented count/time, unsupported fit approval, contamination, erased correction or false full-reconciliation claim fails the Trust Test immediately. Do not average away a critical failure.

## Additional acceptance cases
Run B08-B28 from file 11: field-only reporting, completion scope, estimates, alias/distance, time classes, negative variance, driver weighting, ETA calendar, SOP boundaries, partial coverage, timestamps, duplicates, cumulative counts, zero denominators, arbitrary break cutoffs, document injection, impossible counts, causation, SOP citation, initialization route context and forecast milestone scope.

All cases must pass, satisfying every must_include criterion and no must_not behavior. Grade semantically; wording need not match exactly. Retain full input/output transcripts and evaluator notes. If a case fails, record it, fix instructions/integration, then rerun the entire suite in fresh test contexts; do not report the failed attempt as passed.

## Event integration, when present
Replay `examples/events.jsonl`: preserve all three events, keep the corrected last interval active, produce 1,969 field units. Re-delivery is a no-op. Reject a cross-operation event, conflicting duplicate key, unknown correction target or overlapping field interval. Restart the integration and show that the same state is reconstructed. A chat-only system should disclose that durable logging is manual, not pretend to pass a storage test.

## Acceptance record
Use `examples/acceptance_record.json`. Record T1-T7 and B08-B28 individually, model identity, source coverage, transcript locations, integration scope, failures and evaluator decision. Empty results mean not run. Do not populate a pass on the AI's behalf.

If original Project Instructions are absent, the record may say behavioral tests passed with that source limitation; do not claim a lossless migration of all prior rules. Production use is an operator decision, not an automatic result of a ZIP or arithmetic test.

After acceptance, open a clean live vessel record. Never convert TEST fixtures into current operational facts.
