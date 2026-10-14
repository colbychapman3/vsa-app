// What-if calculators (7d step 3), pure. Every result is a FORECAST that lists its assumptions; nothing is saved.
// Impossible or unknown inputs are refused with the reason, never filled in.
import { CLEAR_BY_MIN, brandSides, eta, formatHM, parseHM, scheduleOf, southRemaining, vesselClearBy, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { heightChip } from './view.ts';

export type WhatIf = { ok: true; title: string; lines: string[] } | { ok: false; error: string };
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const err = (error: string) => ({ ok: false as const, error });
const clock = (abs: number) => `${formatHM(((Math.round(abs) % 1440) + 1440) % 1440)}${abs >= 1440 ? ' (next day)' : ''}`;

// Clock time when `hours` of work are done starting at `from`, skipping each scheduled break (1 hour). Ignores the planned shift end.
export function workUntil(from: number, hours: number, breaks: number[]): number {
  let t = from, left = hours * 60;
  const bs = [...breaks, ...breaks.map((x) => x + 1440)].sort((a, c) => a - c);
  for (let guard = 0; left > 0 && guard < 20; guard++) {
    if (bs.some((x) => t >= x && t < x + 60)) { t = bs.find((x) => t >= x && t < x + 60)! + 60; continue; }
    const nextB = bs.find((x) => x > t);
    const room = nextB == null ? left : nextB - t;
    const use = Math.min(room, left);
    t += use; left -= use;
  }
  return t;
}
const breakMins = (b: Baseline) => b.breaks.map((x) => parseHM(x)).filter((x): x is number => x != null);

export function finishAtPace(s: State, b: Baseline, nowMin: number, pace: number): WhatIf {
  if (!(pace > 0)) return err('Pace must be more than 0 autos per hour.');
  if (s.vesselRemaining == null) return err(`Vessel remaining is unknown: add a count for ${s.missingDecks.join(', ')} first.`);
  if (s.vesselRemaining === 0) return err('Vessel remaining is already 0.');
  const end = workUntil(nowMin, s.vesselRemaining / pace, breakMins(b));
  return { ok: true, title: 'Finish at this pace', lines: [`${n(s.vesselRemaining)} remaining at ${n(pace)}/hr: about ${clock(end)}.`, `Assumes steady pace from ${formatHM(nowMin)}, scheduled breaks of 1 hour (${b.breaks.join(', ')}), no stoppages.`] };
}

export function driversChange(s: State, b: Baseline, nowMin: number, drivers: number): WhatIf {
  if (!Number.isInteger(drivers) || drivers <= 0) return err('Drivers must be a whole number above 0.');
  const p = [...s.periods].reverse().find((x) => x.driverRate.rate != null && typeof x.drivers === 'number');
  if (!p) return err('No per-driver rate yet: an hour needs its drivers and its stoppage time.');
  const rate = p.driverRate.rate!;
  const r = finishAtPace(s, b, nowMin, rate * drivers);
  return r.ok ? { ok: true, title: 'Finish with a different driver count', lines: [`With ${drivers} drivers: ${n(rate * drivers)}/hr (last rate ${rate.toFixed(2)} per driver per productive hr, ${p.start}).`, ...r.lines] } : r;
}

// The numbers behind driversChange for a screen: the finish as an absolute minute (past 1440 = next day) at `drivers` drivers,
// from the last per-driver rate. Same refusals as driversChange.
export function driversFinish(s: State, b: Baseline, nowMin: number, drivers: number): { ok: true; endAbs: number; perHr: number } | { ok: false; error: string } {
  const w = driversChange(s, b, nowMin, drivers);
  if (!w.ok) return w;
  const p = [...s.periods].reverse().find((x) => x.driverRate.rate != null && typeof x.drivers === 'number')!;
  const perHr = p.driverRate.rate! * drivers;
  return { ok: true, endAbs: workUntil(nowMin, s.vesselRemaining! / perHr, breakMins(b)), perHr };
}

// ---- One scenario with every factor (Every Screen "What if", Colby 2026-10-14) ----
// The factors are the ones the log can back: drivers (the last measured per-driver rate), the Southside share of the cars still
// aboard (run through the engine's own split-side forecast, the protocol's 15 / 30 min stops) and heavy cargo (pace in the hours
// H/H ran against the hours it did not, observed from the H/H timeline). Weather is not here: nothing measured yet. A factor with
// no measured basis is refused, never guessed. With nothing moved the result is exactly the Snapshot's forecast.
export type Factors = { drivers?: number; south?: number; heavy?: number }; // south, heavy: share 0..1
export type Levers = {
  drivers: { now: number; perDriver: number } | null;
  south: { now: number; known: boolean };               // now: Southside share of the cars still aboard the forecast uses; known: from the brands' destinations
  heavy: { now: number; active: number; clear: number; activeHours: number; clearHours: number } | null;
  heavyWhy: string | null;
};
export type Scenario = { ok: true; endAbs: number; baseAbs: number; deltaMin: number; rate: number; lines: string[] } | { ok: false; error: string };

export function levers(s: State, b: Baseline): Levers {
  const p = [...s.periods].reverse().find((x) => x.driverRate.rate != null && typeof x.drivers === 'number');
  const now = s.drivers?.n ?? (p ? (p.drivers as number) : 0);
  const south = southRemaining(s.brands, b.destinations);
  const known = south != null && s.vesselRemaining != null && s.vesselRemaining > 0;
  const a = s.hh.analysis;
  const ok = a != null && a.active.n > 0 && a.clear.n > 0 && a.active.pace != null && a.clear.pace != null;
  return {
    drivers: p && now > 0 ? { now, perDriver: p.driverRate.rate! } : null,
    // Unknown (a brand on both sides, or uncounted): the forecast stops every car at the later stop, so "now" is all or none.
    south: { now: known ? south! / s.vesselRemaining! : vesselClearBy(b.destinations) >= CLEAR_BY_MIN.Southside ? 1 : 0, known },
    heavy: ok ? { now: s.hh.status === 'active' ? 1 : 0, active: a.active.pace!, clear: a.clear.pace!, activeHours: a.active.n, clearHours: a.clear.n } : null,
    heavyWhy: ok ? null : !a ? 'No H/H pass is logged yet, so heavy cargo has no measured effect.' : 'Needs whole hours both with and without H/H, so heavy cargo has no measured effect yet.',
  };
}

export function scenario(s: State, b: Baseline, f: Factors): Scenario {
  const base = s.eta.rate, remaining = s.steady.remaining ?? s.vesselRemaining;
  if (remaining == null) return err(`Remaining is unknown: add a count for ${s.missingDecks.join(', ')} first.`);
  if (s.vesselRemaining === 0) return err('Vessel remaining is already 0.');
  if (base == null || !(base > 0)) return err('No recent pace yet: an hour needs its stoppage time or full minutes.');
  const lv = levers(s, b);
  let rate = base;
  const lines: string[] = [];
  if (f.drivers != null) {
    if (!lv.drivers) return err('No per-driver rate yet: an hour needs its drivers and its stoppage time.');
    rate *= f.drivers / lv.drivers.now;
    lines.push(`${f.drivers} drivers instead of ${lv.drivers.now}: ${n(base)} → ${n(rate)}/hr (last measured ${lv.drivers.perDriver.toFixed(2)} per driver per productive hr).`);
  }
  if (f.heavy != null) {
    if (!lv.heavy) return err(lv.heavyWhy ?? 'Heavy cargo has no measured effect yet.');
    const at = (h: number) => lv.heavy!.clear * (1 - h) + lv.heavy!.active * h;
    rate *= at(f.heavy) / at(lv.heavy.now);
    lines.push(`H/H running ${Math.round(f.heavy * 100)}% of the remaining hours: measured pace ${n(lv.heavy.clear)}/hr without it (${lv.heavy.clearHours} h) and ${n(lv.heavy.active)}/hr with it (${lv.heavy.activeHours} h). Observed, not proven.`);
  }
  const actual = Object.fromEntries(Object.entries(s.dayStarts).filter(([, d]) => d.actual != null).map(([k, d]) => [Number(k), d.actual!]));
  const sched = scheduleOf(b, s.plan, actual);
  // The Snapshot's own inputs: Southside cars known from the brands' destinations, carried in proportion with the remaining.
  const realSouth = southRemaining(s.brands, b.destinations);
  const baseSouth = realSouth != null && s.vesselRemaining ? realSouth * (remaining / s.vesselRemaining) : null;
  let schedule = sched, southLeft = baseSouth;
  if (f.south != null) {
    schedule = { ...sched, clearByNorth: sched.clearByNorth ?? CLEAR_BY_MIN.Northside, clearBySouth: sched.clearBySouth ?? CLEAR_BY_MIN.Southside };
    southLeft = f.south * remaining;
    lines.push(`Southside ${Math.round(f.south * 100)}% of the cars still aboard: they stop ${schedule.clearBySouth} min before each break, the Northside cars ${schedule.clearByNorth}; the vessel finishes when both are done.`);
  }
  const run = (r: number, sc: typeof sched, south: number | null) => {
    const per = s.periods.map((p, i, all) => (i >= all.length - 2 ? { ...p, pace: r } : p)); // the forecast averages the last two paces
    return eta({ remaining, basis: s.vesselRemaining != null ? 'vessel' : 'field', periods: per, schedule: sc, ops: s.ops, southLeft: south });
  };
  const now = run(base, sched, baseSouth), then = run(rate, schedule, southLeft);
  if (then.etaAbs == null || now.etaAbs == null) return err(then.reason ?? now.reason ?? 'No finish can be projected.');
  lines.push(`Assumes the same steady pace from the last logged hour and 1-hour scheduled breaks (${b.breaks.join(', ')}). Nothing is saved.`);
  const endAbs = Math.round(then.etaAbs), baseAbs = Math.round(now.etaAbs); // whole minutes: the clock never shows a fraction
  return { ok: true, endAbs, baseAbs, deltaMin: endAbs - baseAbs, rate, lines };
}

// Can the deck's remaining cars be cleared before the next break? The cutoff depends on the side (15 / 30 min), so both are shown.
export function canClear(s: State, b: Baseline, nowMin: number, deckId: string): WhatIf {
  const d = s.decks.find((x) => x.id === deckId);
  if (!d) return err('That deck is not on this vessel.');
  if (d.rem == null) return err(`${d.label} has no remaining count yet.`);
  if (d.rem === 0) return err(`${d.label} has nothing remaining.`);
  const pace = s.production.pace;
  if (pace == null) return err('No pace yet: an hour needs its stoppage time or full minutes.');
  const brk = breakMins(b).find((x) => x > nowMin);
  if (brk == null) return err('No scheduled break is left today.');
  const lines = [`${d.label}: ${n(d.rem)} remaining; pace ${n(pace)}/hr; break at ${formatHM(brk)}.`];
  for (const [side, min] of [['Northside', 15], ['Southside', 30]] as const) {
    const left = (brk - min - nowMin) / 60;
    lines.push(left <= 0 ? `${side}: the ${formatHM(brk - min)} clear-by has passed.` : `${side}: by ${formatHM(brk - min)} about ${n(pace * left)} cars → ${pace * left >= d.rem ? 'enough' : `short by about ${n(d.rem - pace * left)}`}.`);
  }
  lines.push(`Needs ${n(d.rem)} by the cutoff; assumes the whole pace goes to this deck.`);
  return { ok: true, title: `Can ${d.label} clear before the break?`, lines };
}

// Hours of work between two clock times, minus each scheduled break that falls inside.
const workHours = (from: number, to: number, breaks: number[]) =>
  (to - from - [...breaks, ...breaks.map((x) => x + 1440)].reduce((m, x) => m + Math.max(0, Math.min(to, x + 60) - Math.max(from, x)), 0)) / 60;

// "What if we stop at HH:MM?" How many more cars the current pace gives by then. A stop time Colby gives is used as given: no clear-by is applied.
export function stopAt(s: State, b: Baseline, nowMin: number, stopMin: number): WhatIf {
  const pace = s.production.pace;
  if (pace == null) return err('No pace yet: an hour needs its stoppage time or full minutes.');
  if (stopMin <= nowMin) return err(`${formatHM(stopMin)} is not after the time now (${formatHM(nowMin)}).`);
  const hrs = workHours(nowMin, stopMin, breakMins(b));
  if (hrs <= 0) return err(`Everything between now and ${formatHM(stopMin)} is a scheduled break.`);
  const cars = pace * hrs, rem = s.vesselRemaining;
  return { ok: true, title: `Stop at ${formatHM(stopMin)}`, lines: [
    `About ${n(cars)} more cars by ${formatHM(stopMin)} (${hrs.toFixed(2)} work hr at ${n(pace)}/hr).`,
    rem == null ? `Vessel remaining is unknown (add a count for ${s.missingDecks.join(', ')}), so no remaining figure.` : cars >= rem ? `${n(rem)} remaining: enough to finish.` : `${n(rem)} remaining → about ${n(rem - cars)} would be left.`,
    `Assumes steady pace and scheduled breaks of 1 hour (${b.breaks.join(', ')}); clear-by is not applied to a stop time you give.`] };
}

// "What if the 12:00 break moves to 13:00?" The finish at the forecast's own pace with that one break moved, next to the current
// one. Both run through the engine's forecast (clear-by before each break, each side's stop), so "as scheduled" is the Snapshot finish.
export function moveBreak(s: State, b: Baseline, nowMin: number, from: number, to: number): WhatIf {
  const brs = breakMins(b);
  if (!brs.includes(from)) return err(`There is no scheduled break at ${formatHM(from)} (breaks: ${b.breaks.join(', ')}).`);
  if (s.vesselRemaining == null) return err(`Vessel remaining is unknown: add a count for ${s.missingDecks.join(', ')} first.`);
  if (s.vesselRemaining === 0) return err('Vessel remaining is already 0.');
  if (s.eta.rate == null) return err('No recent pace yet: an hour needs its stoppage time or full minutes.');
  const remaining = s.steady.remaining ?? s.vesselRemaining;
  const actual = Object.fromEntries(Object.entries(s.dayStarts).filter(([, d]) => d.actual != null).map(([k, d]) => [Number(k), d.actual!]));
  const sched = scheduleOf(b, s.plan, actual);
  const south = southRemaining(s.brands, b.destinations);
  const southLeft = south != null ? south * (remaining / s.vesselRemaining) : null;
  const run = (breaks: string[]) => eta({ remaining, basis: 'vessel', periods: s.periods, schedule: { ...sched, breaks }, ops: s.ops, southLeft }).etaAbs;
  const was = run(sched.breaks), now = run(sched.breaks.map((x) => (parseHM(x) === from ? formatHM(to) : x)));
  if (was == null || now == null) return err('No finish can be projected at this pace.');
  return { ok: true, title: `Move the ${formatHM(from)} break to ${formatHM(to)}`, lines: [
    `${n(remaining)} remaining at ${n(s.eta.rate)}/hr (the forecast's recent pace): about ${clock(now)} with the break at ${formatHM(to)} (about ${clock(was)} as scheduled).`,
    `Same forecast as the Snapshot: each break is 1 hour with the clear-by before it, no stoppages. Moving a break is only a calculation here; nothing is saved.`] };
}

// Watch rule: an active deck that is a low deck (hard height warning, no vans). Soft (unconfirmed) heights are already listed as "height not confirmed".
export function fitWatch(s: State): string[] {
  return s.decks.filter((d) => d.status === 'active' && d.height.level === 'hard').map((d) => `${d.label} is active: ${heightChip(d).text}.`);
}

// What a deck needs per hour to clear before the next break (Colby, 2026-10-14: the side mix matters). All its cars must be out by
// the Northside stop; its Southside cars (brands positively mapped to Southside) by the Southside stop. The stop that binds is
// returned. Null once the Northside stop has passed: nothing left to warn about (the warning never fires for a deck that could
// still make it, and an unmapped brand counts as Northside, as before, so no new alarm comes from missing paperwork).
function deckNeed(s: State, b: Baseline, d: State['decks'][number], brk: number, nowMin: number): { need: number; stop: number } | null {
  const sc = scheduleOf(b, s.plan, {});
  const nStop = sc.clearByNorth ?? CLEAR_BY_MIN.Northside, sStop = sc.clearBySouth ?? CLEAR_BY_MIN.Southside;
  const hN = (brk - nStop - nowMin) / 60, hS = (brk - sStop - nowMin) / 60;
  if (d.rem == null || hN <= 0) return null;
  const sides = brandSides(b.destinations);
  const tot = Object.values(d.brandStart).reduce((t, x) => t + x, 0);
  const south = tot > 0 ? Object.entries(d.brandStart).reduce((t, [name, q]) => { const x = sides.get(name); return x && x.size === 1 && x.has('S') ? t + q : t; }, 0) : 0;
  const southCars = tot > 0 ? d.rem * (south / tot) : 0;
  const needN = d.rem / hN, needS = southCars > 0 && hS > 0 ? southCars / hS : 0;
  return needS > needN ? { need: needS, stop: brk - sStop } : { need: needN, stop: brk - nStop };
}

// Watch rule (7d step 5): an active deck whose remaining cars the current pace cannot clear before the next break's cutoff.
export function paceWatch(s: State, b: Baseline, nowMin: number): string[] {
  const pace = s.production.pace, brk = breakMins(b).find((x) => x > nowMin);
  if (pace == null || brk == null || s.ops.phase !== 'working') return [];
  const out: string[] = [];
  for (const d of s.decks) {
    if (d.status !== 'active' || d.rem == null || d.rem === 0) continue;
    const x = deckNeed(s, b, d, brk, nowMin);
    if (x && pace < x.need) out.push(`${d.label}: ${n(d.rem)} left, pace ${n(pace)}/hr is below the ${n(x.need)}/hr needed to clear before ${formatHM(x.stop)}.`);
  }
  return out;
}

// Advice (assistant step 3, Colby 2026-10-12): for each deck the pace watch flags, how many drivers the last per-driver rate says
// would clear it by the cutoff. A FORECAST with its math; it never changes anything, and Colby decides.
export function paceAdvice(s: State, b: Baseline, nowMin: number): string[] {
  const pace = s.production.pace, brk = breakMins(b).find((x) => x > nowMin);
  if (pace == null || brk == null || s.ops.phase !== 'working') return [];
  const p = [...s.periods].reverse().find((x) => x.driverRate.rate != null && typeof x.drivers === 'number');
  const out: string[] = [];
  for (const d of s.decks) {
    if (d.status !== 'active' || d.rem == null || d.rem === 0) continue;
    const x = deckNeed(s, b, d, brk, nowMin);
    if (!x || pace >= x.need) continue;
    if (!p) { out.push(`${d.label}: no per-driver rate yet, so no driver advice (an hour needs its drivers and minutes).`); continue; }
    const rate = p.driverRate.rate!, cur = p.drivers as number, want = Math.ceil(x.need / rate), more = want - cur;
    out.push(more > 0
      ? `FORECAST: about ${more} more driver${more === 1 ? '' : 's'} (${want} at ${rate.toFixed(2)} per driver per hr, the ${p.start} rate) would clear ${d.label}'s ${n(d.rem)} by ${formatHM(x.stop)}${b.destinations.some((y) => y.side === 'S') ? ` (Northside cars stop ${formatHM(brk - (scheduleOf(b, s.plan, {}).clearByNorth ?? CLEAR_BY_MIN.Northside))}, Southside cars ${formatHM(brk - (scheduleOf(b, s.plan, {}).clearBySouth ?? CLEAR_BY_MIN.Southside))})` : ''}. Assumes the whole pace goes to this deck.`
      : `${d.label}: at the ${p.start} rate, ${cur} drivers should already clear it by ${formatHM(x.stop)}; the pace is running below that rate.`);
  }
  return out;
}
