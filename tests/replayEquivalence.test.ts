// Replay must give byte-identical results however it is implemented. These hashes were taken from the
// original (quadratic) replay; the linear replay has to reproduce every one of them. They cover every
// parity scenario, the kit 1,969 log, a synthetic 400-event log at every 7th prefix, the history chains,
// and the paths where the engine refuses an event (the refusal text and event id are hashed too).
// To refresh after a deliberate engine change: UPDATE_REPLAY_HASHES=1 npm test (then say why in the commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { project, replay, appendEvent, emptyLog, historyOf, type VsaEvent, type EventLog } from '../src/engine/index.ts';
import { glovis, OP, SCENARIOS, toEvents, plain } from './scenarios.ts';
import { synthLog, SYNTH_OP } from './synthLog.ts';

const FILE = new URL('./fixtures/replay-hashes.json', import.meta.url);
const sorted = (x: unknown): unknown => Array.isArray(x) ? x.map(sorted)
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted((x as Record<string, unknown>)[k])])) : x;
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(sorted(x))).digest('hex');

const kit: VsaEvent[] = readFileSync(new URL('./fixtures/events.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const synth = synthLog(400);

const cases: Record<string, () => unknown> = {};
for (const sc of SCENARIOS) cases[`scenario: ${sc.name}`] = () => project(glovis, toEvents(sc), OP);
cases['kit replay'] = () => replay(kit, kit[0].operation_id);
for (let n = 7; n <= 400; n += 7) cases[`synthetic prefix ${n}`] = () => project(glovis, synth.slice(0, n), SYNTH_OP);
cases['synthetic full 400'] = () => project(glovis, synth, SYNTH_OP);
cases['synthetic history chains'] = () => {
  const log = replay(synth, SYNTH_OP) as EventLog;
  return log.events.filter((e) => e.supersedes_event_id).map((e) => [e.event_id, historyOf(log, e.event_id).map((x) => x.event_id)]);
};
cases['synthetic out of order input'] = () => project(glovis, [...synth.slice(0, 120)].reverse(), SYNTH_OP);

// Refusals: each takes a valid log and adds one bad event on top.
const withExtra = (extra: (log: VsaEvent[]) => VsaEvent | VsaEvent[]) => () => {
  const e = extra(synth.slice(0, 60));
  return project(glovis, [...synth.slice(0, 60), ...(Array.isArray(e) ? e : [e])], SYNTH_OP);
};
const firstNote = synth.find((e) => e.event_type === 'note.added')!;
const firstHour = synth[0];
cases['refused: same key, different content'] = withExtra(() => ({ ...plain(firstHour), event_id: 'DUP-1', sequence: 61, payload: { ...plain(firstHour.payload), value: 99 } }));
cases['refused: overlapping hour'] = withExtra(() => ({ ...plain(firstHour), event_id: 'OVL-1', idempotency_key: 'OVL-1', sequence: 61, payload: { ...plain(firstHour.payload), value: 21 } }));
cases['refused: correcting an already replaced event'] = withExtra((log) => {
  const edited = log.find((e) => e.event_type === 'note.corrected')!;
  return { ...plain(edited), event_id: 'COR-1', idempotency_key: 'COR-1', sequence: 61, supersedes_event_id: edited.supersedes_event_id };
});
cases['refused: correction of a missing event'] = withExtra(() => ({ ...plain(firstNote), event_type: 'note.corrected', event_id: 'MIS-1', idempotency_key: 'MIS-1', sequence: 61, supersedes_event_id: 'NOPE', payload: { ...plain(firstNote.payload), reason: 'Typo' } }));
cases['refused: sequence not after the last'] = withExtra(() => ({ ...plain(firstNote), event_id: 'SEQ-1', idempotency_key: 'SEQ-1', sequence: 3 }));
cases['refused: other operation'] = withExtra(() => ({ ...plain(firstNote), event_id: 'OP-1', idempotency_key: 'OP-1', sequence: 61, operation_id: 'TEST-OTHER' }));
cases['redelivery is a no-op'] = withExtra(() => plain(synth[10]));

const current: Record<string, string> = {};
for (const [name, run] of Object.entries(cases)) current[name] = hash(run());

if (process.env.UPDATE_REPLAY_HASHES) writeFileSync(FILE, JSON.stringify(current, null, 1) + '\n');

test('replay equivalence: every case hashes to the value taken from the original replay', () => {
  const expected = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>;
  assert.deepEqual(Object.keys(current), Object.keys(expected), 'the set of cases changed');
  const differ = Object.keys(current).filter((k) => current[k] !== expected[k]);
  assert.deepEqual(differ, []);
});

test('replay equivalence: the synthetic log is valid and the refusal cases refuse', () => {
  assert.ok((project(glovis, synth, SYNTH_OP) as { ok: boolean }).ok, 'synthetic 400-event log must project');
  for (const name of Object.keys(cases).filter((k) => k.startsWith('refused:'))) {
    const r = cases[name]() as { ok: boolean; error?: string };
    assert.equal(r.ok, false, name);
    assert.ok(r.error, name);
  }
  const log = replay(synth, SYNTH_OP) as EventLog;
  assert.ok(log.events.some((e) => log.supersededBy[e.event_id]), 'the log has correction chains');
  assert.equal(appendEvent(emptyLog(SYNTH_OP), synth[0]).hasOwnProperty('error'), false);
});
