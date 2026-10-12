// Phase 4, prep that asks only about doubt (Game Plan, 2026-10-12). After the paperwork is read: the ship in one card, the few things
// that are in doubt (a mismatch, an unreadable field, a missing berth or height), and what the app will watch today.
// Display-only: it reads the checked baseline from setup.ts and never changes a number.
import { LOW_DECK_M, type Built, type DeckDraft } from './setup.ts';

const n = (x: number) => x.toLocaleString('en-US');
type Ok = Extract<Built, { ok: true }>;

export type ShipCard = {
  total: number; decks: number;
  destinations: { name: string; side: 'N' | 'S'; autos: number | null }[];
  southAutos: number | null; southPct: number | null; // by autos sent to Southside destinations; null when any destination has no count
  hh: number | null;                                   // the game plan's printed H/H total only; never a sum of rows, never added to autos
};

export function shipCard(b: Ok, hhTotal: number | null): ShipCard {
  const destinations = b.baseline.destinations.map((d) => ({ name: d.name, side: d.side, autos: d.autos ?? null }));
  const known = destinations.length > 0 && destinations.every((d) => d.autos != null);
  const all = known ? destinations.reduce((s, d) => s + d.autos!, 0) : null;
  const south = known ? destinations.filter((d) => d.side === 'S').reduce((s, d) => s + d.autos!, 0) : null;
  return { total: b.total, decks: b.baseline.decks.length, destinations, southAutos: south, southPct: all ? Math.round((south! / all) * 100) : null, hh: hhTotal };
}

export type Doubt = { id: string; kind: 'missing' | 'unreadable' | 'mismatch'; text: string; blocks: boolean; ask?: 'berth' | { height: number } };

// Only what is really in doubt. A clean read gives an empty list apart from the berth and the heights the paperwork never carries.
export function doubts(i: { built: Built; gamePlanAutos: number | null; problems: string[]; berth: string; decks: DeckDraft[] }): Doubt[] {
  const out: Doubt[] = [];
  if (!i.berth) out.push({ id: 'berth', kind: 'missing', text: 'Which berth? It sets the miles to each destination.', blocks: true, ask: 'berth' });
  if (!i.built.ok) i.built.errors.forEach((e, k) => out.push({ id: `err${k}`, kind: 'unreadable', text: e, blocks: true }));
  else if (i.gamePlanAutos != null && i.built.total !== i.gamePlanAutos) {
    out.push({ id: 'total', kind: 'mismatch', text: `Game plan total ${n(i.gamePlanAutos)}, decks add to ${n(i.built.total)} (difference ${n(Math.abs(i.built.total - i.gamePlanAutos))}).`, blocks: false });
  }
  i.problems.forEach((p, k) => out.push({ id: `read${k}`, kind: 'unreadable', text: p, blocks: false }));
  i.decks.forEach((d, k) => { if (d.current.trim() === '') out.push({ id: `h${k}`, kind: 'missing', text: `${d.label.trim() || `Deck ${k + 1}`}: height is not on the paperwork. Type it, or leave it unknown (fit checks stay off for this deck).`, blocks: false, ask: { height: k } }); });
  return out;
}

// What the app will watch today, from the saved baseline. Setup ends with this.
export function watchList(b: Ok, o: { hhExists: boolean }): string[] {
  const L: string[] = [];
  const dests = b.baseline.destinations;
  const south = dests.filter((d) => d.side === 'S').map((d) => d.name);
  const northOnly = dests.length > 0 && south.length === 0;
  L.push(dests.length === 0 ? 'Clear-by: no destinations yet, so no clear-by countdown.'
    : northOnly ? `Clear-by: 15 min before the ${b.baseline.breaks.join(' and ')} breaks (all Northside).`
    : `Clear-by before the ${b.baseline.breaks.join(' and ')} breaks: Northside 15 min, Southside 30 min (${south.join(', ')}).`);
  const heights = b.baseline.decks.map((d) => ({ label: d.label, m: d.heights?.find((h) => h.current)?.m ?? d.heights?.[0]?.m ?? null }));
  const low = heights.filter((h) => h.m != null && h.m < LOW_DECK_M);
  const unknown = heights.filter((h) => h.m == null);
  if (low.length) L.push(`Low deck for shuttle vans (under ${LOW_DECK_M} m): ${low.map((h) => `${h.label} ${h.m!.toFixed(2)} m`).join(', ')}.`);
  L.push(unknown.length ? `Fit checks stay off for ${unknown.length} deck${unknown.length === 1 ? '' : 's'} with no height: ${unknown.map((h) => h.label).join(', ')}.` : 'Every deck has a height, so fit checks can run.');
  L.push(`Hourly counts: a reminder at :05 after each working hour (Settings › Notifications). The finish shows as a FORECAST once the first count is in.`);
  L.push(`Planned start ${b.baseline.start}. Hours are clock hours; the ${b.baseline.breaks.join(' and ')} breaks never move.`);
  if (o.hhExists) L.push('High & Heavy is shown as awareness only, in its own ledger: never added to your autos.');
  if (b.discrepancies.length) L.push(`${b.discrepancies.length} discrepanc${b.discrepancies.length === 1 ? 'y' : 'ies'} on record at setup. They stay visible and nothing is adjusted.`);
  return L;
}
