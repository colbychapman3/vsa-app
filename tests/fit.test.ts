import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heightFit as rawFit, manifestCoverage, SOP_P28, type FitResult } from '../src/engine/fit.ts';

// Valid inputs must never be rejected; narrow to the result for the checks below.
function heightFit(input: Parameters<typeof rawFit>[0]): FitResult {
  const r = rawFit(input);
  assert.ok('result' in r, JSON.stringify(r));
  return r;
}

test('T2: Stow H unreadable → not verified; width is never used as height', () => {
  // A Stow W value in the input is ignored: there is no width field to read.
  const input = { cargo: 'passenger_car', stowH_cm: null, deck_cm: 210, stowW_cm: 216 } as const;
  const r = heightFit(input);
  assert.equal(r.result, 'not_verified');
  assert.ok(r.result === 'not_verified' && r.missing.includes('Stow H'));
  assert.ok(r.result === 'not_verified' && r.missing.includes('route clear height'));
});

test('B16: SOP p.28 thresholds — 8 cm at ≤220, 10 cm above 220', () => {
  const a = heightFit({ cargo: 'passenger_car', deck_cm: 220, stowH_cm: 212 });
  assert.deepEqual([a.result, a.result !== 'not_verified' && a.required_cm, a.result !== 'not_verified' && a.margin_cm], ['pass', 8, 0]);
  const b = heightFit({ cargo: 'passenger_car', deck_cm: 221, stowH_cm: 212 });
  assert.deepEqual([b.result, b.result !== 'not_verified' && b.required_cm, b.result !== 'not_verified' && b.margin_cm], ['fail', 10, -1]);
  const c = heightFit({ cargo: 'passenger_car', deck_cm: 210, stowH_cm: 203 });
  assert.deepEqual([c.result, c.result !== 'not_verified' && c.required_cm, c.result !== 'not_verified' && c.margin_cm], ['fail', 8, -1]);
  assert.ok(a.result === 'pass' && a.rule === SOP_P28);
  assert.ok(a.result === 'pass' && a.note.includes('Route clear height not checked'));
});

test('B16: route clear height lower than the deck is the limit', () => {
  const r = heightFit({ cargo: 'passenger_car', deck_cm: 230, route_cm: 215, stowH_cm: 205 });
  assert.ok(r.result === 'pass' && r.required_cm === 10 && r.available_cm === 10 && r.margin_cm === 0);
  assert.ok(r.result === 'pass' && !r.note.includes('not checked'));
});

test('B16: SOP p.28 does not clear H&H', () => {
  const r = heightFit({ cargo: 'hh', deck_cm: 450, stowH_cm: 300, route_cm: 450 });
  assert.equal(r.result, 'not_verified');
  assert.ok(r.result === 'not_verified' && /passenger cars only/.test(r.note));
});

test('fit rejects impossible heights instead of guessing', () => {
  assert.deepEqual(rawFit({ cargo: 'passenger_car', deck_cm: 0, stowH_cm: 150 }), { ok: false, error: 'Deck height must be a positive number of cm.' });
  assert.deepEqual(rawFit({ cargo: 'passenger_car', deck_cm: 210, stowH_cm: -5 }), { ok: false, error: 'Stow H must be a positive number of cm.' });
});

test('B17: partial manifest verifies only the inspected units', () => {
  assert.deepEqual(manifestCoverage({ authoritative: 535, inspected: 415, inspectedFit: 415 }), {
    verified: 415, failed: 0, uninspected: 120, fullyVerified: false,
    message: '415 of 535 verified by height; 120 not inspected.',
  });
  assert.equal(manifestCoverage({ authoritative: 535, inspected: 535, inspectedFit: 535 }).fullyVerified, true);
  assert.equal(manifestCoverage({ authoritative: 535, inspected: 535, inspectedFit: 530 }).fullyVerified, false);
  assert.deepEqual(manifestCoverage({ authoritative: 535, inspected: 540, inspectedFit: 540 }), { ok: false, error: 'Inspected (540) exceeds the authoritative load (535) by 5. Check the count.' });
});
