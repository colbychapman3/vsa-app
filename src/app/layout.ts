// Photographed paperwork → rows and cells. The phone's text reader returns words with boxes but in an order that
// mixes table columns, so rows are rebuilt from positions here. Pure and tested; no AI, no UI.
// A page can be tilted (a photo of paper on a desk): the tilt is estimated and removed first.

export type Word = { t: string; x: number; y: number; w: number; h: number }; // pixels, top-left origin
export type Page = { width: number; height: number; words: Word[]; extra?: ExtraWord[] }; // extra: the raw second pass, kept for "Share what was read"
export type ExtraWord = Word & { c?: number }; // c: the reader's confidence, 0-1
export type Cell = { text: string; x: number; w: number; cx: number; y: number; h: number; words: Word[] };
export type Row = { y: number; cells: Cell[] };

// The full-page read drops small isolated numerals (deck digits, amounts in narrow cells). A second read of enlarged tiles
// (modules/vsa-text) finds them again. Only a numeral is taken from it, only where the full-page read has no word, only
// with the reader's confidence, and never a thin mark that is a ruled line read as "1". Tile overlaps are merged.
const NUMERAL = /^\d{1,4}\*?$/;
export function addMissedNumerals(words: Word[], extra: ExtraWord[]): Word[] {
  const out = [...words];
  const hit = (e: Word, w: Word) => { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; return cx >= w.x && cx <= w.x + w.w && cy >= w.y && cy <= w.y + w.h; };
  for (const e of extra) {
    if (!NUMERAL.test(e.t) || (e.c ?? 1) < 0.5 || e.w < 0.25 * e.h) continue;
    if (out.some((w) => hit(e, w) || hit(w, e))) continue; // read already, or the same numeral from an overlapping tile
    out.push({ t: e.t, x: e.x, y: e.y, w: e.w, h: e.h });
  }
  return out;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Rotate the page so text lines run level (rows line up and columns stay straight). Candidate tilts are scored by how
// sharply word centres pile up in rows.
export function deskew(words: Word[]): { words: Word[]; tiltDeg: number } {
  if (words.length < 6) return { words, tiltDeg: 0 };
  const h = median(words.map((w) => w.h)) || 1;
  const x0 = Math.min(...words.map((w) => w.x));
  const score = (tan: number) => {
    const bins = new Map<number, number>();
    for (const w of words) { const y = w.y + w.h / 2 - (w.x + w.w / 2 - x0) * tan; const k = Math.round(y / (h * 0.5)); bins.set(k, (bins.get(k) ?? 0) + w.w); }
    let s = 0; for (const v of bins.values()) s += v * v; return s;
  };
  let best = 0, bestScore = score(0);
  for (let d = -6; d <= 6; d += 0.2) { const s = score(Math.tan((d * Math.PI) / 180)); if (s > bestScore * 1.0005) { bestScore = s; best = d; } }
  const a = (best * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const px = words.reduce((s, w) => s + w.x + w.w / 2, 0) / words.length, py = words.reduce((s, w) => s + w.y + w.h / 2, 0) / words.length;
  return { tiltDeg: best, words: words.map((w) => {
    const dx = w.x + w.w / 2 - px, dy = w.y + w.h / 2 - py;
    return { ...w, x: px + dx * cos + dy * sin - w.w / 2, y: py - dx * sin + dy * cos - w.h / 2 };
  }) };
}

// Rows top to bottom; within a row, words that sit close together join into one cell (a table cell's text).
export function rowsOf(page: Page): Row[] {
  const { words } = deskew(page.words.filter((w) => w.t.trim() !== ''));
  if (!words.length) return [];
  const h = median(words.map((w) => w.h)) || 1;
  const sorted = words.map((w) => ({ w, cy: w.y + w.h / 2 })).sort((a, b) => a.cy - b.cy);
  const groups: { cy: number; ws: Word[] }[] = [];
  for (const { w, cy } of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.cy - cy) <= Math.max(w.h, h) * 0.55) { g.ws.push(w); g.cy = (g.cy * (g.ws.length - 1) + cy) / g.ws.length; }
    else groups.push({ cy, ws: [w] });
  }
  const gap = h * 1.5;
  return groups.map((g) => {
    const ws = g.ws.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const w of ws) {
      const c = cells[cells.length - 1];
      if (c && w.x - (c.x + c.w) <= gap) { c.words.push(w); c.text += ` ${w.t}`; c.w = w.x + w.w - c.x; }
      else cells.push({ text: w.t, x: w.x, w: w.w, cx: 0, y: w.y, h: w.h, words: [w] });
    }
    for (const c of cells) c.cx = c.x + c.w / 2;
    return { y: g.cy, cells };
  });
}

// What "Show paperwork text" displays: one line per row, cells separated by " | ".
export const rowText = (r: Row) => r.cells.map((c) => c.text).join('  |  ');
export const pageText = (page: Page) => rowsOf(page).map(rowText).join('\n');
