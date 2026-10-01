// AI proposals (Phase 6c). The on-device model only proposes; this file decides what of a proposal may be shown.
// Pure, no AI dependency. A value the model could not have read from the source text is dropped, with the reason:
// every number and every name in a proposal must appear in the text it was given. Nothing here computes a total.

export type SetupProposal = {
  vessel?: string; date?: string; port?: string; berth?: string;
  destinations?: { name: string; brand?: string; autos?: number }[];
  decks?: { label: string; hatches: { h: string; items: { brand: string; qty: number }[] }[] }[];
};
export type Checked<T> = { value: T; dropped: string[] } | null; // null = no proposal: the manual form stays as is

// JSON schema handed to the model (object/array/string/integer only: what the native parser supports).
const str = { type: 'string' };
const int = { type: 'integer' };
export const SETUP_SCHEMA = {
  type: 'object', title: 'Setup',
  properties: {
    vessel: { ...str, description: 'Vessel name exactly as written' },
    date: { ...str, description: 'Operation date exactly as written' },
    port: str, berth: { ...str, description: 'Berth number exactly as written' },
    destinations: { type: 'array', items: { type: 'object', title: 'Destination', properties: { name: str, brand: str, autos: int }, required: ['name'] } },
    decks: {
      type: 'array', items: {
        type: 'object', title: 'Deck', required: ['label', 'hatches'], properties: {
          label: str,
          hatches: { type: 'array', items: { type: 'object', title: 'Hatch', required: ['h', 'items'], properties: {
            h: { ...str, description: 'H1, H2, H3, H4, or the hatch name as written (Ramp)' },
            items: { type: 'array', items: { type: 'object', title: 'Cargo', required: ['brand', 'qty'], properties: { brand: str, qty: int } } },
          } } },
        },
      },
    },
  },
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
// Every digit run, thousands separators removed: "1,969" → "1969", "D9" → "9". Used to spot facts a rewording adds or drops.
const numbersIn = (s: string) => new Set((s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
// Counts written on their own: not part of a label (H4, D12), a date (9/21/2026) or a code. "1,969" counts as 1969.
const countsIn = (line: string) => new Set([...line.matchAll(/(?<![A-Za-z0-9/.,-])(\d{1,3}(?:,\d{3})+|\d+)(?![A-Za-z0-9/-]|[.,]\d)/g)].map((m) => String(Number(m[1].replace(/,/g, '')))));

function seenIn(source: string) {
  const text = ` ${norm(source)} `;
  const lines = source.split(/\r?\n/).map((l) => ({ text: ` ${norm(l)} `, counts: countsIn(l) }));
  const name = (s: unknown): s is string => typeof s === 'string' && norm(s) !== '' && text.includes(` ${norm(s)} `);
  return {
    name,
    // A count must stand alone on the same line as what it counts (its brand or destination).
    count: (n: unknown, owner: string): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 &&
      lines.some((l) => l.counts.has(String(n)) && l.text.includes(` ${norm(owner)} `)),
  };
}

const parse = (raw: unknown): Record<string, unknown> | null => {
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
};
const list = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((y) => y && typeof y === 'object') : []);

export function checkSetupProposal(raw: unknown, source: string): Checked<SetupProposal> {
  const p = parse(raw);
  if (!p) return null;
  const seen = seenIn(source);
  const dropped: string[] = [];
  const out: SetupProposal = {};
  for (const k of ['vessel', 'date', 'port', 'berth'] as const) {
    const v = p[k];
    if (v == null || v === '') continue;
    if (seen.name(v)) out[k] = String(v).trim();
    else dropped.push(`${k} "${String(v)}" is not in the text.`);
  }
  const dests = list(p.destinations).flatMap((d) => {
    if (!seen.name(d.name)) { dropped.push(`Destination "${String(d.name)}" is not in the text.`); return []; }
    const o: NonNullable<SetupProposal['destinations']>[number] = { name: d.name.trim() };
    if (d.brand != null && d.brand !== '') { if (seen.name(d.brand)) o.brand = d.brand.trim(); else dropped.push(`Brand "${String(d.brand)}" for ${o.name} is not in the text.`); }
    if (d.autos != null) { if (seen.count(d.autos, o.name)) o.autos = d.autos; else dropped.push(`${o.name}: ${String(d.autos)} autos is not in the text.`); }
    return [o];
  });
  if (dests.length) out.destinations = dests;
  const decks = list(p.decks).flatMap((d) => {
    if (!seen.name(d.label)) { dropped.push(`Deck "${String(d.label)}" is not in the text.`); return []; }
    const label = d.label.trim();
    const hatches = list(d.hatches).flatMap((h) => {
      const raw = typeof h.h === 'string' ? h.h.trim() : '';
      const hh = /^h[1-4]$/i.test(raw) ? raw.toUpperCase() : raw; // H1–H4, or a named hatch (Ramp) if the text shows it
      if (!/^H[1-4]$/.test(hh) && !seen.name(hh)) { dropped.push(`${label}: hatch "${String(h.h)}" is not H1–H4 and is not in the text.`); return []; }
      const items = list(h.items).flatMap((i) => {
        if (!seen.name(i.brand)) { dropped.push(`${label} ${hh}: brand "${String(i.brand)}" is not in the text.`); return []; }
        if (!seen.count(i.qty, i.brand)) { dropped.push(`${label} ${hh}: ${String(i.qty)} ${i.brand} is not in the text.`); return []; }
        return [{ brand: i.brand.trim(), qty: i.qty }];
      });
      return [{ h: hh, items }];
    });
    return [{ label, hatches }];
  });
  if (decks.length) out.decks = decks;
  return { value: out, dropped };
}

// A reworded note must keep every number and VIN-like code of the original, and bring in none.
export function checkNoteTidy(raw: unknown, original: string): Checked<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const tidy = raw.trim();
  const nums = numbersIn(original);
  const codes = new Set(norm(original).split(' '));
  const newNums = [...numbersIn(tidy)].filter((n) => !nums.has(n));
  const tidyCodes = new Set(norm(tidy).split(' '));
  const tidyNums = numbersIn(tidy);
  const isCode = (w: string) => /\d/.test(w) && /[A-Z]/.test(w);
  const newCodes = [...tidyCodes].filter((w) => isCode(w) && !codes.has(w));
  const lost = [...nums].some((n) => !tidyNums.has(n)) || [...codes].some((w) => isCode(w) && w.length >= 5 && !tidyCodes.has(w)); // VIN-like codes kept whole; D9 → "Deck 9" is fine (its 9 is kept)
  if (newNums.length || newCodes.length || lost) return null; // the model added or dropped a number or code: no proposal
  return { value: tidy, dropped: [] };
}
