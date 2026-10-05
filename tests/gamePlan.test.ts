// Game plan reader (spec docs/specs/phase-6e-game-plan-reader.md) on Colby's real Hector Highway 10A cover page.
// Fixture: word positions read from docs/reference/game-plan-example-hector-highway-10a/7-working-plan-game-plan-form.jpg
// by the Windows text reader. That reader missed a few cells the phone may read; the "complete" copy adds exactly
// those cells (as printed on the paper) to check the full result, and damaged copies check every refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addMissedNumerals, type Page } from '../src/app/layout.ts';
import { complete, form, load } from './gamePlanFixture.ts';
import { NOT_A_GAME_PLAN, parseHatches, parseSplit, readGamePlan, readGamePlanPages, solveSplits, yardName, type GamePlan } from '../src/app/gamePlan.ts';

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
  assert.ok(g.problems.includes('Deck 11: 3 brands but 2 yards (BMW, SITE 3); destinations not paired. Choose them.'));
});

// Colby's Pontus Highway V.13 cover page, as the phone's own text reader returned it (Share what was read, 2026-10-05).
// The phone dropped the deck digits of two rows (8 and 1); everything else on the page came back.
const phone = () => ok(load('pontus-highway-cover-phone'));
const splitOf = (r: GamePlan['autos'][number]) => r.split?.map((i) => `${i.qty} ${i.brand}`).join(', ') ?? null;

