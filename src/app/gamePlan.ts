// APS "Working Plan / Game Plan" cover page → Setup values (spec docs/specs/phase-6e-game-plan-reader.md).
// Deterministic: positions in, values and problems out. No AI, no network. It checks and never fixes:
// a number that fails its check is left empty and reported, so a wrong value never lands in a box.
import type { Item } from '../engine/baseline.ts';
import { TERMINAL } from '../engine/terminal.ts';
import { rowsOf, type Cell, type Page, type Row } from './layout.ts';

export type AutoRow = {
  deck: string | null;       // printed deck number, e.g. "10"
  amount: number | null;      // AMOUNT column; null = not read
  split: Item[] | null;       // brand split; null = not read or failed its check
  cargo: string;              // cargo description as read
  hatches: string[] | null;   // H4 → H1; null = not read
  yards: string[];            // as written, in order
  pairs: { brand: string; yard: string }[] | null; // yard paired with brand by order (or the row's one yard); null = not paired
  brands: string[];           // brands named on the row, with or without counts
  derived: boolean;           // split worked out from the page's brand totals (the row only names its brands)
};
export type HhRow = { deck: string | null; amount: number | null; cargo: string; yards: string[] };
export type GamePlan = {
  vessel: string | null; date: string | null; port: string | null; drivers: number | null;
  autos: AutoRow[]; autosTotal: number | null;
  brandTotals: Item[] | null; // the "1041 BMW / 13 RR / ..." line under the autos rows
  hh: HhRow[]; hhTotal: number | null;
  grandTotal: number | null;  // the labeled TOTAL when it covers both tables (autos + H/H)
  notes: string[];     // the notes area below the last TOTAL (red notes on the form), offered ticked as Plan notes
  extras: string[];    // filled header fields (HEADER, LASHER, VANS, CLERKS, SPOTTER), offered unticked
  problems: string[];  // everything that was not filled, with the reason
};
export type ReadResult = { ok: true; plan: GamePlan; page: number } | { ok: false; error: string };

export const NOT_A_GAME_PLAN = "This doesn't look like the APS game plan cover page (no AMOUNT / DECK / HATCH header found). Retake it flat and in focus, or type it in.";

const n = (x: number) => x.toLocaleString('en-US');
const up = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();
const COLS = ['amount', 'port', 'disc', 'cargo', 'deck', 'hatch', 'yard'] as const;
type Col = (typeof COLS)[number];
const HEAD: Record<Col, RegExp> = {
  amount: /^AMOUNT$/, port: /^PORT$/, disc: /^DISC$/, cargo: /^CARGO$|^D[EI]?SC?R?I?P?TION$/, deck: /^DECK$/, hatch: /^HATCH$/, yard: /^YARD$/,
};
const LABELS = ['HEADER', 'DRIVERS', 'LASHER', 'VANS', 'VESSEL', 'DATE', 'CLERKS', 'SPOTTER/DRIVER', 'SPOTTER', 'PORT ROTATION'];

// A count as printed: digits only (thousands commas allowed). O/I/l are not read as digits: that would be a guess.
const count = (s: string): number | null => (/^\d{1,3}(,\d{3})+$|^\d+$/.test(s.trim()) ? Number(s.trim().replace(/,/g, '')) : null);

// Header row: the words AMOUNT, DECK, HATCH (+ the others) on one row. Column centres come from the header words;
// CARGO DISCRIPTION spans two words, so its centre is the middle of both.
function headerColumns(r: Row): Partial<Record<Col, number>> | null {
  const words = r.cells.flatMap((c) => c.words);
  const at: Partial<Record<Col, number[]>> = {};
  for (const w of words) for (const c of COLS) if (HEAD[c].test(up(w.t).replace(/[^A-Z]/g, ''))) (at[c] ??= []).push(w.x, w.x + w.w);
  if (!at.amount || !at.deck || !at.hatch) return null;
  const cols: Partial<Record<Col, number>> = {};
  for (const c of COLS) if (at[c]) cols[c] = (Math.min(...at[c]!) + Math.max(...at[c]!)) / 2;
  return cols;
}

