// Photo evidence reports (spec phase-6-evidence-reports): accident, poor stowage, pre-stow damage, and stowage
// (plain pre-stow). Pure content like report.ts: the photo itself is resolved by the caller (a reduced copy, PDF only).
// The report lists what was recorded. It never states a cause; hourly counts are context only.
import { TYPE_LABEL, toAbs, type Baseline, type EvidenceType } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { esc, REPORT_CSS, reportMeta } from './report.ts';
import { periodAt } from './view.ts';

export type EvidenceReportKind = 'accident' | 'poor-stowage' | 'pre-stow-damage' | 'stowage';
// Which report a photo type belongs to, and its button label. Buttons come from view.photoTypesPresent, never from the screen.
export const EVIDENCE_REPORTS: Record<EvidenceType, { kind: EvidenceReportKind; title: string }> = {
  accident: { kind: 'accident', title: 'Accident report' },
  'poor-stowage': { kind: 'poor-stowage', title: 'Poor stowage report' },
  'pre-stow-damage': { kind: 'pre-stow-damage', title: 'Pre-stow damage report' },
  'pre-stow': { kind: 'stowage', title: 'Stowage report' },
};

export type EvidenceEntry = { photo: string | null; heading: string; lines: string[]; edited: boolean };
export type EvidenceGroup = { title: string | null; entries: EvidenceEntry[] };
export type EvidenceReport = { kind: EvidenceReportKind; title: string; meta: string[]; interim: boolean; intro: string[]; groups: EvidenceGroup[]; removed: string[] };

type Item = State['evidence'][number];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const atText = (x: Item) => (x.at ? `${x.at.day > 1 ? `Day ${x.at.day} ` : ''}${x.at.hm}` : 'time not provided');

function entry(s: State, x: Item, type: EvidenceType): EvidenceEntry {
  const deck = s.decks.find((d) => d.id === x.deck)?.label ?? x.deck;
  const lines = [
    `Time: ${atText(x)}`,
    `Deck ${deck} · Hatch ${x.hatch}`,
    `Reason (as recorded): ${x.reason}`,
    x.vins.length ? `VIN${x.vins.length === 1 ? '' : 's'}: ${x.vins.join(', ')}` : type === 'accident' ? 'VIN: none recorded' : 'VIN: none entered',
    ...x.vinWarnings.map((w) => `Check: ${w}`),
    ...(x.notes ? [`Notes: ${x.notes}`] : []),
  ];
  if (type === 'accident') {
    const p = x.at ? periodAt(s, x.at) : undefined;
    lines.push(`Hourly count (no cause claimed): ${x.at == null ? 'time not provided, so no hour can be shown' : p ? `${p.count.toLocaleString('en-US')} autos in the hour starting ${p.start}` : 'this time is not inside a logged hour'}`);
  }
  if (x.edited) lines.push('Edited: earlier versions are kept in the log.');
  return { photo: x.photo, heading: `${TYPE_LABEL[x.type]} · ${deck} ${x.hatch}`, lines, edited: x.edited };
}

// Sorted by time; no time goes last.
const byTime = (a: Item, b: Item) => (a.at && b.at ? toAbs(a.at)! - toAbs(b.at)! : a.at ? -1 : b.at ? 1 : 0);

export function buildEvidenceReport(kind: EvidenceReportKind, s: State, b: Baseline, o: { isTest: boolean; generatedAt: string }): EvidenceReport {
  const type = (Object.keys(EVIDENCE_REPORTS) as EvidenceType[]).find((t) => EVIDENCE_REPORTS[t].kind === kind)!;
  const title = EVIDENCE_REPORTS[type].title;
  const mine = s.evidence.filter((x) => x.type === type);
  const live = mine.filter((x) => !x.removed);
  const meta = reportMeta(title, s, b, o);
  const intro = [
    `${plural(live.length, 'photo')} recorded${mine.length > live.length ? `, ${mine.length - live.length} removed (listed at the end)` : ''}.`,
    ...(type === 'accident' ? ['This report lists what was recorded. It does not state what caused anything; the hourly count beside each entry is context only.'] : []),
  ];
  let groups: EvidenceGroup[];
  if (kind === 'stowage') {
    // Grouped by deck then hatch, in the vessel's own deck and hatch order.
    groups = s.decks.flatMap((d) => d.hatches.map((h) => ({
      title: `Deck ${d.label} · Hatch ${h.h}`,
      entries: live.filter((x) => x.deck === d.id && x.hatch === h.h).sort(byTime).map((x) => entry(s, x, type)),
    }))).filter((g) => g.entries.length);
  } else {
    const timed = live.filter((x) => x.at).sort(byTime), untimed = live.filter((x) => !x.at);
    groups = [
      { title: null, entries: timed.map((x) => entry(s, x, type)) },
      ...(untimed.length ? [{ title: 'Time not provided', entries: untimed.map((x) => entry(s, x, type)) }] : []),
    ].filter((g) => g.entries.length);
  }
  const removed = mine.filter((x) => x.removed).sort(byTime).map((x) => {
    const deck = s.decks.find((d) => d.id === x.deck)?.label ?? x.deck;
    return `Removed: ${TYPE_LABEL[x.type]} · ${deck} ${x.hatch} · ${atText(x)}${x.vins.length ? ` · ${x.vins.join(', ')}` : ''} · reason for removal: ${x.removedReason}`;
  });
  return { kind, title, meta, interim: s.vesselRemaining !== 0, intro, groups, removed };
}

// Paths of the photos the report will show (current ones only), for the caller to load in reduced size.
export const reportPhotos = (r: EvidenceReport) => r.groups.flatMap((g) => g.entries.map((e) => e.photo)).filter((p): p is string => !!p);

// `src` gives a photo's (reduced) data URI, or null if the file is missing: the report then says so.
export function evidenceReportHtml(r: EvidenceReport, src: (path: string) => string | null): string {
  const meta = r.meta.map((m, i) => `<p class="meta${r.interim && i === r.meta.length - 1 ? ' interim' : ''}">${esc(m)}</p>`).join('');
  const one = (e: EvidenceEntry) => {
    const uri = e.photo ? src(e.photo) : null;
    return `<div class="entry"><h3>${esc(e.heading)}</h3>${uri ? `<img src="${uri}">` : '<p class="note">Photo file not available on this phone.</p>'}${e.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
  };
  const groups = r.groups.map((g) => `${g.title ? `<h2>${esc(g.title)}</h2>` : ''}${g.entries.map(one).join('')}`).join('');
  const removed = r.removed.length ? `<h2>Removed photos</h2>${r.removed.map((l) => `<p class="note">${esc(l)}</p>`).join('')}` : '';
  const css = `${REPORT_CSS}.entry{break-inside:avoid;border:1px solid #bbb;padding:8px;margin:8px 0}h3{font-size:13px;margin:0 0 6px}img{max-width:60%;max-height:320px;display:block;margin:0 0 6px}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><h1>${esc(r.title)}</h1>${meta}${r.intro.map((l) => `<p>${esc(l)}</p>`).join('')}${groups}${removed}</body></html>`;
}
