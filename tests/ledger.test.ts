import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledger, currentDrivers, checkNotOver, type LedgerInput } from '../src/engine/ledger.ts';
import { deckCalc, type DeckState } from '../src/engine/decks.ts';
import { buildPeriods, type HourEntry } from '../src/engine/production.ts';
import type { Baseline, Deck } from '../src/engine/baseline.ts';
import { loadTracker } from './tracker.ts';

const glovis: Baseline = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const BREAKS = ['12:00', '18:00'];

// Tracker demo shift (vsa-live.html demoData): decks and hourly counts.
const DEMO_DECKS: Record<string, DeckState> = {
  UPP: { status: 'complete' }, D12: { status: 'complete' }, D8: { status: 'complete' }, D6: { status: 'complete' },
  D5: { status: 'complete' }, D4: { status: 'complete' }, D2: { status: 'complete' },
  D1: { status: 'active', hatchRemaining: { H3: 0, H2: 30 } },
  D9: { status: 'active', hatchRemaining: { H4: 24, H3: 123, H2: 103, H1: 69 } },
  D7: { status: 'notStarted', skipped: true },
};
const DEMO_HOURS: HourEntry[] = [
  { day: 1, start: '08:00', count: 253, brands: { Hyundai: 200, Kia: 53 }, drivers: 70 },
  { day: 1, start: '09:00', count: 266, brands: { Hyundai: 216, Kia: 50 }, drivers: 70 },
  { day: 1, start: '10:00', count: 225, brands: { Hyundai: 171, Kia: 54 }, drivers: 68 },
  { day: 1, start: '11:00', count: 186, brands: { Hyundai: 120, Kia: 66 }, drivers: 68, stopMin: 45 },
  { day: 1, start: '13:00', count: 248, drivers: 68 },
  { day: 1, start: '14:00', count: 241, drivers: 70 },
];

function engine(decks: Record<string, DeckState>, hours: HourEntry[], phase: LedgerInput['phase'] = 'working', b: Baseline = glovis) {
  const periods = buildPeriods(hours, b.breaks);
  return ledger({
    decks: b.decks.map((d) => deckCalc(d, decks[d.id])),
    periods,
    phase,
    drivers: currentDrivers(periods, b.labor),
  });
}
function tracker(decks: Record<string, DeckState>, hours: HourEntry[]) {
  const t = loadTracker();
  t.S.baseline = glovis;
  t.S.decks = plain(decks);
  t.S.hourly = Object.fromEntries(hours.map((h) => [`p${h.start.replace(':', '')}`, plain(h)]));
  return plain(t.compute());
}
function assertParity(decks: Record<string, DeckState>, hours: HourEntry[]) {
  const want = tracker(decks, hours), got = engine(decks, hours);
  assert.equal(got.start, want.start);
  assert.equal(got.vesselRemaining, want.vRem);
  assert.equal(got.progress, want.progress);
  assert.deepEqual(got.missingDecks, want.missing);
  assert.equal(got.field, want.field);
  assert.equal(got.fieldBalance, want.fieldBal);
  assert.equal(got.variance, want.transit);  // tracker "transit" is the signed ship − field gap
  assert.deepEqual(got.drivers, want.drivers);
  assert.deepEqual(
    got.brands.map((b) => [b.name, b.start, b.remaining, b.field, b.fieldExact, b.cleared, b.variance == null ? null : 0 - b.variance]),
    want.brands.map((b: any) => [b.name, b.start, b.rem, b.field, b.fieldExact, b.cleared, b.diff]),
  );
}

test('parity: ledger matches the tracker on its demo shift', () => {
  assertParity(DEMO_DECKS, DEMO_HOURS);
});

test('parity: Active deck with no count → vessel remaining unknown, deck listed', () => {
  assertParity({ ...DEMO_DECKS, D9: { status: 'active' } }, DEMO_HOURS);
  const r = engine({ ...DEMO_DECKS, D9: { status: 'active' } }, DEMO_HOURS);
  assert.equal(r.vesselRemaining, null);
  assert.deepEqual(r.missingDecks, ['D9']);
  assert.equal(r.fieldBalance, 1969 - 1419);
});

