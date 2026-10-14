// The brand mix of the cars (Colby, 2026-10-14): a Mercedes goes farther than a BMW, so an hour's car count means different work
// depending on what came off. Each brand's distance comes from the destination it goes to (Appendix D miles, already in the
// baseline); an hour's brand split says how many of each came off. The forecast then scales each hour's pace to the mix still
// aboard, so a Southside-heavy hour is not read as a slow one and the finish moves when the mix left changes.
// Assumption, said wherever it is shown: parking time grows with the distance. Pure; no UI, storage or AI.
import type { Destination } from './baseline.ts';
import type { Period } from './production.ts';
import { terminalInfo } from './terminal.ts';

export type BrandMiles = Map<string, number>;

// A destination with no stored miles gets them from the terminal directory (Appendix D: every zone, site and yard, at the vessel's
// berth), so a destination typed or imported without miles is still priced.
export function withTerminalMiles<T extends Pick<Destination, 'name' | 'mi'>>(destinations: T[], berth: unknown): T[] {
  return destinations.map((d) => (typeof d.mi === 'number' && d.mi > 0 ? d : { ...d, mi: terminalInfo(d.name, String(berth ?? ''))?.mi ?? d.mi }));
}

// Miles per car for each brand: the miles of the destination(s) it goes to. One destination is the usual case; a brand that goes to
// several is the mean of their miles, weighted by the cars planned to each when every one of them says how many.
export function brandMiles(destinations: Pick<Destination, 'brands' | 'mi' | 'autos'>[]): BrandMiles {
  const acc = new Map<string, { mi: number; autos: number | null }[]>();
  for (const d of destinations) {
    if (!(typeof d.mi === 'number' && d.mi > 0)) continue;
    for (const b of d.brands ?? []) acc.set(b, [...(acc.get(b) ?? []), { mi: d.mi, autos: typeof d.autos === 'number' && d.autos > 0 ? d.autos : null }]);
  }
  return new Map([...acc].map(([b, xs]) => {
    const weighted = xs.every((x) => x.autos != null);
    const w = (x: { autos: number | null }) => (weighted ? x.autos! : 1);
    return [b, xs.reduce((s, x) => s + x.mi * w(x), 0) / xs.reduce((s, x) => s + w(x), 0)] as [string, number];
  }));
}

// Average miles per car of a brand mix; null when a brand in it has no miles, or the mix is empty. Unknown is never zero.
export function mixMiles(mix: Record<string, number>, miles: BrandMiles): number | null {
  let cars = 0, mi = 0;
  for (const [b, n] of Object.entries(mix)) {
    if (!(n > 0)) continue;
    const m = miles.get(b);
    if (m == null) return null;
    cars += n; mi += n * m;
  }
  return cars > 0 ? mi / cars : null;
}

// Each hour's pace re-expressed for the cars still aboard: pace × (miles per car that hour ÷ miles per car left). An hour with no
// brand split, or a split that does not add up to its count, keeps its own pace (its mix is unknown, so it is not adjusted).
// Null when nothing can be adjusted: the cars left cannot be priced, or no hour has a usable split.
export function mixAdjust(periods: Period[], remaining: Record<string, number | null>, miles: BrandMiles): { periods: Period[]; avgLeft: number; used: number } | null {
  const left: Record<string, number> = {};
  for (const [b, r] of Object.entries(remaining)) { if (r == null) return null; left[b] = r; }
  const avgLeft = mixMiles(left, miles);
  if (avgLeft == null) return null;
  let used = 0;
  const out = periods.map((p) => {
    if (p.pace == null || !p.brands) return p;
    if (Object.values(p.brands).reduce((s, x) => s + x, 0) !== p.count) return p;
    const avgHour = mixMiles(p.brands, miles);
    if (avgHour == null) return p;
    used++;
    return { ...p, pace: p.pace * (avgHour / avgLeft) };
  });
  return used ? { periods: out, avgLeft, used } : null;
}

// The nearest destination among the brands: the yardstick an hour is expressed in ("= 400 BMW-equivalents").
export function mixReference(miles: BrandMiles): { brand: string; miles: number } | null {
  let best: { brand: string; miles: number } | null = null;
  for (const [brand, m] of miles) if (!best || m < best.miles) best = { brand, miles: m };
  return best;
}
