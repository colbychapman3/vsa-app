// Extra visible: the weight step never invents a font family, so missing fonts still fall back to the system font.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSun, sunFamilies } from '../src/app/sun.ts';

test('type steps up one weight when Extra visible is on', () => {
  const f = { display: 'D', displaySemi: 'DS', body: 'B', bodyMedium: 'BM', bodySemi: 'BS' };
  assert.deepEqual(sunFamilies(f), { display: 'D', displaySemi: 'DS', body: 'BM', bodyMedium: 'BS', bodySemi: 'BS' });
});

test('fonts that failed to load stay undefined (system font)', () => {
  const none = { display: undefined, displaySemi: undefined, body: undefined, bodyMedium: undefined, bodySemi: undefined };
  assert.deepEqual(sunFamilies(none), none);
});

test('the saved preference reads back; anything else is off', () => {
  assert.equal(asSun('1'), true);
  assert.equal(asSun('0'), false);
  assert.equal(asSun(null), false);
});