test('parity: start of shift and brand-split hours only', () => {
  assertParity({}, []);
  assertParity({ D12: { status: 'active', hatchRemaining: { H4: 0, H3: 100, H2: 143, H1: 72 } } }, DEMO_HOURS.slice(0, 2));
});

// A one-deck, one-brand TEST vessel with the kit's numbers.
const TEST_A: Baseline = { vessel: 'TEST-A', date: '2026-09-23', start: '08:00', breaks: BREAKS, destinations: [],
  decks: [{ id: 'D1', label: 'D1', hatches: [{ h: 'H1', items: [{ brand: 'TEST', qty: 1000 }] }] } as Deck] };
const hours = (...counts: number[]): HourEntry[] => counts.map((count, i) => ({ day: 1, start: `${String(8 + i).padStart(2, '0')}:00`, count }));

test('T4: 10:00 — 360 remaining, 64.0%, 30 in transit, no alarm; lunch — same 30 flagged', () => {
  const work = engine({ D1: { status: 'active', hatchRemaining: { H1: 360 } } }, hours(300, 310), 'working', TEST_A);
  assert.equal(work.vesselRemaining, 360);
  assert.equal(work.percentComplete, 64);
  assert.equal(work.inTransit, 30);
  assert.equal(work.reconciliation.status, 'monitor');
  const lunch = engine({ D1: { status: 'paused', hatchRemaining: { H1: 360 } } }, hours(300, 310), 'break', TEST_A);
  assert.equal(lunch.reconciliation.status, 'warning');
  assert.equal(lunch.reconciliation.message, 'Break reconciliation: ship is 30 ahead of field. No cars should be in transit at break.');
  assert.equal(lunch.reconciliation.countsMatch, false);
});

test('B08: field only → 390 field balance; vessel remaining unknown', () => {
  const r = engine({ D1: { status: 'active' } }, hours(300, 310), 'working', TEST_A);
  assert.equal(r.fieldBalance, 390);
  assert.equal(r.vesselRemaining, null);
  assert.equal(r.percentComplete, null);
  assert.equal(r.inTransit, null);
});

test('B09: cars complete is autos physical completion only; 5 unresolved', () => {
  const r = engine({ D1: { status: 'complete' } }, hours(500, 495), 'shift_end', TEST_A);
  assert.equal(r.vesselRemaining, 0);
  assert.equal(r.autosPhysicallyComplete, true);
  assert.equal(r.variance, 5);
  assert.equal(r.reconciliation.status, 'warning');
  assert.equal(r.reconciliation.countsMatch, false);
  assert.match(r.completionScope, /Autos physical completion only/);
  assert.match(r.completionScope, /H&H, load-back and lashing/);
});

test('B13: field ahead of vessel → variance −10, mismatch, in transit not established', () => {
  const work = engine({ D1: { status: 'active', hatchRemaining: { H1: 510 } } }, hours(250, 250), 'working', TEST_A);
  assert.equal(work.variance, -10);
  assert.equal(work.inTransit, null);
  assert.equal(work.progress, 490);                       // not changed to match field
  assert.equal(work.reconciliation.status, 'monitor');   // during work: a note, not an alarm
  assert.deepEqual(work.reconciliation.notes, ['Field is 10 ahead of ship progress. Recheck deck counts.']);
  const brk = engine({ D1: { status: 'paused', hatchRemaining: { H1: 510 } } }, hours(250, 250), 'break', TEST_A);
  assert.equal(brk.reconciliation.status, 'alarm');
  assert.equal(brk.reconciliation.message, 'Break reconciliation: field exceeds ship by 10. These should match at break.');
});

test('during work: gap above the driver count is noted, not alarmed', () => {
  const r = ledger({ decks: [deckCalc(TEST_A.decks[0], { status: 'active', hatchRemaining: { H1: 300 } })], periods: buildPeriods(hours(300, 310), BREAKS), phase: 'working', drivers: { n: 70, src: 'labor order' } });
  assert.equal(r.inTransit, 90);
  assert.deepEqual(r.reconciliation.notes, ['In transit 90 is more than 70 drivers (labor order). Recheck counts.']);
});

