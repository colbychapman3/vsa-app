// New-vessel setup (protocol §11.1) and baseline import. Pure: turns typed answers or a pasted
// baseline JSON into a Baseline, and refuses anything the engine would refuse, with exact messages.
// Nothing is adjusted to make totals balance; mismatches come back as discrepancies to acknowledge.
import { CLEAR_BY_MIN, destination, operationDate, parseHM, validateBaseline, type Baseline, type Deck, type Destination } from '../engine/index.ts';

export const BREAKS = ['12:00', '18:00']; // fixed, always 1 hour
export const LOW_DECK_M = 1.85;

export type SetupForm = {
  vessel: string;
  date: string; // M/D/YYYY or YYYY-MM-DD
  port: string;
  berth: string;
  sources: string[];
  isTest: boolean;
  start: string; // HH:MM
  drivers: number | null; // Day 1; null = unknown
  destinations: { name: string; side?: 'N' | 'S'; clearBy?: number; mi?: number; ref?: string; brands?: string[]; autos?: number }[];
  decks: { label: string; heights: { m: number; current: boolean }[]; hatches: { h: string; items: { brand: string; qty: number }[] }[] }[];
};

export type Built = { ok: true; baseline: Baseline; operationId: string; total: number; brandStart: Record<string, number>; discrepancies: string[]; warnings: string[] } | { ok: false; errors: string[] };

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildBaseline(f: SetupForm): Built {
  const errors: string[] = [];
  const vessel = f.vessel.trim();
  if (!vessel) errors.push('The vessel needs a name.');
  if (!f.decks.length) errors.push('Add at least one deck.');

  const destinations: Destination[] = f.destinations.map((d, i) => {
    const name = d.name.trim();
    if (!name) errors.push(`Destination ${i + 1} needs a name.`);
    const known = destination(name)?.side;
    const side = d.side ?? (known === 'Southside' ? 'S' : known === 'Northside' ? 'N' : undefined);
    if (!side) errors.push(`Destination "${name}" is not a known zone: choose Northside or Southside.`);
    const clearBy = d.clearBy ?? CLEAR_BY_MIN[side === 'S' ? 'Southside' : 'Northside'];
    if (!Number.isInteger(clearBy) || clearBy < 0) errors.push(`Destination "${name}": clear-by minutes must be a whole number (got ${clearBy}).`);
    if (d.autos != null && !(Number.isInteger(d.autos) && d.autos >= 0)) errors.push(`Destination "${name}": autos must be a whole number (got ${d.autos}).`);
    const out: Destination = { name, side: side ?? 'N', clearBy };
    if (d.mi != null) out.mi = d.mi;
    if (d.ref?.trim()) out.ref = d.ref.trim(); // kept as typed: never labeled one-way or round trip
    if (d.brands?.length) out.brands = d.brands;
    if (d.autos != null) out.autos = d.autos;
    return out;
  });

  const seen = new Set<string>();
  const warnings: string[] = [];
  const decks: Deck[] = f.decks.map((d, i) => {
    const label = d.label.trim();
    if (!label) errors.push(`Deck ${i + 1} needs a label.`);
    let id = slug(label) || `DECK-${i + 1}`;
    for (let n = 2; seen.has(id); n++) id = `${slug(label)}-${n}`;
    seen.add(id);
    for (const h of d.heights) if (!(h.m > 0 && Number.isFinite(h.m))) errors.push(`${label}: deck height must be a positive number of metres (got ${h.m}).`);
    if (d.heights.length && d.heights.filter((h) => h.current).length !== 1) errors.push(`${label}: mark exactly one height as the current one.`);
    const cur = d.heights.find((h) => h.current);
    if (cur && cur.m < LOW_DECK_M) warnings.push(`${label} is set to ${cur.m.toFixed(2)} m, below ${LOW_DECK_M.toFixed(2)} m: shuttle vans cannot use it (low deck).`);
    const deck: Deck = { id, label, hatches: d.hatches.map((h) => ({ h: h.h.trim(), items: h.items.map((x) => ({ brand: x.brand.trim(), qty: x.qty })) })) };
    if (d.heights.length) deck.heights = d.heights.map((h) => ({ m: h.m, current: h.current }));
    return deck;
  });
  for (const d of decks) for (const h of d.hatches) {
    if (!h.h) errors.push(`${d.label}: a hatch needs a name (H4, H3, H2, H1).`);
    for (const it of h.items) if (!it.brand) errors.push(`${d.label} ${h.h}: a cargo line needs a brand.`);
  }
  if (f.drivers != null && !(Number.isInteger(f.drivers) && f.drivers >= 0)) errors.push(`Drivers must be a whole number (got ${f.drivers}).`);

  const baseline: Baseline = {
    vessel, date: f.date.trim(), port: f.port.trim(), berth: f.berth.trim(), start: f.start.trim(), breaks: [...BREAKS],
    sources: f.sources.map((s) => s.trim()).filter(Boolean),
    ...(f.drivers != null ? { labor: { autoDrivers: f.drivers } } : {}),
    destinations, decks,
  };
  return finish(baseline, f.isTest, errors, warnings);
}

