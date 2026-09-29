// A late start (accident, late vessel, ramp problem): the day's actual start is a
// day_start event; hours before it count only the minutes from it. Through the real store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { planView, hourOptions } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-LATE-START';
const t = (hm: string, day = 1) => ({ day, hm });

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-late-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const save = async (evs: VsaEvent[] | Reject) => {
    if (!Array.isArray(evs)) return evs;
    const r = await store.append(OP, evs);
    if (r.ok) state = r.state;
    return r;
  };
  const ok = async (evs: VsaEvent[] | Reject) => { const r = await save(evs); assert.ok(r.ok, JSON.stringify(r)); };
  const refused = async (evs: VsaEvent[] | Reject, msg: RegExp) => {
    const before = state.log.events.length;
    const r = await save(evs);
    assert.ok(!r.ok && msg.test(r.error), JSON.stringify(r));
    assert.equal(state.log.events.length, before);
  };
  return { ctx, ok, refused, store, get state() { return state; } };
}

test('no day_start: planned start shown, nothing invented, pace on a full hour', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(planView(s.state, glovis).dayStarts.map((d) => [d.label, d.value, d.actual]), [['Day 1 start', 'Planned 08:00', null], ['Day 2 start', 'Planned 08:00', null]]);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 240 }));
  assert.equal(s.state.periods[0].min, 60);
  assert.equal('lateMin' in s.state.periods[0], false);
});

test('late start: the first hour counts only minutes from the actual start; pace uses them, H.A. still counts the hour', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:40', 'Ramp problem'));
  const ev = s.state.log.events.at(-1)!;
  assert.deepEqual([ev.event_type, ev.payload.metric, ev.payload.value, ev.payload.cause, ev.occurred_at, ev.payload.period_start],
    ['observation', 'day_start', '08:40', 'Ramp problem', '2026-09-21T08:40:00-04:00', '2026-09-21T00:00:00-04:00']);
  assert.deepEqual(planView(s.state, glovis).dayStarts[0], { day: 1, label: 'Day 1 start', planned: '08:00', actual: '08:40', cause: 'Ramp problem', value: 'Started 08:40 (late 40 min)' });

  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 240 }));
  const [h8, h9] = s.state.periods;
  assert.deepEqual([h8.min, h8.lateMin, h8.pace], [20, 40, 300]);   // 100 in 20 productive minutes
  assert.deepEqual([h9.min, h9.pace], [60, 240]);
  assert.equal(s.state.production.prodMin, 80);
  assert.equal(s.state.production.pace, 340 / (80 / 60));           // productive minutes, not 2 h
  assert.equal(s.state.production.ha, 170);                         // 340 / 2 counted hours (unchanged rule)
  assert.equal(s.state.production.countedHours, 2);
  // The hour grid stays on the planned start.
  assert.equal(hourOptions(s.state, glovis).hours[0].start, '08:00');
});

test('late start inside the pre-break hour reduces the stop-time minutes', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '11:10'));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '11:00', count: 30, stopMin: 45 }));
  assert.deepEqual([s.state.periods[0].min, s.state.periods[0].pace], [35, 30 / (35 / 60)]);
  // A start after production stopped leaves no productive minutes.
  await s.refused(E.dayStartEvents(s.ctx(), 1, '11:50', null, 'Typo'), /no productive time/);
});

test('an hour wholly before the actual start cannot hold a count above 0', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '09:10'));
  await s.refused(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 40 }),
    /Hour 08:00: Day 1 work started at 09:10, so this hour has no productive time and can't have a count above 0\. Log the count in the hour work actually started, or correct the day's start time\./);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 0 })); // zero is allowed, and has no pace
  assert.deepEqual([s.state.periods[0].min, s.state.periods[0].pace], [0, null]);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 50 })); // 50 min productive
  assert.equal(s.state.periods[1].min, 50);
});

test('saving a late start over an hour that has no productive minutes is refused', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  await s.refused(E.dayStartEvents(s.ctx(), 1, '09:00'), /Hour 08:00: Day 1 work started at 09:00/);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:30'));
  assert.equal(s.state.periods[0].min, 30);
});