test('break: match is green; waiting on deck counts lists the decks', () => {
  const split = hours(300, 310).map((h) => ({ ...h, brands: { TEST: h.count } }));
  const m = engine({ D1: { status: 'paused', hatchRemaining: { H1: 390 } } }, split, 'break', TEST_A);
  assert.equal(m.reconciliation.status, 'match');
  assert.equal(m.reconciliation.countsMatch, true);
  // Without a brand split the by-brand match can't be confirmed, so counts don't "match" yet.
  const noSplit = engine({ D1: { status: 'paused', hatchRemaining: { H1: 390 } } }, hours(300, 310), 'break', TEST_A);
  assert.equal(noSplit.reconciliation.status, 'match');
  assert.equal(noSplit.reconciliation.countsMatch, false);
  const w = engine({ D1: { status: 'paused' } }, hours(300, 310), 'shift_end', TEST_A);
  assert.equal(w.reconciliation.status, 'waiting');
  assert.equal(w.reconciliation.message, 'End-of-shift reconciliation waiting on deck counts: add a remaining count for D1.');
});

test('break by brand: ship ahead = warning, field ahead = alarm; unsplit hours → unknown', () => {
  // UPP (Kia 199) done; D9 (Hyundai 398) done. Field: Kia 200 (1 over), Hyundai 390 (8 in transit).
  const decks = { UPP: { status: 'complete' }, D9: { status: 'complete' } } as Record<string, DeckState>;
  const h: HourEntry[] = [{ day: 1, start: '08:00', count: 590, brands: { Kia: 200, Hyundai: 390 } }];
  const r = engine(decks, h, 'break');
  const byName = Object.fromEntries(r.brands.map((b) => [b.name, b]));
  assert.deepEqual([byName.Kia.variance, byName.Kia.status], [-1, 'alarm']);
  assert.deepEqual([byName.Hyundai.variance, byName.Hyundai.status], [8, 'warning']);
  assert.equal(r.variance, 7);  // overall 597 − 590, yet brands still flagged separately
  const unsplit = engine(decks, [{ day: 1, start: '08:00', count: 590 }], 'break');
  assert.ok(unsplit.brands.every((b) => b.status === 'unknown'));
});

test('clerk count is a cross-check at breaks, never the source of vessel remaining', () => {
  const base = { decks: [deckCalc(TEST_A.decks[0], { status: 'paused', hatchRemaining: { H1: 390 } })], periods: buildPeriods(hours(300, 310), BREAKS), phase: 'break' as const, drivers: null };
  assert.deepEqual(ledger({ ...base, clerk: { remaining: 390, time: '12:05' } }).clerk, { remaining: 390, time: '12:05', status: 'match', message: 'Matches chief clerk (12:05): 390.' });
  const off = ledger({ ...base, clerk: { remaining: 400, time: '12:05' } });
  assert.equal(off.vesselRemaining, 390);
  assert.equal(off.clerk?.status, 'mismatch');
  assert.equal(off.clerk?.message, 'Discrepancy: 10 autos. Chief clerk 12:05: 400 · Yours: 390.');
  const unknown = ledger({ ...base, decks: [deckCalc(TEST_A.decks[0], { status: 'paused' })], clerk: { remaining: 400, time: '12:05' } });
  assert.equal(unknown.clerk?.status, 'unknown');
});

test('B24 / impossible values: rejected with the exact overage, never clamped', () => {
  assert.deepEqual(checkNotOver('Cleared', 1005, 'starting cargo', 1000), { ok: false, error: 'Cleared (1,005) exceeds starting cargo (1,000) by 5. Check the count.' });
  assert.equal(checkNotOver('Cleared', 1000, 'starting cargo', 1000), null);
  const r = engine({ D1: { status: 'active', hatchRemaining: { H1: 0 } } }, hours(600, 410), 'working', TEST_A);
  assert.equal(r.fieldOverStart, 'Field count exceeds starting cargo by 10. Field 1,010 · Starting 1,000. Check hourly entries.');
});

test('starting 0 → percent not applicable (B21)', () => {
  const empty: Baseline = { ...TEST_A, decks: [{ id: 'D1', label: 'D1', hatches: [] }] };
  const r = engine({}, [], 'working', empty);
  assert.equal(r.start, 0);
  assert.equal(r.percentComplete, null);
  assert.equal(r.percentNote, 'No cargo in scope; percent complete not applicable.');
});
