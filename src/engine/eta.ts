// FORECAST completion time, required rate, and forecast error.
// ETA stepping is ported from the VSA Live tracker's etaCalc(): rate = average pace of
// the last two hours with a known pace; skips clear-by + 1-hour breaks; Day 1 ends at
// shift end minus the stop for the side it ends on; later days start at the next-day start time.
import type { Destination } from './baseline.ts';
import { preBreak, SAFETY_MEETING, type Period } from './production.ts';
import { parseHM, toAbs, fromAbs, formatHM, type OpTime, type Reject } from './time.ts';

const DAY = 1440, BREAK_MIN = 60;

// Shift end (Colby, 2026-10-10): the app asks which side the shift ends on and stops work this many minutes before it.
// Its own rule: kept apart from the pre-break clear-by table, even though the numbers match today.
export const SHIFT_END_STOP_MIN: Record<'N' | 'S', number> = { N: 15, S: 30 };

export type Schedule = {
  dayStart: string;              // Day 1 start
  nextStart?: string | null;     // start time for Day 2 onward
  shiftEnd?: string | null;      // Day 1 shift end, if set
  breaks: string[];
  clearByMin: number;            // applied once before each break (and before the shift end when its side is not given: older logs)
  // The two sides' pre-break stops, when the destinations name both. With the cars still aboard per side (`southLeft`) the forecast
  // finishes each class by its own stop instead of stopping every car at the later one (Colby, 2026-10-14).
  clearByNorth?: number;
  clearBySouth?: number;
  shiftEndStopMin?: number;      // minutes before the Day 1 shift end that work stops, from the side Colby names (its own rule)
  actualStarts?: Record<number, string>; // day → actual (late) start; replaces that day's planned start
};
export type Ops = { day: number; onBreak?: boolean; breakStart?: string | null; shiftEnded?: boolean };

export function vesselClearBy(destinations: Pick<Destination, 'clearBy'>[]): number {
  return destinations.reduce((m, d) => Math.max(m, d.clearBy || 0), 0);
}

// Minutes after midnight when a given day (1-based) starts producing. A 07:00 day opens with the
// safety meeting, so production starts at the later of 07:10 and a recorded actual start.
const dayStartMin = (s: Schedule, day: number) => {
  const planned = day > 1 ? s.nextStart || s.dayStart || '08:00' : s.dayStart || '08:00';
  const actual = s.actualStarts?.[day];
  const meetingEnd = planned === SAFETY_MEETING.start ? parseHM(planned)! + SAFETY_MEETING.min : 0;
  return Math.max(parseHM(actual ?? planned)!, meetingEnd);
};

// Working windows for one day (0-based index d), in absolute minutes.
function windows(s: Schedule, d: number): [number, number][] {
  const base = d * DAY, ds = base + dayStartMin(s, d + 1);
  const end = d === 0 && s.shiftEnd ? base + parseHM(s.shiftEnd)! - (s.shiftEndStopMin ?? s.clearByMin) : Infinity;
  const segs: [number, number][] = [];
  let cur = ds;
  for (const b of s.breaks.map((x) => parseHM(x)!).sort((a, z) => a - z)) { segs.push([cur, base + b - s.clearByMin]); cur = base + b + BREAK_MIN; }
  segs.push([cur, Infinity]);
  return segs.map(([a, z]) => [a, Math.min(z, end)] as [number, number]).filter(([a, z]) => z > a);
}

// Cars still aboard that must stop at the Southside time: the sum of the remaining of every brand whose destination is Southside.
// Null when it cannot be known (a brand with no remaining count, one that goes to both sides, or one the destinations do not name):
// the forecast then keeps the conservative rule and stops every car at the later stop.
export function southRemaining(brands: { name: string; remaining: number | null }[], destinations: Pick<Destination, 'side' | 'brands'>[]): number | null {
  const sides = new Map<string, Set<'N' | 'S'>>();
  for (const d of destinations) for (const b of d.brands ?? []) sides.set(b, (sides.get(b) ?? new Set<'N' | 'S'>()).add(d.side));
  let south = 0;
  for (const b of brands) {
    const s = sides.get(b.name);
    if (!s || s.size !== 1 || b.remaining == null) return null;
    if (s.has('S')) south += b.remaining;
  }
  return south;
}