test('phone read of the Pontus Highway page: every row is kept, the autos TOTAL is the red subtotal, the brand line is read', () => {
  const g = phone();
  assert.equal(g.vessel, 'Pontus Highway V.13');
  assert.equal(g.date, '10/5/2026');
  assert.deepEqual(g.autos.map((r) => [r.deck, r.amount]), [['11', 557], [null, 438], ['2', 65], [null, 103], ['3', 4]]);
  assert.equal(g.autosTotal, 1167);
  assert.equal(g.grandTotal, 1191);
  assert.deepEqual(g.brandTotals?.map((i) => `${i.qty} ${i.brand}`), ['1041 BMW', '13 RR', '4 MASE', '96 MB', '13 POV']);
  assert.ok(!g.problems.some((p) => /autos TOTAL was not read|Line not placed in a row: "1041/.test(p)), g.problems.join('\n'));
});

test('phone read: rows that name brands without counts are settled from the brand totals, and say so', () => {
  const g = phone();
  assert.deepEqual(g.autos.map(splitOf), ['544 BMW, 13 RR', '438 BMW', '52 BMW, 9 POV, 4 MASE', '96 MB, 7 BMW', '4 POV']);
  assert.deepEqual(g.autos.map((r) => r.derived), [true, false, true, true, false]);
  const brands: Record<string, number> = {};
  for (const r of g.autos) for (const i of r.split!) brands[i.brand] = (brands[i.brand] ?? 0) + i.qty;
  assert.deepEqual(brands, { BMW: 1041, RR: 13, MASE: 4, MB: 96, POV: 13 }); // equals the page's brand line exactly
  assert.ok(g.problems.includes('Deck 11: brand counts worked out from the page\'s brand totals (544 BMW, 13 RR). Check them.'));
});

test('phone read: hatches with a lookalike letter or a * are read; "ALL" stays a choice; yards pair when the page allows it', () => {
  const g = phone();
  assert.deepEqual(g.autos.map((r) => r.hatches), [null, null, ['H4', 'H3', 'H2'], ['H3'], ['H1']]);
  assert.ok(g.problems.some((p) => p.includes('hatch "З*" read as H3; the page puts a * on it')));
  assert.deepEqual(g.autos[0].pairs?.map((p) => p.yard), ['BMW', 'BMW']); // one yard on the row: every brand goes there
  assert.equal(g.autos[1].pairs, null); // 1 brand, 3 yards: left to Colby
  assert.ok(g.problems.some((p) => p.includes('1 brand but 3 yards (BMW, MB, SITE 3)')));
  assert.deepEqual(g.autos[4].pairs, [{ brand: 'POV', yard: 'AVP' }]);
});

test('phone read, damaged: totals that do not add up settle nothing; the brands stay named and are typed by hand', () => {
  const p = load('pontus-highway-cover-phone');
  p.words.find((w) => w.t === '96')!.t = '95'; // brand line no longer adds to the TOTAL
  const g = ok(p);
  assert.deepEqual(g.autos.map((r) => r.split == null), [true, false, true, true, false]);
  assert.ok(g.problems.some((x) => x.includes('the brand totals (1,166) and the rows do not match the TOTAL')), g.problems.join('\n'));
  const q = load('pontus-highway-cover-phone');
  q.words = q.words.filter((w) => !(w.t === '1041' || w.t === 'POV' && w.x === 1666)); // brand line unreadable
  assert.ok(ok(q).problems.some((x) => x.includes("the page's brand totals line was not read")));
});

// The second pass (enlarged tiles) finds the numerals the full-page read dropped. These are the numerals that are on the
// paper at the places the phone left empty (deck 8, deck 1, the H/H deck 3, the H/H amount 17 and the red H/H subtotal 24),
// plus every kind of noise the merge must refuse. The real second pass is checked on the phone (Share what was read).
test('second pass merged: the dropped deck digits and H/H amounts come back, noise does not', () => {
  const p = load('pontus-highway-cover-phone');
  const extra = [
    { t: '8', x: 2016, y: 1283, w: 35, h: 47, c: 0.9 }, { t: '8', x: 2019, y: 1285, w: 35, h: 47, c: 0.8 }, // same numeral from an overlapping tile
    { t: '1', x: 2016, y: 1489, w: 24, h: 47, c: 0.9 }, { t: '3', x: 2010, y: 2250, w: 41, h: 47, c: 0.9 },
    { t: '17', x: 276, y: 2100, w: 60, h: 47, c: 0.9 }, { t: '24', x: 285, y: 2380, w: 60, h: 50, c: 0.9 },
    { t: '557', x: 275, y: 1160, w: 88, h: 47, c: 0.99 }, // already read
    { t: '1', x: 1100, y: 1500, w: 8, h: 47, c: 0.9 },     // a ruled line read as "1"
    { t: '4', x: 1900, y: 1700, w: 30, h: 45, c: 0.2 },    // low confidence
    { t: 'O8', x: 2300, y: 1900, w: 60, h: 45, c: 0.9 },   // not a numeral
  ];
  p.words = addMissedNumerals(p.words, extra);
  assert.equal(p.words.length, load('pontus-highway-cover-phone').words.length + 5);
  const g = ok(p);
  assert.deepEqual(g.autos.map((r) => r.deck), ['11', '8', '2', '1', '3']);
  assert.deepEqual(g.hh.map((h) => [h.deck, h.amount]), [['5', 17], ['3', 7]]);
  assert.equal(g.hhTotal, 24);
  assert.equal(g.grandTotal, 1191); // 1,167 + 24: no mismatch is reported
  assert.ok(!g.problems.some((x) => /deck number was not read|TOTAL (was not read|says)|amount was not read/.test(x)), g.problems.join('\n'));
});

test('a build without the second pass still reads: no extra words, the page is unchanged', () => {
  const p = load('pontus-highway-cover-phone');
  assert.deepEqual(addMissedNumerals(p.words, []), p.words);
});

test('solveSplits: a brand on one open row goes wholly there; ambiguous or non-fitting totals settle nothing', () => {
  const row = (amount: number, brands: string[]) => ({ amount, split: null, brands });
  const a = row(10, ['X', 'Y']), b = row(6, ['Y', 'Z']);
  const r = solveSplits([a, b], [{ brand: 'X', qty: 7 }, { brand: 'Y', qty: 5 }, { brand: 'Z', qty: 4 }]);
  assert.ok(r instanceof Map);
  assert.deepEqual(r.get(a)?.map((i) => i.qty), [7, 3]);
  assert.deepEqual(r.get(b)?.map((i) => i.qty), [2, 4]);
  // X and Y both on both rows: many answers fit, so none is given
  const c = row(10, ['X', 'Y']), d = row(10, ['X', 'Y']);
  assert.equal(typeof solveSplits([c, d], [{ brand: 'X', qty: 10 }, { brand: 'Y', qty: 10 }]), 'string');
  // totals larger than the rows hold
  assert.equal(typeof solveSplits([row(10, ['X', 'Y'])], [{ brand: 'X', qty: 9 }, { brand: 'Y', qty: 9 }]), 'string');
});

test('parseHatches: lookalike letters and a trailing * ("3*"); ALL and nonsense are still refused', () => {
  assert.deepEqual(parseHatches('З*'), { hatches: ['H3'], starred: true });
  assert.deepEqual(parseHatches('1*'), { hatches: ['H1'], starred: true });
  assert.deepEqual(parseHatches('1*2*3*4').hatches, ['H4', 'H3', 'H2', 'H1']);
  assert.equal(parseHatches('ALL').hatches, null);
  assert.equal(parseHatches('5*').hatches, null);
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
