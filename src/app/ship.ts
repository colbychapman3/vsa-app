// Design B "Ship Plan" (Colby, 2026-10-11): the home screen is the vessel. One band per deck, top deck first (paperwork order),
// split into its hatches H4 → H3 → H2 → H1 left to right (Colby's comment on the design: "if it's hatches 2 & 3, the bar
// highlights those two sections while 4 & 1 show empty"). A hatch fills by how much of it is still aboard. Pure and tested;
// every number comes from the engine's state. Unknown stays unknown: no fill, and the row says a count is needed.
import type { State } from '../storage/store.ts';

export const HATCH_SLOTS = ['H4', 'H3', 'H2', 'H1'] as const;
export type Seg = { h: string; fill: number | null }; // fill: share still aboard, 0..1; null = unknown (or no quantity on the paperwork)
export type ShipRow = { id: string; label: string; segs: (Seg | null)[]; right: string; tone: 'working' | 'waiting' | 'clear' | 'unknown'; a11y: string };

const n = (x: number) => x.toLocaleString('en-US');
const share = (qty: number | null, rem: number | null, complete: boolean): number | null =>
  complete ? 0 : qty == null || rem == null || !(qty > 0) ? null : Math.min(1, Math.max(0, rem / qty));

export function shipView(s: State): { rows: ShipRow[]; left: number | null; decksLeft: number; decks: number } {
  const rows = s.decks.map((d): ShipRow => {
    const complete = d.status === 'complete';
    const named = d.hatches.filter((h) => (HATCH_SLOTS as readonly string[]).includes(h.h));
    // Per hatch when the paperwork splits the deck into H1–H4 and Colby counts by hatch (or the deck is done);
    // otherwise one band for the deck (a ramp, or a deck counted as a whole).
    const byHatch = named.length > 0 && (complete || named.some((h) => h.rem != null));
    const segs: (Seg | null)[] = byHatch
      ? HATCH_SLOTS.map((slot) => { const h = d.hatches.find((x) => x.h === slot); return h ? { h: slot, fill: share(h.qty, h.rem, complete) } : null; })
      : [{ h: d.label, fill: share(d.start, d.rem, complete) }];
    const working = byHatch ? named.filter((h) => !complete && h.rem != null && h.rem > 0).map((h) => h.h) : [];
    const tone: ShipRow['tone'] = complete ? 'clear' : d.rem == null ? 'unknown' : d.status === 'notStarted' ? 'waiting' : 'working';
    const right = complete ? '✓ clear' : d.rem == null ? 'count?' : `${n(d.rem)} left`;
    const a11y = complete ? `${d.label}: clear`
      : d.rem == null ? `${d.label}: remaining count needed`
      : `${d.label}: ${n(d.rem)} left${d.status === 'notStarted' ? ', not started' : ''}${working.length ? `, in ${working.join(' and ')}` : ''}`;
    return { id: d.id, label: d.label, segs, right, tone, a11y };
  });
  return { rows, left: s.vesselRemaining, decksLeft: s.decks.filter((d) => d.status !== 'complete').length, decks: s.decks.length };
}
