// "Send update" (assistant step 1, Colby 2026-10-12): the message the superintendent asks for, built from the state and handed to
// Messages through the share sheet. Display-only: every figure comes from the engine. Forecasts say FORECAST; unknown says unknown.
import { formatHM, parseHM, type Baseline } from '../engine/index.ts';
import type { State } from '../storage/store.ts';
import { paceWatch } from './whatif.ts';

const n = (x: number) => x.toLocaleString('en-US');
const clock = (abs: number) => `${formatHM(abs % 1440)}${abs >= 1440 ? ` (Day ${Math.floor(abs / 1440) + 1})` : ''}`;

export function updateMessage(s: State, b: Baseline, nowMin: number, isTest: boolean): string {
  const L: string[] = [];
  L.push(`${isTest ? 'TEST · ' : ''}${s.vessel} update, as of ${formatHM(nowMin)}`);
  L.push(`Autos counted in the field: ${n(s.field)} of ${n(s.start)}`);
  L.push(s.vesselRemaining == null ? `Vessel remaining: unknown until ${s.missingDecks.join(', ')} ${s.missingDecks.length === 1 ? 'is' : 'are'} counted (field balance ${n(s.fieldBalance ?? s.start - s.field)})` : `Vessel remaining: ${n(s.vesselRemaining)}`);
  if (s.vesselRemaining === 0) L.push(s.completed ? 'Vessel marked complete.' : 'Discharge at 0: ready to close, not confirmed.');
  else L.push(s.steady.etaAbs != null ? `Finish: FORECAST ${clock(s.steady.etaAbs)}` : 'Finish: not forecast yet (needs a logged hour with its pace)');
  if (s.ops.phase === 'break') L.push(`On break since ${s.ops.breakStart ?? 'time not provided'}.`);
  else if (s.ops.phase === 'shift_end') L.push(`Shift ended${s.ops.shiftEnd ? ` at ${s.ops.shiftEnd}` : ''}.`);
  else if (s.vesselRemaining !== 0) {
    const brk = b.breaks.map((x) => parseHM(x)).filter((x): x is number => x != null).find((x) => x > nowMin);
    if (brk == null) L.push('No scheduled break left today.');
    else {
      const sides = new Set(b.destinations.map((d) => d.side));
      const cut = [sides.has('N') && `Northside cars stop ${formatHM(brk - 15)}`, sides.has('S') && `Southside ${formatHM(brk - 30)}`].filter(Boolean).join(', ');
      L.push(`Next break ${formatHM(brk)}${cut ? `: ${cut}` : ''}.`);
      const watch = paceWatch(s, b, nowMin);
      L.push(watch.length ? `FORECAST: ${watch.join(' ')}` : s.production.pace == null ? 'Break outlook: no pace yet.' : 'Break outlook: active decks on pace to clear by the cutoff (FORECAST).');
    }
  }
  L.push('Autos only; H&H is counted separately.');
  return L.join('\n');
}
