import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glovis } from './scenarios.ts';
import { buildBaseline, importBaseline, type SetupForm } from '../src/app/setup.ts';

const form = (over: Partial<SetupForm> = {}): SetupForm => ({
  vessel: glovis.vessel, date: glovis.date, port: glovis.port, berth: String(glovis.berth), sources: glovis.sources, isTest: true,
  start: glovis.start, drivers: glovis.labor.autoDrivers,
  destinations: glovis.destinations, decks: glovis.decks.map((d: any) => ({ label: d.label, heights: d.heights, hatches: d.hatches })),
  ...over,
});

test('typed setup rebuilds the Glovis Condor 101 baseline: 1,969 autos (829 Kia / 1,140 Hyundai)', () => {
  const r = buildBaseline(form());
  assert.ok(r.ok);
  assert.equal(r.total, 1969);
  assert.deepEqual(r.brandStart, { Kia: 829, Hyundai: 1140 });
  assert.equal(r.operationId, 'TEST-GLOVIS-CONDOR-101-20260921');
  const b = r.baseline as any;
  for (const k of ['vessel', 'date', 'start', 'breaks', 'sources', 'destinations']) assert.deepEqual(b[k], glovis[k], k);
  assert.equal(b.labor.autoDrivers, 70);
  // deck ids are generated from labels (the reference uses hand-made ids for Upper)
  assert.deepEqual(b.decks.map((d: any) => d.hatches), glovis.decks.map((d: any) => d.hatches));
  assert.deepEqual(r.discrepancies, []);
});

test('import: the reference file round-trips unchanged', () => {
  const r = importBaseline(JSON.stringify(glovis), true);
  assert.ok(r.ok);
  assert.deepEqual(r.baseline, glovis);
  assert.equal(r.total, 1969);
});

test('import refuses bad input with exact messages', () => {
  const bad = (t: string) => { const r = importBaseline(t, false); assert.ok(!r.ok); return r.errors; };
  assert.deepEqual(bad('{nope'), ['This is not readable JSON. Nothing was loaded.']);
  assert.deepEqual(bad('[]'), ['This is not a vessel baseline (expected a JSON object).']);
  const neg = structuredClone(glovis); neg.decks[0].hatches[0].items[0].qty = -3;
  assert.deepEqual(bad(JSON.stringify(neg)), ['Upper H4 Kia quantity must be a whole number (got -3).']);
  const frac = structuredClone(glovis); frac.decks[0].hatches[0].items[0].qty = 2.5;
  assert.deepEqual(bad(JSON.stringify(frac)), ['Upper H4 Kia quantity must be a whole number (got 2.5).']);
  const dup = structuredClone(glovis); dup.decks[0].hatches.push({ h: 'H4', items: [] });
  assert.deepEqual(bad(JSON.stringify(dup)), ['Upper has hatch H4 twice.']);
  assert.deepEqual(bad(JSON.stringify({ ...glovis, vessel: undefined })), ['Baseline is missing "vessel".']);
});

test('destination total vs decks mismatch is kept as a discrepancy, not adjusted', () => {
  const f = form({ destinations: [{ name: 'Zone 3', autos: 2000 }] });
  const r = buildBaseline(f);
  assert.ok(r.ok);
  assert.equal(r.total, 1969);
  assert.equal(r.discrepancies.length, 1);
  assert.match(r.discrepancies[0], /2,000 autos but the decks add to 1,969 \(difference 31\)/);
});

test('destination sides and clear-by defaults; unknown zone needs a side', () => {
  const r = buildBaseline(form({ destinations: [{ name: 'Zone 3' }, { name: 'MB Field' }, { name: 'Zone T' }, { name: 'Lot Q' }] }));
  assert.ok(!r.ok);
  assert.deepEqual(r.errors, ['Destination "Lot Q" is not a known zone: choose Northside or Southside.']);
  const ok = buildBaseline(form({ destinations: [{ name: 'Zone 3' }, { name: 'MB Field' }, { name: 'Lot Q', side: 'S', clearBy: 20 }] }));
  assert.ok(ok.ok);
  assert.deepEqual(ok.baseline.destinations.map((d) => [d.side, d.clearBy]), [['N', 15], ['S', 30], ['S', 20]]);
});

