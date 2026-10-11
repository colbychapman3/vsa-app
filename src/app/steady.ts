// Steady finish (Colby, 2026-10-11, option A): the finish time the screens show. When the deck counts are older than the last
// logged hour, the cars still aboard are carried forward at the forecast pace (labeled an estimate) before the forecast runs, so
// logging an hourly count without a deck update no longer pushes the finish an hour later. Vessel remaining itself never changes.
// One function, so the tile, the break strip, the answer card, the brief and the live estimate always show the same finish.
import { carriedRemaining, eta, scheduleOf, parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';

export type Carry = { cars: number; sinceMin: number };
export type Steady = { etaAbs: number | null; remaining: number | null; carry: Carry | null };

// "09:30" or "Day 2 09:30" is an event time; "Logged at …" / "time not provided" is not one (the deck's age is unknown, so no carry).
function deckTimeAbs(t: string | null): number | null {
  const m = /^(?:Day (\d+) )?(\d{1,2}:\d{2})$/.exec(t ?? '');
  const mins = m ? parseHM(m[2]) : null;
  return m && mins != null ? ((m[1] ? Number(m[1]) : 1) - 1) * 1440 + mins : null;
}

export function steady(s: State, b: Baseline): Steady {
  const base: Steady = { etaAbs: s.eta.etaAbs, remaining: s.vesselRemaining ?? s.fieldBalance, carry: null };
  if (s.vesselRemaining == null || s.vesselRemaining === 0) return base; // the field balance is already as new as the hourly counts
  const times = s.decks.filter((d) => d.time != null).map((d) => deckTimeAbs(d.time)); // a deck never updated holds its starting quantity: no age
  if (!times.length || times.some((x) => x == null)) return base; // a deck saved with no event time has an unknown age: leave the forecast as it is
  const actual = Object.fromEntries(Object.entries(s.dayStarts).filter(([, d]) => d.actual != null).map(([k, d]) => [Number(k), d.actual!]));
  const schedule = scheduleOf(b, s.plan, actual);
  const c = carriedRemaining({ remaining: s.vesselRemaining, rate: s.eta.rate, deckAsOfAbs: Math.max(...(times as number[])), fromAbs: s.eta.fromAbs, schedule });
  if (!c) return base;
  const e = eta({ remaining: c.remaining, basis: 'vessel', periods: s.periods, schedule, ops: s.ops });
  return { etaAbs: e.etaAbs, remaining: c.remaining, carry: { cars: c.cars, sinceMin: c.sinceMin } };
}
