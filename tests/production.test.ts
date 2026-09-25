import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPeriods, summarize, hourDriverRate, driverRate, stoppageHours, cumulativeToIntervals, suggestedStop, checkHour, type HourEntry } from '../src/engine/production.ts';
import { loadTracker } from './tracker.ts';

const glovis = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const BREAKS = ['12:00', '18:00'];
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// The tracker's own demo shift (vsa-live.html demoData), plus a Day 2 hour.
const DEMO: HourEntry[] = [
  { day: 1, start: '08:00', count: 253, brands: { Hyundai: 200, Kia: 53 }, drivers: 70 },
  { day: 1, start: '09:00', count: 266, brands: { Hyundai: 216, Kia: 50 }, drivers: 70 },
  { day: 1, start: '10:00', count: 225, brands: { Hyundai: 171, Kia: 54 }, drivers: 68 },
  { day: 1, start: '11:00', count: 186, brands: { Hyundai: 120, Kia: 66 }, drivers: 68, stopMin: 45 },
  { day: 1, start: '13:00', count: 248, drivers: 68 },
  { day: 1, start: '14:00', count: 241, drivers: 70 },
  { day: 1, start: '17:00', count: 150, drivers: 70 },           // short, stop not set
  { day: 2, start: '08:00', count: 200, drivers: 60 },
];

test('parity: periods and summary match the tracker on its demo shift', () => {
  const t = loadTracker();
  t.S.baseline = glovis;
  t.S.hourly = Object.fromEntries(DEMO.map((h) => [`d${h.day}p${h.start.replace(':', '')}`, plain(h)]));
  const want = plain(t.compute());
  const periods = buildPeriods(DEMO, BREAKS);
  const got = summarize(periods);
  const cols = (p: any) => [p.day, p.start, p.count, p.short, p.min, p.pace, p.delta, p.deltaPct, p.deltaPaced];
  assert.deepEqual(periods.map(cols), want.periods.map(cols));
  assert.equal(got.field, want.field);
  assert.equal(got.ha, want.ha);
  assert.equal(got.pace, want.pace);
  assert.equal(got.prodMin, want.prodMin);
  assert.deepEqual(got.unsetShort, want.unsetShort);
});

test('H.A. = field ÷ counted hours, with the denominator; short hours count as 1', () => {
  const s = summarize(buildPeriods(DEMO.slice(0, 4), BREAKS));
  assert.equal(s.field, 930);
  assert.equal(s.countedHours, 4);
  assert.equal(s.ha, 232.5);
  // Pace uses productive minutes: 930 ÷ (3 × 60 + 45)/60.
  assert.equal(s.prodMin, 225);
  assert.equal(s.pace, 930 / 3.75);
});

test('short hour with no stop time: pace unknown and listed, not guessed', () => {
  const [p] = buildPeriods([{ day: 1, start: '11:00', count: 120 }], BREAKS);
  assert.equal(p.short, true);
  assert.equal(p.min, null);
  assert.equal(p.pace, null);
  assert.deepEqual(summarize([p]).unsetShort, ['11:00']);
  assert.equal(summarize([p]).pace, null);
});

test('T6: Southside noon, 40 drivers, 120 autos 11:00–11:30 → 240/active hour, 6 per driver-hour', () => {
  const [p] = buildPeriods([{ day: 1, start: '11:00', count: 120, drivers: 40, stopMin: 30 }], BREAKS);
  assert.equal(p.count, 120);  // the 11:00–12:00 bucket
  assert.equal(p.pace, 240);
  assert.deepEqual(hourDriverRate(p), { rate: 6, driverHours: 20 });
  assert.equal(suggestedStop(['Southside']), 30);
  assert.equal(suggestedStop(['Northside']), 45);
  assert.equal(suggestedStop(['Northside', 'Southside']), null);
});

test('B14: driver rate is time-weighted when the gang changes', () => {
  assert.deepEqual(driverRate(240, [{ drivers: 40, minutes: 30 }, { drivers: 60, minutes: 30 }]), { rate: 4.8, driverHours: 50 });
});