// Import: JSON text → same checks as typed setup. Extra fields (labor, hh, verification…) are kept as-is.
export function importBaseline(text: string, isTest: boolean): Built {
  let b: any;
  try { b = JSON.parse(text); } catch { return { ok: false, errors: ['This is not readable JSON. Nothing was loaded.'] }; }
  const e: string[] = [];
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, errors: ['This is not a vessel baseline (expected a JSON object).'] };
  if (b.format === 'vsa-log') return { ok: false, errors: ['This is a VSA log backup, not a baseline. Restore it from Plan › Backup.'] };
  for (const k of ['vessel', 'date', 'start'] as const) if (typeof b[k] !== 'string' || !b[k].trim()) e.push(`Baseline is missing "${k}".`);
  if (!Array.isArray(b.decks) || !b.decks.length) e.push('Baseline is missing "decks".');
  if (!Array.isArray(b.breaks)) e.push('Baseline is missing "breaks".');
  if (b.destinations !== undefined && !Array.isArray(b.destinations)) e.push('"destinations" must be a list.');
  if (Array.isArray(b.decks)) b.decks.forEach((d: any, i: number) => {
    if (!d || typeof d.id !== 'string' || typeof d.label !== 'string' || !Array.isArray(d.hatches)) e.push(`Deck ${i + 1} needs an id, a label and a hatch list.`);
    else for (const h of d.hatches) if (!h || typeof h.h !== 'string' || !Array.isArray(h.items)) e.push(`${d.label}: every hatch needs a name and an items list.`);
      else for (const it of h.items) if (!it || typeof it.brand !== 'string' || typeof it.qty !== 'number') e.push(`${d.label} ${h.h}: every cargo line needs a brand and a number quantity.`);
  });
  if (e.length) return { ok: false, errors: e };
  const baseline = { ...b, destinations: b.destinations ?? [] } as Baseline;
  const warnings = baseline.decks.flatMap((d) => {
    const cur = d.heights?.find((h) => h.current);
    return cur && cur.m < LOW_DECK_M ? [`${d.label} is set to ${cur.m.toFixed(2)} m, below ${LOW_DECK_M.toFixed(2)} m: shuttle vans cannot use it (low deck).`] : [];
  });
  return finish(baseline, isTest, [], warnings);
}

function finish(baseline: Baseline, isTest: boolean, errors: string[], warnings: string[]): Built {
  const iso = operationDate(baseline);
  const real = iso != null && !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso; // 13/40/2026 has the right shape but is no date
  if (!real) errors.push(`Date "${baseline.date}" is not a date (use M/D/YYYY).`);
  if (parseHM(baseline.start) == null) errors.push(`Start time "${baseline.start}" is not a valid HH:MM time.`);
  if (errors.length) return { ok: false, errors };
  const check = validateBaseline(baseline);
  if (!check.ok) return { ok: false, errors: check.errors };
  const day = iso!.replace(/-/g, '');
  const operationId = `${isTest ? 'TEST-' : ''}${slug(baseline.vessel)}-${day}`;
  return { ok: true, baseline, operationId, total: check.start, brandStart: check.brandStart, discrepancies: check.discrepancies, warnings };
}
