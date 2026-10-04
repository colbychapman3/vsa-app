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
  pairs: { brand: string; yard: string }[] | null; // yard paired with brand by order; null = not paired
};
export type HhRow = { deck: string | null; amount: number | null; cargo: string; yards: string[] };
export type GamePlan = {
  vessel: string | null; date: string | null; port: string | null; drivers: number | null;
  autos: AutoRow[]; autosTotal: number | null;
  hh: HhRow[]; hhTotal: number | null;
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
export function parseSplit(text: string, amount: number | null): { split: Item[] | null; reason?: string } {
  const parts = text.split('/').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { split: null, reason: 'cargo not read' };
  const brand = (b: string) => up(b).replace(/[.'’]/g, '').replace(/^POVS$/, 'POV');
  if (parts.length === 1 && /^[A-Za-z][A-Za-z.'’]{0,15}$/.test(parts[0])) {
    return amount == null ? { split: null, reason: 'the amount was not read' } : { split: [{ brand: brand(parts[0]), qty: amount }] };
  }
  const items: Item[] = [];
  for (const p of parts) {
    const m = /^(\d{1,3}(?:,\d{3})*|\d+)\s*([A-Za-z][A-Za-z.'’]{0,15})$/.exec(p);
    if (!m) return { split: null, reason: `"${p}" is not a count and a brand` };
    items.push({ brand: brand(m[2]), qty: Number(m[1].replace(/,/g, '')) });
  }
  return { split: items };
}

// "1*2*3*4" → H4..H1. The * may be read as x, ×, ·, a comma or a space. Only 1-4, each once.
export function parseHatches(text: string): { hatches: string[] | null; reason?: string } {
  const t = text.trim();
  if (!t) return { hatches: null, reason: 'hatch list not read' };
  if (/^ALL$/i.test(t)) return { hatches: null, reason: '"ALL" does not say which hatches the deck has' };
  if (!/^[1-4](\s*[*x×·,.\s]\s*[1-4])*$/i.test(t)) return { hatches: null, reason: `hatch text "${t}" is not hatch numbers 1-4` };
  const ds = t.match(/[1-4]/g)!;
  if (new Set(ds).size !== ds.length) return { hatches: null, reason: `hatch text "${t}" repeats a hatch` };
  return { hatches: [...ds].sort().reverse().map((d) => `H${d}`) };
}

// Yard as written → a terminal destination name. Unknown names are kept as written (Colby chooses the side).
const KEY = (s: string) => up(s).replace(/[^A-Z0-9]/g, '');
const YARD_ALIAS: Record<string, string> = { BMW: 'BMW Field', BMWFIELD: 'BMW Field', ZONE1: 'Zone 1 (MB Field)', MBZ: 'MBZ (Mercedes)', MBFIELD: 'MBZ (Mercedes)', AVP: 'AVP Yard' };
export function yardName(raw: string): string | null {
  const k = KEY(raw);
  if (YARD_ALIAS[k]) return YARD_ALIAS[k];
  return TERMINAL.find((t) => KEY(t.name) === k)?.name ?? null;
}

type Section = { kind: 'autos' | 'hh' | 'unknown'; head: number; cols: Partial<Record<Col, number>>; rows: Row[]; total: number | null; totalAt: number };

export function readGamePlan(page: Page): { ok: true; plan: GamePlan } | { ok: false; error: string } {
  const rows = rowsOf(page);
  const heads = rows.map((r, i) => ({ i, cols: headerColumns(r) })).filter((h) => h.cols);
  if (!heads.length) return { ok: false, error: NOT_A_GAME_PLAN };
  const problems: string[] = [];

  // Sections: header row → (title "DISCHARGE AUTO'S" / "DISCHARGE H/H") → data rows → TOTAL row.
  const sections: Section[] = heads.map((h, k) => {
    const next = k + 1 < heads.length ? heads[k + 1].i : rows.length;
    let body = rows.slice(h.i + 1, next);
    const own = body.slice(0, 2).findIndex(isTitle);
    const title = own >= 0 ? up(body[own].cells.map((c) => c.text).join(' ')) : '';
    // A section also ends at the next table's title, so a missed header or TOTAL never pulls the next table in.
    const cut = body.findIndex((r, j) => j > own && isTitle(r));
    if (cut >= 0) body = body.slice(0, cut);
    const end = h.i + 1 + body.length;
    // The title decides; only with both tables found may their order (AUTO'S first) stand in for an unreadable title.
    const kind: Section['kind'] = /AUTO/.test(title) ? 'autos' : /H\W?H|W\/?H|HEAVY/.test(title) ? 'hh' : heads.length === 2 ? (k === 0 ? 'autos' : 'hh') : 'unknown';
    const ti = body.findIndex((r) => r.cells.some((c) => /^TOTAL\b/.test(up(c.text))));
    const totalRow = ti >= 0 ? assign(body[ti], h.cols!) : null;
    const total = totalRow?.amount ? count(totalRow.amount) : null;
    const data = (ti >= 0 ? body.slice(0, ti) : body).filter((r) => !isTitle(r));
    return { kind, head: h.i, cols: h.cols!, rows: data, total, totalAt: ti >= 0 ? h.i + 1 + ti : end - 1 };
  });

  for (const s of sections) if (s.kind === 'unknown') problems.push("A table's title (DISCHARGE AUTO'S or DISCHARGE H/H) was not read, so that table was not filled.");

  // Rows of one section: anchored by an AMOUNT or DECK cell. A line with only cargo text (a wrapped description)
  // joins an anchored row only when it sits within one text height of it; otherwise it is reported. Free text is reported.
  const records = (s: Section) => {
    const lines = s.rows.filter((r) => {
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
  if (autosSec) for (const v of autoRecs) {
    const deck = v.deck ? (/^\d{1,2}$/.test(v.deck.trim()) ? String(Number(v.deck.trim())) : null) : null;
    const name = deck ? `Deck ${deck}` : 'A row with no deck number';
    if (!deck) problems.push(`${name} (${[v.amount, v.cargo].filter(Boolean).join(', ') || 'nothing readable'}): the deck was not read. Add it by hand.`);
    const amount = v.amount ? count(v.amount) : null;
    if (v.amount && amount == null) problems.push(`${name}: the amount "${v.amount}" is not a number. Type it.`);
    const cargo = v.cargo ?? '';
    let { split, reason } = parseSplit(cargo, amount);
    const row: AutoRow = { deck, amount, split, cargo, hatches: null, yards: (v.yard ?? '').split('/').map((y) => y.trim()).filter(Boolean), pairs: null };
    if (split && amount != null) {
      const sum = split.reduce((s, i) => s + i.qty, 0);
      if (sum !== amount) { problems.push(`${name}: the split adds to ${n(sum)} but AMOUNT says ${n(amount)} (difference ${n(Math.abs(sum - amount))}). Type the split.`); row.split = null; }
    } else if (split && amount == null) {
      if (v.amount) row.split = null; // an AMOUNT was printed but not readable: never stand in for it with the split
      else derived.push(row);
    }
    else if (!split) problems.push(`${name}: brand split not filled (${reason}). Type it.`);
    if (amount == null && !split) problems.push(`${name}: the amount was not read. Type it.`);
    const h = parseHatches(v.hatch ?? '');
    row.hatches = h.hatches;
    if (!h.hatches) problems.push(`${name}: ${h.reason}. Choose the hatches.`);
    if (row.split) {
      if (row.split.length === row.yards.length) row.pairs = row.split.map((i, k) => ({ brand: i.brand, yard: row.yards[k] }));
      else if (row.yards.length) problems.push(`${name}: ${row.split.length} brand${row.split.length === 1 ? '' : 's'} but ${row.yards.length} yard${row.yards.length === 1 ? '' : 's'}; destinations not paired. Choose them.`);
      else problems.push(`${name}: yard not read. Choose the destinations.`);
    }
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
  if (lastSec.total == null) problems.push('The notes below the tables could not be placed because a TOTAL was not read. Check the paper for notes.');
  else if (hhTitle <= last) for (const r of rows.slice(last + 1)) { const t = r.cells.map((c: Cell) => c.text).join(' ').replace(/^\W+|\W+$/g, '').trim(); if (t.split(/\s+/).length >= 3) notes.push(t); }

  const portCells = autoRecs.map((v) => (v.port ?? '').trim()).filter(Boolean);
  const port = portCells.length && portCells.every((p) => p === portCells[0]) ? portCells[0] : null;

  return {
    ok: true,
    plan: {
      vessel: field('VESSEL'), date: date && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ? date : null, port,
      drivers: d && count(d) != null ? count(d) : null,
      autos, autosTotal, hh, hhTotal, notes, extras, problems,
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
