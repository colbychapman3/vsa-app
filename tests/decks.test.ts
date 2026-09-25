import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckCalc, deckUpdate, heightInfo, type DeckState } from '../src/engine/decks.ts';
import type { Baseline, Deck } from '../src/engine/baseline.ts';
import { loadTracker } from './tracker.ts';

const glovis: Baseline = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));
const deck = (id: string): Deck => glovis.decks.find((d) => d.id === id)!;
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// Deck states to run through both the tracker and the engine, per deck.
function statesFor(d: Deck): DeckState[] {
  const hs = d.hatches.map((h) => h.h);
  const qty = (h: string) => d.hatches.find((x) => x.h === h)!.items.reduce((s, i) => s + i.qty, 0);
  const allHalf = Object.fromEntries(hs.map((h) => [h, Math.floor(qty(h) / 2)]));
  const allDoneButFirst = Object.fromEntries(hs.map((h, i) => [h, i === 0 ? qty(h) : 0]));
  return [
    { status: 'notStarted' },
    { status: 'notStarted', skipped: true },
    { status: 'complete' },
    { status: 'unknown' },
    { status: 'active' },
    { status: 'active', hatchRemaining: { [hs[0]]: 1 } },
    { status: 'active', hatchRemaining: allHalf },
    { status: 'active', hatchRemaining: allDoneButFirst },
    { status: 'paused', deckRemaining: 5 },
    { status: 'paused', hatchRemaining: { [hs[0]]: 1 }, deckRemaining: 7 },
  ];
}

test('parity: deckCalc matches the tracker on every Glovis deck and status', () => {
  const t = loadTracker();
  let cases = 0;
  for (const d of glovis.decks) {
    for (const st of statesFor(d)) {
      const want = plain(t.deckCalc(d, plain(st)));
      const got = deckCalc(d, st);
      const label = `${d.id} ${JSON.stringify(st)}`;
      assert.equal(got.start, want.start, label);
      assert.equal(got.rem, want.rem, label);
      assert.deepEqual(got.hatches.map((h) => [h.h, h.qty, h.rem]), want.hatches.map((h: any) => [h.h, h.qty, h.rem]), label);
      assert.deepEqual(got.brandStart, want.brandStart, label);
      assert.deepEqual(got.brandRem, want.brandRem, label);
      cases++;
    }
  }
  assert.equal(cases, glovis.decks.length * 10);
});

test('Active deck with no count: remaining is unknown (null), not the start', () => {
  const r = deckCalc(deck('D9'), { status: 'active' });
  assert.equal(r.rem, null);
  assert.deepEqual(r.brandRem, { Hyundai: null });
});

test('mixed hatch part-done makes those brands unknown', () => {
  // D12 H2 = 65 Hyundai + 78 Kia; 100 left there can't be split by brand.
  const r = deckCalc(deck('D12'), { status: 'active', hatchRemaining: { H4: 0, H3: 0, H2: 100, H1: 0 } });
  assert.equal(r.rem, 100);
  assert.deepEqual(r.brandRem, { Hyundai: null, Kia: null });
});

test('deck updates reject impossible counts with the exact overage (never clamp)', () => {
  const d = deck('UPP'); // H4 58, H3 106, H2 35 = 199
  assert.deepEqual(deckUpdate(d, { status: 'active', hatchRemaining: { H3: 110 } }), { ok: false, error: 'H3 exceeds its 106 autos by 4. Check the count.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', hatchRemaining: { H3: -1 } }), { ok: false, error: 'H3 must be a whole number.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', hatchRemaining: { H3: 2.5 } }), { ok: false, error: 'H3 must be a whole number.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', hatchRemaining: { H9: 1 } }), { ok: false, error: 'Upper has no hatch H9.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', deckRemaining: 205 }), { ok: false, error: 'Deck total exceeds Upper’s 199 autos by 6. Check the count.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', hatchRemaining: { H4: 10, H3: 10, H2: 10 }, deckRemaining: 31 }), { ok: false, error: 'Hatch counts add to 30 but deck total says 31. Fix one.' });
  assert.deepEqual(deckUpdate(d, { status: 'active', skipped: true }), { ok: false, error: 'Only a Not started deck can be marked Skipped.' });
});

test('deck updates: Complete/Not started/Unknown drop counts; Complete → 0 remaining', () => {
  const d = deck('UPP');
  const u = deckUpdate(d, { status: 'complete', hatchRemaining: { H3: 5 }, deckRemaining: 5 });
  assert.ok(!('ok' in u));
  assert.deepEqual(u, { status: 'complete', skipped: false, hatchRemaining: {}, deckRemaining: null });
  assert.equal(deckCalc(d, u).rem, 0);
  const ok = deckUpdate(d, { status: 'active', hatchRemaining: { H3: 50 } });
  assert.deepEqual(ok, { status: 'active', skipped: false, hatchRemaining: { H3: 50 }, deckRemaining: null });
});

test('heights: 1.85 m van rule — hard below, soft when lowerable and unconfirmed', () => {
  assert.equal(heightInfo(deck('UPP')).level, 'ok');                 // 1.85 only
  assert.equal(heightInfo(deck('D9')).level, 'soft');                // 2.00 set, can go to 1.70
  assert.equal(heightInfo(deck('D9'), { m: 2.0 }).level, 'ok');      // confirmed
  assert.equal(heightInfo(deck('D9'), { m: 1.7 }).level, 'hard');    // confirmed low
  assert.equal(heightInfo(deck('D8')).level, 'ok');                  // 2.00, lowest 2.00
  assert.equal(heightInfo({ id: 'X', label: 'X', hatches: [] }).level, 'unknown');
  assert.equal(heightInfo({ id: 'X', label: 'X', heights: [{ m: 1.8, current: true }], hatches: [] }).level, 'hard');
});

test('parity: heights match the tracker on every Glovis deck, confirmed or not', () => {
  const t = loadTracker();
  t.S.baseline = glovis;
  t.S.decks = { D9: { status: 'notStarted', heightConfirmed: { m: 1.7 } }, D7: { status: 'notStarted', heightConfirmed: { m: 2.0 } } };
  const want = plain(t.compute().decks);
  for (const w of want) {
    const conf = t.S.decks[w.id]?.heightConfirmed ?? null;
    const got = heightInfo(deck(w.id), conf && { m: conf.m });
    assert.deepEqual([got.current, got.canLower, got.level, got.lowest], [w.hi.cur, w.hi.canLower, w.hi.level, w.hi.lowest], w.id);
  }
});

test('baseline hatch order is kept (H4 → H1)', () => {
  assert.deepEqual(deckCalc(deck('D12')).hatches.map((h) => h.h), ['H4', 'H3', 'H2', 'H1']);
  assert.deepEqual(deckCalc(deck('UPP')).hatches.map((h) => h.h), ['H4', 'H3', 'H2']);
});