test('refusals: earlier than planned, not before the first break, not a time, unchanged', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(E.dayStartEvents(s.ctx(), 1, '07:30'), { ok: false, error: 'Day 1 start 07:30 is earlier than the planned 08:00. Operations start on the hour; only a later start can be recorded.' });
  assert.deepEqual(E.dayStartEvents(s.ctx(), 1, '12:00'), { ok: false, error: 'Day 1 start 12:00 must be before the 12:00 break.' });
  assert.deepEqual(E.dayStartEvents(s.ctx(), 1, '8-40'), { ok: false, error: 'Enter the actual start as HH:MM, for example 08:40.' });
  assert.deepEqual(E.dayStartEvents(s.ctx(), 0, '08:40'), { ok: false, error: 'Pick the operation day.' });
  // The engine refuses the same things if an event gets past the form.
  const bad = E.dayStartEvents(s.ctx(), 1, '08:40') as VsaEvent[];
  bad[0].payload.value = '07:30'; bad[0].occurred_at = '2026-09-21T07:30:00-04:00';
  await s.refused(bad, /Day 1 start 07:30 is earlier than the planned 08:00/);
  const badVal = E.dayStartEvents(s.ctx(), 1, '08:40') as VsaEvent[];
  badVal[0].payload.value = 'soon';
  await s.refused(badVal, /day_start must be an HH:MM time/);
  const mismatch = E.dayStartEvents(s.ctx(), 1, '08:40') as VsaEvent[];
  mismatch[0].occurred_at = '2026-09-21T08:50:00-04:00';
  await s.refused(mismatch, /doesn't match the event time/);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:40', 'Accident'));
  assert.deepEqual(E.dayStartEvents(s.ctx(), 1, '08:40', 'Accident', 'Typo'), { ok: false, error: 'Nothing to save: Day 1 already shows this start (08:40).' });
  // A second uncorrected figure for the same day is refused.
  const dup = E.dayStartEvents(s.ctx(), 2, '08:30') as VsaEvent[];
  const dup2 = E.dayStartEvents(s.ctx(), 2, '08:45') as VsaEvent[];
  dup2[0] = { ...dup2[0], event_id: `${OP}-99`, idempotency_key: `${OP}-99`, sequence: 99 };
  await s.refused([...dup, dup2[0]], /Day 2 already has an actual start .* correct that event instead/);
});

test('correction supersedes with a reason and keeps history; void goes back to the planned start', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:40', 'Late vessel'));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  assert.deepEqual(E.dayStartEvents(s.ctx(), 1, '09:00'), { ok: false, error: 'Pick a reason for changing Day 1’s start time. The old time is kept.' });
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:30', 'Late vessel', 'Checker update'));
  assert.equal(s.state.periods[0].min, 30);
  assert.equal(s.state.dayStarts[1].actual, '08:30');
  assert.deepEqual(s.state.corrections.filter((c) => c.metric === 'day_start').at(-1)!.history, ['08:40', '08:30']);
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'day_start').length, 2); // 08:40 kept

  assert.deepEqual(E.clearDayStartEvents(s.ctx(), 1, null), { ok: false, error: 'Pick a reason for clearing Day 1’s start time. The old time is kept.' });
  assert.deepEqual(E.clearDayStartEvents(s.ctx(), 2, 'Typo'), { ok: false, error: 'Day 2 has no actual start recorded; the planned start applies.' });
  await s.ok(E.clearDayStartEvents(s.ctx(), 1, 'Typo'));
  assert.equal(s.state.dayStarts[1].actual, null);
  assert.equal(s.state.periods[0].min, 60);                                  // back to the planned start
  assert.equal(planView(s.state, glovis).dayStarts[0].value, 'Planned 08:00');
  assert.equal(s.state.log.events.filter((e) => e.payload.metric === 'day_start').length, 3);
  // Set again after clearing.
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:20'));
  assert.equal(s.state.periods[0].min, 40);
});

test('replay of the stored log rebuilds the same state', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:40', 'Other'));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 100 }));
  await s.ok(E.dayStartEvents(s.ctx(), 1, '08:50', null, 'Typo'));
  const again = project(glovis, s.state.log.events, OP);
  assert.ok(again.ok);
  assert.deepEqual(again.periods, s.state.periods);
  assert.deepEqual(again.dayStarts, s.state.dayStarts);
  assert.deepEqual((await s.store.load(OP) as { state: State }).state.dayStarts, s.state.dayStarts);
});

test('Day 2 late start: ETA resumes from the actual start, still FORECAST', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.shiftSettingsEvents(s.ctx(), '17:00', '08:00'));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 250 }));
  await s.ok(E.endShiftEvents(s.ctx(), t('17:00')));
  const planned = s.state.eta.etaAbs!;
  await s.ok(E.dayStartEvents(s.ctx(), 2, '09:30', 'Late vessel'));
  assert.equal(s.state.eta.label, 'FORECAST');
  assert.equal(s.state.eta.fromAbs, 1440 + 9 * 60 + 30); // the forecast starts at Day 2 09:30, not 08:00
  assert.ok(s.state.eta.etaAbs! > planned);
  assert.deepEqual(planView(s.state, glovis).dayStarts[1].value, 'Started 09:30 (late 90 min)');
});
