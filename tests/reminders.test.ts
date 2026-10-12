// The three moment-based reminders (Colby, 2026-10-11): count due, deck won't make the cutoff, break ending.
// Pure planner with an injected clock. TEST data (Glovis Condor 101: start 08:00, breaks 12:00 and 18:00).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { project } from '../src/engine/index.ts';
import type { State } from '../src/storage/store.ts';
import { REMINDERS_ALL_ON, reminderPlan, switchFromPref, switchPref, type PlannedReminder, type ReminderInput } from '../src/app/assistant.ts';
import { glovis, toEvents, SCENARIOS, OP } from './scenarios.ts';

const base = (): State => {
  const s = project(glovis, toEvents(SCENARIOS.find((x) => x.name === 'mixed deck progress, working')!, OP), OP);
  assert.ok(s.ok);
  return s as State;
};
// Counted hours in the base scenario: 08, 09, 10, 11, 13, 14 (12 is the break).
const counted = (...hours: number[]) => (s: State): State => ({ ...s, periods: s.periods.filter((p) => hours.includes(Number(p.start.slice(0, 2)))) }) as State;
const T = (h: number, m = 0) => new Date(2026, 9, 12, h, m); // a Monday, local time
const hm = (r: PlannedReminder) => { const d = new Date(r.at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const plan = (s: State, now: Date, over: Partial<ReminderInput> = {}) => reminderPlan({ s, b: glovis, now, isTest: false, ...over });
const times = (p: PlannedReminder[], kind: PlannedReminder['kind']) => p.filter((r) => r.kind === kind).map(hm);
const with_ = (s: State, o: Record<string, unknown>) => ({ ...s, ...o }) as State;
const deckRem = (s: State, rem: number, pace: number | null = 246) =>
  ({ ...s, production: { ...s.production, pace }, decks: s.decks.map((d) => (d.id === 'D9' ? { ...d, status: 'active', rem } : d)) }) as unknown as State;

// ---------- Count due ----------
test('count due: HH:05 for a working hour with no count; absolute date; opens Log; one per missed hour', () => {
  const s = counted(8, 9, 10, 11, 13)(base()); // 14-15 not logged
  const p = plan(s, T(15, 0));
  assert.deepEqual(times(p, 'count'), ['15:05', '16:05', '17:05', '18:05', '20:05', '21:05', '22:05', '23:05']);
  const first = p.find((r) => r.kind === 'count')!;
  assert.equal(first.at, new Date(2026, 9, 12, 15, 5).getTime());
  assert.equal(first.tab, 'log');
  assert.match(first.body, /no hourly count logged for 14-15/);
  assert.equal(p.filter((r) => r.at === first.at).length, 1);
});

test('count due: logged hours are not reminded; logging the count cancels it (state change re-plans without it)', () => {
  const missing = counted(8, 9, 10, 11, 13)(base());
  assert.ok(times(plan(missing, T(15, 0)), 'count').includes('15:05'));
  const logged = counted(8, 9, 10, 11, 13, 14)(base());
  assert.ok(!times(plan(logged, T(15, 0)), 'count').includes('15:05'));
  assert.equal(times(plan(logged, T(15, 0)), 'count')[0], '16:05');
});

test('count due: nothing in the past (after HH:05 the reminder for that hour is not scheduled)', () => {
  const s = counted(8, 9, 10, 11, 13)(base());
  assert.equal(times(plan(s, T(15, 5)), 'count')[0], '16:05'); // 15:05 is not later than now
  assert.equal(times(plan(s, T(15, 4)), 'count')[0], '15:05');
});

test('count due: never for a break hour (12-13 and 18-19)', () => {
  const p = plan(counted(8, 9, 10)(base()), T(11, 30));
  const c = times(p, 'count');
  assert.ok(c.includes('12:05')); // the 11-12 hour just finished (a working hour); its count is the break reconciliation
  assert.ok(!c.includes('13:05') && !c.includes('19:05'));
});

test('count due: none before work starts; a 07:30 start still owes the 07-08 hour; a late actual start moves it', () => {
  const day = (planned: string, actual: string | null) => with_(counted()(base()), { dayStarts: { 1: { planned, actual, firstBreak: '12:00', lateMin: 0, cause: null, id: null } } });
  assert.equal(times(plan(day('08:00', null), T(5, 0)), 'count')[0], '09:05');  // 07-08 is before the 08:00 start
  assert.equal(times(plan(day('07:30', null), T(5, 0)), 'count')[0], '08:05');  // 30 minutes of 07-08 worked
  assert.equal(times(plan(day('08:00', '09:30'), T(5, 0)), 'count')[0], '10:05'); // started 09:30: 08-09 and 09-10... 09-10 is worked, due 10:05
});

test('count due: none after the planned shift end; none once the shift is ended', () => {
  const s = with_(counted(8, 9, 10, 11)(base()), { plan: { shiftEnd: '15:00', nextStart: null } });
  assert.deepEqual(times(plan(s, T(12, 30)), 'count'), ['14:05']); // 13:05 is a break hour; 15:05 is after 15:00
  assert.deepEqual(plan(with_(s, { ops: { day: 1, shiftEnded: true, onBreak: false, phase: 'shift_end' } }), T(12, 30)), []);
});

test('count due: two-day ship: Day 2 counts are separate, and Day 1\'s shift end does not bound Day 2', () => {
  const d2 = (periods: unknown[]) => with_(base(), { ops: { day: 2, phase: 'working' }, plan: { shiftEnd: '15:00', nextStart: '07:30' },
    periods, dayStarts: { 1: { planned: '08:00', actual: null }, 2: { planned: '07:30', actual: null } } });
  const day1Only = d2(base().periods); // all counts are Day 1: nothing counted on Day 2 yet
  const c = times(plan(day1Only, T(8, 30)), 'count');
  assert.equal(c[0], '09:05'); // hour 08-09 of Day 2 is uncounted although Day 1 had an 08:00 count
  assert.ok(c.includes('16:05'), 'Day 2 is not cut off at the Day 1 shift end');
  const counted2 = d2([{ day: 2, start: '08:00', count: 100 }]);
  assert.ok(!times(plan(counted2, T(8, 30)), 'count').includes('09:05'));
});

test('count due: unknown day start schedules nothing', () => {
  assert.deepEqual(times(plan(with_(counted()(base()), { dayStarts: {} }), T(9, 0)), 'count'), []);
  assert.deepEqual(times(plan(with_(counted()(base()), { dayStarts: { 1: { planned: 'soon', actual: null } } }), T(9, 0)), 'count'), []);
});

// ---------- Gates shared by all three ----------
test('TEST vessel: only the open one is reminded, and it says TEST; complete and archived vessels get nothing', () => {
  const s = counted(8, 9, 10, 11, 13)(base());
  assert.deepEqual(plan(s, T(15, 0), { isTest: true, open: false }), []);
  const open = plan(s, T(15, 0), { isTest: true, open: true });
  assert.ok(open.length > 0 && open.every((r) => r.title.startsWith('TEST · ')));
  assert.ok(!plan(s, T(15, 0)).some((r) => r.title.startsWith('TEST')));
  assert.deepEqual(plan(with_(s, { completed: { time: '14:00' } }), T(15, 0)), []);
  assert.deepEqual(plan(s, T(15, 0), { archived: true }), []);
});

test('switches: each reminder can be turned off on its own; all off schedules nothing; the default is on', () => {
  const s = deckRem(counted(8, 9, 10, 11)(base()), 900);
  const all = plan(s, T(10, 0));
  const kinds = new Set(all.map((r) => r.kind));
  assert.deepEqual([...kinds].sort(), ['break', 'count', 'deck']);
  for (const k of ['count', 'deck', 'break'] as const) {
    const p = plan(s, T(10, 0), { on: { ...REMINDERS_ALL_ON, [k]: false } });
    assert.ok(!p.some((r) => r.kind === k) && p.length < all.length, k);
  }
  assert.deepEqual(plan(s, T(10, 0), { on: { count: false, deck: false, break: false } }), []);
  assert.equal(switchFromPref(null), true);
  assert.equal(switchFromPref('1'), true);
  assert.equal(switchFromPref('0'), false);
  assert.equal(switchPref('break'), 'remind:break');
});

test('quiet hours still silence a reminder whose time falls inside the window', () => {
  const s = counted(8, 9, 10, 11, 13)(base());
  const p = plan(s, T(15, 0), { quiet: { from: '20:00', to: '23:30' } });
  assert.deepEqual(times(p, 'count'), ['15:05', '16:05', '17:05', '18:05']);
});

// ---------- Deck won't make the cutoff ----------
test('deck: one FORECAST reminder an hour before the clear-by when the watch rule already warns; opens Plan', () => {
  const s = deckRem(base(), 900); // 900 left on D9 at 246/hr cannot clear before 11:45
  const p = plan(s, T(10, 0));
  const d = p.filter((r) => r.kind === 'deck');
  assert.equal(d.length, 1);
  assert.equal(hm(d[0]), '10:45'); // 12:00 break, Northside clear-by 11:45, one hour earlier
  assert.equal(d[0].tab, 'plan');
  assert.match(d[0].body, /FORECAST/);
  assert.match(d[0].body, /D9|Deck/);
  assert.match(d[0].body, /11:45/);
});

test('deck: silent when everything is on track, with no pace, off the working phase, or when the hour has already passed', () => {
  assert.deepEqual(times(plan(deckRem(base(), 100), T(10, 0)), 'deck'), []);       // on track
  assert.deepEqual(times(plan(deckRem(base(), 900, null), T(10, 0)), 'deck'), []); // no pace: unknown stays unknown
  assert.deepEqual(times(plan(with_(deckRem(base(), 900), { ops: { day: 1, onBreak: true, breakStart: '09:50', phase: 'break' } }), T(10, 0)), 'deck'), []);
  assert.deepEqual(times(plan(deckRem(base(), 900), T(10, 50)), 'deck'), []);      // 10:45 is gone; Plan already shows it
});

test('deck: the condition clearing cancels it (re-plan without it); the next break is used after lunch', () => {
  assert.equal(times(plan(deckRem(base(), 900), T(10, 0)), 'deck').length, 1);
  assert.equal(times(plan(deckRem(base(), 120), T(10, 0)), 'deck').length, 0);
  assert.deepEqual(times(plan(deckRem(base(), 1500), T(13, 30)), 'deck'), ['16:45']); // 18:00 break
});

test('deck: the clear-by rules are untouched: the reminder uses the existing watch text and the Northside cutoff', () => {
  const s = deckRem(base(), 900);
  const body = plan(s, T(10, 0)).find((r) => r.kind === 'deck')!.body;
  assert.match(body, /needed to clear before 11:45/);
});

// ---------- Break ending ----------
test('break ending: scheduled breaks, 5 minutes before the hour ends, labeled an estimate; opens Snapshot', () => {
  const p = plan(counted(8, 9, 10)(base()), T(11, 0));
  assert.deepEqual(times(p, 'break'), ['12:55', '18:55']);
  const b = p.find((r) => r.kind === 'break')!;
  assert.equal(b.tab, 'snap');
  assert.match(b.body, /ESTIMATE/);
  assert.match(b.body, /scheduled 12:00/);
});

test('break ending: a logged break start wins over the schedule', () => {
  const s = with_(base(), { ops: { day: 1, onBreak: true, breakStart: '12:10', phase: 'break' }, breakLog: [{ kind: 'break', start: '12:10', end: null, startAbs: 730, endAbs: null }] });
  const p = plan(s, T(12, 20));
  assert.deepEqual(times(p, 'break'), ['13:05', '18:55']); // 12:10 + 55 min; the 12:55 scheduled one is not also sent
  assert.match(p.find((r) => r.kind === 'break')!.body, /started 12:10 \(logged\)/);
});

test('break ending: cancelled when the break is ended early (and a skipped break is not reminded)', () => {
  const ended = with_(base(), { ops: { day: 1, onBreak: false, phase: 'working' }, breakLog: [{ kind: 'break', start: '12:00', end: '12:30', startAbs: 720, endAbs: 750 }] });
  assert.deepEqual(times(plan(ended, T(12, 40)), 'break'), ['18:55']);
  const missed = with_(base(), { breakLog: [{ kind: 'missed', start: '12:00', end: '13:00', startAbs: 720, endAbs: 780 }] });
  assert.deepEqual(times(plan(missed, T(12, 40)), 'break'), ['18:55']);
});

test('break ending: Day 2 uses Day 2 log times; past times, shift end and the shift being over schedule nothing', () => {
  assert.deepEqual(times(plan(base(), T(12, 56)), 'break'), ['18:55']); // 12:55 is already past
  const d2 = with_(base(), { ops: { day: 2, phase: 'working' }, breakLog: [{ kind: 'break', start: '12:00', end: '13:00', startAbs: 720, endAbs: 780 }] }); // Day 1's break is not Day 2's
  assert.deepEqual(times(plan(d2, T(11, 0)), 'break'), ['12:55', '18:55']);
  assert.deepEqual(times(plan(with_(base(), { plan: { shiftEnd: '12:30', nextStart: null } }), T(11, 0)), 'break'), []);
  assert.deepEqual(plan(with_(base(), { ops: { day: 1, shiftEnded: true, phase: 'shift_end' } }), T(11, 0)), []);
});

test('break ending: an unknown break start while on break falls back to the schedule, never an invented time', () => {
  const s = with_(base(), { ops: { day: 1, onBreak: true, breakStart: null, phase: 'break' } });
  assert.deepEqual(times(plan(s, T(12, 20)), 'break'), ['12:55', '18:55']);
});
