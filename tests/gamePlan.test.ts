// Game plan reader (spec docs/specs/phase-6e-game-plan-reader.md) on Colby's real Hector Highway 10A cover page.
// Fixture: word positions read from docs/reference/game-plan-example-hector-highway-10a/7-working-plan-game-plan-form.jpg
// by the Windows text reader. That reader missed a few cells the phone may read; the "complete" copy adds exactly
// those cells (as printed on the paper) to check the full result, and damaged copies check every refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '../src/app/layout.ts';
import { complete, form, load } from './gamePlanFixture.ts';
import { NOT_A_GAME_PLAN, parseHatches, parseSplit, readGamePlan, readGamePlanPages, yardName, type GamePlan } from '../src/app/gamePlan.ts';

const clone = (p: Page): Page => JSON.parse(JSON.stringify(p));
const ok = (p: Page): GamePlan => { const r = readGamePlan(p); assert.ok(r.ok, r.ok ? '' : r.error); return (r as { plan: GamePlan }).plan; };
const row = (g: GamePlan, deck: string) => g.autos.find((r) => r.deck === deck)!;
const splitText = (g: GamePlan, deck: string) => row(g, deck).split?.map((i) => `${i.qty} ${i.brand}`).join(', ') ?? null;

test('complete cover page: exactly the spec table (decks in printed order, splits, hatches, yards, totals, H/H, note)', () => {
  const g = ok(complete());
  assert.equal(g.vessel, 'HECTOR HIGHWAY IOA'); // read as printed by this reader; Colby checks the name
  assert.equal(g.date, '9/27/2026');
  assert.equal(g.port, 'SSI');
  assert.equal(g.drivers, null);
  assert.deepEqual(g.autos.map((r) => r.deck), ['10', '11', '12', '4', '3', '2', '1']);
  assert.deepEqual(g.autos.map((r) => r.amount), [556, 94, 538, 84, 48, 130, 128]);
  assert.equal(splitText(g, '10'), '475 BMW, 24 LR, 53 MB, 4 POV');
  assert.equal(splitText(g, '11'), '35 BMW, 58 MAS, 1 POV');
  assert.equal(splitText(g, '12'), '56 BMW, 482 MB');
  assert.equal(splitText(g, '4'), '84 MB');
  assert.equal(splitText(g, '3'), '48 MB');
  assert.equal(splitText(g, '2'), '130 MB');
  assert.equal(splitText(g, '1'), '123 MB, 5 POV');
  assert.deepEqual(row(g, '10').hatches, ['H4', 'H3', 'H2', 'H1']);
  assert.deepEqual(row(g, '11').hatches, ['H2', 'H1']);
  assert.deepEqual(row(g, '4').hatches, ['H3', 'H2']);
  assert.deepEqual(row(g, '1').hatches, ['H3', 'H2', 'H1']);
  assert.deepEqual(row(g, '10').pairs, [{ brand: 'BMW', yard: 'BMW' }, { brand: 'LR', yard: 'ZONE 1' }, { brand: 'MB', yard: 'MBZ' }, { brand: 'POV', yard: 'AVP' }]);
  assert.deepEqual(row(g, '11').pairs?.map((p) => p.yard), ['BMW', 'SITE 3', 'AVP']);
  assert.equal(g.autosTotal, 1578);
  const brands: Record<string, number> = {};
  for (const r of g.autos) for (const i of r.split!) brands[i.brand] = (brands[i.brand] ?? 0) + i.qty;
  assert.deepEqual(brands, { BMW: 566, LR: 24, MB: 920, POV: 10, MAS: 58 });
  assert.deepEqual(g.hh.map((h) => [h.deck, h.amount]), [['5', 33], ['3', 14]]);
  assert.equal(g.hhTotal, 47);
  assert.deepEqual(g.notes, ["2 PORSCHE POV'S DISCHARGE DIRECTLY TO WAREHOUSE 2 DO NOT PUT ON DOCK OR FIELD"]);
  assert.deepEqual(g.problems, []);
});