test('B21: zero or unknown denominators → unavailable with a reason', () => {
  assert.deepEqual(driverRate(0, [{ drivers: 0, minutes: 60 }]), { rate: null, reason: 'No driver-hours (0), so the rate is unavailable.' });
  assert.deepEqual(driverRate(100, [{ drivers: 40, minutes: 0 }]), { rate: null, reason: 'No driver-hours (0), so the rate is unavailable.' });
  assert.deepEqual(driverRate(100, [{ drivers: null, minutes: 60 }]), { rate: null, reason: 'Driver count unknown for part of the period.' });
  assert.deepEqual(driverRate(100, []), { rate: null, reason: 'No driver segments recorded.' });
  const [p] = buildPeriods([{ day: 1, start: '09:00', count: 200 }], BREAKS);
  assert.deepEqual(hourDriverRate(p), { rate: null, reason: 'Driver count unknown for part of the period.' });
  const s = summarize([]);
  assert.deepEqual([s.field, s.ha, s.pace, s.countedHours], [0, null, null, 0]);
});

test('stoppage hours merge overlaps and never double-count', () => {
  // 10:00–10:30 and 10:15–10:45 overlap → 45 min; 13:00–13:10 separate → 55 min total.
  assert.equal(stoppageHours([[600, 630], [615, 645], [780, 790]]), 55 / 60);
  assert.equal(stoppageHours([]), 0);
});

test('B20: cumulative checkpoints give intervals by difference; a decrease is rejected', () => {
  assert.deepEqual(cumulativeToIntervals([{ at: { day: 1, hm: '09:00' }, value: 300 }, { at: { day: 1, hm: '10:00' }, value: 540 }]),
    [{ from: { day: 1, hm: '09:00' }, to: { day: 1, hm: '10:00' }, units: 240 }]);
  assert.deepEqual(cumulativeToIntervals([{ at: { day: 1, hm: '09:00' }, value: 300 }, { at: { day: 1, hm: '10:00' }, value: 290 }]),
    { ok: false, error: 'Cumulative count went down from 300 (09:00) to 290 (10:00). Needs a correction.' });
});

test('hour entry checks (tracker saveHour wording)', () => {
  const brands = ['Hyundai', 'Kia'];
  const h = (x: Partial<HourEntry>): HourEntry => ({ day: 1, start: '09:00', count: 100, ...x });
  assert.equal(checkHour(h({}), brands, BREAKS), null);
  assert.deepEqual(checkHour(h({ count: -1 }), brands, BREAKS), { ok: false, error: 'Enter the whole-number count for this hour.' });
  assert.deepEqual(checkHour(h({ count: 1.5 }), brands, BREAKS), { ok: false, error: 'Enter the whole-number count for this hour.' });
  assert.deepEqual(checkHour(h({ drivers: 2.5 }), brands, BREAKS), { ok: false, error: 'Drivers must be a whole number.' });
  assert.deepEqual(checkHour(h({ brands: { Kia: 100 } }), brands, BREAKS), { ok: false, error: 'Fill every brand, or leave the split blank.' });
  assert.deepEqual(checkHour(h({ brands: { Kia: 40, Hyundai: 50 } }), brands, BREAKS), { ok: false, error: 'Brand split adds to 90 but the hour total is 100. Fix one.' });
  assert.deepEqual(checkHour(h({ brands: { Kia: 40, Hyundai: -1 } }), brands, BREAKS), { ok: false, error: 'Hyundai must be a whole number.' });
  assert.deepEqual(checkHour(h({ start: '11:00' }), brands, BREAKS), { ok: false, error: 'Pick when production stopped before the 12:00 break.' });
  assert.deepEqual(checkHour(h({ start: '11:00', stopMin: 50 }), brands, BREAKS), { ok: false, error: 'Stop time must be :30 or :45 (30 or 45 minutes worked).' });
  assert.equal(checkHour(h({ start: '11:00', stopMin: 45 }), brands, BREAKS), null);
  assert.deepEqual(checkHour(h({ start: '9am' }), brands, BREAKS), { ok: false, error: 'Hour start "9am" is not a valid HH:MM time.' });
});
