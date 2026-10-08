// The history behind the forecast box: the ETA the app would have shown right after each logged hour, rebuilt from the log
// (nothing is stored, so it cannot disagree with the record). A correction made later is not applied to an earlier point:
// each point is the projection of the log as it stood then. Plus/minus lines state what changed and never a cause.
import { formatHM, project, type Baseline, type VsaEvent } from '../engine/index.ts';

export type EtaPoint = {
  hour: string;            // "HH:MM" start of the hour just logged
  day: number;
  count: number;           // what that hour counted
  etaAbs: number | null;   // minutes since Day 1 00:00; null = no forecast then (or nothing remained)
  rate: number | null;     // the per-hour pace the forecast then used
  deltaMin: number | null; // ETA change since the previous point (later = positive); null when either has no forecast
  text: string;            // the plus/minus line
};

const clock = (abs: number) => `${formatHM(abs % 1440)}${abs >= 1440 ? ` (Day ${Math.floor(abs / 1440) + 1})` : ''}`;

// Hours logged later than `max` ago are dropped from the front: the work is a projection per point, so it stays small.
export function etaHistory(baseline: Baseline, events: VsaEvent[], operationId: string, max = 48): EtaPoint[] {
  const cuts = events.map((e, i) => ({ e, i })).filter(({ e }) => e.event_type === 'observation' && e.payload.metric === 'field_units' && e.scope.commodity == null && typeof e.payload.value === 'number' && e.payload.period_start);
  const day1 = Date.parse(baseline.date) || (cuts.length ? Date.parse(cuts[0].e.payload.period_start!.slice(0, 10)) : 0);
  const raw = cuts.slice(-max).flatMap(({ e, i }) => {
    // The hour's own entries (total, brands, drivers, stop time) go in together: the total alone may not match its brand split.
    let end = i;
    while (end + 1 < events.length && events[end + 1].payload.period_start === e.payload.period_start) end++;
    const p = project(baseline, events.slice(0, end + 1), operationId);
    if (!p.ok) return [];
    const day = Math.round((Date.parse(e.payload.period_start!.slice(0, 10)) - day1) / 86400000) + 1;
    const done = p.vesselRemaining === 0;
    return [{ hour: e.payload.period_start!.slice(11, 16), day, count: e.payload.value as number, etaAbs: done ? null : p.eta.etaAbs, rate: done ? null : p.eta.rate }];
  });
  return raw.map((r, k): EtaPoint => {
    const prev = k > 0 ? raw[k - 1] : null;
    const deltaMin = prev && r.etaAbs != null && prev.etaAbs != null ? r.etaAbs - prev.etaAbs : null;
    const head = `After ${r.hour}${r.day > 1 ? ` (Day ${r.day})` : ''}:`;
    let text: string;
    if (r.etaAbs == null) text = `${head} no forecast yet.`;
    else if (deltaMin == null) text = `${head} ETA ${clock(r.etaAbs)}${prev ? ', no earlier forecast to compare.' : '.'}`;
    else {
      const move = deltaMin === 0 ? 'unchanged' : `${Math.abs(deltaMin)} min ${deltaMin > 0 ? 'later' : 'earlier'}`;
      const assumed = prev!.rate != null ? ` That hour counted ${r.count.toLocaleString('en-US')}; the previous forecast assumed ${Math.round(prev!.rate)} per hour.` : ` That hour counted ${r.count.toLocaleString('en-US')}.`;
      text = `${head} ETA ${clock(r.etaAbs)}, ${move}${deltaMin === 0 ? '' : ` than after ${prev!.hour}`}.${assumed}`;
    }
    return { ...r, deltaMin, text };
  });
}