test('the real read as it came back: every value read is right, every miss is reported, nothing is guessed', () => {
  const g = ok(form());
  assert.deepEqual(g.autos.map((r) => r.amount), [556, 94, 538, 84, 48, null, null]);
  assert.equal(splitText(g, '2'), null);
  assert.equal(splitText(g, '1'), null); // 123 MB / 5 POV was read but its AMOUNT was not, and the TOTAL can't confirm it
  assert.equal(row(g, '10').hatches, null);
  assert.ok(g.problems.includes('Deck 10: hatch list not read. Choose the hatches.'));
  assert.ok(g.problems.includes('Game plan TOTAL says 1,578; the rows read add to 1,448 (difference 130), with 1 row not read.'));
  assert.ok(g.problems.some((p) => p.startsWith('Deck 1: AMOUNT not read')));
});

test('a split whose AMOUNT was not read is filled only when all rows match the printed TOTAL', () => {
  const p = complete();
  p.words = p.words.filter((w) => !(w.t === '128' && w.x === 152)); // deck 1 amount unreadable again
  const g = ok(p);
  assert.equal(row(g, '1').amount, 128); // 123 MB + 5 POV, confirmed by TOTAL 1,578
  assert.equal(splitText(g, '1'), '123 MB, 5 POV');
  assert.deepEqual(g.problems, []);
});

test('split ≠ amount: refused with the exact difference; the split is left empty, the deck and amount stay', () => {
  const p = complete();
  p.words.find((w) => w.t === '475')!.t = '465';
  const g = ok(p);
  assert.equal(row(g, '10').amount, 556);
  assert.equal(row(g, '10').split, null);
  assert.ok(g.problems.includes('Deck 10: the split adds to 546 but AMOUNT says 556 (difference 10). Type the split.'));
});

test('rows ≠ printed TOTAL: reported with the difference', () => {
  const p = complete();
  p.words.find((w) => w.t === '1578')!.t = '1588';
  const g = ok(p);
  assert.ok(g.problems.includes('Game plan TOTAL says 1,588; the rows read add to 1,578 (difference 10).'));
});

test('a tilted photo (3°) reads the same', () => {
  const p = complete();
  const a = (3 * Math.PI) / 180, cx = p.width / 2, cy = p.height / 2;
  p.words = p.words.map((w) => {
    const x = w.x + w.w / 2 - cx, y = w.y + w.h / 2 - cy;
    return { ...w, x: Math.round(cx + x * Math.cos(a) - y * Math.sin(a) - w.w / 2), y: Math.round(cy + x * Math.sin(a) + y * Math.cos(a) - w.h / 2) };
  });
  const g = ok(p);
  assert.deepEqual(g.autos.map((r) => r.amount), [556, 94, 538, 84, 48, 130, 128]);
  assert.equal(splitText(g, '10'), '475 BMW, 24 LR, 53 MB, 4 POV');
  assert.deepEqual(g.problems, []);
});

test('yards ≠ brands on a row: nothing paired for that row, and it says so', () => {
  const p = complete();
  p.words = p.words.filter((w) => !(w.t === 'AVP' && w.x === 1384)); // deck 11 yard list loses "AVP"
  const g = ok(p);
  assert.equal(row(g, '11').pairs, null);
  assert.ok(g.problems.includes('Deck 11: 3 brands but 2 yards; destinations not paired. Choose them.'));
});

test('not the cover page (no AMOUNT / DECK / HATCH header): nothing is read', () => {
  assert.deepEqual(readGamePlan(load('5-discharge-summary-table')), { ok: false, error: NOT_A_GAME_PLAN });
  const p = form();
  p.words = p.words.filter((w) => !/^(AMOUNT|HATCH)$/.test(w.t));
  assert.deepEqual(readGamePlan(p), { ok: false, error: NOT_A_GAME_PLAN });
});

test('several photos: the cover page is found among them; the others are named as not read', () => {
  const r = readGamePlanPages([load('8-kline-stow-plan-decks-12-to-9'), complete(), load('5-discharge-summary-table')]);
  assert.ok(r.ok);
  assert.equal(r.ok && r.page, 1);
  assert.deepEqual(r.ok && r.plan.problems, ['Only photo 2 was read (the game plan cover page); 2 other photos were not read.']);
  assert.deepEqual(readGamePlanPages([load('5-discharge-summary-table')]), { ok: false, error: NOT_A_GAME_PLAN });
});

