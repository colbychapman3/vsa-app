// Vessel complete (Colby, 2026-10-08; spec phase-7k). Completion is Colby's mark, never automatic. These are the open items that
// stop a clean close; each can still be overridden with a reason. Display-only: the numbers come from the engine's state.
import type { State } from '../storage/store.ts';

const n = (x: number) => x.toLocaleString('en-US');

export type Blocker = { text: string; go: 'decks' | 'hourly' | 'snap' };

export function completeBlockers(s: State): Blocker[] {
  const b: Blocker[] = [];
  if (s.vesselRemaining == null) b.push({ text: `Vessel remaining is unknown: add a count for ${s.missingDecks.join(', ')}.`, go: 'decks' });
  else if (s.vesselRemaining > 0) b.push({ text: `${n(s.vesselRemaining)} autos still remaining on the vessel.`, go: 'decks' });
  if (s.field > s.start) b.push({ text: `Field count exceeds starting cargo by ${n(s.field - s.start)}.`, go: 'hourly' });
  const v = s.variance;
  if (v != null && v > 0) b.push({ text: `Ship is ${n(v)} ahead of field.`, go: 'hourly' });
  if (v != null && v < 0) b.push({ text: `Field exceeds ship by ${n(-v)}.`, go: 'decks' });
  for (const br of s.brands) {
    if (br.variance == null || br.variance === 0) continue;
    b.push({ text: `${br.name}: field ${br.variance < 0 ? 'exceeds' : 'is short of'} cleared by ${n(Math.abs(br.variance))}.`, go: 'hourly' });
  }
  const open = s.issues.filter((i) => i.status === 'open').length;
  if (open) b.push({ text: `${open} open issue${open === 1 ? '' : 's'}.`, go: 'snap' });
  return b;
}

export const isComplete = (s: State) => s.completed != null;

// The prompt is due when remaining is exactly 0 and Colby has not marked the vessel.
export const completionDue = (s: State) => s.vesselRemaining === 0 && !isComplete(s);

// A clean close whose remaining count later moved off 0: the mark no longer holds until Colby reopens or re-confirms.
export const completionStale = (s: State) => !!s.completed && !s.completed.override && s.vesselRemaining !== 0;
// Reports print COMPLETE only for a mark that still holds. Remaining 0 alone is "ready to close", never COMPLETE.
export function completeLine(s: State): { interim: boolean; text: string } {
  const c = s.completed;
  if (c && !completionStale(s)) return { interim: false, text: c.override ? `COMPLETE: closed with ${c.blockers.length} open item${c.blockers.length === 1 ? '' : 's'}. ${c.blockers.join(' ')} Reason: ${c.reason}` : 'COMPLETE' };
  return { interim: true, text: s.vesselRemaining === 0 ? 'INTERIM: ready to close, not confirmed' : 'INTERIM: the vessel is not complete' };
}
