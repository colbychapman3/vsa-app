import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBaseline, authoritativeAutos, type Baseline } from '../src/engine/baseline.ts';

const glovis: Baseline = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const clone = (): Baseline => JSON.parse(JSON.stringify(glovis));

test('Glovis Condor 101 baseline: 1,969 autos = 829 Kia + 1,140 Hyundai', () => {
  const r = validateBaseline(glovis);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.start, 1969);
  assert.deepEqual(r.brandStart, { Kia: 829, Hyundai: 1140 });
  assert.deepEqual(r.discrepancies, []);
});

test('baseline rejects bad quantities, duplicate ids and bad times with the exact place', () => {
  let b = clone(); b.decks[0].hatches[0].items[0].qty = 58.5;
  assert.match(errs(b), /Upper H4 Kia quantity must be a whole number/);
  b = clone(); b.decks[0].hatches[0].items[0].qty = -1;
  assert.match(errs(b), /Upper H4 Kia quantity must be a whole number/);
  b = clone(); b.decks[1].id = 'UPP';
  assert.match(errs(b), /Deck id UPP is used twice/);
  b = clone(); b.decks[1].hatches[1].h = 'H4';
  assert.match(errs(b), /D12 has hatch H4 twice/);
  b = clone(); b.breaks = ['12:00', 'noon'];
  assert.match(errs(b), /Break time "noon"/);
  b = clone(); b.start = '8am';
  assert.match(errs(b), /Start time "8am"/);
});

test('destination totals that differ from deck totals are kept as a discrepancy, not fixed', () => {
  const b = clone(); b.destinations[0].autos = 1970;
  const r = validateBaseline(b);
  assert.ok(r.ok);
  assert.equal(r.start, 1969);
  assert.deepEqual(r.discrepancies, ['Destination totals say 1,970 autos but the decks add to 1,969 (difference 1).']);
});

test('T3: load list controls over game plan; H&H separate; discrepancy kept', () => {
  const r = authoritativeAutos({ loadList: { autos: 535, hh: 11 }, gamePlan: { autos: 536, deckSplit: [102, 136, 298] } });
  assert.equal(r.autos, 535);
  assert.equal(r.source, 'load_list');
  assert.equal(r.hh, 11);
  assert.deepEqual(r.discrepancies, [
    'Game plan says 536 autos; load list says 535 (difference 1). Load list controls.',
    'Game plan deck split adds to 536, not 535. Deck allocation needs reconciliation.',
  ]);
});

test('Colby can override the load list; the discrepancy stays visible', () => {
  const r = authoritativeAutos({ loadList: { autos: 535 }, gamePlan: { autos: 536 }, override: 'game_plan' });
  assert.equal(r.autos, 536);
  assert.equal(r.source, 'game_plan_override');
  assert.equal(r.discrepancies.length, 1);
});

test('missing load list: game plan used but labeled; nothing at all → unknown', () => {
  assert.deepEqual(authoritativeAutos({ gamePlan: { autos: 536 } }).source, 'game_plan');
  const none = authoritativeAutos({});
  assert.equal(none.autos, null);
  assert.equal(none.source, 'unknown');
});

function errs(b: Baseline): string {
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  return r.ok ? '' : r.errors.join('\n');
}