test('hatch text: * may come back as x, ×, ·, a comma or a space; only 1-4, each once', () => {
  for (const t of ['1*2*3*4', '1x2x3x4', '1×2×3×4', '1·2·3·4', '1, 2, 3, 4', '1 2 3 4']) assert.deepEqual(parseHatches(t).hatches, ['H4', 'H3', 'H2', 'H1'], t);
  assert.deepEqual(parseHatches('2*3').hatches, ['H3', 'H2']);
  assert.equal(parseHatches('1*2*2').hatches, null);
  assert.equal(parseHatches('1*5').hatches, null);
  assert.equal(parseHatches('ALL').hatches, null);
  assert.equal(parseHatches('').reason, 'hatch list not read');
});

test('cargo split: counts with brands, a bare brand takes the whole amount, anything else is not a split', () => {
  assert.deepEqual(parseSplit('475 BMW/ 24 L.R/ 53 MB/ 4 pov', 556).split, [{ brand: 'BMW', qty: 475 }, { brand: 'LR', qty: 24 }, { brand: 'MB', qty: 53 }, { brand: 'POV', qty: 4 }]);
  assert.deepEqual(parseSplit('MB', 84).split, [{ brand: 'MB', qty: 84 }]);
  assert.equal(parseSplit('MB', null).split, null);
  assert.equal(parseSplit('24 BUSES/ 5 STATIC/ CB', 33).split, null);
  assert.equal(parseSplit('', 10).reason, 'cargo not read');
});

test('yard names map to the terminal list; unknown stays unmapped', () => {
  assert.equal(yardName('BMW'), 'BMW Field');
  assert.equal(yardName('ZONE 1'), 'Zone 1 (MB Field)');
  assert.equal(yardName('MBZ'), 'MBZ (Mercedes)');
  assert.equal(yardName('MB Field'), 'MBZ (Mercedes)');
  assert.equal(yardName('AVP'), 'AVP Yard');
  assert.equal(yardName('SITE 3'), 'Site 3');
  assert.equal(yardName('Zone T'), 'Zone T');
  assert.equal(yardName('Warehouse 2'), null);
});

test('review: a text-only line far from any row is reported, never merged into another deck', () => {
  const p = complete();
  p.words = p.words.filter((w) => !((w.t === '130' && w.x === 155) || (w.t === 'SSI' && w.x === 296 && w.y > 940 && w.y < 990) || (w.t === '2' && w.x === 955)));
  const g = ok(p);
  assert.equal(splitText(g, '3'), '48 MB');
  assert.deepEqual(row(g, '3').yards, ['MBZ']);
  assert.ok(g.problems.some((x) => x.startsWith('Line not placed in a row')), g.problems.join('\n'));
  assert.equal(parseSplit('MB MB', 48).split, null);
});

test('review: a missing H/H header is reported, and H/H rows are never offered as notes', () => {
  const p = complete();
  const second = p.words.filter((w) => w.t === 'AMOUNT').sort((a, b) => b.y - a.y)[0];
  p.words = p.words.filter((w) => !(Math.abs(w.y - second.y) < 20 && /^(AMOUNT|PORT|DISC|CARGO|DISCRIPTION|DECK|HATCH|YARD)$/.test(w.t)));
  const g = ok(p);
  assert.deepEqual(g.hh, []);
  assert.ok(g.problems.includes('The DISCHARGE H/H table was not found.'), g.problems.join('\n'));
  assert.deepEqual(g.notes, ["2 PORSCHE POV'S DISCHARGE DIRECTLY TO WAREHOUSE 2 DO NOT PUT ON DOCK OR FIELD"]);
});

