// The Now line (Design B, Phase 2; Colby 2026-10-11: one line above the remaining number). The single thing worth knowing
// right now, in priority order: a deck that won't clear before a break, then an hourly count that's due, then the stop before a
// break coming up (board 1.2b), else calm.
// Quiet on a break and after shift end (the banner says so). Pure and tested.
import { formatHM, parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { hourOptions } from './view.ts';
import { paceAdvice, paceWatch } from './whatif.ts';

export type NowAction = { label: string; to: 'log' | 'decks' | 'deck'; deck?: string }; // 'deck': that deck's sheet
export type NowLine = { tone: 'warn' | 'due' | 'calm'; text: string; sub?: string; advice?: string; action?: NowAction }; // advice: the driver move, FORECAST, only with a warning; action: the one tap that answers it

// The hour that has ended without a count ("14–15"), for the Log button's chip: the due count is said there, not on the Snapshot.
export function dueHour(s: State, b: Baseline, nowMin: number): string | null {
  const l = nowLine(s, b, nowMin);
  return l?.tone === 'due' && l.action ? l.action.label.replace(/^Log /, '') : null;
}

export function nowLine(s: State, b: Baseline, nowMin: number): NowLine | null {
  if (s.ops.phase !== 'working' || s.vesselRemaining === 0) return null;
  const watch = paceWatch(s, b, nowMin);
  if (watch.length) {
    const a = paceAdvice(s, b, nowMin)[0];
    const d = s.decks.find((x) => watch[0].startsWith(`${x.label}:`)); // paceWatch lines open with the deck's label: the card jumps to that deck
    return { tone: 'warn', text: watch[0], ...(a ? { advice: a } : {}), action: d ? { label: `See ${d.label}`, to: 'deck', deck: d.id } : { label: 'See decks', to: 'decks' } };
  }
  const opts = hourOptions(s, b);
  const endOf = (h: { start: string; end: string }) => { const a = parseHM(h.start)!, z = parseHM(h.end)!; return z > a ? z : z + 1440; }; // 23–00 ends at midnight
  const due = opts.hours.filter((h) => !h.logged && endOf(h) <= nowMin).at(-1); // the latest hour that has ended without a count
  if (due && s.ops.day === opts.day) { const r = `${due.start.slice(0, 2)}–${due.end.slice(0, 2)}`; return { tone: 'due', text: `The ${r} count is due.`, sub: `The hour ended at ${due.end}.`, action: { label: `Log ${r}`, to: 'log' } }; }
  const nudge = breakNudge(s, b, nowMin);
  if (nudge) return nudge;
  return { tone: 'calm', text: 'Nothing needs your attention right now.' };
}

// The stop before a scheduled break, said NUDGE_MIN before it (board 1.2b): each side present on this vessel stops its clear-by
// minutes before the break (Appendix C: Northside 15, Southside 30). The action opens the active deck with the most cars left.
export const NUDGE_MIN = 30;
export function breakNudge(s: State, b: Baseline, nowMin: number): NowLine | null {
  const sides = new Map<'N' | 'S', number>();
  for (const d of b.destinations) sides.set(d.side, d.clearBy);
  if (!sides.size) return null;
  for (const brk of b.breaks.map((x) => parseHM(x)).filter((x): x is number => x != null)) {
    const stops = ([['S', 'Southside'], ['N', 'Northside']] as const).filter(([k]) => sides.has(k)).map(([k, name]) => ({ name, at: brk - sides.get(k)! }));
    const first = Math.min(...stops.map((x) => x.at));
    if (nowMin >= first || first - nowMin > NUDGE_MIN) continue;
    const text = stops.length === 1 ? `Break at ${formatHM(brk)}. Stop at ${formatHM(first)}, in ${first - nowMin} min.`
      : `Break at ${formatHM(brk)}. Stop ${stops.map((x) => `${x.name} at ${formatHM(x.at)}`).join(', ')}; the first in ${first - nowMin} min.`;
    const d = s.decks.filter((x) => x.status === 'active' && (x.rem ?? 0) > 0).sort((x, y) => (y.rem ?? 0) - (x.rem ?? 0))[0];
    return { tone: 'warn', text, action: d ? { label: `See ${d.label}`, to: 'deck', deck: d.id } : { label: 'See decks', to: 'decks' } };
  }
  return null;
}
