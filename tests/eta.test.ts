import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eta, requiredRate, forecastError, forecastPassed, vesselClearBy, southRemaining, scheduleOf, type Schedule, type Ops } from '../src/engine/eta.ts';
import { buildPeriods, type HourEntry } from '../src/engine/production.ts';
import { toAbs } from '../src/engine/time.ts';
import { loadTracker } from './tracker.ts';

const glovis = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const BREAKS = ['12:00', '18:00'];
const DEMO: HourEntry[] = [
  { day: 1, start: '08:00', count: 253, drivers: 70 },
  { day: 1, start: '09:00', count: 266, drivers: 70 },
  { day: 1, start: '10:00', count: 225, drivers: 68 },
  { day: 1, start: '11:00', count: 186, drivers: 68, stopMin: 45 },
  { day: 1, start: '13:00', count: 248, drivers: 68 },
  { day: 1, start: '14:00', count: 241, drivers: 70 },
];

type Case = { name: string; rem: number; hours: HourEntry[]; plan?: { shiftEnd?: string | null; nextStart?: string | null }; ops?: Ops; cb?: number };
const CASES: Case[] = [
  { name: 'demo shift, mid-afternoon', rem: 550, hours: DEMO },
  { name: 'rolls past 18:00 break', rem: 1500, hours: DEMO },
  // 07:30, not 07:00: the tracker has no 07:00 safety meeting (7e); tests/safety.test.ts covers 07:00.
  { name: 'Day 1 shift end 17:00 → Day 2 07:30', rem: 1200, hours: DEMO, plan: { shiftEnd: '17:00', nextStart: '07:30' } },
  { name: 'on lunch break', rem: 1039, hours: DEMO.slice(0, 4), ops: { day: 1, onBreak: true, breakStart: '12:00' } },
  { name: 'shift ended, Day 2 not started', rem: 300, hours: DEMO, plan: { shiftEnd: '15:00', nextStart: '08:00' }, ops: { day: 1, shiftEnded: true } },
  { name: 'Day 2 production', rem: 400, hours: [...DEMO, { day: 2, start: '08:00', count: 230 }, { day: 2, start: '09:00', count: 250 }], plan: { shiftEnd: '17:00', nextStart: '08:00' }, ops: { day: 2 } },
  { name: 'Northside-only clear-by', rem: 700, hours: DEMO, cb: 15 },
  { name: 'short hour without stop time only', rem: 900, hours: [{ day: 1, start: '11:00', count: 150 }] },
  { name: 'nothing logged', rem: 1969, hours: [] },
  { name: 'zero remaining', rem: 0, hours: DEMO },
  { name: 'zero pace', rem: 50, hours: [{ day: 1, start: '08:00', count: 0 }, { day: 1, start: '09:00', count: 0 }] },
];

test('parity: ETA matches the tracker across breaks, shift end and Day 2', () => {
  for (const c of CASES) {
    const t = loadTracker();
    t.S.baseline = glovis;
    t.S.plan = plain(c.plan ?? {});
    t.S.ops = plain(c.ops ?? {});
    const periods = buildPeriods(c.hours, BREAKS);
    const cb = c.cb ?? 30;
    const want = plain(t.etaCalc(c.rem, plain(periods), BREAKS.map((b) => toAbs({ day: 1, hm: b })!), cb));
    const schedule: Schedule = { dayStart: glovis.start, nextStart: c.plan?.nextStart ?? null, shiftEnd: c.plan?.shiftEnd ?? null, breaks: BREAKS, clearByMin: cb };
    const got = eta({ remaining: c.rem, basis: 'vessel', periods, schedule, ops: c.ops ?? { day: 1 } });
    assert.equal(got.etaAbs, want.eta, c.name);
    assert.equal(got.rate, want.rate, c.name);
    assert.equal(got.hoursUsed, want.k, c.name);
    assert.equal(got.fromAbs, want.from, c.name);
    if (want.reason !== 'done') assert.equal(got.reason, want.reason, c.name);
  }
});

// Colby, 2026-10-14: the side split changes production numbers, so the forecast no longer stops every car at the Southside time when
// only some go there. This is a deliberate step away from the VSA Live tracker's single clear-by (the parity test above keeps the
// tracker's rule for schedules that do not name both sides).
test('split sides: each class finishes by its own stop; the vessel finishes when both are done', () => {
  const periods = buildPeriods(DEMO, BREAKS);
  const one: Schedule = { dayStart: '08:00', breaks: BREAKS, clearByMin: 30 };
  const two: Schedule = { ...one, clearByNorth: 15, clearBySouth: 30 };
  const run = (schedule: Schedule, southLeft?: number | null, remaining = 1000) => eta({ remaining, basis: 'vessel', periods, schedule, ops: { day: 1 }, southLeft }).etaAbs!;
  const conservative = run(one);
  assert.equal(run(two, null), conservative, 'unknown Southside cars: the later stop for every car, as before');
  assert.equal(run(two, 1000), conservative, 'every car Southside: the Southside stop');
  assert.equal(run(two, 0), run({ ...one, clearByMin: 15 }), 'no car Southside: the Northside stop');
  const mixed = run(two, 300);
  assert.ok(mixed <= conservative && mixed >= run(two, 0), 'a mix lands between the two');
  assert.ok(run(two, 600) >= run(two, 300), 'more Southside cars never finish earlier');
  // A schedule that names only one side keeps the one stop.
  assert.equal(run({ ...one, clearByNorth: 15 }, 300), conservative);
});