test('setup refuses: no name, bad date/start, no decks, two current heights; warns on a low deck', () => {
  const r = buildBaseline(form({ vessel: ' ', date: '13/40/2026', start: '25:00', decks: [] }));
  assert.ok(!r.ok);
  assert.deepEqual(r.errors, ['The vessel needs a name.', 'Add at least one deck.', 'Date "13/40/2026" is not a date (use M/D/YYYY).', 'Start time "25:00" is not a valid HH:MM time.']);
  const two = buildBaseline(form({ decks: [{ label: 'D1', heights: [{ m: 2, current: true }, { m: 1.7, current: true }], hatches: [] }] }));
  assert.ok(!two.ok);
  assert.deepEqual(two.errors, ['D1: mark exactly one height as the current one.']);
  const low = buildBaseline(form({ decks: [{ label: 'D1', heights: [{ m: 1.7, current: true }], hatches: [{ h: 'H4', items: [{ brand: 'Kia', qty: 5 }] }] }] }));
  assert.ok(low.ok);
  assert.equal(low.warnings.length, 1);
  assert.match(low.warnings[0], /D1 is set to 1\.70 m, below 1\.85 m/);
});

test('LIVE ids never start with TEST-; TEST ids always do', () => {
  const live = buildBaseline(form({ isTest: false }));
  assert.ok(live.ok && !live.operationId.startsWith('TEST-'));
});

import { deckFromDraft, emptyDeck } from '../src/app/setup.ts';

test('deck drafts: text becomes a deck; blanks are dropped; half-filled lines are refused', () => {
  const d = emptyDeck();
  Object.assign(d, { label: 'D9', heights: '2.00, 1.70', current: '2' });
  d.hatches[0].items[0] = { brand: 'Kia', qty: '58' };
  const r = deckFromDraft(d);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.deck.heights, [{ m: 2, current: true }, { m: 1.7, current: false }]);
  assert.deepEqual(r.deck.hatches, [{ h: 'H4', items: [{ brand: 'Kia', qty: 58 }] }, { h: 'H3', items: [] }, { h: 'H2', items: [] }, { h: 'H1', items: [] }]);
  const bad = emptyDeck();
  Object.assign(bad, { label: 'D1', heights: '2.0, 1.7', current: '' });
  bad.hatches[0].items[0] = { brand: 'Kia', qty: '' };
  bad.hatches[1].items[0] = { brand: '', qty: '4' };
  assert.deepEqual(deckFromDraft(bad).errors, ['D1: the current height must be one of the listed heights.', 'D1 H4: Kia needs a quantity.', 'D1 H3: a quantity needs a brand.']);
});

test('review fixes: zero cargo, wrong breaks, bad destination, NaN miles, empty slug are refused', () => {
  const zero = structuredClone(glovis); zero.decks.forEach((d: any) => d.hatches.forEach((h: any) => { h.items = []; }));
  const errs = (b: unknown) => { const r = importBaseline(JSON.stringify(b), true); assert.ok(!r.ok); return r.errors; };
  assert.deepEqual(errs(zero), ['Starting cargo is 0. Add at least one quantity.']);
  assert.deepEqual(errs({ ...glovis, breaks: ['10:00'] }), ['Breaks must be 12:00 and 18:00 (fixed by protocol).']);
  assert.deepEqual(errs({ ...glovis, destinations: [{ ...glovis.destinations[0], side: 'X' }] }), ['Destination "Zone 3": side must be "N" or "S".']);
  assert.deepEqual(errs({ ...glovis, vessel: '***' }), ['The vessel name needs at least one letter or number.']);
  const mi = buildBaseline(form({ destinations: [{ name: 'Zone 3', mi: NaN }] }));
  assert.ok(!mi.ok);
  assert.deepEqual(mi.errors, ['Destination "Zone 3": miles must be a number, 0 or more.']);
});