export function eta(input: { remaining: number; basis: 'vessel' | 'field'; periods: Period[]; schedule: Schedule; ops: Ops; southLeft?: number | null }) {
  const { remaining, basis, periods, schedule: s, ops, southLeft } = input;
  const out = {
    label: 'FORECAST' as const,
    eta: null as OpTime | null,
    etaAbs: null as number | null,
    rate: null as number | null,
    hoursUsed: 0,
    fromAbs: null as number | null,
    reason: null as string | null,
    basisNote: basis === 'field' ? 'Based on field balance; vessel remaining is unknown and field counts can lag the ship.' : null,
  };
  if (remaining === 0) return { ...out, reason: 'No autos remaining. Completion time is recorded only when reported.' };
  if (!periods.length) return { ...out, reason: 'Needs production data' };
  const use = periods.filter((p) => p.pace != null).slice(-2);
  if (!use.length) return { ...out, reason: 'Set the stoppage time on the short hour' };
  const rate = use.reduce((t, p) => t + p.pace!, 0) / use.length;
  out.rate = rate; out.hoursUsed = use.length;
  if (!(rate > 0)) return { ...out, reason: 'Recent rate is zero' };

  const last = periods[periods.length - 1];
  let t = (last.day - 1) * DAY + (preBreak(last.start, s.breaks) ?? parseHM(last.start)! + 60); // a cut-short hour ends at its break
  if (ops.shiftEnded) t = Math.max(t, ops.day * DAY + dayStartMin(s, ops.day + 1));
  else if (ops.onBreak && ops.breakStart) t = Math.max(t, (ops.day - 1) * DAY + parseHM(ops.breakStart)! + BREAK_MIN);
  out.fromAbs = t;
  const d0 = Math.floor(t / DAY);
  // When every working window has run for `cars` at this rate, from the anchor: null when it is beyond two days.
  const finish = (cars: number, sched: Schedule): number | null => {
    let need = (cars / rate) * 60, at = t;
    for (let d = d0; d < d0 + 4; d++) {
      for (const [a, z] of windows(sched, d)) {
        const a1 = Math.max(a, at);
        if (z <= a1) continue;
        const avail = z - a1;
        if (need <= avail) return a1 + need;
        need -= avail; at = z;
      }
      at = (d + 1) * DAY;
    }
    return null;
  };
  // Both sides named and the Southside cars known: the Northside stop serves every car, the Southside stop serves the Southside
  // cars, and the vessel finishes when both are done (a car of either side may use the time before the earlier stop).
  const split = s.clearByNorth != null && s.clearBySouth != null && southLeft != null;
  let end: number | null;
  if (split) {
    const all = finish(remaining, { ...s, clearByMin: s.clearByNorth! });
    const south = southLeft! > 0 ? finish(southLeft!, { ...s, clearByMin: s.clearBySouth! }) : 0;
    end = all == null || south == null ? null : Math.max(all, south);
  } else end = finish(remaining, s);
  if (end == null) return { ...out, reason: 'Beyond two days at this pace' };
  out.etaAbs = end; out.eta = fromAbs(end);
  return out;
}

// The forecast's schedule from the baseline and the plan. One builder, so the forecast and the live estimate never disagree.
export function scheduleOf(
  b: { start: string; breaks: string[]; destinations: (Pick<Destination, 'clearBy'> & { side?: 'N' | 'S' })[] },
  plan: { shiftEnd: string | null; nextStart: string | null; shiftEndSide?: 'N' | 'S' | null },
  actualStarts: Record<number, string>,
): Schedule {
  const sideStop = (side: 'N' | 'S') => { const x = b.destinations.filter((d) => d.side === side); return x.length ? vesselClearBy(x) : null; };
  const north = sideStop('N'), south = sideStop('S');
  return { dayStart: b.start, nextStart: plan.nextStart, shiftEnd: plan.shiftEnd, breaks: b.breaks, clearByMin: vesselClearBy(b.destinations),
    ...(north != null && south != null ? { clearByNorth: north, clearBySouth: south } : {}), // only when both sides are named
    ...(plan.shiftEndSide ? { shiftEndStopMin: SHIFT_END_STOP_MIN[plan.shiftEndSide] } : {}), ...(Object.keys(actualStarts).length ? { actualStarts } : {}) };
}

