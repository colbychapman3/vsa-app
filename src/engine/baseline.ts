// Vessel baseline (the shape of docs/reference/glovis-condor-101-baseline.json):
// validation, starting totals, and load list vs game plan authority.
import { parseHM } from './time.ts';

export type Item = { brand: string; qty: number };
export type Hatch = { h: string; items: Item[] };
export type Height = { m: number; current: boolean };
export type Deck = { id: string; label: string; heights?: Height[]; hatches: Hatch[] };
export type Destination = { name: string; side: 'N' | 'S'; clearBy: number; mi?: number; ref?: string; brands?: string[]; autos?: number };
export type Baseline = {
  vessel: string;
  date: string;
  start: string;
  breaks: string[];
  labor?: { autoDrivers?: number };
  destinations: Destination[];
  decks: Deck[];
  [other: string]: unknown;
};

export type BaselineCheck =
  | { ok: true; start: number; brandStart: Record<string, number>; discrepancies: string[] }
  | { ok: false; errors: string[] };

const n = (x: number) => x.toLocaleString('en-US');
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;

export function validateBaseline(b: Baseline): BaselineCheck {
  const errors: string[] = [];
  if (parseHM(b.start) == null) errors.push(`Start time "${b.start}" is not a valid HH:MM time.`);
  for (const t of b.breaks) if (parseHM(t) == null) errors.push(`Break time "${t}" is not a valid HH:MM time.`);

  const ids = new Set<string>();
  const brandStart: Record<string, number> = {};
  let start = 0;
  for (const d of b.decks) {
    if (ids.has(d.id)) errors.push(`Deck id ${d.id} is used twice.`);
    ids.add(d.id);
    const hs = new Set<string>();
    for (const h of d.hatches) {
      if (hs.has(h.h)) errors.push(`${d.label} has hatch ${h.h} twice.`);
      hs.add(h.h);
      for (const i of h.items) {
        if (!isCount(i.qty)) { errors.push(`${d.label} ${h.h} ${i.brand} quantity must be a whole number (got ${i.qty}).`); continue; }
        start += i.qty;
        brandStart[i.brand] = (brandStart[i.brand] ?? 0) + i.qty;
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  // Keep conflicts visible; never adjust a count to make totals balance.
  const discrepancies: string[] = [];
  const dests = b.destinations.filter((d) => typeof d.autos === 'number');
  if (dests.length) {
    const destTotal = dests.reduce((s, d) => s + d.autos!, 0);
    if (destTotal !== start) discrepancies.push(`Destination totals say ${n(destTotal)} autos but the decks add to ${n(start)} (difference ${n(Math.abs(destTotal - start))}).`);
  }
  return { ok: true, start, brandStart, discrepancies };
}

// Load list quantity controls over the game plan unless Colby overrides.
// The losing value and every mismatch stay visible. H&H is its own ledger.
export function authoritativeAutos(input: {
  loadList?: { autos: number; hh?: number };
  gamePlan?: { autos: number; deckSplit?: number[] };
  override?: 'game_plan';
}): { autos: number | null; hh: number | null; source: 'load_list' | 'game_plan' | 'game_plan_override' | 'unknown'; discrepancies: string[] } {
  const { loadList, gamePlan, override } = input;
  const useGamePlan = gamePlan && (override === 'game_plan' || !loadList);
  const autos = useGamePlan ? gamePlan.autos : loadList?.autos ?? null;
  const source = !loadList && !gamePlan ? 'unknown' : useGamePlan ? (loadList ? 'game_plan_override' : 'game_plan') : 'load_list';
  const discrepancies: string[] = [];
  if (loadList && gamePlan && loadList.autos !== gamePlan.autos) {
    discrepancies.push(`Game plan says ${n(gamePlan.autos)} autos; load list says ${n(loadList.autos)} (difference ${n(Math.abs(gamePlan.autos - loadList.autos))}). ${useGamePlan ? 'Game plan controls (Colby override).' : 'Load list controls.'}`);
  }
  if (autos != null && gamePlan?.deckSplit) {
    const split = gamePlan.deckSplit.reduce((s, x) => s + x, 0);
    if (split !== autos) discrepancies.push(`Game plan deck split adds to ${n(split)}, not ${n(autos)}. Deck allocation needs reconciliation.`);
  }
  return { autos, hh: loadList?.hh ?? null, source, discrepancies };
}
