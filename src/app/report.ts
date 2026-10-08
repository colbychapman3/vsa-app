// PDF report content (protocol §11.2 break / shift-end, §9.3 completion). Pure: every number comes
// from the engine state and view model; unknown prints "unknown", never 0. Recorded facts and
// analysis stay in separate sections, and the app never writes conclusions (notes are typed by Colby).
import { formatHM, parseHM, preBreak, validateBaseline, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { completeLine } from './complete.ts';
import { snapshot } from './view.ts';

export type ReportKind = 'break' | 'completion';
export type Section = { title: string; lines?: string[]; table?: { head: string[]; rows: string[][] }; note?: string };
export type Report = { title: string; meta: string[]; interim: boolean; sections: Section[] };

// Sections the app has no data for. Colby may type a short note; otherwise "Not recorded".
export const NOTE_SECTIONS = ['Load-back', 'Efficiency and trends', 'Destination and route effects', 'Bottlenecks', 'Lessons learned', 'Recommendations'] as const;

const n = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? 'unknown' : x.toLocaleString('en-US'));
const STATUS = { active: 'Active', paused: 'Paused', notStarted: 'Not started', complete: 'Complete', unknown: 'Unknown' } as const;

export function buildReport(kind: ReportKind, s: State, b: Baseline, o: { isTest: boolean; generatedAt: string; notes?: Record<string, string> }): Report {
  const interim = completeLine(s).interim;
  const phase = s.ops.shiftEnded ? `Shift ended${s.ops.shiftEnd ? ` at ${s.ops.shiftEnd}` : ''}` : s.ops.onBreak ? `On break${s.ops.breakStart ? ` since ${s.ops.breakStart}` : ''}` : 'Working (not at a break)';
  const title = kind === 'break' ? (s.ops.shiftEnded ? 'End-of-shift report' : 'Break report') : 'Vessel completion report';
  const meta = reportMeta(title, s, b, o);
  const sections = kind === 'break' ? breakSections(s, b, phase) : completionSections(s, b, phase, o.notes ?? {});
  return { title, meta, interim, sections };
}

// The header every PDF carries: vessel, date, berth, TEST mark, generated time (phone time), INTERIM until complete.
// The last line is the INTERIM/COMPLETE one (the HTML colors it).
export function reportMeta(title: string, s: State, b: Baseline, o: { isTest: boolean; generatedAt: string }): string[] {
  const place = [b.port != null ? String(b.port) : '', b.berth != null ? `Berth ${String(b.berth)}` : ''].filter(Boolean).join(' ');
  return [
    `${b.vessel} · ${b.date}${place ? ` · ${place}` : ''}`,
    o.isTest ? 'TEST DATA' : 'LIVE',
    title,
    `Generated ${o.generatedAt} (phone time)`,
    completeLine(s).text,
  ];
}

// ---------- shared pieces ----------

function reconciliation(s: State): Section {
  const recon = s.ops.phase !== 'working';
  const brandResult = (v: number | null) =>
    v == null ? 'unknown'
      : !recon ? (v === 0 ? '0' : `${n(Math.abs(v))} ${v > 0 ? 'in transit' : 'field over'}`)
        : v === 0 ? 'Match' : v > 0 ? `Ship ahead by ${n(v)}` : `Field ahead by ${n(-v)}`;
  return {
    title: 'Ship vs field reconciliation',
    lines: [
      s.reconciliation.message ?? (recon ? 'Waiting on deck counts.' : 'Not at a break or shift end: the gap between ship and field is monitored, not reconciled.'),
      `Ship progress ${n(s.progress)} · Field ${n(s.field)} · In transit ${n(s.variance)}`,
    ],
    table: {
      head: ['Brand', 'Field', 'Cleared from ship', 'Result'],
      rows: s.brands.map((x) => [x.name, `${x.fieldExact ? '' : '≥ '}${n(x.field)}`, n(x.cleared), brandResult(x.variance)]),
    },
    note: s.unsplit ? `${n(s.unsplit)} autos were logged without a brand split, so brand field totals are minimums.` : undefined,
  };
}

function remainingByBrand(s: State): Section {
  const unknown = s.vesselRemaining == null ? ` (unknown: needs a remaining count on ${s.missingDecks.join(', ')}). Field balance: ${n(s.fieldBalance)}.` : '';
  return {
    title: 'Remaining cargo',
    lines: [`Vessel remaining: ${n(s.vesselRemaining)} of ${n(s.start)}${unknown}`],
    table: { head: ['Brand', 'Remaining', 'Starting'], rows: s.brands.map((x) => [x.name, n(x.remaining), n(x.start)]) },
  };
}

