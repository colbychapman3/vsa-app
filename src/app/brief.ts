// Full vessel brief (7d step 1), pure: built only from the same view models the screens use, so every total equals a screen's.
// Formulas and denominators sit beside each number. No VINs, ids, photos or the vessel name (the caller adds the name if asked).
import type { Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { completeLine } from './complete.ts';
import { decksView, hourlyView, planView, snapshot } from './view.ts';

export function vesselBrief(s: State, b: Baseline, nowMin: number): string[] {
  const snap = snapshot(s, b, nowMin), hv = hourlyView(s, b), dv = decksView(s), pv = planView(s, b);
  const out: string[] = [];
  const h = snap.hero;
  out.push(`- ${h.label === 'VESSEL REMAINING' ? 'Vessel remaining' : 'Field balance'}: ${h.value} ${h.of}${h.unknownNote ? ` (${h.unknownNote})` : ''}`);
  for (const r of h.rows) out.push(`  - ${r.k}: ${r.v}`);
  out.push('- Ledgers: autos, High & Heavy, load-back and lashing are separate. H&H is awareness only and never part of the auto counts.');
  out.push(`- Status: ${completeLine(s).text}`);
  out.push(`- Production [CALCULATED]: H.A. ${hv.stats.ha === '—' ? 'unknown' : `${hv.stats.ha}/hr`} (${hv.stats.haNote}); Pace ${hv.stats.pace === '—' ? 'unknown' : `${hv.stats.pace}/hr`} (${hv.stats.paceNote}). ${hv.paceLine ?? ''}`.trim());
  const e = snap.eta;
  out.push(`- ETA [FORECAST]: ${e.dashed ? `unknown (${e.notes[0] || 'not enough data'})` : `${e.value}${e.day ? ` (${e.day})` : ''}${e.notes.length ? `; ${e.notes.join('; ')}` : ''}`}. Never marked complete automatically.`);
  out.push(`- Breaks: ${b.breaks.join(' and ')}, 1 hour each. Clear-by before a break: Northside 15 min, Southside 30 min.`);
  if (s.brands.length) out.push(`- Brands (remaining of start; field vs cleared from ship): ${s.brands.map((x) => `${x.name} ${x.remaining ?? 'unknown'} of ${x.start}, field ${x.field}, cleared ${x.cleared ?? 'unknown'}`).join('; ')}`);
  out.push('- Decks:');
  for (const r of dv.rows) out.push(`  - ${r.label}: ${r.pill}, ${r.remaining === '—' ? 'remaining count needed' : `${r.remaining} of ${r.start} remaining`}; ${r.height.text}${r.cleared ? `; ${r.cleared}` : ''}`);
  out.push(`- Hourly field counts (the official record), ${hv.rows.length} hour${hv.rows.length === 1 ? '' : 's'}:`);
  for (const r of hv.rows) out.push(`  - ${r.dayHeader ? `${r.dayHeader} ` : ''}${r.range}: ${r.count}${r.short ? `, ${r.short}` : ''}${r.driversLine ? `, ${r.driversLine}` : ''}${r.corrected ? `, ${r.corrected}` : ''}`);
  if (hv.unsplitNote) out.push(`- ${hv.unsplitNote}`);
  out.push(`- Labor: ${pv.workday.map((d) => `${d.label} ${d.value}`).join('; ')}`);
  if (s.hh.passes.length) out.push(`- H/H timeline (awareness only): ${s.hh.text}`);
  if (pv.issues.open.length) out.push(`- Open issues: ${pv.issues.open.map((x) => x.text).join('; ')}`);
  return out;
}

// "Why" traces (7d step 2): inputs, formula and exclusions for each derived number, from the same state the screens read.
export type Trace = { key: 'remaining' | 'transit' | 'ha' | 'pace' | 'gap' | 'clearby'; title: string; lines: string[] };
const n = (x: number) => x.toLocaleString('en-US');
export function traces(s: State, b: Baseline): Trace[] {
  const p = s.production;
  return [
    { key: 'remaining', title: 'Vessel remaining', lines: s.vesselRemaining == null
      ? [`Unknown: no remaining count for ${s.missingDecks.join(', ')}. Field balance = starting ${n(s.start)} − field ${n(s.field)} = ${n(s.start - s.field)} (a different number; never mixed).`]
      : [`Starting ${n(s.start)} − confirmed deck progress ${n(s.progress!)} = ${n(s.vesselRemaining)}.`, 'Field counts are not part of this number.'] },
    { key: 'transit', title: 'In transit', lines: s.inTransit == null
      ? ['Unknown: needs every active deck counted, so ship progress is known.']
      : [`Ship progress ${n(s.progress!)} − field ${n(s.field)} = ${n(s.inTransit)}. It cannot be negative.`] },
    { key: 'gap', title: 'Gap between ship and field', lines: s.variance == null
      ? ['Unknown until every active deck has a count.']
      : [`Ship progress ${n(s.progress!)} vs field ${n(s.field)}: ${s.variance === 0 ? 'they match' : s.variance > 0 ? `ship is ${n(s.variance)} ahead` : `field is ${n(-s.variance)} ahead`}.`, 'Mid-work this is only watched; at a break or end of shift ship must equal field.'] },
    { key: 'ha', title: 'H.A. (hourly average)', lines: p.ha == null ? ['Unknown: no counted hours yet.'] : [`Field ${n(s.field)} ÷ ${p.countedHours} counted hour${p.countedHours === 1 ? '' : 's'} = ${n(Math.round(p.ha))}/hr.`, 'Every counted hour counts as a whole hour, including the short pre-break hour.'] },
    { key: 'pace', title: 'Pace', lines: p.pace == null ? ['Unknown: no productive time known (a short hour needs its stoppage time).'] : [`${n(p.prodCount)} autos in the hours with known minutes ÷ ${(p.prodMin / 60).toFixed(2)} productive hr = ${n(Math.round(p.pace))}/hr.`, 'Pre-break hours count only the minutes worked before stoppage.'] },
    { key: 'clearby', title: 'Clear-by', lines: [`Breaks at ${b.breaks.join(' and ')}, 1 hour each. Clear-by is a fixed time before the break: Northside 15 min, Southside 30 min (Appendix C).`, 'It is not computed from travel times, and it is applied once (a stop time you give is used as given).'] },
  ];
}
