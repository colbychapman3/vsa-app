// Hourly field production: short pre-break hours, pace, H.A., driver rates,
// stoppage hours, cumulative checkpoints. Period math is ported from the VSA Live
// tracker's compute(); driver rates follow calculation guide 07.
import { parseHM, formatHM, toAbs, type OpTime, type Reject, type Side } from './time.ts';

export type HourEntry = {
  day: number;
  start: string;                       // hour start, "HH:MM"
  count: number;                       // field autos counted in this hour
  drivers?: number | null;
  brands?: Record<string, number> | null;
  stopMin?: number | null;             // productive minutes in a short pre-break hour (30 or 45)
  was?: number[];                      // earlier values of this hour's total, oldest first (corrections)
};

export type Period = HourEntry & {
  short: boolean;                      // a break starts at the end of this hour
  min: number | null;                  // productive minutes; null = short hour with no stop time
  pace: number | null;                 // autos per productive hour
  delta: number | null;                // pace change vs the previous hour (same day)
  deltaPct: number | null;
  deltaPaced: boolean;                 // true when either hour was short, so the change is pace, not count
};

const STOP_CHOICES = [30, 45];

export function isShort(start: string, breaks: string[]): boolean {
  const s = parseHM(start);
  return s != null && breaks.some((b) => parseHM(b) === s + 60);
}

export function buildPeriods(entries: HourEntry[], breaks: string[]): Period[] {
  const sorted = [...entries].sort((a, b) => a.day - b.day || parseHM(a.start)! - parseHM(b.start)!);
  let prevP: number | null = null, prevS = false, prevD = 1;
  return sorted.map((h) => {
    if (h.day !== prevD) { prevP = null; prevS = false; prevD = h.day; }
    const short = isShort(h.start, breaks);
    const min = short ? (typeof h.stopMin === 'number' ? h.stopMin : null) : 60;
    const pace = min ? h.count / (min / 60) : null;
    const delta = prevP == null || pace == null ? null : pace - prevP;
    const deltaPct = prevP && pace != null ? ((pace - prevP) / prevP) * 100 : null;
    const p: Period = { ...h, short, min, pace, delta, deltaPct, deltaPaced: short || prevS };
    prevP = pace; prevS = short;
    return p;
  });
}

export function summarize(periods: Period[]) {
  const field = periods.reduce((s, p) => s + p.count, 0);
  const known = periods.filter((p) => p.min != null);
  const prodMin = known.reduce((s, p) => s + p.min!, 0);
  const prodCount = known.reduce((s, p) => s + p.count, 0);
  return {
    field,
    countedHours: periods.length,                                // H.A. denominator
    ha: periods.length ? field / periods.length : null,          // field ÷ counted hours
    prodMin,
    prodCount,
    pace: prodMin ? prodCount / (prodMin / 60) : null,           // field ÷ productive hours
    unsetShort: periods.filter((p) => p.short && p.min == null).map((p) => p.start),
  };
}

type RateResult = { rate: number; driverHours: number } | { rate: null; reason: string };

// Vehicles per driver per hour from time-weighted driver-hours.
export function driverRate(units: number, segments: { drivers: number | null; minutes: number | null }[]): RateResult {
  if (!segments.length) return { rate: null, reason: 'No driver segments recorded.' };
  if (segments.some((s) => s.drivers == null)) return { rate: null, reason: 'Driver count unknown for part of the period.' };
  if (segments.some((s) => s.minutes == null)) return { rate: null, reason: 'Productive minutes unknown for part of the period.' };
  const driverHours = segments.reduce((h, s) => h + (s.drivers! * s.minutes!) / 60, 0);
  if (!(driverHours > 0)) return { rate: null, reason: 'No driver-hours (0), so the rate is unavailable.' };
  return { rate: units / driverHours, driverHours };
}

export function hourDriverRate(p: Period): RateResult {
  return driverRate(p.count, [{ drivers: p.drivers ?? null, minutes: p.min }]);
}

// Total hours stopped; overlapping stops are merged first. Intervals are [start, end) in absolute minutes.
export function stoppageHours(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0, curS = -Infinity, curE = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curE) { if (curE > curS) total += curE - curS; curS = s; curE = e; }
    else curE = Math.max(curE, e);
  }
  if (curE > curS) total += curE - curS;
  return total / 60;
}

// Cumulative field checkpoints → interval units. A checkpoint is never an increment itself.
export function cumulativeToIntervals(points: { at: OpTime; value: number }[]): { from: OpTime; to: OpTime; units: number }[] | Reject {
  const sorted = [...points].sort((a, b) => toAbs(a.at)! - toAbs(b.at)!);
  const out: { from: OpTime; to: OpTime; units: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (b.value < a.value) return { ok: false, error: `Cumulative count went down from ${a.value} (${a.at.hm}) to ${b.value} (${b.at.hm}). Needs a correction.` };
    out.push({ from: a.at, to: b.at, units: b.value - a.value });
  }
  return out;
}

// Default stop for a short hour: Northside-only work stops :45, Southside-only :30; mixed → Colby picks.
export function suggestedStop(sides: Side[]): 30 | 45 | null {
  const n = sides.includes('Northside'), s = sides.includes('Southside');
  return n && !s ? 45 : s && !n ? 30 : null;
}

// Validate one hourly entry (tracker saveHour rules). Field-over-starting is checked in ledger.
export function checkHour(h: HourEntry, brands: string[], breaks: string[]): Reject | null {
  const fail = (error: string): Reject => ({ ok: false, error });
  const s = parseHM(h.start);
  if (s == null) return fail(`Hour start "${h.start}" is not a valid HH:MM time.`);
  if (!Number.isInteger(h.count) || h.count < 0) return fail('Enter the whole-number count for this hour.');
  if (h.drivers != null && (!Number.isInteger(h.drivers) || h.drivers < 0)) return fail('Drivers must be a whole number.');
  if (h.brands) {
    for (const [b, v] of Object.entries(h.brands)) {
      if (!brands.includes(b)) return fail(`${b} is not on this vessel.`);
      if (!Number.isInteger(v) || v < 0) return fail(`${b} must be a whole number.`);
    }
    const filled = Object.keys(h.brands).length;
    if (filled && filled < brands.length) return fail('Fill every brand, or leave the split blank.');
    const sum = Object.values(h.brands).reduce((t, v) => t + v, 0);
    if (filled && sum !== h.count) return fail(`Brand split adds to ${sum} but the hour total is ${h.count}. Fix one.`);
  }
  if (!isShort(h.start, breaks) && h.stopMin != null) return fail('A stop time only applies to the hour before a break.');
  if (isShort(h.start, breaks)) {
    if (h.stopMin == null) return fail(`Pick when production stopped before the ${formatHM(s + 60)} break.`);
    if (!STOP_CHOICES.includes(h.stopMin)) return fail('Stop time must be :30 or :45 (30 or 45 minutes worked).');
  }
  return null;
}