// LIVE ESTIMATE between counts (Colby, 2026-10-11: "1. fill the gaps between counts"). The same anchor and rate as the forecast:
// remaining at the end of the last logged hour, minus the forecast pace over the productive minutes since. Always an estimate,
// never a count; it never replaces the remaining number and never goes below zero. Quiet when the count is fresh, and it stops
// guessing when the last count is too old to lean on.
export const NOW_EST_MIN_MIN = 10;   // under this many productive minutes since the anchor, the last count is current
export const NOW_EST_MAX_MIN = 120;  // over this many, too stale to project; ask for a count instead
export function nowEstimate(i: { remaining: number | null; rate: number | null; fromAbs: number | null; nowAbs: number; schedule: Schedule; phase: 'working' | 'break' | 'shift_end' }):
  { est: number; sinceMin: number; rate: number } | { est: null; reason: string; stale?: boolean } {
  if (i.remaining == null) return { est: null, reason: 'Remaining is unknown.' };
  if (i.remaining === 0) return { est: null, reason: 'Nothing remaining.' };
  if (i.phase !== 'working') return { est: null, reason: i.phase === 'break' ? 'On break: no production to estimate.' : 'Shift ended: no production to estimate.' };
  if (i.rate == null || !(i.rate > 0) || i.fromAbs == null) return { est: null, reason: 'Needs a recent pace.' };
  const since = productiveMinutes(i.schedule, i.fromAbs, i.nowAbs);
  if (since < NOW_EST_MIN_MIN) return { est: null, reason: 'The last count is current.' };
  if (since > NOW_EST_MAX_MIN) return { est: null, reason: 'No count in over 2 working hours. Log one to estimate again.', stale: true };
  return { est: Math.max(0, Math.round(i.remaining - (i.rate * since) / 60)), sinceMin: Math.round(since), rate: i.rate };
}

// STEADY FINISH (Colby, 2026-10-11, option A). The forecast starts at the end of the last logged hour. Deck counts can be older
// than that hour, so dividing the same stale cars from a later start made the finish jump an hour later with no new information.
// Carry the deck count forward to the anchor at the forecast pace over the working minutes in between. An estimate, never a count;
// the vessel remaining number is untouched. Null when nothing needs carrying (the counts are as new as the anchor) or there is
// nothing safe to carry (no pace, no deck time, or the carry would reach zero: the live estimate says "may be finishing").
export function carriedRemaining(i: { remaining: number | null; rate: number | null; deckAsOfAbs: number | null; fromAbs: number | null; schedule: Schedule }):
  { remaining: number; cars: number; sinceMin: number } | null {
  if (i.remaining == null || i.rate == null || !(i.rate > 0) || i.deckAsOfAbs == null || i.fromAbs == null) return null;
  const since = productiveMinutes(i.schedule, i.deckAsOfAbs, i.fromAbs);
  if (since < NOW_EST_MIN_MIN) return null;
  const cars = Math.round((i.rate * since) / 60), remaining = i.remaining - cars;
  return cars > 0 && remaining > 0 ? { remaining, cars, sinceMin: Math.round(since) } : null;
}

