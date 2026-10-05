// H/H timeline (spec docs/specs/phase-7g-hh-timeline.md). H/H is awareness only: another stevedore counts it, so a marker
// carries no count and nothing here touches an auto ledger. Markers become passes (a start and its complete, repeatable),
// and the car hours are grouped by whether H/H was on. The wording describes what was observed and never states a cause.
import { driverRate, preBreak, summarize, type Period } from './production.ts';
import { parseHM } from './time.ts';

const DAY = 1440;

export type HhMarker = { id: string; kind: 'started' | 'completed'; abs: number; label: string; processing: boolean };
export type HhPass = {
  start: HhMarker;
  end: HhMarker | null;          // the entered complete, or null
  endAbs: number | null;         // when the pass ended: the complete, else the shift end; null = still active
  endedWithShift: boolean;       // no closing time was entered, so the shift end closes it (Colby, 2026-10-05)
};

// Markers → passes. Order is by time, not by when each was saved, so a corrected time takes effect where it belongs.
// shiftEnds: absolute minutes of every recorded shift end. A refusal names the event and what to do.
export function buildPasses(markers: HhMarker[], shiftEnds: number[]): { passes: HhPass[] } | { error: string; id: string } {
  const sorted = markers.map((m, i) => ({ m, i })).sort((a, b) => a.m.abs - b.m.abs || a.i - b.i).map((x) => x.m);
  const passes: HhPass[] = [];
  let open: HhMarker | null = null;
  for (const m of sorted) {
    if (m.kind === 'started') {
      // A pass left open when the shift ended ended with it; a later start (the next day) is a new pass.
      const se = open ? shiftEnds.filter((x) => x > open!.abs && x <= m.abs).sort((a, b) => a - b)[0] : undefined;
      if (open && se != null) { passes.push({ start: open, end: null, endAbs: se, endedWithShift: true }); open = null; }
      if (open) return { id: m.id, error: `Event ${m.id}: H/H is already started since ${open.label}. Mark it complete first, or correct that start.` };
      open = m;
    } else {
      const later = sorted.find((x) => x.kind === 'started' && x.abs > m.abs);
      if (!open && later) return { id: m.id, error: `Event ${m.id}: H/H complete (${m.label}) must be after its start (${later.label}). Correct one of the times.` };
      if (!open) return { id: m.id, error: `Event ${m.id}: H/H complete at ${m.label} has no start before it. Log the start first (with its real time), or correct this time.` };
      if (m.abs <= open.abs) return { id: m.id, error: `Event ${m.id}: H/H complete (${m.label}) must be after its start (${open.label}). Correct one of the times.` };
      passes.push({ start: open, end: m, endAbs: m.abs, endedWithShift: false });
      open = null;
    }
  }
  if (open) {
    const se = shiftEnds.filter((x) => x > open!.abs).sort((a, b) => a - b)[0] ?? null;
    passes.push({ start: open, end: null, endAbs: se, endedWithShift: se != null });
  }
  return { passes };
}

export type HhStatus = 'notStarted' | 'active' | 'complete' | 'endedWithShift';
export function hhStatus(passes: HhPass[]): { status: HhStatus; text: string } {
  const last = passes.at(-1);
  if (!last) return { status: 'notStarted', text: 'H/H not started' };
  const again = passes.length > 1 ? ' again' : '';
  if (last.end) return { status: 'complete', text: `H/H complete ${last.end.label}` };
  if (last.endedWithShift) return { status: 'endedWithShift', text: `H/H ended with the shift (started ${last.start.label}; no closing time entered)` };
  return { status: 'active', text: `H/H active${again} since ${last.start.label}` };
}

export type HhGroup = {
  hours: string[]; n: number; field: number; ha: number | null; prodMin: number; pace: number | null;
  drivers: number | null; driverRate: number | null;
};
export type HhAnalysis = { active: HhGroup; clear: HhGroup; transition: string[]; before: string[]; lines: string[] };

const hourLabel = (p: Period) => `${p.day > 1 ? `Day ${p.day} ` : ''}${p.start}`;
const r0 = (x: number) => Math.round(x).toLocaleString('en-US');

function group(ps: Period[]): HhGroup {
  const s = summarize(ps);
  const known = ps.filter((p) => p.min != null);
  const withDrivers = ps.filter((p) => p.drivers != null);
  const dr = driverRate(known.reduce((t, p) => t + p.count, 0), known.map((p) => ({ drivers: p.drivers ?? null, minutes: p.min })));
  return {
    hours: ps.map(hourLabel), n: ps.length, field: s.field, ha: s.ha, prodMin: s.prodMin, pace: s.pace,
    drivers: withDrivers.length ? withDrivers.reduce((t, p) => t + p.drivers!, 0) / withDrivers.length : null,
    driverRate: dr.rate,
  };
}

// Every hour counts: there is no minimum. Active = wholly inside a pass; clear = wholly outside every pass and after a
// pass ended; transition = an hour that holds a start or an end (counted in neither); before = ahead of the first start.
export function hhAnalysis(periods: Period[], passes: HhPass[], breaks: string[]): HhAnalysis | null {
  if (!passes.length) return null;
  const act: Period[] = [], clr: Period[] = [], tra: Period[] = [], bef: Period[] = [];
  for (const p of periods) {
    const a = (p.day - 1) * DAY + parseHM(p.start)!;
    const z = (p.day - 1) * DAY + (preBreak(p.start, breaks) ?? parseHM(p.start)! + 60);
    const span = passes.map((q) => ({ s: q.start.abs, e: q.endAbs ?? Infinity }));
    if (span.some((q) => a >= q.s && z <= q.e)) act.push(p);
    else if (span.some((q) => a < q.e && z > q.s)) tra.push(p);
    else if (span.some((q) => q.e !== Infinity && a >= q.e)) clr.push(p);
    else bef.push(p);
  }
  const active = group(act), clear = group(clr);
  const num = (x: number | null, unit = '') => (x == null ? 'unknown' : `${r0(x)}${unit}`);
  const hrs = (g: HhGroup) => `${g.n} h`;
  const lines: string[] = [];
  if (!active.n || !clear.n) {
    lines.push(`H/H active: ${active.n ? `H.A. ${num(active.ha)} (${hrs(active)}), Pace ${num(active.pace, '/hr')}` : 'no whole hours yet'}.`);
    lines.push(`After H/H cleared: ${clear.n ? `H.A. ${num(clear.ha)} (${hrs(clear)}), Pace ${num(clear.pace, '/hr')}` : 'none yet'}. No comparison until both have hours.`);
  } else {
    lines.push(`H.A. ${num(active.ha)} with H/H active (${hrs(active)}) and ${num(clear.ha)} after it cleared (${hrs(clear)}). Pace ${num(active.pace, '/hr')} and ${num(clear.pace, '/hr')}.`);
    lines.push(`Drivers on cars averaged ${num(active.drivers)} and ${num(clear.drivers)}; vehicles per driver per hour ${active.driverRate == null ? 'unknown' : active.driverRate.toFixed(1)} and ${clear.driverRate == null ? 'unknown' : clear.driverRate.toFixed(1)}.`);
    lines.push('Observed, not proven: consistent with H/H clearing. The driver change and anything else that changed are also possible contributors.');
  }
  if (tra.length) lines.push(`Hours holding an H/H start or end, counted in neither: ${tra.map(hourLabel).join(', ')}.`);
  if (bef.length) lines.push(`Hours before H/H started, not compared: ${bef.map(hourLabel).join(', ')}.`);
  return { active, clear, transition: tra.map(hourLabel), before: bef.map(hourLabel), lines };
}