// A sentence that runs across three or more columns is free text (a note), never a table row.
const isFree = (r: Row, cols: Partial<Record<Col, number>>) => r.cells.some((c) => Object.values(cols).filter((x) => x! >= c.x && x! <= c.x + c.w).length >= 3);
const isTitle = (r: Row) => /^DISCHARGE\b/.test(up(r.cells.map((c) => c.text).join(' ')));

// Each cell goes to the nearest column centre. A cell that covers two column centres (two columns read as one run of
// text) is split word by word.
function assign(r: Row, cols: Partial<Record<Col, number>>): Partial<Record<Col, string>> {
  const centres = Object.entries(cols) as [Col, number][];
  const nearest = (x: number) => centres.reduce((a, b) => (Math.abs(b[1] - x) < Math.abs(a[1] - x) ? b : a))[0];
  const out: Partial<Record<Col, string>> = {};
  const put = (c: Col, t: string) => { out[c] = out[c] ? `${out[c]} ${t}` : t; };
  for (const cell of r.cells) {
    const covers = centres.filter(([, x]) => x >= cell.x && x <= cell.x + cell.w).length;
    if (covers >= 2) for (const w of cell.words) put(nearest(w.x + w.w / 2), w.t);
    else put(nearest(cell.cx), cell.text);
  }
  return out;
}

