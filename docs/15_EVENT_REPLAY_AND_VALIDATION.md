# Event architecture and integration contract
This file specifies new migration engineering conventions (D1). The original protocol requires preserving corrections; this is a concrete implementation, not a claim that the old assistant already used these schemas.

## Persistence
Store one JSON object per line, validated against file 06 before appending. Use durable, atomic, serialized writes per operation. Require unique event IDs, idempotency keys and strictly increasing sequences. Scope must bind workstream and any deck/hatch/commodity/destination. Exact duplicate delivery is a no-op; a reused key with different content is a conflict. Reject cross-operation events before they reach a ledger.

`occurred_at` is reported event time, nullable. `recorded_at` is actual clock processing time, offset-qualified. A current logging time cannot supply an unknown event time. Sequence determines deterministic application order even for late-arriving observations. Timestamp-only ordering must not overwrite explicit later corrections.

## Corrections
A correction references one earlier active event in the same operation, scope, metric and period. Retain both, replacing only the active projection. Correction of a correction targets the currently active correction. Reject cycles, unknown targets, double supersession and ambiguous scope. Require the reason and new evidence. Changing a timestamp/window or scope requires explicit reviewed remapping; the simple reference reducer rejects it. Do not merge it silently.

An authoritative inventory amendment changes the baseline with a reason and source; it is not extra discharge. A status event is not a cargo increment. Deck/hatch aggregates are projections over nonoverlapping inventory lines; do not sum a deck aggregate plus its constituent hatches.

## Counts and checkpoints
Field intervals are half-open [start,end). Reject overlapping active intervals in the same scope. A cumulative observation is a checkpoint, never an increment. Derive increments only between compatible cumulative checkpoints. Do not sum interval and cumulative representations of the same work. Missing intervals stay missing. Reference reducer intentionally returns active events, not a full multi-ledger automatic state; your adapter must implement these semantics.

## State semantics beyond JSON Schema
1. All source/event references resolve; source facts and user reports have evidence; calculated/forecast values retain input IDs. Unknown value = null and class unknown. No unknown-as-zero substitution.
2. Count values are nonnegative integers. Derived negative remaining is stored as a discrepancy and not presented as valid remaining. Preserve the contradictory inputs.
3. Enforce known starting = cleared + remaining within one inventory scope. For direct physical remaining, derive cleared once; do not also add the same movement from an hourly field report.
4. Compare field and vessel totals only for matched cargo scope and times. Zero global variance does not close allocation discrepancies.
5. Completion status requires evidence for that scope. Actual completion time may remain null. Not applicable requires explicit evidence, not absence of data.
6. `reconciled=true` requires relevant known totals to match, no open discrepancies and no unknown required ledger at the checkpoint. Full operation completion additionally requires every applicable workstream milestone; it is separate from count reconciliation.
7. Forecasts retain class forecast. A later matching observation is a new event, never conversion of a forecast into a fact.
8. Validate productive minutes against interval duration, driver segments against coverage and known breaks, and ISO timezones against the actual operation date (including daylight saving).

## Reference utilities and their limits
`vsa_reference.py` supplies checked arithmetic, working-window ETA, scope-safe correction replay, interval overlap checks and a schema validator for the precise keyword subset used by these two schemas. It is not a complete JSON Schema engine or a production database. It does not extract paperwork, determine SOP fit evidence, automatically operate an AI, or implement every business invariant above. The optional external-integration workflow should also validate using a full Draft-07 validator.

`run_validation.py` runs local artifact tests, not the receiving-AI Trust Test. Its report explicitly distinguishes these. Human-scored behavior and original-source comparison remain required. Any adapter should add persistence/concurrency tests and full semantic enforcement before being treated as a live ledger.

## Migration and rollback
Export state plus the entire event log and source register. Recompute the projection; compare totals, status, open discrepancies and forecast versions. Keep a read-only old snapshot until the new projection and Trust Test pass. If they do not, retain the old operational record and investigate the mismatch. Do not discard correction history to simplify import.


## Extended live-state coverage
The state schema also carries operation timing, time-bounded resource segments, actual/planned interruptions, per-destination route context, coverage-aware clearance checks, per-workstream physical/reconciliation status, and restrictions. Empty collections mean no records established, not that breaks/restrictions/workstreams do not exist. Individual unknown facts use null/unknown provenance.

Do not mark a clearance check verified unless its applicable SOP, full assigned quantity, current cargo dimensions, deck/route evidence and relevant restrictions support that scope. Keep partial checks partial. Resource intervals and interruption intervals must be checked for overlap and actual-versus-planned status before rates are calculated. A logged forecast about a future break is not an actual interruption observation.
