// VIN candidates from recognized text and the note-tidy check (the model may reword, never add or drop a number). Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vinCandidates } from '../src/engine/scan.ts';
import { checkNoteTidy } from '../src/engine/proposal.ts';

const VIN = '1M8GDM9AXKP042788';
const VIN2 = '1HGCM82633A004352';

test('scan: VINs found in noisy text, duplicates collapsed, short/long runs and plain words ignored', () => {
  const text = `VIN: ${VIN}\nMFD 03/24 ${VIN2} ${VIN}\n1M8GDM9AXKP04278 1M8GDM9AXKP0427888 MANUFACTURERSLABEL`;
  assert.deepEqual(vinCandidates(text), [{ vin: VIN, warning: null }, { vin: VIN2, warning: null }]);
  assert.deepEqual(vinCandidates(''), []);
});

test('scan: I/O/Q is flagged unreadable, never corrected; bad check digit only warns', () => {
  const withO = 'IM8GDM9AXKP042788';
  const [c] = vinCandidates(withO.toLowerCase());
  assert.equal(c.vin, withO);
  assert.ok('unreadable' in c && /contains I/.test(c.unreadable));
  const bad = VIN.slice(0, 8) + '1' + VIN.slice(9);
  const [w] = vinCandidates(bad);
  assert.ok('warning' in w && /check digit/.test(w.warning ?? ''));
});

test('note tidy: rewording passes; a new number or VIN-like code means no proposal', () => {
  assert.equal(checkNoteTidy('Scratch on rear bumper, Deck 9 H3, VIN 1HGCM82633A004352.', 'scratch rear bumper d9 h3 vin 1HGCM82633A004352')!.value,
    'Scratch on rear bumper, Deck 9 H3, VIN 1HGCM82633A004352.');
  assert.equal(checkNoteTidy('VIN 1HGCM82633A004353', 'vin 1HGCM82633A004352'), null, 'a changed VIN is a new code');
  assert.deepEqual(checkNoteTidy('Scratch on the rear bumper at H3.', 'scratch rear bumper h3')!.value, 'Scratch on the rear bumper at H3.');
  assert.equal(checkNoteTidy('Scratch on rear bumper, 2 cars.', 'scratch rear bumper'), null);
  assert.equal(checkNoteTidy('Scratch on the rear bumper.', 'scratch rear bumper h3 vin 1HGCM82633A004352'), null, 'dropping facts is refused too');
  assert.equal(checkNoteTidy('', 'x'), null);
});
