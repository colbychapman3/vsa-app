// FORECAST completion time, required rate, and forecast error.
// ETA stepping is ported from the VSA Live tracker's etaCalc(): rate = average pace of
// the last two hours with a known pace; skips clear-by + 1-hour breaks; Day 1 ends at
// shift end minus the stop for the side it ends on; later days start at the next-day start time.
import type { Destination } from './baseline.ts';
import { preBreak, SAFETY_MEETING, type Period } from './production.ts';
import { parseHM, toAbs, fromAbs, type OpTime, type Reject } from './time.ts';

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

export function eta(input: { remaining: number; basis: 'vessel' | 'field'; periods: Period[]; schedule: Schedule; ops: Ops }) {
  const { remaining, basis, periods, schedule: s, ops } = input;
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
  let need = (remaining / rate) * 60;
  const d0 = Math.floor(t / DAY);
  for (let d = d0; d < d0 + 4; d++) {
    for (const [a, z] of windows(s, d)) {
      const a1 = Math.max(a, t);
      if (z <= a1) continue;
      const avail = z - a1;
      if (need <= avail) { out.etaAbs = a1 + need; out.eta = fromAbs(out.etaAbs); return out; }
      need -= avail; t = z;
    }
    t = (d + 1) * DAY;
  }
  return { ...out, reason: 'Beyond two days at this pace' };
}

// Productive hours between two times, skipping breaks and clear-by windows.
function productiveMinutes(s: Schedule, from: number, to: number): number {
  let total = 0;
  for (let d = Math.floor(from / DAY); d <= Math.floor(to / DAY); d++) {
    for (const [a, z] of windows(s, d)) total += Math.max(0, Math.min(z, to) - Math.max(a, from));
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
