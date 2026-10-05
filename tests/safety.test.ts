// Phase 7e: a workday that starts at 07:00 opens with a 10-minute safety meeting (Colby, 2026-10-05).
// Pace, the driver rate and the ETA count the 07:00 hour as 50 productive minutes; H.A. does not change.
// The productive start is the later of 07:10 and a recorded actual start, so nothing is subtracted twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type VsaEvent, type Reject } from '../src/engine/index.ts';
import { buildPeriods, hourDriverRate } from '../src/engine/production.ts';
import { eta, type Schedule } from '../src/engine/eta.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { hourlyView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-SAFETY';
const BREAKS = ['12:00', '18:00'];

async function setup(tc: { after: (fn: () => Promise<void>) => void }, start: string) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-safety-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: { ...glovis, start }, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  return { ctx, ok, get state() { return state; } };
}

test('07:00 day: the 07:00 hour is 50 productive minutes; Pace uses them, H.A. does not', async (tc) => {
  const s = await setup(tc, '07:00');
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '07:00', count: 120, drivers: 60 }));
  const p = s.state.periods[0];
  assert.deepEqual([p.min, p.pace, p.reason], [50, 144, 'Safety meeting 07:00-07:10']);   // 120 ÷ 50 min, not 120/h
  assert.equal(s.state.production.ha, 120);                                                 // H.A.: 120 ÷ 1 counted hour, unchanged
  assert.equal(s.state.production.countedHours, 1);
  assert.equal(s.state.production.prodMin, 50);
  assert.equal(s.state.production.pace, 144);
  assert.equal(hourDriverRate(p).rate, 120 / ((60 * 50) / 60));                             // driver rate also uses 50 min
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 150, drivers: 60 }));
  assert.deepEqual([s.state.periods[1].min, s.state.periods[1].reason ?? null], [60, null]); // only the 07:00 hour is shortened
  const rows = hourlyView(s.state).rows;
  assert.deepEqual([rows[0].minNote, rows[0].short], ['50 min worked (safety meeting 07:00-07:10) · pace 144/hr', null]); // said why, not tagged SHORT HOUR
  assert.equal(rows[1].minNote, null);
  assert.match(hourlyView(s.state).paceLine!, /first hour as 50 minutes \(safety meeting 07:00-07:10\)/);
});

test('08:00 day: no deduction, no reason', async (tc) => {
  const s = await setup(tc, '08:00');
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 120 }));
  assert.deepEqual([s.state.periods[0].min, s.state.periods[0].pace, s.state.periods[0].reason ?? null], [60, 120, null]);
});

test('07:00 day with a recorded 07:20 start: 40 productive minutes, not 30 (never subtracted twice)', async (tc) => {
  const s = await setup(tc, '07:00');
  await s.ok(E.dayStartEvents(s.ctx(), 1, '07:20', 'Ramp problem'));
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '07:00', count: 80 }));
  const p = s.state.periods[0];
  assert.deepEqual([p.min, p.pace], [40, 120]);
  assert.equal(p.reason ?? null, null);   // the late start explains these minutes, not the meeting
  // A recorded start inside the meeting (07:05) still leaves 07:10 as the productive start.
  const s2 = await setup(tc, '07:00');
  await s2.ok(E.hourEvents(s2.ctx(), { day: 1, start: '07:00', count: 100 }));
  assert.equal(s2.state.periods[0].min, 50);
});

test('buildPeriods: safetyMin and lateMin overlap, the larger one applies', () => {
  const [a, b] = buildPeriods([{ day: 1, start: '07:00', count: 50, safetyMin: 10 }, { day: 2, start: '07:00', count: 50, safetyMin: 10, lateMin: 25 }], BREAKS);
  assert.deepEqual([a.min, a.reason], [50, 'Safety meeting 07:00-07:10']);
  assert.deepEqual([b.min, b.reason ?? null], [35, null]);
});

test('ETA: a Day 2 that starts at 07:00 resumes at 07:10; an 08:00 Day 2 is unchanged', () => {
  const periods = buildPeriods([{ day: 1, start: '08:00', count: 100 }], BREAKS);   // 100/h
  const run = (nextStart: string, actualStarts?: Record<number, string>) => {
    const schedule: Schedule = { dayStart: '08:00', nextStart, shiftEnd: '17:00', breaks: BREAKS, clearByMin: 30, ...(actualStarts ? { actualStarts } : {}) };
    return eta({ remaining: 10, basis: 'vessel', periods, schedule, ops: { day: 1, shiftEnded: true } });
  };
  const d2 = run('07:00');
  assert.deepEqual([d2.fromAbs, d2.etaAbs], [1440 + 7 * 60 + 10, 1440 + 7 * 60 + 10 + 6]);   // 10 autos at 100/h = 6 min after 07:10
  assert.equal(run('08:00').etaAbs, 1440 + 8 * 60 + 6);
  assert.equal(run('07:00', { 2: '07:30' }).etaAbs, 1440 + 7 * 60 + 30 + 6);                 // a later recorded start wins
});
