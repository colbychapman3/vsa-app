// Terminal map model: features joined to the terminal directory (protocol Appendix C sides/cutoffs,
// Appendix D berth miles), highlight chips, and the measure helper. Pure: no UI, no storage.
// The map only shows and locates; sides, cutoffs and miles come from src/engine/terminal.ts.
import { MAP, type MapItem, type Pt } from './data.ts';
import { TERMINAL, terminalInfo } from '../../engine/terminal.ts';

export type Kind = 'zone' | 'site' | 'yard' | 'oem' | 'point';
export type Feature = {
  id: string; name: string; kind: Kind;
  poly: Pt[] | null;              // null = a point landmark (Gate 1, Gate 2, AVP)
  at: Pt;                         // label / marker position
  dir: string | null;             // directory name, null when the directory has no entry
  side: 'Northside' | 'Southside' | null;
  cutoff: 15 | 30 | null;         // from the directory only; null = not in the directory (unknown)
  mapCut: 15 | 30 | null;         // what the map file says, kept only to flag disagreements
  note: string;
};

// Map names that differ from the directory's formal names; every other map name is identical.
const DIR_NAME: Record<string, string> = { 'Zone 1': 'Zone 1 (MB Field)', BMW: 'BMW Field', MBZ: 'MBZ (Mercedes)', AVP: 'AVP Yard' };
// Landmarks that are also directory destinations (matched by label).
const POINTS = ['Gate 1', 'Gate 2', 'AVP'];

function join(name: string) {
  const dir = DIR_NAME[name] ?? name;
  const d = TERMINAL.find((x) => x.name === dir);
  return d ? { dir: d.name, side: d.side === 'S' ? 'Southside' as const : 'Northside' as const, cutoff: d.clearBy as 15 | 30 } : { dir: null, side: null, cutoff: null };
}

const fromItem = (it: MapItem): Feature => ({ id: it.id, name: it.name, kind: it.type, poly: it.poly, at: it.lab, mapCut: it.cut, note: it.note, ...join(it.name) });
export const FEATURES: Feature[] = [
  ...MAP.items.map(fromItem),
  ...MAP.land.filter((m) => POINTS.includes(m.label)).map((m): Feature => ({ id: m.id, name: m.label, kind: 'point', poly: null, at: [m.x, m.y], mapCut: null, note: '', ...join(m.label) })),
];

// Consistency between map and directory, reported by tests and never hidden.
export const onMapNotInDirectory = () => FEATURES.filter((f) => f.dir == null).map((f) => f.name);
export const inDirectoryNotOnMap = () => TERMINAL.map((d) => d.name).filter((n) => !FEATURES.some((f) => f.dir === n));
export const cutoffDisagreements = () => FEATURES.filter((f) => f.mapCut != null && f.cutoff != null && f.mapCut !== f.cutoff);

// Highlight chips (same groups as the artifact): type chips combine with OR, cutoff chips with OR,
// and the two groups combine with AND. No chip on = everything.
export const CHIPS = [
  { id: 'zone', label: 'Zones', group: 'type' }, { id: 'site', label: 'Sites', group: 'type' },
  { id: 'yard', label: 'Yards', group: 'type' }, { id: 'oem', label: 'BMW / MBZ', group: 'type' },
  { id: 'n15', label: 'Northside · 15 min', group: 'cut' }, { id: 's30', label: 'Southside · 30 min', group: 'cut' },
] as const;
export type ChipId = (typeof CHIPS)[number]['id'];

export function highlighted(on: ChipId[]): Feature[] {
  const types = on.filter((c) => c === 'zone' || c === 'site' || c === 'yard' || c === 'oem');
  const cuts = on.filter((c) => c === 'n15' || c === 's30').map((c) => (c === 'n15' ? 15 : 30));
  return FEATURES.filter((f) => (!types.length || (types as string[]).includes(f.kind)) && (!cuts.length || (f.cutoff != null && cuts.includes(f.cutoff))));
}

// Detail card for one feature: directory facts first (cited), then the map's own note.
export type Card = { title: string; rows: { k: string; v: string }[]; flags: string[]; foot: string };
export function card(f: Feature): Card {
  const rows: Card['rows'] = [];
  const flags: string[] = [];
  if (f.dir == null) {
    rows.push({ k: 'Side', v: 'Unknown' }, { k: 'Pre-break cutoff', v: 'Unknown' });
    flags.push('Not in the terminal directory (Appendix C/D). Side and cutoff are unknown.');
  } else {
    rows.push({ k: 'Side', v: f.side! }, { k: 'Pre-break cutoff', v: `${f.cutoff} min` });
    for (const b of [1, 2, 3]) {
      const mi = terminalInfo(f.dir, b)?.mi;
      rows.push({ k: `Berth ${b}`, v: mi == null ? 'Unknown' : `${mi.toFixed(2)} mi` });
    }
    if (f.mapCut != null && f.mapCut !== f.cutoff) flags.push(`The map file says ${f.mapCut} min; the directory says ${f.cutoff} min. The directory value is shown.`);
  }
  const foot = f.dir == null ? 'Source: map only.' : 'Cutoff: Protocol Appendix C. Miles: Appendix D, measured berth to destination; the source does not say one-way or round trip.';
  return { title: f.name, rows, flags, foot: f.note ? `${f.note} ${foot}` : foot };
}

// Measure: straight segments between tapped points, in map units -> feet via the map's scale.
// Always a rough estimate (lot outlines are approximate, protocol 7.4). Never feeds any calculation.
export const MEASURE_LABEL = 'map estimate, not a route distance';
export type Measure = { feet: number; metres: number; text: string; label: typeof MEASURE_LABEL };
export function measure(pts: Pt[]): Measure | null {
  if (pts.length < 2) return null;
  let units = 0;
  for (let i = 1; i < pts.length; i++) units += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const feet = units * MAP.ftPerUnit, metres = feet * 0.3048;
  const text = `≈ ${Math.round(feet).toLocaleString('en-US')} ft (${Math.round(metres).toLocaleString('en-US')} m)`;
  return { feet, metres, text, label: MEASURE_LABEL };
}

export const pathD = (poly: Pt[]) => `M${poly.map((p) => `${p[0]} ${p[1]}`).join('L')}Z`;

// Tap hit-test in map units. Point landmarks win within r units; otherwise the smallest lot containing the point.
export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const area = (poly: Pt[]) => { const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
export function featureAt(p: Pt, r: number): Feature | null {
  const near = FEATURES.filter((f) => !f.poly && Math.hypot(f.at[0] - p[0], f.at[1] - p[1]) <= r)
    .sort((a, b) => Math.hypot(a.at[0] - p[0], a.at[1] - p[1]) - Math.hypot(b.at[0] - p[0], b.at[1] - p[1]));
  if (near.length) return near[0];
  const hit = FEATURES.filter((f) => f.poly && pointInPoly(p, f.poly)).sort((a, b) => area(a.poly!) - area(b.poly!));
  return hit[0] ?? null;
}