// "475 BMW/ 24 LR/ 53 MB/ 4 POV" → split. A bare brand ("MB") means the whole amount is that brand: the paper says so.
export function parseSplit(text: string, amount: number | null): { split: Item[] | null; reason?: string; brands?: string[] } {
  const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { split: null, reason: 'cargo not read' };
  const brand = (b: string) => up(b).replace(/[.'’]/g, '').replace(/^POVS$/, 'POV');
  const bare = (p: string) => /^[A-Za-z][A-Za-z.'’]{0,15}$/.test(p);
  if (parts.length === 1 && bare(parts[0])) {
    return amount == null ? { split: null, reason: 'the amount was not read', brands: [brand(parts[0])] } : { split: [{ brand: brand(parts[0]), qty: amount }] };
  }
  // "BMW / RR": the brands without counts. The page's brand totals may settle them (solveSplits).
  if (parts.length > 1 && parts.every(bare)) return { split: null, reason: 'the page names the brands without counts', brands: parts.map(brand) };
  const items: Item[] = [];
  for (const p of parts) {
    const m = /^(\d{1,3}(?:,\d{3})*|\d+)\s*([A-Za-z][A-Za-z.'’]{0,15})$/.exec(p);
    if (!m) return { split: null, reason: `"${p}" is not a count and a brand` };
    items.push({ brand: brand(m[2]), qty: Number(m[1].replace(/,/g, '')) });
  }
  return { split: items };
}

// "1*2*3*4" → H4..H1. The * may be read as x, ×, ·, a comma or a space. Only 1-4, each once.
// A single hatch with a trailing * ("3*") is that hatch; the page's * is kept as a note, never given a meaning.
// The reader can return a lookalike letter for a digit (Cyrillic "З" for 3).
export function parseHatches(text: string): { hatches: string[] | null; reason?: string; starred?: boolean } {
  const t = text.trim().replace(/[Зз]/g, '3');
  if (!t) return { hatches: null, reason: 'hatch list not read' };
  if (/^ALL$/i.test(t)) return { hatches: null, reason: '"ALL" does not say which hatches the deck has' };
  const starred = /^[1-4]\s*\*$/.test(t);
  if (!starred && !/^[1-4](\s*[*x×·,.\s]\s*[1-4])*$/i.test(t)) return { hatches: null, reason: `hatch text "${t}" is not hatch numbers 1-4` };
  const ds = t.match(/[1-4]/g)!;
  if (new Set(ds).size !== ds.length) return { hatches: null, reason: `hatch text "${t}" repeats a hatch` };
  return { hatches: [...ds].sort().reverse().map((d) => `H${d}`), ...(starred ? { starred: true } : {}) };
}

// Rows that name their brands without counts ("BMW / RR", 557) get their counts from the page's brand totals, but only
// when that settles them exactly: a brand named on one open row goes wholly to it, a row with one brand left takes
// the rest, repeat. Anything left over, or any total that does not fit exactly, settles nothing.
export function solveSplits<R extends { amount: number | null; split: Item[] | null; brands: string[] }>(rows: R[], totals: Item[]): Map<R, Item[]> | string {
  const left = new Map(totals.map((t) => [t.brand, t.qty]));
  for (const r of rows) if (r.split) for (const i of r.split) left.set(i.brand, (left.get(i.brand) ?? 0) - i.qty);
  const open = rows.filter((r) => !r.split && r.brands.length >= 2);
  if (open.some((r) => r.amount == null)) return 'a row amount was not read';
  const named = new Set(totals.map((t) => t.brand));
  for (const r of open) for (const b of r.brands) if (!named.has(b)) return `${b} is not in the page's brand totals`;
  const need = new Map(open.map((r) => [r, r.amount!]));
  const got = new Map(open.map((r) => [r, [] as Item[]]));
  const todo = new Map(open.map((r) => [r, new Set(r.brands)]));
  const give = (r: typeof open[number], b: string, q: number) => { got.get(r)!.push({ brand: b, qty: q }); need.set(r, need.get(r)! - q); left.set(b, left.get(b)! - q); todo.get(r)!.delete(b); };
  for (let moved = true; moved;) {
    moved = false;
    for (const [r, bs] of todo) if (bs.size === 1) { const b = [...bs][0]; give(r, b, need.get(r)!); moved = true; }
    for (const [b, q] of left) {
      const holders = [...todo].filter(([, bs]) => bs.has(b));
      if (holders.length === 1 && q > 0) { give(holders[0][0], b, q); moved = true; }
    }
  }
  if ([...todo.values()].some((bs) => bs.size) || [...need.values()].some((q) => q !== 0) || [...left.values()].some((q) => q !== 0)) return 'the brand totals do not settle them exactly';
  return new Map(open.map((r) => [r, r.brands.map((b) => got.get(r)!.find((i) => i.brand === b)!)]));
}

// Yard as written → a terminal destination name. Unknown names are kept as written (Colby chooses the side).
const KEY = (s: string) => up(s).replace(/[^A-Z0-9]/g, '');
const YARD_ALIAS: Record<string, string> = { BMW: 'BMW Field', BMWFIELD: 'BMW Field', ZONE1: 'Zone 1 (MB Field)', MBZ: 'MBZ (Mercedes)', MBFIELD: 'MBZ (Mercedes)', AVP: 'AVP Yard' };
export function yardName(raw: string): string | null {
  const k = KEY(raw);
  if (YARD_ALIAS[k]) return YARD_ALIAS[k];
  return TERMINAL.find((t) => KEY(t.name) === k)?.name ?? null;
}

type Section = { kind: 'autos' | 'hh' | 'unknown'; head: number; cols: Partial<Record<Col, number>>; rows: Row[]; total: number | null; totalAt: number; grand: number | null };

export function readGamePlan(page: Page): { ok: true; plan: GamePlan } | { ok: false; error: string } {
  const rows = rowsOf(page);
  const heads = rows.map((r, i) => ({ i, cols: headerColumns(r) })).filter((h) => h.cols);
  if (!heads.length) return { ok: false, error: NOT_A_GAME_PLAN };
  const problems: string[] = [];

  // Sections: header row → (title "DISCHARGE AUTO'S" / "DISCHARGE H/H") → data rows → TOTAL row. The APS form comes in two
  // layouts: a header row per table, or one header row with both titles under it. Each title starts a section.
  const isTotal = (r: Row) => r.cells.some((c) => /^TOTAL\b/.test(up(c.text)));
  const sections: Section[] = heads.flatMap((h, k) => {
    const next = k + 1 < heads.length ? heads[k + 1].i : rows.length;
    const body = rows.slice(h.i + 1, next);
    const at = body.flatMap((r, j) => (isTitle(r) ? [j] : []));
    // Rows before the first title are the title's yellow band, unless a title is further down (then they are an untitled table).
    const starts = !at.length ? [-1] : at[0] <= 1 ? at : [-1, ...at];
    const lone = (r: Row) => { const v = assign(r, h.cols!); return !!v.amount && Object.keys(v).length === 1; };
    // One header row over both tables: told apart by the first table ending in a red subtotal (an amount alone, no TOTAL
    // label). Then a labeled TOTAL covers both tables. Otherwise a second title is the cut-off, as when a header was missed.
    const first = at.length > 1 ? body.slice(at[0] + 1, at[1]) : [];
    const shared = heads.length === 1 && first.length > 0 && !first.some(isTotal) && lone(first[first.length - 1]);
    return (shared ? starts : starts.slice(0, 1)).map((s): Section => {
      const stop = starts[starts.indexOf(s) + 1] ?? body.length;
      const seg = body.slice(s + 1, stop);
      const title = s >= 0 ? up(body[s].cells.map((c) => c.text).join(' ')) : '';
      // The title decides; only with both tables found may their order (AUTO'S first) stand in for an unreadable title.
      const kind: Section['kind'] = /AUTO/.test(title) ? 'autos' : /H\W?H|W\/?H|HEAVY/.test(title) ? 'hh' : heads.length === 2 ? (k === 0 ? 'autos' : 'hh') : 'unknown';
      const ti = seg.findIndex(isTotal);
      const labeled = ti >= 0 ? count(assign(seg[ti], h.cols!).amount ?? '') : null;
      // An amount alone on the last row, with no TOTAL label (the red subtotal), is that table's total.
      const rest = ti >= 0 ? seg.slice(0, ti) : seg; // rows after the TOTAL row are the notes area, read below
      const sub =(ti < 0 || shared) && rest.length && lone(rest[rest.length - 1]) ? rest[rest.length - 1] : null;
      const data = rest.filter((r) => r !== sub);
      const subTotal = sub ? count(assign(sub, h.cols!).amount!) : null;
      const total = shared ? subTotal : ti >= 0 ? labeled : subTotal;
      const totalRow = shared ? sub : ti >= 0 ? seg[ti] : sub;
      return { kind, head: h.i, cols: h.cols!, rows: data, total, grand: shared ? labeled : null, totalAt: totalRow ? rows.indexOf(totalRow) : h.i + 1 + stop - 1 };
    });
  });

  for (const s of sections) if (s.kind === 'unknown') problems.push("A table's title (DISCHARGE AUTO'S or DISCHARGE H/H) was not read, so that table was not filled.");

  // Rows of one section: anchored by an AMOUNT or DECK cell. A line with only cargo text (a wrapped description)
  // joins an anchored row only when it sits within one text height of it; otherwise it is reported. Free text is reported.
  let brandTotals: Item[] | null = null;
  const records = (s: Section) => {
    const lines = s.rows.filter((r) => {
      // "1041 BMW / 13 RR / 4 MASE / 96 MB / 13 POV" under the autos rows: the page's brand totals, not a stray line.
      const bt = s.kind === 'autos' ? parseSplit(r.cells.map((c) => c.text).join(' '), null).split : null;
      if (bt && bt.length >= 2) { brandTotals = bt; return false; }
      if (!isFree(r, s.cols)) return true;
      problems.push(`Line not placed in a row: "${r.cells.map((c) => c.text).join(' ')}". Type what it says where it belongs.`);
      return false;
    }).map((r) => ({ y: r.y, v: assign(r, s.cols) }));
    const hs = s.rows.flatMap((r) => r.cells.map((c) => c.h)).sort((a, b) => a - b);
    const near = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
    const anchors = lines.filter((l) => l.v.amount || l.v.deck).map((l) => ({ y: l.y, v: { ...l.v } as Partial<Record<Col, string>> }));
    for (const l of lines) {
      if (l.v.amount || l.v.deck) continue;
      const a = anchors.reduce<typeof anchors[number] | null>((best, x) => (!best || Math.abs(x.y - l.y) < Math.abs(best.y - l.y) ? x : best), null);
      if (!a || Math.abs(a.y - l.y) > near) { problems.push(`Line not placed in a row: "${Object.values(l.v).join(' ')}". Type what it says where it belongs.`); continue; }
      for (const c of COLS) if (l.v[c]) a.v[c] = a.v[c] ? `${a.v[c]} ${l.v[c]}` : l.v[c]; // order kept: wrapped text is rare and short
    }
    return anchors.sort((x, y) => x.y - y.y).map((a) => a.v);
  };

  const autosSec = sections.find((s) => s.kind === 'autos');
  const hhSec = sections.find((s) => s.kind === 'hh');
  const autoRecs = autosSec ? records(autosSec) : [];
  const autos: AutoRow[] = [];
  const derived: AutoRow[] = []; // rows whose amount was not read; their split is kept only if the TOTAL check passes
  const nameOf = (r: AutoRow) => (r.deck ? `Deck ${r.deck}` : `The row "${[r.amount, r.cargo].filter((x) => x != null && x !== '').join(' ')}"`);
  if (autosSec) for (const v of autoRecs) {
    const deck = v.deck ? (/^\d{1,2}$/.test(v.deck.trim()) ? String(Number(v.deck.trim())) : null) : null;
    const amount = v.amount ? count(v.amount) : null;
    const cargo = v.cargo ?? '';
    let { split, reason, brands } = parseSplit(cargo, amount);
    const row: AutoRow = { deck, amount, split, cargo, hatches: null, yards: (v.yard ?? '').split('/').map((y) => y.trim()).filter(Boolean), pairs: null, brands: split ? split.map((i) => i.brand) : brands ?? [], derived: false };
    const name = nameOf(row);
    if (!deck) problems.push(`${name}: the deck number was not read. Type it on its deck card.`);
    if (v.amount && amount == null) problems.push(`${name}: the amount "${v.amount}" is not a number. Type it.`);
    if (split && amount != null) {
      const sum = split.reduce((s, i) => s + i.qty, 0);
      if (sum !== amount) { problems.push(`${name}: the split adds to ${n(sum)} but AMOUNT says ${n(amount)} (difference ${n(Math.abs(sum - amount))}). Type the split.`); row.split = null; }
    } else if (split && amount == null) {
      if (v.amount) row.split = null; // an AMOUNT was printed but not readable: never stand in for it with the split
      else derived.push(row);
    }
    else if (!split && !(brands && brands.length >= 2)) problems.push(`${name}: brand split not filled (${reason}). Type it.`); // named brands are settled below
    if (amount == null && !split) problems.push(`${name}: the amount was not read. Type it.`);
    const h = parseHatches(v.hatch ?? '');
    row.hatches = h.hatches;
    if (!h.hatches) problems.push(`${name}: ${h.reason}. Choose the hatches.`);
    else if (h.starred) problems.push(`${name}: hatch "${(v.hatch ?? '').trim()}" read as ${h.hatches[0]}; the page puts a * on it. Check what the * means.`);
    autos.push(row);
  }
  else problems.push("The DISCHARGE AUTO'S table was not found.");

  const autosTotal = autosSec?.total ?? null;
  const sum = (rs: AutoRow[]) => rs.reduce((s, r) => s + (r.amount ?? r.split?.reduce((x, i) => x + i.qty, 0) ?? 0), 0);
  const unread = autos.filter((r) => r.amount == null && !r.split).length;
  if (autosTotal == null) problems.push('The autos TOTAL was not read, so the rows could not be checked against it.');
  else if (sum(autos) !== autosTotal || unread) {
    problems.push(`Game plan TOTAL says ${n(autosTotal)}; the rows read add to ${n(sum(autos))} (difference ${n(Math.abs(autosTotal - sum(autos)))})${unread ? `, with ${unread} row${unread === 1 ? '' : 's'} not read` : ''}.`);
  }
  // A split whose AMOUNT was not read is only trusted when every row together matches the printed TOTAL, and only for
  // one such row: with two, an error in one could cancel an error in the other.
  const trusted = autosTotal != null && !unread && sum(autos) === autosTotal && derived.length <= 1;
  for (const r of derived) {
    if (trusted) r.amount = r.split!.reduce((s, i) => s + i.qty, 0);
    else { problems.push(`Deck ${r.deck ?? '?'}: AMOUNT not read, so its split (${r.cargo}) could not be checked. Type it.`); r.split = null; r.pairs = null; }
  }
  // Rows that name their brands without counts: settled from the page's brand totals only when the rows and the totals
  // all agree with the printed TOTAL and the totals settle every such row exactly. Otherwise typed by hand.
  const named = autos.filter((r) => !r.split && r.brands.length >= 2);
  if (named.length) {
    const bt = brandTotals as Item[] | null;
    const btSum = bt?.reduce((s, i) => s + i.qty, 0) ?? null;
    const ready = autosTotal != null && !unread && sum(autos) === autosTotal && btSum === autosTotal;
    const res = ready ? solveSplits(autos, bt!) : null;
    const why = !bt ? "the page's brand totals line was not read" : !ready ? `the brand totals (${n(btSum!)}) and the rows do not match the TOTAL` : (res as string);
    for (const r of named) {
      const items = res instanceof Map ? res.get(r) : undefined;
      if (items) { r.split = items; r.derived = true; problems.push(`${nameOf(r)}: brand counts worked out from the page's brand totals (${items.map((i) => `${n(i.qty)} ${i.brand}`).join(', ')}). Check them.`); }
      else problems.push(`${nameOf(r)}: brand split not filled (${r.brands.join(' / ')} named without counts; ${why}). Type it.`);
    }
  }
  // Destinations: a row's yards pair with its brands by order; a row with one yard sends every brand there.
  for (const r of autos) {
    if (!r.split) continue;
    if (r.split.length === r.yards.length || r.yards.length === 1) r.pairs = r.split.map((i, k) => ({ brand: i.brand, yard: r.yards[r.yards.length === 1 ? 0 : k] }));
    else if (r.yards.length) problems.push(`${nameOf(r)}: ${r.split.length} brand${r.split.length === 1 ? '' : 's'} but ${r.yards.length} yards (${r.yards.join(', ')}); destinations not paired. Choose them.`);
    else problems.push(`${nameOf(r)}: yard not read. Choose the destinations.`);
  }
  const seen = new Set<string>();
  for (const r of autos) if (r.deck) { if (seen.has(r.deck)) problems.push(`Deck ${r.deck} appears twice in the autos table. Both rows are kept; merge them.`); seen.add(r.deck); }

  const hh: HhRow[] = hhSec ? records(hhSec).map((v) => ({
    deck: v.deck && /^\d{1,2}$/.test(v.deck.trim()) ? String(Number(v.deck.trim())) : null,
    amount: v.amount ? count(v.amount) : null, cargo: v.cargo ?? '', yards: (v.yard ?? '').split('/').map((y) => y.trim()).filter(Boolean),
  })) : [];
  const hhTotal = hhSec?.total ?? null;
  const totals = rows.map((r, i) => (r.cells.some((c) => /^TOTAL\b/.test(up(c.text))) ? i : -1)).filter((i) => i >= 0);
  if (!hhSec && (rows.some((r) => /DISCHARGE\s*(H\W?H|W\/?H|HEAVY)/.test(up(r.cells.map((c) => c.text).join(' ')))) || totals.length > 1)) problems.push('The DISCHARGE H/H table was not found.');
  if (hhSec) {
    const hs = hh.reduce((s, r) => s + (r.amount ?? 0), 0);
    if (hhTotal == null) problems.push('The H/H TOTAL was not read.');
    if (hh.some((r) => r.amount == null)) problems.push('An H/H amount was not read; it is saved as unknown.');
    if (hhTotal != null && hs !== hhTotal) problems.push(`H/H TOTAL says ${n(hhTotal)}; the rows read add to ${n(hs)} (difference ${n(Math.abs(hhTotal - hs))}).`);
  }
  const grandTotal = sections.find((s) => s.grand != null)?.grand ?? null;
  if (grandTotal != null && autosTotal != null && hhTotal != null && autosTotal + hhTotal !== grandTotal) problems.push(`The page TOTAL says ${n(grandTotal)}; the autos (${n(autosTotal)}) and H/H (${n(hhTotal)}) totals add to ${n(autosTotal + hhTotal)}.`);

  // Header fields: the text right of each label on its row. Handwriting outside the form is not on these rows.
  const top = rows.slice(0, heads[0].i);
  const field = (label: string): string | null => {
    for (const r of top) {
      const cells = r.cells;
      for (let k = 0; k < cells.length; k++) {
        const t = up(cells[k].text);
        if (!t.startsWith(`${label}:`) && t !== label) continue;
        const rest = t.slice(label.length).replace(/^:\s*/, '').trim();
        if (rest && !LABELS.some((l) => rest.startsWith(`${l}:`))) return cells[k].text.trim().slice(cells[k].text.trim().length - rest.length);
        const next = cells[k + 1];
        if (next && !LABELS.some((l) => up(next.text).startsWith(`${l}:`) || up(next.text) === l)) return next.text.trim();
        return null;
      }
    }
    return null;
  };
  const date = field('DATE');
  const d = field('DRIVERS');
  const extras: string[] = [];
  for (const l of ['HEADER', 'LASHER', 'VANS', 'CLERKS', 'SPOTTER/DRIVER']) { const v = field(l); if (v) extras.push(`${l[0]}${l.slice(1).toLowerCase()}: ${v}`); }
  // Notes area: lines below the last TOTAL on the page (the red notes on the APS form). Table rows are never notes.
  const notes: string[] = [];
  const last = Math.max(...sections.map((s) => s.totalAt), ...totals);
  // A missed H/H table whose title sits below the last TOTAL read: its rows are not notes, so nothing there is offered.
  const hhTitle = hhSec ? -1 : rows.findIndex((r) => /DISCHARGE\s*(H\W?H|W\/?H|HEAVY)/.test(up(r.cells.map((c) => c.text).join(' '))));
  const lastSec = sections[sections.length - 1];
  if (lastSec.total == null && grandTotal == null) problems.push('The notes below the tables could not be placed because a TOTAL was not read. Check the paper for notes.');
  else if (hhTitle <= last) for (const r of rows.slice(last + 1)) { const t = r.cells.map((c: Cell) => c.text).join(' ').replace(/^\W+|\W+$/g, '').trim(); if (t.split(/\s+/).length >= 3) notes.push(t); }

  const portCells = autoRecs.map((v) => (v.port ?? '').trim()).filter(Boolean);
  const port = portCells.length && portCells.every((p) => p === portCells[0]) ? portCells[0] : null;

  return {
    ok: true,
    plan: {
      vessel: field('VESSEL'), date: date && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ? date : null, port,
      drivers: d && count(d) != null ? count(d) : null,
      autos, autosTotal, brandTotals: brandTotals as Item[] | null, hh, hhTotal, grandTotal, notes, extras, problems,
    },
  };
}

// Several photos: the first page that is the cover page is read; the others are named as not read.
export function readGamePlanPages(pages: Page[]): ReadResult {
  for (let i = 0; i < pages.length; i++) {
    const r = readGamePlan(pages[i]);
    if (r.ok) {
      const others = pages.length > 1 ? [`Only photo ${i + 1} was read (the game plan cover page); ${pages.length - 1} other photo${pages.length === 2 ? ' was' : 's were'} not read.`] : [];
      return { ok: true, page: i, plan: { ...r.plan, problems: [...others, ...r.plan.problems] } };
    }
  }
  return { ok: false, error: NOT_A_GAME_PLAN };
}
