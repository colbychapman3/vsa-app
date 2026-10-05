// Replay and projection must stay linear in the length of the log. Wall-clock limits are brittle (CI
// machines vary and a desktop says little about an iPhone), so this counts work instead: every property
// read on an event. Four times the events should cost about four times the reads (linear); a rescan or
// copy of the log per event makes it about sixteen times (quadratic). The limit sits between the two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project, replay, type VsaEvent } from '../src/engine/index.ts';
import { glovis } from './scenarios.ts';
import { synthLog, SYNTH_OP } from './synthLog.ts';

let reads = 0;
const counted = <T extends object>(e: T): T => new Proxy(e, {
  get(t, k, r) { reads++; const v = Reflect.get(t, k, r); return v && typeof v === 'object' ? counted(v) : v; },
});
const readsFor = (n: number, run: (events: VsaEvent[]) => unknown): number => {
  const events = synthLog(n).map((e) => counted(e));
  reads = 0;
  const r = run(events) as { ok?: boolean; error?: string };
  assert.ok(!('error' in r), `${n} events must replay: ${r.error}`);
  return reads;
};
const LINEAR = 4, QUADRATIC = 16, LIMIT = 6; // growth for 4x the events

for (const [name, run] of [
  ['replay()', (ev: VsaEvent[]) => replay(ev, SYNTH_OP)],
  ['project()', (ev: VsaEvent[]) => project(glovis, ev, SYNTH_OP)],
] as const) {
  test(`scaling: ${name} work grows linearly with the log`, () => {
    const small = readsFor(250, run), large = readsFor(1000, run);
    const growth = large / small;
    assert.ok(growth < LIMIT, `4x the events cost ${growth.toFixed(1)}x the reads (linear is ${LINEAR}, quadratic is ${QUADRATIC}); something scans or copies the log per event`);
  });
}
