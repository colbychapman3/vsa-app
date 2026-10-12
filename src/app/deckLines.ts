// Pasted deck lines (Colby, 2026-10-12: the "Code" block from his ChatGPT game plan summary) → the same GamePlan the photo
// reader makes, so it opens the normal Review step. Rules only, no AI. It checks and never fixes: a line whose brands don't
// add up to its "= N", or decks that don't add up to STARTING AUTOS, is reported with the exact difference.
//   STARTING AUTOS: 1,352 | H&H: 51 | SHEET TOTAL: 1,403
//   DK12 H4: 53 BMW, 99 MB = 152 > BMW Field, MBZ
//   DK9 H4: 129 BMW > BMW Field
import type { GamePlan, AutoRow } from './gamePlan.ts';

const num = (s: string) => Number(s.replace(/,/g, ''));
const n = (x: number) => x.toLocaleString('en-US');
const LINE = /^\s*(?:DK|DECK|D)\s*(\d{1,2})\s*(H[1-4])?\s*:\s*([^=>]+?)\s*(?:=\s*([\d,]+)\s*)?(?:>\s*(.+?))?\s*$/i;
const ITEM = /^([\d,]+)\s+(.+)$/;
const HEAD = (label: string) => new RegExp(`${label}\\s*:\\s*([\\d,]+)`, 'i');

export function readDeckLines(text: string): { ok: true; plan: GamePlan } | { ok: false; error: string } {
  const problems: string[] = [];
  const decks = new Map<string, { hatches: Set<string>; items: Map<string, { brand: string; qty: number; yard: string }>; amount: number }>();
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(LINE);
    if (!m) continue;
    const [, dk, hatch, list, eq, yardText] = m;
    const where = `DK${dk}${hatch ? ` ${hatch.toUpperCase()}` : ''}`;
    const items = list.split(',').map((x) => x.trim().match(ITEM)).filter((x): x is RegExpMatchArray => !!x).map((x) => ({ qty: num(x[1]), brand: x[2].trim() }));
    if (!items.length) { problems.push(`${where}: no "count brand" pairs could be read.`); continue; }
    const sum = items.reduce((t, i) => t + i.qty, 0);
    if (eq != null && num(eq) !== sum) problems.push(`${where}: the brands add to ${n(sum)}, the line says ${n(num(eq))} (difference ${n(Math.abs(num(eq) - sum))}). Check it at Review.`);
    const yards = (yardText ?? '').split(',').map((y) => y.trim()).filter(Boolean);
    // A destination per brand by order; one destination for every brand when only one is given; otherwise left to pick.
    const yardFor = (k: number) => (yards.length === items.length ? yards[k] : yards.length === 1 ? yards[0] : '');
    if (yards.length > 1 && yards.length !== items.length) problems.push(`${where}: ${items.length} brands but ${yards.length} destinations, so none were paired. Choose them at Review.`);
    const d = decks.get(dk) ?? { hatches: new Set<string>(), items: new Map(), amount: 0 };
    if (hatch) d.hatches.add(hatch.toUpperCase());
    items.forEach((i, k) => {
      const key = `${i.brand}|${yardFor(k)}`;
      const was = d.items.get(key);
      d.items.set(key, { brand: i.brand, qty: (was?.qty ?? 0) + i.qty, yard: yardFor(k) });
    });
    d.amount += sum;
    decks.set(dk, d);
  }
  if (!decks.size) return { ok: false, error: 'No deck lines were found. Each line needs a deck and its counts, like "DK12 H4: 53 BMW, 99 MB = 152 > BMW Field, MBZ".' };

  const autos: AutoRow[] = [...decks].map(([dk, d]) => {
    const items = [...d.items.values()];
    return {
      deck: dk, amount: d.amount, split: items.map((i) => ({ brand: i.brand, qty: i.qty })), cargo: '',
      hatches: ['H4', 'H3', 'H2', 'H1'].filter((h) => d.hatches.has(h)),
      yards: [...new Set(items.map((i) => i.yard).filter(Boolean))],
      pairs: items.every((i) => i.yard) ? items.map((i) => ({ brand: i.brand, yard: i.yard })) : null,
      brands: [...new Set(items.map((i) => i.brand))], derived: false,
    };
  });
  const total = autos.reduce((t, r) => t + (r.amount ?? 0), 0);
  const start = text.match(HEAD('STARTING AUTOS'));
  const hh = text.match(HEAD('H&H'));
  const sheet = text.match(HEAD('SHEET TOTAL'));
  if (start && num(start[1]) !== total) problems.push(`The deck lines add to ${n(total)} autos; STARTING AUTOS says ${n(num(start[1]))} (difference ${n(Math.abs(num(start[1]) - total))}). Nothing was changed: check the decks at Review.`);
  return {
    ok: true,
    plan: {
      vessel: null, date: null, port: null, drivers: null, autos, autosTotal: start ? num(start[1]) : null, brandTotals: null,
      hh: [], hhTotal: hh ? num(hh[1]) : null, grandTotal: sheet ? num(sheet[1]) : null, notes: [], extras: [], problems,
    },
  };
}
