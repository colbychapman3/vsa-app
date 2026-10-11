// Live estimate between counts (Colby, 2026-10-11): the forecast's pace carried from the last logged hour to now.
// Always labeled an estimate, never a count, quiet when the count is fresh, and it stops guessing when the count is stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nowEstimate, productiveMinutes, scheduleOf, type Schedule, type VsaEvent, type Reject } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { snapshot } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const S: Schedule = { dayStart: '08:00', breaks: ['12:00', '18:00'], clearByMin: 15 };
const at = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const base = { remaining: 512, rate: 240, schedule: S, phase: 'working' as const };

test('estimate = remaining − pace × working minutes since the last logged hour', () => {
  const r = nowEstimate({ ...base, fromAbs: at('15:00'), nowAbs: at('15:30') });
  assert.deepEqual(r, { est: 392, sinceMin: 30, rate: 240 }); // 512 − 240 × 0.5
});

test('the break and the clear-by before it are not working time', () => {
  assert.equal(productiveMinutes(S, at('11:00'), at('13:30')), 75); // 11:00–11:45, then 13:00–13:30
  const r = nowEstimate({ ...base, fromAbs: at('11:00'), nowAbs: at('13:30') });
  assert.equal(r.est, 212); // 512 − 240 × 75/60
});

test('quiet while the last count is fresh (under 10 working minutes)', () => {
  const r = nowEstimate({ ...base, fromAbs: at('15:00'), nowAbs: at('15:05') });
  assert.equal(r.est, null);
  assert.equal('reason' in r && r.reason, 'The last count is current.');
});

test('stops guessing past 2 working hours and asks for a count', () => {
  const r = nowEstimate({ ...base, fromAbs: at('13:00'), nowAbs: at('15:30') });
  assert.equal(r.est, null);
  assert.ok('stale' in r && r.stale);
});

test('never below zero, and nothing on a break, at shift end, when unknown or when nothing is left', () => {
  assert.equal(nowEstimate({ ...base, remaining: 50, fromAbs: at('15:00'), nowAbs: at('15:30') }).est, 0);
  assert.equal(nowEstimate({ ...base, phase: 'break', fromAbs: at('15:00'), nowAbs: at('15:30') }).est, null);
  assert.equal(nowEstimate({ ...base, phase: 'shift_end', fromAbs: at('15:00'), nowAbs: at('15:30') }).est, null);
  assert.equal(nowEstimate({ ...base, remaining: null, fromAbs: at('15:00'), nowAbs: at('15:30') }).est, null); // unknown is not zero
  assert.equal(nowEstimate({ ...base, remaining: 0, fromAbs: at('15:00'), nowAbs: at('15:30') }).est, null);
  assert.equal(nowEstimate({ ...base, rate: null, fromAbs: at('15:00'), nowAbs: at('15:30') }).est, null);
});

test('scheduleOf matches the forecast: shift-end side and late starts carry through', () => {
  const sc = scheduleOf({ start: '08:00', breaks: ['12:00'], destinations: [{ clearBy: 30 }, { clearBy: 15 }] }, { shiftEnd: '18:00', nextStart: '07:00', shiftEndSide: 'S' }, { 1: '08:30' });
  assert.deepEqual(sc, { dayStart: '08:00', nextStart: '07:00', shiftEnd: '18:00', breaks: ['12:00'], clearByMin: 30, shiftEndStopMin: 30, actualStarts: { 1: '08:30' } });
});

const OP = 'TEST-NOW-EST';
async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-nowest-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs as VsaEvent[]);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  return { ctx, ok, get state() { return state; } };
}

test('Snapshot: the estimate is a labeled line under the number; the number stays the last count', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 200 }));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '09:00', count: 240 }));
  const fresh = snapshot(s.state, glovis, at('10:05'));
  assert.equal(fresh.hero.estimate, null); // the 09–10 count is current
  const later = snapshot(s.state, glovis, at('10:40'));
  assert.equal(later.hero.value, fresh.hero.value); // the headline never moves on a guess
  assert.ok(later.hero.estimate);
  assert.match(later.hero.estimate.text, /^About [\d,]+ left now \(est\.\)$/);
  assert.match(later.hero.estimate.sub ?? '', /^40 working min since the last count, at \d+\/hr$/);
  const stale = snapshot(s.state, glovis, at('14:00')); // 10:00–11:45 + 13:00–14:00 = 165 working min
  assert.equal(stale.hero.estimate?.text, 'No count in over 2 working hours');
  assert.equal(stale.hero.estimate?.forecast, false); // a request for a count, not a forecast: no FORECAST tag
});
