// The Now line (Design B, Phase 2; Colby 2026-10-11: one line above the remaining number). The single thing worth knowing
// right now, in priority order: a deck that won't clear before a break, then an hourly count that's due, else calm.
// Quiet on a break and after shift end (the banner says so). Pure and tested.
import { parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { hourOptions } from './view.ts';
import { paceAdvice, paceWatch } from './whatif.ts';

export type NowAction = { label: string; to: 'log' | 'decks' | 'deck'; deck?: string }; // 'deck': that deck's sheet
export type NowLine = { tone: 'warn' | 'due' | 'calm'; text: string; sub?: string; advice?: string; action?: NowAction }; // advice: the driver move, FORECAST, only with a warning; action: the one tap that answers it

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
  return { tone: 'calm', text: 'Nothing needs your attention right now.' };
}
