// Phase 6c: VIN candidates from recognized text, AI proposal checks (nothing the text doesn't show), and the
// photo-import merge into Setup. Pure; no camera, no model. The Glovis Condor 101 baseline is a TEST fixture only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vinCandidates } from '../src/engine/scan.ts';
import { checkNoteTidy, checkSetupProposal, type SetupProposal } from '../src/engine/proposal.ts';
import { buildBaseline, deckFromDraft, groupAllocations, mergeProposal, noteLines, type Drafts } from '../src/app/setup.ts';
import { glovis } from './scenarios.ts';

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

const SOURCE = `LOAD LIST  GLOVIS CONDOR 101  9/21/2026  Berth 2
Upper  H4 Kia 58  H3 Kia 106  H2 Kia 35
Discharge to Zone 3: Kia, Hyundai total 1,969`;

test('proposal: values in the text pass; invented counts, names and hatches are dropped with a reason', () => {
  const r = checkSetupProposal(JSON.stringify({
    vessel: 'Glovis Condor 101', date: '9/21/2026', berth: '2', port: 'Brunswick', extra: 'x',
    destinations: [{ name: 'Zone 3', brand: 'Kia', autos: 1969 }, { name: 'Zone 9', autos: 5 }],
    decks: [{ label: 'Upper', hatches: [{ h: 'H4', items: [{ brand: 'Kia', qty: 58 }, { brand: 'Kia', qty: 59 }] }, { h: 'H5', items: [] }] },
      { label: 'Deck 12', hatches: [] }],
  }), SOURCE)!;
  assert.deepEqual(r.value, {
    vessel: 'Glovis Condor 101', date: '9/21/2026', berth: '2',
    destinations: [{ name: 'Zone 3', brand: 'Kia', autos: 1969 }],
    decks: [{ label: 'Upper', hatches: [{ h: 'H4', items: [{ brand: 'Kia', qty: 58 }] }] }],
  });
  assert.deepEqual(r.dropped, [
    'port "Brunswick" is not in the text.', 'Destination "Zone 9" is not in the text.',
    'Upper H4: 59 Kia is not in the text.', 'Upper: hatch "H5" is not H1–H4 and is not in the text.', 'Deck "Deck 12" is not in the text.',
  ]);
});

test('proposal: malformed or non-object output = no proposal; a partial word is not a match', () => {
  assert.equal(checkSetupProposal('{not json', SOURCE), null);
  assert.equal(checkSetupProposal('[1,2]', SOURCE), null);
  assert.deepEqual(checkSetupProposal({ vessel: 'Condor' }, 'CONDORS ONLY')!.dropped, ['vessel "Condor" is not in the text.']);
});

test('note tidy: rewording passes; a new number or VIN-like code means no proposal', () => {
  assert.equal(checkNoteTidy('Scratch on rear bumper, Deck 9 H3, VIN 1HGCM82633A004352.', 'scratch rear bumper d9 h3 vin 1HGCM82633A004352')!.value,
    'Scratch on rear bumper, Deck 9 H3, VIN 1HGCM82633A004352.');
  assert.equal(checkNoteTidy('VIN 1HGCM82633A004353', 'vin 1HGCM82633A004352'), null, 'a changed VIN is a new code');
  assert.deepEqual(checkNoteTidy('Scratch on the rear bumper at H3.', 'scratch rear bumper h3')!.value, 'Scratch on the rear bumper at H3.');
  assert.equal(checkNoteTidy('Scratch on rear bumper, 2 cars.', 'scratch rear bumper'), null);
  assert.equal(checkNoteTidy('', 'x'), null);
});

const empty = (): Drafts => ({ v: { vessel: '', date: '', port: '', berth: '' }, allocs: [{ brand: '', autos: '', destination: '' }], decks: [] });

test('merge: fills only empty fields, names what it filled, resolves aliases, leaves unknowns to Colby', () => {
  const d = empty();
  d.v.vessel = 'Typed name';
  const r = mergeProposal(d, { vessel: 'Other', date: '9/21/2026', berth: 'Berth 2', destinations: [{ name: 'MB Field', autos: 10 }, { name: 'Lot 99' }] });
  assert.equal(r.drafts.v.vessel, 'Typed name');
  assert.equal(r.drafts.v.berth, '2');
  assert.deepEqual(r.filled, ['date', 'berth', 'destinations']);
  assert.deepEqual(r.drafts.allocs, [{ brand: '', autos: '10', destination: 'MBZ (Mercedes)' }, { brand: '', autos: '', destination: '' }]);
  assert.deepEqual(r.unplaced, ['Destination "Lot 99" is not in the terminal list: choose it.']);
  assert.deepEqual(mergeProposal(empty(), { berth: '7' }).unplaced, ['Berth "7" is not Berth 1, 2 or 3.']);
});

test('merge: an impossible proposed hatch is still refused by buildBaseline with the exact overage', () => {
  const r = mergeProposal(empty(), { decks: [{ label: 'Upper', hatches: [{ h: 'H4', items: [{ brand: 'Kia', qty: 58 }] }] }] });
  const deck = deckFromDraft({ ...r.drafts.decks[0], total: '50' });
  assert.deepEqual(deck.errors, ['Upper: deck total 50 but the hatches add to 58.']);
});

test('Glovis Condor 101: a proposal read from its own paperwork round-trips to the verified totals', () => {
  // Paperwork text rendered from the baseline, as text recognition would hand it over.
  const text = [`${glovis.vessel} ${glovis.date} Berth ${glovis.berth}`, ...glovis.decks.map((d: { label: string; hatches: { h: string; items: { brand: string; qty: number }[] }[] }) =>
    `${d.label} ${d.hatches.map((h) => `${h.h} ${h.items.map((i) => `${i.brand} ${i.qty}`).join(' ')}`).join(' ')}`)].join('\n');
  const proposal: SetupProposal = { vessel: glovis.vessel, date: glovis.date, berth: String(glovis.berth), decks: glovis.decks.map((d: SetupProposal['decks'] & object) => d) };
  const checked = checkSetupProposal(proposal, text)!;
  assert.deepEqual(checked.dropped, []);
  const { drafts } = mergeProposal(empty(), checked.value);
  const decks = drafts.decks.map((d) => { const r = deckFromDraft(d); assert.deepEqual(r.errors, []); return r.deck; });
  const built = buildBaseline({ ...drafts.v, isTest: true, start: '08:00', drivers: null, sources: ['Photo import (1 page)'], destinations: groupAllocations([]).destinations, decks });
  assert.ok(built.ok, JSON.stringify(built));
  assert.equal(built.total, 1969);
  const brands: Record<string, number> = {};
  for (const d of glovis.decks) for (const h of d.hatches) for (const i of h.items) brands[i.brand] = (brands[i.brand] ?? 0) + i.qty;
  assert.deepEqual(built.brandStart, brands);
});

test('note lines: sentences offered once, cargo rows and short labels skipped', () => {
  assert.deepEqual(noteLines('Upper H4 Kia 58 H3 Kia 106\nDo not stack  trucks on D6 ramp\nBERTH 2\nDo not stack trucks on D6 ramp\nGang starts at Zone 3 first'),
    ['Do not stack trucks on D6 ramp', 'Gang starts at Zone 3 first']);
});
