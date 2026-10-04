// Deck-level brand split (Phase 7b / spec 6e): the game plan gives a deck's total by brand and which hatches
// hold cargo, never a count per hatch. Hatch counts are then unknown (null), never 0 and never split by guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckCalc, deckUpdate } from '../src/engine/decks.ts';
import { validateBaseline, type Baseline, type Deck } from '../src/engine/baseline.ts';

const d10: Deck = { id: 'D10', label: 'D10', cargo: [{ brand: 'BMW', qty: 475 }, { brand: 'LR', qty: 24 }, { brand: 'MB', qty: 53 }, { brand: 'POV', qty: 4 }],
  hatches: ['H4', 'H3', 'H2', 'H1'].map((h) => ({ h, items: [] })) };
const d4: Deck = { id: 'D4', label: 'D4', cargo: [{ brand: 'MB', qty: 84 }], hatches: [{ h: 'H3', items: [] }, { h: 'H2', items: [] }] };
const base = (decks: Deck[]): Baseline => ({ vessel: 'Hector Highway 10A', date: '9/27/2026', start: '08:00', breaks: ['12:00', '18:00'], destinations: [], decks });

test('baseline: starting cargo and brand totals come from the deck split', () => {
  const r = validateBaseline(base([d10, d4]));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.ok && r.start, 640);
  assert.deepEqual(r.ok && r.brandStart, { BMW: 475, LR: 24, MB: 137, POV: 4 });
});

test('baseline: a deck cannot carry both a deck split and hatch counts; split counts must be whole numbers', () => {
  const both: Deck = { ...d4, hatches: [{ h: 'H3', items: [{ brand: 'MB', qty: 40 }] }, { h: 'H2', items: [] }] };
  const r = validateBaseline(base([both]));
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.errors.join(' ') : '', /D4 has a deck brand split and hatch counts/);
  const bad = validateBaseline(base([{ ...d4, cargo: [{ brand: 'MB', qty: 8.5 }] }]));
  assert.match(!bad.ok ? bad.errors.join(' ') : '', /D4 MB quantity must be a whole number \(got 8\.5\)/);
});

test('deckCalc: not started → remaining is the deck start; hatch counts are unknown, never 0', () => {
  const r = deckCalc(d10, { status: 'notStarted' });
  assert.equal(r.start, 556);
  assert.equal(r.rem, 556);
  assert.deepEqual(r.hatches.map((h) => [h.h, h.qty, h.rem]), [['H4', null, null], ['H3', null, null], ['H2', null, null], ['H1', null, null]]);
  assert.deepEqual(r.brandStart, { BMW: 475, LR: 24, MB: 53, POV: 4 });
  assert.deepEqual(r.brandRem, { BMW: 475, LR: 24, MB: 53, POV: 4 });
});

test('deckCalc: complete → 0 everywhere; active with no count → unknown', () => {
  const c = deckCalc(d10, { status: 'complete' });
  assert.equal(c.rem, 0);
  assert.ok(c.hatches.every((h) => h.rem === 0));
  assert.deepEqual(c.brandRem, { BMW: 0, LR: 0, MB: 0, POV: 0 });
  assert.equal(deckCalc(d10, { status: 'active' }).rem, null);
});

test('deckCalc: multi-brand deck mid-work keeps brand remaining unknown (never split by guess); single brand follows the deck', () => {
  const a = deckCalc(d10, { status: 'active', hatchRemaining: { H4: 100, H3: 100, H2: 100, H1: 100 } });
  assert.equal(a.rem, 400);
  assert.deepEqual(a.brandRem, { BMW: null, LR: null, MB: null, POV: null });
  const s = deckCalc(d4, { status: 'active', deckRemaining: 30 });
  assert.equal(s.rem, 30);
  assert.deepEqual(s.brandRem, { MB: 30 });
});

test('deckUpdate: a hatch count above the deck start is refused with the exact overage', () => {
  const r = deckUpdate(d4, { status: 'active', hatchRemaining: { H3: 90 } });
  assert.deepEqual(r, { ok: false, error: 'H3 exceeds D4’s 84 autos by 6. Check the count.' });
});

test('deckUpdate: when every hatch has a count, their sum above the deck start is refused with the overage', () => {
  const r = deckUpdate(d4, { status: 'active', hatchRemaining: { H3: 50, H2: 40 } });
  assert.deepEqual(r, { ok: false, error: 'Hatch counts add to 90, more than D4’s 84 autos by 6. Check the counts.' });
  const ok = deckUpdate(d4, { status: 'active', hatchRemaining: { H3: 50, H2: 30 } });
  assert.ok(!('ok' in ok));
});

test('deckUpdate: unknown hatch name is still refused; deck total rules unchanged', () => {
  assert.deepEqual(deckUpdate(d4, { status: 'active', hatchRemaining: { H1: 3 } }), { ok: false, error: 'D4 has no hatch H1.' });
  assert.deepEqual(deckUpdate(d4, { status: 'active', deckRemaining: 85 }), { ok: false, error: 'Deck total exceeds D4’s 84 autos by 1. Check the count.' });
});

test('review: a deck split with no hatches is refused (an Active deck would otherwise read 0 remaining)', () => {
  const r = validateBaseline(base([{ ...d4, hatches: [] }]));
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.errors.join(' ') : '', /D4 has a brand split but no hatches/);
});

test('review 5: hatch counts entered on part of a split deck are refused once they add up past the deck start', () => {
  const d2: Deck = { id: 'D2', label: 'D2', cargo: [{ brand: 'MB', qty: 130 }], hatches: [{ h: 'H3', items: [] }, { h: 'H2', items: [] }, { h: 'H1', items: [] }] };
  assert.deepEqual(deckUpdate(d2, { status: 'active', hatchRemaining: { H3: 120, H2: 120 } }),
    { ok: false, error: 'Hatch counts add to 240, more than D2’s 130 autos by 110. Check the counts.' });
  assert.ok(!('ok' in deckUpdate(d2, { status: 'active', hatchRemaining: { H3: 60, H2: 60 } })));
});