test('review: with one table header and an unreadable title, nothing is filled as autos (H/H never lands in autos)', () => {
  const p = complete();
  const first = p.words.filter((w) => w.t === 'AMOUNT').sort((a, b) => a.y - b.y)[0];
  p.words = p.words.filter((w) => !(Math.abs(w.y - first.y) < 20 && /^(AMOUNT|PORT|DISC|CARGO|DISCRIPTION|DECK|HATCH|YARD)$/.test(w.t)));
  p.words.find((w) => w.t === 'WH')!.t = 'HIH?';
  const g = ok(p);
  assert.ok(!g.autos.some((r) => r.deck === '5'), JSON.stringify(g.autos.map((r) => r.deck)));
  assert.ok(g.problems.includes("The DISCHARGE AUTO'S table was not found."));
});

test('review: header extras are kept apart from the notes area (only notes-area lines start ticked)', () => {
  const p = complete();
  const lasher = p.words.find((w) => w.t === 'LASHER:')!;
  p.words.push({ t: 'J.SMITH', x: 290, y: lasher.y, w: 110, h: lasher.h });
  const g = ok(p);
  assert.deepEqual(g.extras, ['Lasher: J.SMITH']);
  assert.deepEqual(g.notes, ["2 PORSCHE POV'S DISCHARGE DIRECTLY TO WAREHOUSE 2 DO NOT PUT ON DOCK OR FIELD"]);
});

test('review: two rows with unread AMOUNTs are never trusted from the TOTAL (their errors could cancel out)', () => {
  const p = complete();
  p.words = p.words.filter((w) => !((w.t === '128' && w.x === 152) || (w.t === '94' && w.x === 157)));
  const g = ok(p);
  assert.equal(row(g, '1').split, null);
  assert.equal(row(g, '11').split, null);
});

test('review 2: H/H header and TOTAL both missed: its rows are never offered as notes', () => {
  const p = complete();
  const second = p.words.filter((w) => w.t === 'AMOUNT').sort((a, b) => b.y - a.y)[0];
  p.words = p.words.filter((w) => !(Math.abs(w.y - second.y) < 20 && /^(AMOUNT|PORT|DISC|CARGO|DISCRIPTION|DECK|HATCH|YARD)$/.test(w.t)) && w.t !== '47' && !(w.t === 'TOTAL' && w.y > 1300));
  const g = ok(p);
  assert.ok(g.problems.includes('The DISCHARGE H/H table was not found.'));
  assert.deepEqual(g.notes, []);
});

test('review 3: H/H TOTAL missed: reported; no H/H row is made from the notes; notes are not guessed', () => {
  const p = complete();
  p.words = p.words.filter((w) => !(w.t === '47' || (w.t === 'TOTAL' && w.y > 1300)));
  const g = ok(p);
  assert.deepEqual(g.hh.map((h) => [h.deck, h.amount]), [['5', 33], ['3', 14]]);
  assert.ok(g.problems.includes('The H/H TOTAL was not read.'), g.problems.join('\n'));
  assert.ok(g.problems.some((x) => x.startsWith('The notes below the tables could not be placed')), g.problems.join('\n'));
  assert.deepEqual(g.notes, []);
});

test('review 3: autos TOTAL and H/H header both missed: H/H rows never land in autos', () => {
  const p = complete();
  const second = p.words.filter((w) => w.t === 'AMOUNT').sort((a, b) => b.y - a.y)[0];
  p.words = p.words.filter((w) => !(Math.abs(w.y - second.y) < 20 && /^(AMOUNT|PORT|DISC|CARGO|DISCRIPTION|DECK|HATCH|YARD)$/.test(w.t)) && w.t !== '1578' && !(w.t === 'TOTAL' && w.y > 1100 && w.y < 1160));
  const g = ok(p);
  assert.deepEqual(g.autos.map((r) => r.deck), ['10', '11', '12', '4', '3', '2', '1']);
  assert.equal(g.autosTotal, null);
  assert.ok(g.problems.includes('The DISCHARGE H/H table was not found.'), g.problems.join('\n'));
});

test('review 4: an AMOUNT that is not a number is never filled from the split', () => {
  const p = complete();
  p.words.find((w) => w.t === '556')!.t = 'S56';
  const g = ok(p);
  assert.equal(row(g, '10').amount, null);
  assert.equal(row(g, '10').split, null);
  assert.ok(g.problems.includes('Deck 10: the amount "S56" is not a number. Type it.'));
});
