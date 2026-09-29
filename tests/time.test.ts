import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHM, formatHM, toAbs, fromIso, destination, clearBy, productionEnd, eventTimeLabel } from '../src/engine/time.ts';

test('parseHM accepts H:MM/HH:MM and rejects anything else', () => {
  assert.equal(parseHM('08:00'), 480);
  assert.equal(parseHM('8:05'), 485);
  assert.equal(parseHM('23:59'), 1439);
  for (const bad of ['', '24:00', '12:60', '12:5', '12', 'noon', '-1:00']) assert.equal(parseHM(bad), null, bad);
});

test('formatHM pads and toAbs counts days from Day 1', () => {
  assert.equal(formatHM(485), '08:05');
  assert.equal(toAbs({ day: 1, hm: '08:00' }), 480);
  assert.equal(toAbs({ day: 2, hm: '07:00' }), 1440 + 420);
  assert.equal(toAbs({ day: 0, hm: '07:00' }), null);
  assert.equal(toAbs({ day: 1, hm: 'bad' }), null);
});

test('fromIso uses the terminal wall-clock time and the operation day; offset is required', () => {
  assert.deepEqual(fromIso('2026-09-23T16:00:00-04:00', '2026-09-23'), { day: 1, hm: '16:00' });
  assert.deepEqual(fromIso('2026-09-24T07:30:00-04:00', '2026-09-23'), { day: 2, hm: '07:30' });
  assert.equal('error' in (fromIso('2026-09-23T16:00:00', '2026-09-23') as object), true);
  assert.equal('error' in (fromIso('2026-09-22T16:00:00-04:00', '2026-09-23') as object), true);
});

test('Appendix C sides, including aliases (B11, B22)', () => {
  assert.deepEqual(destination('MB Field'), { name: 'MBZ (Mercedes)', side: 'Southside' });
  assert.deepEqual(destination('Zone 1'), { name: 'Zone 1 (MB Field)', side: 'Southside' });
  assert.deepEqual(destination('zone 3'), { name: 'Zone 3', side: 'Northside' });
  assert.deepEqual(destination('Gate 1'), { name: 'Gate 1', side: 'Northside' });
  assert.deepEqual(destination('Gate 2'), { name: 'Gate 2', side: 'Southside' });
  assert.equal(destination('across the street')?.side, 'Southside');
  assert.equal(destination('this side')?.side, 'Northside');
  for (const s of ['Zone X', 'Zone B', 'Site 5', 'Site 6', 'Zone T', 'Zone V']) assert.equal(destination(s)?.side, 'Southside', s);
  for (const n of ['BMW Field', 'Site 2', 'Yard 3', 'AVP Yard', 'Zone 9']) assert.equal(destination(n)?.side, 'Northside', n);
  assert.equal(destination('Zone 42'), null);
});

test('clear-by: Northside 15, Southside 30, for any break time (B22)', () => {
  assert.equal(clearBy('12:00', 'Northside'), '11:45');
  assert.equal(clearBy('12:00', 'Southside'), '11:30');
  assert.equal(clearBy('18:00', 'Northside'), '17:45');
  assert.equal(clearBy('18:00', 'Southside'), '17:30');
  assert.equal(clearBy('15:20', 'Northside'), '15:05');
  assert.equal(clearBy('15:20', 'Southside'), '14:50');
  assert.equal(clearBy('bad', 'Southside'), null);
});

test('a stop time Colby gives is used as-is, never cut again', () => {
  assert.deepEqual(productionEnd('12:00', 'Southside'), { hm: '11:30', basis: 'clear_by' });
  assert.deepEqual(productionEnd('12:00', 'Southside', '11:30'), { hm: '11:30', basis: 'user_stop' });
  assert.deepEqual(productionEnd('12:00', 'Northside', '11:40'), { hm: '11:40', basis: 'user_stop' });
});

test('timestamps: event time, labeled processing time, or "time not provided" (B18)', () => {
  assert.equal(eventTimeLabel({ day: 1, hm: '14:10' }), '14:10');
  assert.equal(eventTimeLabel({ day: 2, hm: '08:15' }), 'Day 2 08:15');
  assert.equal(eventTimeLabel(null, { hm: '14:12', tz: 'EDT' }), 'Logged at 14:12 EDT (processing time, not event time)');
  assert.equal(eventTimeLabel(null), 'time not provided');
  assert.equal(eventTimeLabel(null, null), 'time not provided');
});

test('fromIso rejects an impossible time of day', () => {
  assert.ok('error' in (fromIso('2026-09-23T25:00:00-04:00', '2026-09-23') as object));
  assert.ok('error' in (fromIso('2026-09-23T10:99:00-04:00', '2026-09-23') as object));
});

test('destination: inherited object keys are not destinations', () => {
  for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(destination(k), null, k);
});
