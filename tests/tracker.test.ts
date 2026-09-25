import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTracker } from './tracker.ts';

const glovis = JSON.parse(readFileSync(new URL('../docs/reference/glovis-condor-101-baseline.json', import.meta.url), 'utf8'));

test('tracker harness: deckCalc runs on the Glovis D12 deck', () => {
  const t = loadTracker();
  const d12 = glovis.decks.find((d: { id: string }) => d.id === 'D12');
  const r = t.deckCalc(d12, { status: 'notStarted' });
  assert.equal(r.start, 457);
  assert.equal(r.rem, 457);
  assert.deepEqual({ ...r.brandStart }, { Hyundai: 307, Kia: 150 });
});

test('tracker harness: compute runs on the full Glovis baseline', () => {
  const t = loadTracker();
  t.S.baseline = glovis;
  const m = t.compute();
  assert.equal(m.start, 1969);
  assert.equal(m.vRem, 1969);
  assert.equal(m.field, 0);
});