test('southRemaining: only brands whose destination is Southside, and only when every brand is known to one side', () => {
  const dest = [{ side: 'N' as const, brands: ['BMW'] }, { side: 'S' as const, brands: ['MBZ', 'POV'] }];
  assert.equal(southRemaining([{ name: 'BMW', remaining: 200 }, { name: 'MBZ', remaining: 100 }, { name: 'POV', remaining: 15 }], dest), 115);
  assert.equal(southRemaining([{ name: 'BMW', remaining: 200 }, { name: 'MBZ', remaining: null }], dest), null, 'an uncounted brand: unknown, never zero');
  assert.equal(southRemaining([{ name: 'KIA', remaining: 5 }], dest), null, 'a brand no destination names');
  assert.equal(southRemaining([{ name: 'BMW', remaining: 5 }], [...dest, { side: 'S', brands: ['BMW'] }]), null, 'a brand going to both sides');
  // scheduleOf names both sides only when the destinations do.
  const sc = scheduleOf({ start: '08:00', breaks: ['12:00'], destinations: [{ clearBy: 15, side: 'N' }, { clearBy: 30, side: 'S' }] }, { shiftEnd: null, nextStart: null }, {});
  assert.deepEqual([sc.clearByMin, sc.clearByNorth, sc.clearBySouth], [30, 15, 30]);
});

test('ETA is always a FORECAST; field basis is labeled', () => {
  const periods = buildPeriods(DEMO, BREAKS);
  const schedule: Schedule = { dayStart: '08:00', breaks: BREAKS, clearByMin: 30 };
  const v = eta({ remaining: 550, basis: 'vessel', periods, schedule, ops: { day: 1 } });
  assert.equal(v.label, 'FORECAST');
  assert.equal(v.basisNote, null);
  const f = eta({ remaining: 550, basis: 'field', periods, schedule, ops: { day: 1 } });
  assert.equal(f.label, 'FORECAST');
  assert.equal(f.basisNote, 'Based on field balance; vessel remaining is unknown and field counts can lag the ship.');
});

test('zero remaining: no further production needed, but no completion time is invented', () => {
  const r = eta({ remaining: 0, basis: 'vessel', periods: buildPeriods(DEMO, BREAKS), schedule: { dayStart: '08:00', breaks: BREAKS, clearByMin: 30 }, ops: { day: 1 } });
  assert.equal(r.etaAbs, null);
  assert.equal(r.eta, null);
  assert.equal(r.reason, 'No autos remaining. Completion time is recorded only when reported.');
});

test('B15: 11:00, 360 remain, 240/hr, stop 11:30, resume 13:00 → FORECAST 14:00; 14:00 target needs 240/hr', () => {
  const periods = buildPeriods([{ day: 1, start: '10:00', count: 240 }], BREAKS);
  const schedule: Schedule = { dayStart: '08:00', breaks: BREAKS, clearByMin: 30 };
  const r = eta({ remaining: 360, basis: 'vessel', periods, schedule, ops: { day: 1 } });
  assert.deepEqual(r.eta, { day: 1, hm: '14:00' });
  assert.deepEqual(requiredRate(360, { day: 1, hm: '11:00' }, { day: 1, hm: '14:00' }, schedule), { rate: 240, productiveHours: 1.5 });
  assert.deepEqual(requiredRate(360, { day: 1, hm: '11:45' }, { day: 1, hm: '12:30' }, schedule), { rate: null, reason: 'No productive time left before the target; not feasible on these assumptions.' });
  assert.deepEqual(requiredRate(0, { day: 1, hm: '11:00' }, { day: 1, hm: '14:00' }, schedule), { rate: 0, productiveHours: 1.5 });
});

test('B10: a passed forecast is never marked complete', () => {
  const at = (hm: string) => toAbs({ day: 1, hm })!;
  assert.equal(forecastPassed(at('14:00'), at('14:05'), 50, false), true);
  assert.equal(forecastPassed(at('14:00'), at('13:55'), 50, false), false);
  assert.equal(forecastPassed(at('14:00'), at('14:05'), 0, false), false);
  assert.equal(forecastPassed(null, at('14:05'), 50, false), false);
});

test('B28: forecast error compares the same milestone only', () => {
  assert.deepEqual(forecastError({ milestone: 'cars_complete', at: { day: 1, hm: '14:00' } }, { milestone: 'cars_complete', at: { day: 1, hm: '14:12' } }),
    { signedMin: 12, absMin: 12 });
  assert.deepEqual(forecastError({ milestone: 'cars_complete', at: { day: 1, hm: '14:00' } }, { milestone: 'lashing_complete', at: { day: 1, hm: '14:45' } }),
    { ok: false, error: 'Forecast was for cars_complete; actual is lashing_complete. Score only the same milestone.' });
  assert.deepEqual(forecastError({ milestone: 'cars_complete', at: { day: 1, hm: '16:00' } }, { milestone: 'cars_complete', at: { day: 1, hm: '15:30' } }),
    { signedMin: -30, absMin: 30 });
});

test('vessel clear-by is the largest destination cutoff (tracker default)', () => {
  assert.equal(vesselClearBy(glovis.destinations), 15);
  assert.equal(vesselClearBy([{ clearBy: 15 }, { clearBy: 30 }]), 30);
  assert.equal(vesselClearBy([]), 0);
});
