import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapCells } from '../src/app/gamePlan.ts';
import { addMissedNumerals, type Word } from '../src/app/layout.ts';

// Glovis Countess 107, phone read 2026-10-08 (build #9): the deck 8 of the 267 row came back from neither pass.
const w = (t: string, x: number, y: number, ww: number, h = 35): Word => ({ t, x, y, w: ww, h });
const head = [w('AMOUNT', 170, 1137, 170), w('PORT', 404, 1137, 111), w('DISC', 621, 1137, 88), w('CARGO', 1090, 1137, 122), w('DISCRIPTION', 1217, 1137, 225), w('DECK', 1940, 1137, 105), w('HATCH', 2309, 1142, 123), w('YARD', 2661, 1143, 100)];
const row = (y: number, amount: string, deck: string | null, hatch: string): Word[] => [w(amount, 240, y, 65), w('SSI', 435, y, 59), w('DISC', 627, y, 82), w('HYND', 1219, y, 94), ...(deck ? [w(deck, 1975, y, 30)] : []), w(hatch, 2320, y, 100), w('ZONE', 2649, y, 88), w('3', 2741, y, 31)];
const page = (rows: Word[][]) => ({ width: 3024, height: 4032, words: [...head, ...rows.flat()] });

test('a row with an amount and no deck gets a box around where the deck number sits', () => {
  const g = gapCells(page([row(1330, '30', '2', '1*'), row(1770, '267', null, '1*2*3'), row(1881, '271', '9', '1*2*3')]));
  assert.equal(g.length, 1);
  const cx = g[0].x + g[0].w / 2, cy = g[0].y + g[0].h / 2;
  assert.ok(Math.abs(cx - 1992) < 20, `box centre x ${cx}`);
  assert.ok(Math.abs(cy - 1787) < 20, `box centre y ${cy}`);
  assert.ok(g[0].w < 400 && g[0].h < 150, 'a small box, never the whole row');
});

test('nothing to re-read when every row has its deck', () => {
  assert.deepEqual(gapCells(page([row(1330, '30', '2', '1*'), row(1441, '475', '1', '1*2*3*4')])), []);
});

test('a numeral found by the closer read fills the gap, and a letter or a repeat does not', () => {
  const p = page([row(1770, '267', null, '1*2*3')]);
  const found = [{ t: '8', x: 1980, y: 1772, w: 22, h: 30, c: 0.9 }, { t: 'B', x: 1980, y: 1772, w: 22, h: 30, c: 0.99 }, { t: '8', x: 1981, y: 1773, w: 22, h: 30, c: 0.8 }];
  const words = addMissedNumerals(p.words, found);
  assert.equal(words.filter((x) => x.t === '8').length, 1);
  assert.ok(!words.some((x) => x.t === 'B'));
});
