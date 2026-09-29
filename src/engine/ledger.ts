// Autos ledger: vessel remaining, field balance, in transit, brand ledgers, and
// reconciliation (monitor during work; match / warning / alarm at breaks and shift end).
// Numbers match the VSA Live tracker's compute(); colors follow CLAUDE.md.
import type { DeckResult } from './decks.ts';
import type { Period } from './production.ts';
import type { Reject } from './time.ts';

export type Phase = 'working' | 'break' | 'shift_end';
export type RecStatus = 'monitor' | 'waiting' | 'match' | 'warning' | 'alarm';

export type LedgerInput = {
  decks: DeckResult[];
  periods: Period[];
  phase: Phase;
  drivers: { n: number; src: string } | null;
  clerk?: { remaining: number; time: string } | null; // chief clerk's count for this break, if logged
};

const n = (x: number) => x.toLocaleString('en-US');

export function checkNotOver(label: string, value: number, limitLabel: string, limit: number): Reject | null {
  return value > limit ? { ok: false, error: `${label} (${n(value)}) exceeds ${limitLabel} (${n(limit)}) by ${n(value - limit)}. Check the count.` } : null;
}

// Drivers now: the latest hour today with drivers (its own count or the day's setting),
// else today's workday setting, else the last logged count, else the labor order.
export function currentDrivers(periods: Period[], labor?: { autoDrivers?: number }, today?: { day: number; n: number } | null): { n: number; src: string } | null {
  for (let i = periods.length - 1; i >= 0; i--) {
    const p = periods[i], d = p.drivers;
    if (today && p.day < today.day) break; // today's setting is newer than any earlier day's count
    if (typeof d === 'number' && d > 0) return { n: d, src: p.driversFrom === 'day' ? `Day ${p.day} setting` : `logged ${p.start}` };
  }
  if (today) return { n: today.n, src: `Day ${today.day} setting` };
  return typeof labor?.autoDrivers === 'number' ? { n: labor.autoDrivers, src: 'labor order' } : null;
}

// Signed variance → status at a break or shift end. Ship ahead = warning, field ahead = alarm.
const atStop = (v: number | null): RecStatus => (v == null ? 'waiting' : v === 0 ? 'match' : v > 0 ? 'warning' : 'alarm');

export function ledger(input: LedgerInput) {
  const { decks, periods, phase, drivers, clerk } = input;
  const start = decks.reduce((s, d) => s + d.start, 0);
  const known = decks.every((d) => d.rem != null);
  const vesselRemaining = known ? decks.reduce((s, d) => s + d.rem!, 0) : null;
  const progress = vesselRemaining == null ? null : start - vesselRemaining;
  const missingDecks = decks.filter((d) => d.rem == null).map((d) => d.label);
  const field = periods.reduce((s, p) => s + p.count, 0);
  const fieldBalance = start - field;                      // NOT vessel remaining
  const variance = progress == null ? null : progress - field;
  const inTransit = variance != null && variance >= 0 ? variance : null; // never negative
  const percentComplete = progress != null && start > 0 ? (progress / start) * 100 : null;
  const percentFieldCounted = start > 0 ? (field / start) * 100 : null;

  // Brand ledgers.
  const bStart: Record<string, number> = {}, bRem: Record<string, number | null> = {}, order: string[] = [];
  for (const d of decks) for (const b of Object.keys(d.brandStart)) {
    if (!(b in bStart)) { bStart[b] = 0; bRem[b] = 0; order.push(b); }
    bStart[b] += d.brandStart[b];
    if (bRem[b] != null) bRem[b] = d.brandRem[b] == null ? null : bRem[b]! + d.brandRem[b]!;
  }
  const bField: Record<string, number> = {};
  let unsplit = 0;
  for (const p of periods) {
    if (p.brands) for (const [b, v] of Object.entries(p.brands)) bField[b] = (bField[b] ?? 0) + v;
    else unsplit += p.count;
  }
  const recon = phase !== 'working';
  const brands = order.map((name) => {
    const remaining = bRem[name];
    const cleared = remaining == null ? null : bStart[name] - remaining;
    const fieldExact = unsplit === 0;                       // otherwise brand field totals are minimums
    const bVar = fieldExact && cleared != null ? cleared - (bField[name] ?? 0) : null;
    return { name, start: bStart[name], remaining, cleared, field: bField[name] ?? 0, fieldExact, variance: bVar,
      status: (bVar == null ? 'unknown' : recon ? atStop(bVar) : 'monitor') as RecStatus | 'unknown' };
  });

  // Reconciliation.
  const label = phase === 'shift_end' ? 'End-of-shift' : 'Break';
  const when = phase === 'shift_end' ? 'at end of shift' : 'at break';
  const notes: string[] = [];
  let status: RecStatus = 'monitor', message: string | null = null;
  if (!recon) {
    if (variance != null && variance < 0) notes.push(`Field is ${n(-variance)} ahead of ship progress. Recheck deck counts.`);
    if (variance != null && drivers && variance > drivers.n) notes.push(`In transit ${n(variance)} is more than ${drivers.n} drivers (${drivers.src}). Recheck counts.`);
  } else {
    status = atStop(variance);
    message = variance == null ? `${label} reconciliation waiting on deck counts: add a remaining count for ${missingDecks.join(', ')}.`
      : variance === 0 ? `${label} reconciliation: ship and field match at ${n(field)}.`
      : variance > 0 ? `${label} reconciliation: ship is ${n(variance)} ahead of field. No cars should be in transit ${when}.`
      : `${label} reconciliation: field exceeds ship by ${n(-variance)}. These should match ${when}.`;
  }
  // Counts match only if overall and every brand match. This is never a full-operation reconciliation.
  const countsMatch = recon && status === 'match' && brands.every((b) => b.status === 'match');

  const clerkCheck = recon && clerk ? (vesselRemaining == null
    ? { ...clerk, status: 'unknown' as const, message: `Chief clerk at ${clerk.time}: ${n(clerk.remaining)}. Can’t compare until every active deck has a remaining count.` }
    : clerk.remaining === vesselRemaining
      ? { ...clerk, status: 'match' as const, message: `Matches chief clerk (${clerk.time}): ${n(clerk.remaining)}.` }
      : { ...clerk, status: 'mismatch' as const, message: `Discrepancy: ${n(Math.abs(clerk.remaining - vesselRemaining))} autos. Chief clerk ${clerk.time}: ${n(clerk.remaining)} · Yours: ${n(vesselRemaining)}.` })
    : null;

  return {
    start, vesselRemaining, progress, missingDecks, field, fieldBalance, variance, inTransit,
    percentComplete, percentFieldCounted,
    percentNote: start === 0 ? 'No cargo in scope; percent complete not applicable.' : null,
    brands, unsplit, drivers,
    reconciliation: { phase, status, message, notes, countsMatch },
    clerk: clerkCheck,
    fieldOverStart: field > start ? `Field count exceeds starting cargo by ${n(field - start)}. Field ${n(field)} · Starting ${n(start)}. Check hourly entries.` : null,
    autosPhysicallyComplete: vesselRemaining === 0 && start > 0,
    completionScope: 'Autos physical completion only. H&H, load-back and lashing are separate and stay unconfirmed here.',
  };
}
