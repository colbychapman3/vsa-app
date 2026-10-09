// Discharge summary reader (spec 7h): the page's own printed brand totals ("920 - MB", "47 - H/H"), read by position.
// It never sums the table rows (VIN/booking text stays unread) and never fills a number the page does not state.
import type { Page, Word } from './layout.ts';

export type SummaryTotal = { label: string; count: number };
export type SummaryRead = { ok: true; totals: SummaryTotal[]; hh: number | null; pageTotal: number | null; note: string } | { ok: false; error: string };

export const NOT_A_SUMMARY = 'No brand totals found (lines like “920 - MB”). Photograph the bottom of the Discharge Summary with the totals block in view, flat and in focus, or type the totals in.';

const LABELS: Record<string, string> = { MB: 'MB', BMW: 'BMW', MAS: 'MAS', LR: 'LR', POVS: 'POV', POV: 'POV', 'H/H': 'HH', HH: 'HH' };
const DASH = /^[-–—]$/;

export function readDischargeSummary(pages: Page[]): SummaryRead {
  const found = new Map<string, number>();
  const ints: number[] = [];
  for (const page of pages) {
    const ws: Word[] = page.words;
    for (let i = 0; i < ws.length; i++) {
      const num = /^\d{1,6}$/.test(ws[i].t) ? Number(ws[i].t) : null;
      if (num != null && ws[i].t.length >= 3) ints.push(num);
      const d = ws[i + 1], l = ws[i + 2];
      if (num == null || !d || !l || !DASH.test(d.t)) continue;
      const key = LABELS[l.t.toUpperCase()];
      // same printed line: the dash and the label sit within one text height of the number
      if (!key || Math.abs(d.y - ws[i].y) > ws[i].h * 1.5 || Math.abs(l.y - ws[i].y) > ws[i].h * 1.5) continue;
      if (found.has(key) && found.get(key) !== num) return { ok: false, error: `The page shows two different figures for ${key}. Retake it so only one totals block is in view.` };
      found.set(key, num);
    }
  }
  if (found.size === 0) return { ok: false, error: NOT_A_SUMMARY };
  const hh = found.get('HH') ?? null;
  const totals = [...found].filter(([k]) => k !== 'HH').map(([label, count]) => ({ label, count }));
  const sum = totals.reduce((a, t) => a + t.count, 0) + (hh ?? 0);
  const pageTotal = ints.includes(sum) ? sum : null;
  const note = pageTotal != null ? `The parts add to the page total (${pageTotal.toLocaleString('en-US')}).` : `The parts add to ${sum.toLocaleString('en-US')}; no matching page total was read, so check it against the page.`;
  return { ok: true, totals, hh, pageTotal, note };
}

// Which of the vessel's brand names a printed label fills ('MB' → 'Mercedes-Benz'); null when none or more than one fits.
const MATCH: Record<string, RegExp> = { MB: /mercedes|^mb\b|benz/i, BMW: /bmw/i, MAS: /masera/i, LR: /land\s*rover|^lr\b|jaguar/i, POV: /pov/i };
export function brandFor(label: string, brands: string[]): string | null {
  const hit = brands.filter((b) => MATCH[label]?.test(b));
  return hit.length === 1 ? hit[0] : null;
}