function hours(s: State): Section {
  const p = s.production;
  return {
    title: 'Hourly field counts (official record)',
    lines: [
      `H.A. ${p.ha == null ? 'unknown' : Math.round(p.ha)}/hr = ${n(s.field)} ÷ ${p.countedHours} counted hr`,
      `Pace ${p.pace == null ? 'unknown' : Math.round(p.pace)}/hr = ${n(p.prodCount)} ÷ ${(p.prodMin / 60).toFixed(2)} productive hr`,
    ],
    table: {
      head: ['Hour', 'Count', 'Notes'],
      rows: s.periods.map((x) => {
        const start = parseHM(x.start)!;
        const notes = [
          x.short ? (x.min != null ? `Production stopped ${formatHM(start + x.min)} (${x.min} min worked)` : 'Stoppage time not set') : '',
          !x.short && x.reason && x.min != null ? `${x.min} min worked (${x.reason.toLowerCase()})` : '',
          x.was?.length ? `Corrected: was ${x.was.map(n).join(' → ')}` : '',
        ].filter(Boolean).join('; ');
        return [`${x.day > 1 ? `Day ${x.day} ` : ''}${x.start}–${formatHM(preBreak(x.start, s.breaks) ?? start + 60)}`, n(x.count), notes];
      }),
    },
  };
}

// H/H timeline (awareness only): each pass as logged, and what was observed on the car hours. Never a cause.
function hhSection(s: State): Section {
  const h = s.hh;
  if (!h.passes.length) return { title: 'H/H timeline', lines: ['No H/H start or complete was logged.'] };
  return {
    title: 'H/H timeline',
    lines: [
      h.text,
      ...h.passes.map((p, i) => `Pass ${i + 1}: started ${p.start.label}; ${p.end ? `complete ${p.end.label}` : p.endedWithShift ? 'ended with the shift (no closing time entered)' : 'still active'}`),
      ...(h.analysis?.lines ?? []),
      'H/H counts are awareness only and are not part of the auto counts above.',
    ],
  };
}

function eta(s: State, b: Baseline): Section {
  const e = snapshot(s, b, 0).eta;
  return {
    title: 'ETA',
    lines: [`FORECAST: ${e.value === '—' ? 'not available' : `${e.value}${e.day ? ` (${e.day})` : ''}`}`, ...e.notes.filter(Boolean), 'A forecast is never marked complete automatically.'],
  };
}

function clearBy(s: State, b: Baseline): Section {
  const cut: Partial<Record<'N' | 'S', number>> = {};
  for (const d of b.destinations) cut[d.side] = d.clearBy;
  const rows = b.breaks.map((br) => {
    const at = parseHM(br)!;
    const hr = s.periods.find((p) => preBreak(p.start, s.breaks) === at);
    const stop = hr == null ? 'no count for the pre-break hour' : hr.min != null ? `production stopped ${formatHM(parseHM(hr.start)! + hr.min)}` : 'stop time not recorded';
    return [br, cut.N != null ? formatHM(at - cut.N) : 'n/a', cut.S != null ? formatHM(at - cut.S) : 'n/a', stop];
  });
  return { title: 'Clear-by before breaks', table: { head: ['Break', 'Northside clear-by', 'Southside clear-by', 'Recorded'], rows } };
}

// Current notes only (removed ones stay in the log, not the report); edited ones say so.
export function notesSection(s: State): Section {
  const live = s.notes.filter((x) => !x.removed);
  return {
    title: 'Notes',
    lines: live.length ? live.map((x) => `${x.title ? `${x.title}: ` : ''}${x.text} (${x.createdAt}${x.edited ? '; edited, earlier versions kept in the log' : ''}${x.source === 'photo-read' ? '; read from a photo' : ''})`) : ['None recorded.'],
  };
}

function discrepancies(s: State, b: Baseline): Section {
  const base = validateBaseline(b);
  const lines = [
    ...(base.ok ? base.discrepancies : []),
    ...s.issues.filter((i) => i.status === 'open').map((i) => `OPEN: ${i.text} (${i.openedAt})`),
    ...s.issues.filter((i) => i.status === 'resolved').map((i) => `Resolved ${i.resolvedAt}: ${i.text}`),
  ];
  return { title: 'Discrepancies', lines: lines.length ? lines : ['None recorded.'] };
}

function decksTable(s: State): Section {
  return {
    title: 'Decks',
    table: {
      head: ['Deck', 'Status', 'Remaining', 'Starting', 'Height'],
      rows: s.decks.map((d) => [
        d.label, d.status === 'notStarted' && d.skipped ? 'Skipped' : STATUS[d.status], n(d.rem), n(d.start),
        d.height.current == null ? 'unknown' : `${d.height.current.toFixed(2)} m${d.height.level === 'hard' ? ' LOW DECK' : d.height.level === 'soft' ? ' (not confirmed)' : ''}`,
      ]),
    },
  };
}

// ---------- break / shift end ----------

function breakSections(s: State, b: Baseline, phase: string): Section[] {
  const live = s.decks.filter((d) => d.status === 'active' || d.status === 'paused');
  return [
    { title: 'Status', lines: [phase, `Day ${s.ops.day}`, `Active/paused decks: ${live.length ? live.map((d) => `${d.label} (${STATUS[d.status].toLowerCase()}, ${n(d.rem)} left)`).join('; ') : 'none'}`] },
    reconciliation(s), remainingByBrand(s), hours(s), eta(s, b), clearBy(s, b), discrepancies(s, b), notesSection(s),
  ];
}

