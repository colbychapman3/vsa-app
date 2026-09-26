// Deck status, hatch/deck/brand remaining, and deck heights.
// Ported from the VSA Live tracker (deckCalc, heightInfo, saveDeck validation).
import type { Deck, Item } from './baseline.ts';
import type { Reject } from './time.ts';

export type DeckStatus = 'notStarted' | 'active' | 'paused' | 'complete' | 'unknown';
export type DeckState = {
  status: DeckStatus;
  skipped?: boolean;
  hatchRemaining?: Record<string, number>;
  deckRemaining?: number | null;
};

export type DeckResult = {
  id: string;
  label: string;
  status: DeckStatus;
  skipped: boolean;
  hatches: { h: string; items: Item[]; qty: number; rem: number | null }[];
  start: number;
  rem: number | null; // null = unknown
  brandStart: Record<string, number>;
  brandRem: Record<string, number | null>;
};

export function deckCalc(d: Deck, st: DeckState = { status: 'notStarted' }): DeckResult {
  const status = st.status;
  const hatches = d.hatches.map((h) => {
    const qty = h.items.reduce((s, i) => s + i.qty, 0);
    const v = st.hatchRemaining?.[h.h];
    const rem = status === 'complete' ? 0 : status === 'notStarted' ? qty : typeof v === 'number' ? v : null;
    return { h: h.h, items: h.items, qty, rem };
  });
  const start = hatches.reduce((s, h) => s + h.qty, 0);
  let rem: number | null;
  if (status === 'complete') rem = 0;
  else if (status === 'notStarted') rem = start;
  else if (status === 'unknown') rem = null;
  else if (hatches.every((h) => h.rem != null)) rem = hatches.reduce((s, h) => s + h.rem!, 0);
  else if (typeof st.deckRemaining === 'number') rem = st.deckRemaining;
  else rem = null;

  const brandStart: Record<string, number> = {};
  for (const h of hatches) for (const i of h.items) brandStart[i.brand] = (brandStart[i.brand] ?? 0) + i.qty;
  const brands = Object.keys(brandStart);
  const brandRem: Record<string, number | null> = {};
  if (rem === 0) brands.forEach((b) => (brandRem[b] = 0));
  else if (rem === start) brands.forEach((b) => (brandRem[b] = brandStart[b]));
  else if (rem == null) brands.forEach((b) => (brandRem[b] = null));
  else if (brands.length === 1) brandRem[brands[0]] = rem;
  else {
    // Split by brand only where each hatch is single-brand, empty, or untouched.
    let ok = true;
    const acc: Record<string, number> = Object.fromEntries(brands.map((b) => [b, 0]));
    for (const h of hatches) {
      if (h.rem == null) { ok = false; break; }
      if (h.items.length === 1) acc[h.items[0].brand] += h.rem;
      else if (h.rem === h.qty) h.items.forEach((i) => (acc[i.brand] += i.qty));
      else if (h.rem !== 0) { ok = false; break; }
    }
    brands.forEach((b) => (brandRem[b] = ok ? acc[b] : null));
  }
  return { id: d.id, label: d.label, status, skipped: status === 'notStarted' && !!st.skipped, hatches, start, rem, brandStart, brandRem };
}

// Validate a deck update. Rejects with the exact overage; never clamps.
export function deckUpdate(d: Deck, input: DeckState): DeckState | Reject {
  const qty = new Map(d.hatches.map((h) => [h.h, h.items.reduce((s, i) => s + i.qty, 0)]));
  const start = [...qty.values()].reduce((s, x) => s + x, 0);
  if (input.skipped && input.status !== 'notStarted') return { ok: false, error: 'Only a Not started deck can be marked Skipped.' };
  const hr = input.hatchRemaining ?? {};
  for (const [h, v] of Object.entries(hr)) {
    const max = qty.get(h);
    if (max == null) return { ok: false, error: `${d.label} has no hatch ${h}.` };
    if (!Number.isInteger(v) || v < 0) return { ok: false, error: `${h} must be a whole number.` };
    if (v > max) return { ok: false, error: `${h} exceeds its ${max} autos by ${v - max}. Check the count.` };
  }
  const dr = input.deckRemaining ?? null;
  if (dr != null) {
    if (!Number.isInteger(dr) || dr < 0) return { ok: false, error: 'Deck total must be a whole number.' };
    if (dr > start) return { ok: false, error: `Deck total exceeds ${d.label}’s ${start} autos by ${dr - start}. Check the count.` };
    if (Object.keys(hr).length === qty.size) {
      const sum = Object.values(hr).reduce((s, x) => s + x, 0);
      if (sum !== dr) return { ok: false, error: `Hatch counts add to ${sum} but deck total says ${dr}. Fix one.` };
    }
  }
  const counted = input.status === 'active' || input.status === 'paused';
  return {
    status: input.status,
    skipped: input.status === 'notStarted' && !!input.skipped,
    hatchRemaining: counted ? { ...hr } : {},
    deckRemaining: counted ? dr : null,
  };
}

export const VAN_MIN_M = 1.85; // shuttle vans need 1.85 m or more

// hard: below 1.85 m. soft: at/above 1.85 m but the deck can be lowered below it
// and the height isn't confirmed. unknown: no height on record.
export function heightInfo<C extends { m: number }>(d: Deck, confirmed: C | null = null) {
  const hs = d.heights ?? [];
  const stow = hs.find((x) => x.current) ?? null;
  const current = confirmed ? confirmed.m : stow ? stow.m : null;
  const canLower = hs.some((x) => x.m < VAN_MIN_M);
  const level: 'unknown' | 'hard' | 'soft' | 'ok' =
    current == null ? 'unknown' : current < VAN_MIN_M ? 'hard' : !confirmed && canLower ? 'soft' : 'ok';
  const lowest = hs.length ? Math.min(...hs.map((x) => x.m)) : null;
  return { current, confirmed, stow, canLower, level, lowest };
}
