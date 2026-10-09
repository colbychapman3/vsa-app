// What-if calculators (7d step 3), pure. Every result is a FORECAST that lists its assumptions; nothing is saved.
// Impossible or unknown inputs are refused with the reason, never filled in.
import { formatHM, parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { heightChip } from './view.ts';

export type WhatIf = { ok: true; title: string; lines: string[] } | { ok: false; error: string };
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const err = (error: string): WhatIf => ({ ok: false, error });
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

// "What if the 12:00 break moves to 13:00?" The finish time at the current pace with that one break moved, next to the current one.
export function moveBreak(s: State, b: Baseline, nowMin: number, from: number, to: number): WhatIf {
  const brs = breakMins(b);
  if (!brs.includes(from)) return err(`There is no scheduled break at ${formatHM(from)} (breaks: ${b.breaks.join(', ')}).`);
  const pace = s.production.pace;
  if (pace == null) return err('No pace yet: an hour needs its stoppage time or full minutes.');
  if (s.vesselRemaining == null) return err(`Vessel remaining is unknown: add a count for ${s.missingDecks.join(', ')} first.`);
  if (s.vesselRemaining === 0) return err('Vessel remaining is already 0.');
  const hrs = s.vesselRemaining / pace;
  const was = workUntil(nowMin, hrs, brs), now = workUntil(nowMin, hrs, brs.map((x) => (x === from ? to : x)));
  return { ok: true, title: `Move the ${formatHM(from)} break to ${formatHM(to)}`, lines: [
    `${n(s.vesselRemaining)} remaining at ${n(pace)}/hr: about ${clock(now)} with the break at ${formatHM(to)} (about ${clock(was)} as scheduled).`,
    `Assumes steady pace from ${formatHM(nowMin)}, every break 1 hour, no stoppages. Moving a break is only a calculation here; nothing is saved.`] };
}

// Watch rule: an active deck that is a low deck (hard height warning, no vans). Soft (unconfirmed) heights are already listed as "height not confirmed".
export function fitWatch(s: State): string[] {
  return s.decks.filter((d) => d.status === 'active' && d.height.level === 'hard').map((d) => `${d.label} is active: ${heightChip(d).text}.`);
}

// Watch rule (7d step 5): an active deck whose remaining cars the current pace cannot clear before the next break's cutoff.
export function paceWatch(s: State, b: Baseline, nowMin: number): string[] {
  const pace = s.production.pace, brk = breakMins(b).find((x) => x > nowMin);
  if (pace == null || brk == null || s.ops.phase !== 'working') return [];
  const out: string[] = [];
  for (const d of s.decks) {
    if (d.status !== 'active' || d.rem == null || d.rem === 0) continue;
    const need = d.rem / Math.max((brk - 15 - nowMin) / 60, 0.01); // Northside cutoff (the later one): the warning never fires for a deck that could still make it
    if ((brk - 15 - nowMin) > 0 && pace < need) out.push(`${d.label}: ${n(d.rem)} left, pace ${n(pace)}/hr is below the ${n(need)}/hr needed to clear before ${formatHM(brk - 15)}.`);
  }
  return out;
}