// The steady finish (see carriedRemaining): the finish the screens show. `deckSaves` is when each deck's numbers were last saved
// (null = a time that could not be read); a deck never saved is not in the list. `shiftEndAbs` is Day 1's logged end of shift.
// Inputs the forecast already used are passed in, so this is one more step of the same forecast, never a second model.
export type Steady = { etaAbs: number | null; remaining: number | null; carry: { cars: number; sinceMin: number } | null };
export function steadyFinish(i: { vesselRemaining: number | null; fieldBalance: number | null; forecast: { etaAbs: number | null; rate: number | null; fromAbs: number | null };
  periods: Period[]; schedule: Schedule; ops: Ops; deckSaves: (number | null)[]; shiftEndAbs: number | null; southLeft?: number | null }): Steady {
  const base: Steady = { etaAbs: i.forecast.etaAbs, remaining: i.vesselRemaining ?? i.fieldBalance, carry: null };
  if (i.vesselRemaining == null || i.vesselRemaining === 0) return base; // the field balance is already as new as the hourly counts
  if (!i.deckSaves.length || i.deckSaves.some((x) => x == null)) return base; // a save whose time can't be read: leave the forecast as it is
  const from = i.forecast.fromAbs, asOf = Math.max(...(i.deckSaves as number[]));
  let schedule = i.schedule;
  if (from != null && Math.floor(from / DAY) !== Math.floor(asOf / DAY)) {
    // Across the night: only Day 1 to Day 2, and only when Day 1's end is known (planned, or the logged end of shift). A logged end
    // with no known side stops the longer 30 min before it, so the carry can only come out smaller.
    if (Math.floor(asOf / DAY) !== 0 || Math.floor(from / DAY) !== 1) return base;
    if (!schedule.shiftEnd) {
      if (i.shiftEndAbs == null || i.shiftEndAbs >= DAY) return base;
      schedule = { ...schedule, shiftEnd: formatHM(i.shiftEndAbs), shiftEndStopMin: Math.max(SHIFT_END_STOP_MIN.N, SHIFT_END_STOP_MIN.S) };
    }
  }
  const c = carriedRemaining({ remaining: i.vesselRemaining, rate: i.forecast.rate, deckAsOfAbs: asOf, fromAbs: from, schedule });
  if (!c) return base;
  // The carried cars come off both sides in proportion (the log does not say which side they were): an estimate, like the carry.
  const southLeft = i.southLeft == null ? null : i.southLeft * (c.remaining / i.vesselRemaining);
  const e = eta({ remaining: c.remaining, basis: 'vessel', periods: i.periods, schedule, ops: i.ops, southLeft });
  return { etaAbs: e.etaAbs, remaining: c.remaining, carry: { cars: c.cars, sinceMin: c.sinceMin } };
}

// Productive hours between two times, skipping breaks and clear-by windows.
export function productiveMinutes(s: Schedule, from: number, to: number): number {
  if (!(to > from)) return 0;
  let total = 0;
  for (let d = Math.floor(from / DAY); d <= Math.floor(to / DAY); d++) {
    for (const [a, z] of windows(s, d)) total += Math.max(0, Math.min(z, to, (d + 1) * DAY) - Math.max(a, from)); // a day ends at midnight: no overlap with the next
  }
  return total;
}

export function requiredRate(remaining: number, from: OpTime, target: OpTime, s: Schedule): { rate: number; productiveHours: number } | { rate: null; reason: string } {
  const a = toAbs(from), z = toAbs(target);
  if (a == null || z == null) return { rate: null, reason: 'Needs a valid start and target time.' };
  const hours = productiveMinutes(s, a, z) / 60;
  if (!(hours > 0)) return remaining === 0 ? { rate: 0, productiveHours: 0 } : { rate: null, reason: 'No productive time left before the target; not feasible on these assumptions.' };
  return { rate: remaining / hours, productiveHours: hours };
}

// A forecast is never marked complete; a passed one says so.
export function forecastPassed(etaAbs: number | null, nowAbs: number, remaining: number | null, atBreakOrShiftEnd: boolean): boolean {
  return etaAbs != null && remaining !== 0 && !atBreakOrShiftEnd && nowAbs > etaAbs;
}

type Milestone = 'cars_complete' | 'hh_complete' | 'loadback_complete' | 'lashing_complete' | 'operation_complete';

// Signed error in minutes: actual − predicted (positive = later than forecast).
export function forecastError(predicted: { milestone: Milestone; at: OpTime }, actual: { milestone: Milestone; at: OpTime }): { signedMin: number; absMin: number } | Reject {
  if (predicted.milestone !== actual.milestone) return { ok: false, error: `Forecast was for ${predicted.milestone}; actual is ${actual.milestone}. Score only the same milestone.` };
  const p = toAbs(predicted.at), a = toAbs(actual.at);
  if (p == null || a == null) return { ok: false, error: 'Forecast error needs valid predicted and actual times.' };
  return { signedMin: a - p, absMin: Math.abs(a - p) };
}
