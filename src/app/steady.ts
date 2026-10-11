// Steady finish (Colby, 2026-10-11, option A): the finish time the screens show. When the deck counts are older than the last
// logged hour, the cars still aboard are carried forward at the forecast pace (labeled an estimate) before the forecast runs, so
// logging an hourly count without a deck update no longer pushes the finish an hour later. Vessel remaining itself never changes.
// One function, so the tile, the break strip, the answer card, the brief and the live estimate always show the same finish.
import { carriedRemaining, eta, formatHM, operationDate, scheduleOf, parseHM, SHIFT_END_STOP_MIN, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Carry = { cars: number; sinceMin: number };
export type Steady = { etaAbs: number | null; remaining: number | null; carry: Carry | null };

// When a deck's numbers were last saved, in minutes from Day 1 00:00. The reported time if one was given; otherwise the save's
// processing time, an upper bound (a count is read before it is saved), so the carry can only come out smaller, never larger.
// Read from the event itself: both times are written in the terminal's local time with their offset.
function absOf(iso: string, opDate: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?[+-]\d{2}:\d{2}$/.exec(iso); // local time with its offset; a UTC 'Z' time is not read
  const mins = m ? parseHM(m[2]) : null;
  if (!m || mins == null) return null;
  const day = Math.round((Date.parse(`${m[1]}T00:00:00Z`) - Date.parse(`${opDate}T00:00:00Z`)) / 86400000);
  return day < 0 ? null : day * 1440 + mins;
}
const DECK_METRICS = new Set(['vessel_remaining', 'deck_status']);

export function steady(s: State, b: Baseline): Steady {
  const base: Steady = { etaAbs: s.eta.etaAbs, remaining: s.vesselRemaining ?? s.fieldBalance, carry: null };
  if (s.vesselRemaining == null || s.vesselRemaining === 0) return base; // the field balance is already as new as the hourly counts
  const opDate = operationDate(b);
  if (!opDate) return base;
  const last = new Map<string, number | null>(); // deck → when its numbers were last saved (log order: the latest wins)
  for (const e of s.log.events) {
    if (s.log.supersededBy[e.event_id] || !e.scope.deck || !DECK_METRICS.has(e.payload.metric)) continue;
    last.set(e.scope.deck, absOf(e.occurred_at ?? e.recorded_at, opDate));
  }
  const times = [...last.values()]; // a deck never saved holds its starting quantity: no age
  if (!times.length || times.some((x) => x == null)) return base; // a time that can't be read: leave the forecast as it is
  const actual = Object.fromEntries(Object.entries(s.dayStarts).filter(([, d]) => d.actual != null).map(([k, d]) => [Number(k), d.actual!]));
  const schedule = scheduleOf(b, s.plan, actual);
  const asOf = Math.max(...(times as number[]));
  if (s.eta.fromAbs != null && Math.floor(s.eta.fromAbs / 1440) !== Math.floor(asOf / 1440)) {
    // Across the night: only from Day 1 to Day 2, and only when Day 1's end is known (planned, or the logged end of shift).
    // A logged end without a known side stops 30 min before it, the longer stop, so the carry can only come out smaller.
    if (Math.floor(asOf / 1440) !== 0 || Math.floor(s.eta.fromAbs / 1440) !== 1) return base;
    if (!schedule.shiftEnd) {
      const end = s.breakLog.find((x) => x.kind === 'shift' && x.startAbs < 1440);
      if (!end) return base;
      Object.assign(schedule, { shiftEnd: formatHM(end.startAbs), shiftEndStopMin: Math.max(SHIFT_END_STOP_MIN.N, SHIFT_END_STOP_MIN.S) });
    }
  }
  const c = carriedRemaining({ remaining: s.vesselRemaining, rate: s.eta.rate, deckAsOfAbs: asOf, fromAbs: s.eta.fromAbs, schedule });
  if (!c) return base;
  const e = eta({ remaining: c.remaining, basis: 'vessel', periods: s.periods, schedule, ops: s.ops });
  return { etaAbs: e.etaAbs, remaining: c.remaining, carry: { cars: c.cars, sinceMin: c.sinceMin } };
}
