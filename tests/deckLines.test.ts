import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDeckLines } from '../src/app/deckLines.ts';
import { mergeGamePlan } from '../src/app/setup.ts';

// Real input: the start of Colby's pasted game plan summary for Hera Highway 13A (2026-10-12), as far as his screenshot shows.
const HERA = `STARTING AUTOS: 1,352 | H&H: 51 | SHEET TOTAL: 1,403

DECK > HATCH > BRAND > QTY > DESTINATION
DK12 H4: 53 BMW, 99 MB = 152 > BMW Field, MBZ
DK12 H3: 15 BMW, 51 MB = 66 > BMW Field, MBZ
DK12 H2: 84 MB = 84 > MBZ
DK12 H1: 124 MB, 7 POV = 131 > MBZ, Site 4
DK9 H4: 129 BMW > BMW Field
DK9 H3: 110 BMW > BMW Field
DK9 H2: 57 BMW, 7 MAS, 1 LR = 65 > BMW Field, Site 3, Zone 1
DK7 H4: 49 MB > MBZ`;

test('deck lines: decks in printed order, brands summed per deck and destination, hatches H4 → H1', () => {
  const r = readDeckLines(HERA);
  assert.ok(r.ok);
  const p = r.plan;
  assert.deepEqual(p.autos.map((a) => [a.deck, a.amount, a.hatches]), [['12', 433, ['H4', 'H3', 'H2', 'H1']], ['9', 304, ['H4', 'H3', 'H2']], ['7', 49, ['H4']]]);
  assert.deepEqual(p.autos[0].split, [{ brand: 'BMW', qty: 68 }, { brand: 'MB', qty: 358 }, { brand: 'POV', qty: 7 }]);
  assert.deepEqual(p.autos[1].pairs, [{ brand: 'BMW', yard: 'BMW Field' }, { brand: 'MAS', yard: 'Site 3' }, { brand: 'LR', yard: 'Zone 1' }]);
  // H&H stays its own number, never added to the autos.
  assert.equal(p.hhTotal, 51);
  assert.equal(p.autosTotal, 1352);
  // The excerpt is only part of the ship: the gap is reported with the exact difference, nothing is changed.
  assert.match(p.problems.join(' '), /add to 786 autos; STARTING AUTOS says 1,352 \(difference 566\)/);
});

test('deck lines: a line whose brands miss its total is reported, not fixed; destinations that do not line up are left to pick', () => {
  const r = readDeckLines('DK5 H4: 50 BMW, 10 MB = 61 > BMW Field, MBZ\nDK5 H3: 5 BMW, 5 MB, 5 POV > MBZ, Site 4');
  assert.ok(r.ok);
  assert.match(r.plan.problems[0], /DK5 H4: the brands add to 60, the line says 61 \(difference 1\)/);
  assert.match(r.plan.problems[1], /DK5 H3: 3 brands but 2 destinations/);
  assert.equal(r.plan.autos[0].amount, 75);
  assert.equal(r.plan.autos[0].pairs, null);
});

test('deck lines: text with no deck lines is refused with an example', () => {
  const r = readDeckLines('{"vessel": "x"}');
  assert.ok(!r.ok);
  assert.match(r.error, /DK12 H4/);
});

test('deck lines open the normal Review drafts (same path as a game plan photo)', () => {
  const r = readDeckLines(HERA);
  assert.ok(r.ok);
  const m = mergeGamePlan({ v: { vessel: '', date: '', port: '', drivers: '' }, allocs: [{ brand: '', autos: '', destination: '' }], decks: [] }, r.plan);
  assert.deepEqual(m.drafts.decks.map((d) => [d.label, d.total]), [['D12', '433'], ['D9', '304'], ['D7', '49']]);
  assert.ok(m.drafts.allocs.some((a) => a.brand === 'MB' && a.destination === 'MBZ (Mercedes)' && a.autos === '407'));
});
