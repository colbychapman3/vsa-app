import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replay, appendEvent, emptyLog, activeEvents, historyOf, type VsaEvent, type EventLog } from '../src/engine/events.ts';

const kit: VsaEvent[] = readFileSync(new URL('./fixtures/events.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map((l) => JSON.parse(l));
const OP = 'TEST-CORRECTION';
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function fieldTotal(log: EventLog): number {
  return activeEvents(log)
    .filter((e) => e.payload.metric === 'field_units' && e.payload.count_kind === 'interval' && e.scope.commodity === null)
    .reduce((s, e) => s + (e.payload.value as number), 0);
}
function ok(r: ReturnType<typeof replay>): EventLog {
  assert.ok(!('error' in r), JSON.stringify(r));
  return r as EventLog;
}
function rejected(r: unknown, pattern: RegExp) {
  assert.ok(r && typeof r === 'object' && 'error' in r, `expected a rejection, got ${JSON.stringify(r)}`);
  assert.match((r as { error: string }).error, pattern);
}

test('kit replay: 1,969 field units, 275 active, 250 kept in history (T5)', () => {
  const log = ok(replay(kit, OP));
  assert.equal(fieldTotal(log), 1969);
  assert.deepEqual(activeEvents(log).map((e) => e.event_id), ['E1', 'E3']);
  assert.deepEqual(historyOf(log, 'E3').map((e) => [e.event_id, e.payload.value]), [['E2', 250], ['E3', 275]]);
  assert.equal(log.events.length, 3);
});

test('T5: a correction reports the net change and never adds on top', () => {
  const log = ok(replay(kit.slice(0, 2), OP));
  assert.equal(fieldTotal(log), 1944);
  const r = appendEvent(log, kit[2]);
  assert.ok(!('error' in r));
  assert.deepEqual(r.change, { target: 'E2', from: 250, to: 275, net: 25 });
  assert.equal(fieldTotal(r.log), 1969);
});

test('replaying twice rebuilds identical state; order comes from sequence', () => {
  const a = ok(replay(kit, OP));
  const b = ok(replay([kit[2], kit[0], kit[1]], OP));
  assert.deepEqual(b, a);
});

test('B19: exact re-delivery is a no-op', () => {
  const log = ok(replay([...kit, copy(kit[1]), copy(kit[2])], OP));
  assert.equal(fieldTotal(log), 1969);
  assert.equal(log.events.length, 3);
});

test('T7: an event from another operation is rejected before it reaches a ledger', () => {
  const other = { ...copy(kit[0]), operation_id: 'TEST-A' };
  rejected(replay([other], OP), /belongs to operation TEST-A, not TEST-CORRECTION/);
});

test('reused key with different content is a conflict', () => {
  const dup = copy(kit[1]); dup.payload.value = 260;
  rejected(replay([...kit, dup], OP), /E2 was already used with different content/);
});

test('corrections: unknown target, double supersession, scope change, missing reason', () => {
  const unknown = { ...copy(kit[2]), event_id: 'E4', idempotency_key: 'E4', sequence: 4, supersedes_event_id: 'E9' };
  rejected(replay([...kit, unknown], OP), /E9 is not in this operation's log/);

  const again = { ...copy(kit[2]), event_id: 'E4', idempotency_key: 'E4', sequence: 4 };
  rejected(replay([...kit, again], OP), /E2 was already replaced by E3; correct E3 instead/);

  const moved = copy(kit[2]); moved.payload.period_start = '2026-09-23T16:30:00-04:00';
  rejected(replay([kit[0], kit[1], moved], OP), /must keep the same scope, metric and period as E2/);

  const noReason = copy(kit[2]); noReason.payload.reason = null;
  rejected(replay([kit[0], kit[1], noReason], OP), /needs a reason/);

  // Correcting the active correction works and keeps the whole chain.
  const e4 = { ...copy(kit[2]), event_id: 'E4', idempotency_key: 'E4', sequence: 4, supersedes_event_id: 'E3', payload: { ...kit[2].payload, value: 270 } };
  const log = ok(replay([...kit, e4], OP));
  assert.equal(fieldTotal(log), 1964);
  assert.deepEqual(historyOf(log, 'E4').map((e) => e.payload.value), [250, 275, 270]);
});

test('overlapping field intervals in the same scope are rejected', () => {
  const overlap = { ...copy(kit[1]), event_id: 'E4', idempotency_key: 'E4', sequence: 4 };
  overlap.payload.period_start = '2026-09-23T16:30:00-04:00';
  overlap.payload.period_end = '2026-09-23T17:30:00-04:00';
  rejected(replay([...kit, overlap], OP), /overlaps E3/);
  // Back-to-back intervals are fine ([start, end) is half-open).
  const next = copy(overlap);
  next.payload.period_start = '2026-09-23T17:00:00-04:00';
  next.payload.period_end = '2026-09-23T18:00:00-04:00';
  assert.equal(fieldTotal(ok(replay([...kit, next], OP))), 1969 + 250);
});

test('envelope validation: counts, times, sequence, event type', () => {
  const bad = (f: (e: VsaEvent) => void, pattern: RegExp) => { const e = copy(kit[0]); f(e); rejected(appendEvent(emptyLog(OP), e), pattern); };
  bad((e) => (e.payload.value = -5), /whole number/);
  bad((e) => (e.payload.value = 12.5), /whole number/);
  bad((e) => (e.recorded_at = '2026-09-23 17:01'), /recorded_at/);
  bad((e) => (e.payload.period_end = e.payload.period_start), /period_end must be after period_start/);
  bad((e) => ((e as any).event_type = 'guess'), /event_type/);
  bad((e) => (e.sequence = 0), /sequence/);
  bad((e) => (e.supersedes_event_id = 'E0'), /Only a correction/);
  bad((e) => ((e.scope as any).workstream = 'cars'), /workstream/);

  const log = ok(replay(kit, OP));
  const late = { ...copy(kit[0]), event_id: 'E5', idempotency_key: 'E5', sequence: 2 };
  rejected(appendEvent(log, late), /sequence 2 is not after 3/);
});

test('impossible timestamps (month 13, hour 25, minute 99) are refused, never skipped past the overlap checks', () => {
  const field = kit.filter((e) => e.payload.metric === 'field_units' && e.payload.period_start);
  assert.ok(field.length >= 1);
  const bad = (f: (e: VsaEvent) => void, pattern: RegExp) => { const e = copy(field[0]); f(e); rejected(appendEvent(emptyLog(OP), e), pattern); };
  bad((e) => (e.payload.period_start = '2026-13-21T08:00:00-04:00'), /period_start/);
  bad((e) => (e.payload.period_end = '2026-09-21T25:00:00-04:00'), /period_end/);
  bad((e) => (e.payload.period_end = '2026-09-21T09:99:00-04:00'), /period_end/);
  bad((e) => (e.occurred_at = '2026-09-21T08:99:00-04:00'), /occurred_at/);
  bad((e) => (e.recorded_at = '2026-00-21T08:00:00-04:00'), /recorded_at/);
});