// ---------- completion ----------

function completionSections(s: State, b: Baseline, phase: string, notes: Record<string, string>): Section[] {
  const p = s.production;
  const labor = (b.labor ?? {}) as { autoDrivers?: number };
  const drivers = Object.keys(s.workdayDrivers).length
    ? Object.entries(s.workdayDrivers).map(([d, x]) => `Day ${d} ${n(x)}`).join(', ')
    : labor.autoDrivers != null ? `labor order ${n(labor.autoDrivers)}` : 'unknown';
  const corrected = s.periods.filter((x) => x.was?.length).map((x) => `${x.day > 1 ? `Day ${x.day} ` : ''}${x.start}: was ${x.was!.map(n).join(' → ')}, now ${n(x.count)} (original kept)`);
  const timeline = [
    ...Object.entries(s.dayStarts).map(([d, x]) => `Day ${d} start: ${x.actual == null ? `planned ${x.planned}` : `started ${x.actual}${x.lateMin > 0 ? ` (late ${x.lateMin} min${x.cause ? `: ${x.cause}` : ''})` : ''}`}`),
    ...s.breakLog.map((x) => `${x.kind === 'shift' ? 'Shift' : 'Break'}${x.kind === 'missed' ? ' (added later)' : x.edited ? ' (edited)' : ''}: ${x.end ? `${x.start}–${x.end}` : `${x.start} (no end recorded)`}`),
  ];
  const disc = discrepancies(s, b);
  const src = ((b.sources as string[] | undefined) ?? []).join('; ');
  const named = (t: (typeof NOTE_SECTIONS)[number]): Section => ({
    title: t,
    lines: [notes[t]?.trim() || 'Not recorded.'],
    note: t === 'Load-back' ? 'Load-back is its own ledger and is not tracked in this app.' : undefined,
  });
  // Protocol §9.3 order; numbered 1-15 below. ETA and Plan notes follow the numbered sections.
  const numbered: Section[] = [
    { title: 'Executive summary', lines: [
      `${b.vessel}: ${n(s.field)} of ${n(s.start)} autos in the field record; vessel remaining ${n(s.vesselRemaining)}.`,
      `H.A. ${p.ha == null ? 'unknown' : Math.round(p.ha)}/hr over ${p.countedHours} counted hr; pace ${p.pace == null ? 'unknown' : Math.round(p.pace)}/hr.`,
      phase,
    ] },
    { title: 'Operation overview', lines: [
      `Date ${b.date} · planned start ${b.start} · breaks ${b.breaks.join(' and ')} (1 hour each)`,
      `Drivers: ${drivers}`,
      ...(src ? [`Sources: ${src}`] : []),
    ] },
    { title: 'Starting cargo', lines: [`${n(s.start)} autos`], table: { head: ['Brand', 'Starting'], rows: s.brands.map((x) => [x.name, n(x.start)]) } },
    { title: 'Discharge results', lines: [`Field ${n(s.field)} · Ship progress ${n(s.progress)} · Vessel remaining ${n(s.vesselRemaining)}`],
      table: { head: ['Brand', 'Field', 'Remaining'], rows: s.brands.map((x) => [x.name, `${x.fieldExact ? '' : '≥ '}${n(x.field)}`, n(x.remaining)]) } },
    { ...hours(s), title: 'Hourly productivity' },
    { ...decksTable(s), title: 'Deck progression' },
    { ...reconciliation(s), title: 'Reconciliation' },
    named('Load-back'),
    { title: 'Timeline', lines: timeline.length ? timeline : ['No day starts or breaks recorded.'] },
    named('Efficiency and trends'),
    named('Destination and route effects'),
    named('Bottlenecks'),
    { title: 'Corrections and discrepancies', lines: [...(disc.lines ?? []), ...corrected] },
    named('Lessons learned'),
    named('Recommendations'),
  ];
  const out: Section[] = [...numbered.map((x, i) => ({ ...x, title: `${i + 1}. ${x.title}` })), eta(s, b), hhSection(s), notesSection(s)]; // protocol 9.3's 15 sections stay as they are; H/H follows them
  return out;
}

// ---------- HTML ----------

export const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const REPORT_CSS = `
body{font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px;color:#111;margin:24px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px}
p{margin:3px 0}.meta{font-weight:600}.interim{color:#b45309}.note{color:#555;font-style:italic}
table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #bbb;padding:3px 6px;text-align:left;vertical-align:top}th{background:#eee}
`;

export function reportHtml(r: Report): string {
  const table = (t: NonNullable<Section['table']>) =>
    `<table><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  const section = (x: Section) =>
    `<h2>${esc(x.title)}</h2>${(x.lines ?? []).map((l) => `<p>${esc(l)}</p>`).join('')}${x.table ? table(x.table) : ''}${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}`;
  const meta = r.meta.map((m, i) => `<p class="meta${r.interim && i === r.meta.length - 1 ? ' interim' : ''}">${esc(m)}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${REPORT_CSS}</style></head><body><h1>${esc(r.title)}</h1>${meta}${r.sections.map(section).join('')}</body></html>`;
}
