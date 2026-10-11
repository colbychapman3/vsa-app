// Colby, 2026-10-10: a shift end names its side (Northside or Southside); the hour it ends in, and a forecast with a planned
// shift end, stop that side's minutes before it. Its own rule, apart from the pre-break clear-by. Through the real store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Baseline, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { hourlyView, planView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-SHIFT-END';
const t = (hm: string, day = 1) => ({ day, hm });

async function setup(tc: { after: (fn: () => Promise<void>) => void }, baseline: Baseline = glovis) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-shiftend-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline, isTest: true })).ok);
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
  return { ctx, ok, refused, get state() { return state; } };
}

test('shift end asks the side: the hour it ends in stops at that side’s clear-by', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '15:00', count: 200 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '16:00', count: 120 }));
  assert.deepEqual(E.endShiftEvents(s.ctx(), t('17:00'), null), { ok: false, error: 'Pick the side the shift ended on: Northside or Southside.' });
  await s.ok(E.endShiftEvents(s.ctx(), t('17:00'), 'S'));
  const last = s.state.periods.at(-1)!;
  assert.deepEqual([last.start, last.short, last.min, last.pace], ['16:00', true, 30, 240]);
  assert.equal(last.reason, 'Shift ended 17:00 on Southside · stopped 30 min before');
  assert.deepEqual(s.state.production.unsetShort, []); // nothing to pick: the side set the stop
  assert.equal(s.state.production.countedHours, 2); // H.A. unchanged: still two nominal hours
  assert.equal(hourlyView(s.state, glovis).rows.at(-1)!.short, 'Stopped 16:30 · 30 min worked · pace 240/hr');
});

test('Northside shift end mid-hour: a 16:30 end leaves 15 minutes of the 16-17 hour', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '16:00', count: 40 }));
  await s.ok(E.endShiftEvents(s.ctx(), t('16:30'), 'N'));
  assert.deepEqual([s.state.periods[0].min, s.state.periods[0].pace], [15, 160]);
});

test('planned Day 1 shift end uses the clear-by of the side picked, not the vessel’s widest', async (tc) => {
  const both = { ...glovis, destinations: [...glovis.destinations, { name: 'Zone 1 (MB Field)', side: 'S', clearBy: 30, mi: 1.7, ref: '', brands: [], autos: 0 }] } as Baseline;
  const s = await setup(tc, both);
  for (const [h, n] of [['08:00', 250], ['09:00', 250]] as const) await s.ok(E.hourEvents(s.ctx(), { day: 1, start: h, count: n }));
  assert.deepEqual(E.shiftSettingsEvents(s.ctx(), '17:00', '08:00', null), { ok: false, error: 'Pick the side Day 1 ends on: Northside or Southside.' });
  await s.ok(E.shiftSettingsEvents(s.ctx(), '17:00', '08:00', 'N'));
  // 1,469 left at 250/hr = 5.876 hr from 10:00: 10:00-11:30 (South clear-by before noon on a two-side ship), 13:00-16:45 = 5.25 hr, so Day 2.
  assert.equal(planView(s.state, both).forecast.dayEnd, '17:00 · Northside (last cars 16:45)');
  const north = s.state.eta.etaAbs!;
  await s.ok(E.shiftSettingsEvents(s.ctx(), '17:00', '08:00', 'S'));
  assert.equal(planView(s.state, both).forecast.dayEnd, '17:00 · Southside (last cars 16:30)');
  assert.equal(s.state.eta.etaAbs! - north, 15); // 15 more minutes lost on Day 1 → the finish moves 15 minutes later
  // Changing only the side is a change worth saving; the same side again is not.
  assert.deepEqual(E.shiftSettingsEvents(s.ctx(), '17:00', '08:00', 'S'), { ok: false, error: 'Nothing to save: these shift settings are already set.' });
});
